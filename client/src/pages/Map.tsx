import L from "leaflet";
import '../styles/Map.css';
import "leaflet/dist/leaflet.css";
import { useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { getStops, getEta } from "../apis/trip.api";
import type { Map, Marker, Polyline } from "leaflet";
import { useEffect, useRef, useState, useCallback } from "react";
import { makeBusIcon, makeStopIcon, makeStopPopupHtml } from "../icons/mapIcons";
import type { LatLng, Stop, StopEta, BoardAlight, Status, LocationUpdate } from "../types/map.types";
import { buildCumulativeDist, getPositionAt, easeInOut, bearing, sortBySeq } from "../utils/mapGeometry";


const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

const DEFAULT_ANIM_MS = 10_000;
const MIN_ANIM_MS     = 2_000;
const MAX_ANIM_MS     = 12_000;

const STATUS_LABELS: Record<Status, string> = {
  idle:       "Waiting for connection…",
  connecting: "Connecting…",
  riding:     "Animating…",
  waiting:    "Waiting for next location…",
  stopped:    "Bus stopped",
  last_known: "Showing last known location",
};


export default function BusTracker() {
  const { tripId } = useParams<{ tripId: string }>();

  // Map / marker / layer refs.
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<Map | null>(null);
  const markerRef       = useRef<Marker | null>(null);
  const routeLayerRef   = useRef<Polyline | null>(null);
  const stopMarkersRef  = useRef<Marker[]>([]);

  // Animation refs.
  const animFrameRef   = useRef<number | null>(null);
  const startTimeRef   = useRef<number | null>(null);
  const currentPosRef  = useRef<LatLng | null>(null);
  const routePointsRef = useRef<LatLng[]>([]);
  const cumulDistRef   = useRef<number[]>([]);

  // Socket / queue refs.
  const socketRef              = useRef<Socket | null>(null);
  const joinedRoomRef          = useRef<string | null>(null);
  const updateQueueRef         = useRef<LocationUpdate[]>([]);
  const schedulerRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnimStartRef       = useRef<number>(0);
  const lastUpdateTimestampRef = useRef<number | null>(null);
  const lastSegmentDurationRef = useRef<number>(DEFAULT_ANIM_MS);

  const [status, setStatus]           = useState<Status>("idle");
  const [stops, setStops]             = useState<Stop[]>([]);
  const [etaMap, setEtaMap]           = useState<Record<number, StopEta>>({});
  const [boardAlight, setBoardAlight] = useState<BoardAlight>({});
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("smtTheme") as "light" | "dark") || "light";
  });


  // 1. Load the user's chosen boarding/alighting stops from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("trackBoardAlight");
      if (raw) setBoardAlight(JSON.parse(raw));
    } catch {
    }
  }, []);


  // 2. Fetch ETA for every stop, then keep it fresh with a 15s poll.
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    const fetchEta = async () => {
      try {
        const res = await getEta(tripId);
        if (cancelled) return;
        const map: Record<number, StopEta> = {};
        (res.stops || []).forEach((s: StopEta) => { map[s.seq] = s; });
        setEtaMap(map);
      } catch (err) {
        console.error("Failed to fetch ETA:", err);
      }
    };

    fetchEta();
    const interval = setInterval(fetchEta, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [tripId]);


  // 3. Toggle light/dark theme and persist the choice.
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("smtTheme", next);
      return next;
    });
  }, []);


  // 4. Render stop markers + fit the map bounds to the route.
  const renderStops = useCallback((stopList: Stop[]) => {
    const map = mapRef.current;
    if (!map) return;

    stopMarkersRef.current.forEach((m) => map.removeLayer(m));
    stopMarkersRef.current = [];

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (!stopList.length) return;

    setStops(stopList);

    const latLngs: LatLng[] = stopList.map((s) => [s.lat, s.lng]);
    const lastIdx = stopList.length - 1;

    stopList.forEach((stop, i) => {
      const kind: "source" | "destination" | "mid" =
        i === 0 ? "source" : i === lastIdx ? "destination" : "mid";

      const marker = L.marker([stop.lat, stop.lng], { icon: makeStopIcon(kind, i + 1) })
        .addTo(map)
        .bindPopup(
          makeStopPopupHtml(kind, i, stop.stop_name),
          { className: 'light-popup', closeButton: false, offset: [0, -8] }
        );
      stopMarkersRef.current.push(marker);
    });

    map.fitBounds(latLngs as L.LatLngBoundsExpression, { padding: [40, 40] });
  }, []);


  // 5. Load the route's stops.
  const loadRouteStops = useCallback(async () => {
    if (tripId) {
      try {
        const res = await getStops(tripId);
        const stopList: Stop[] = sortBySeq(
          (res.stops || [])
            .map((entry: any) => ({
              lat:       entry.stop.lat,
              lng:       entry.stop.lng,
              stop_name: entry.stop.stopName,
              seq:       entry.stop.seq,
            }))
            .filter((s: Stop) => s.lat != null && s.lng != null)
        );

        localStorage.setItem("trackRoute", JSON.stringify(stopList));
        renderStops(stopList);
        return;
      } catch (err) {
        console.error("Failed to fetch stops from server, falling back to cached route:", err);
      }
    }

    const raw = localStorage.getItem("trackRoute");
    if (!raw) return;

    let stopList: Stop[] = [];
    try {
      stopList = sortBySeq(
        (JSON.parse(raw) as (Stop | null)[]).filter(
          (s): s is Stop => s !== null && s.lat != null && s.lng != null
        )
      );
    } catch {
      return;
    }

    renderStops(stopList);
  }, [tripId, renderStops]);


  // 6. Reset all map/animation/queue state — called when switching to track a different trip.
  const resetMapState = useCallback(() => {
    const map = mapRef.current;

    if (routeLayerRef.current && map) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (markerRef.current && map) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    updateQueueRef.current = [];
    if (schedulerRef.current !== null) {
      clearTimeout(schedulerRef.current);
      schedulerRef.current = null;
    }
    lastAnimStartRef.current       = 0;
    lastUpdateTimestampRef.current = null;
    lastSegmentDurationRef.current = DEFAULT_ANIM_MS;

    currentPosRef.current  = null;
    routePointsRef.current = [];
    cumulDistRef.current   = [];
    setStatus("waiting");
  }, []);


  // 7. Join a trip's socket room, resetting state first if we were tracking a different one.
  const joinRoom = useCallback((id: string) => {
    const socket = socketRef.current;
    if (!socket || !id.trim()) return;

    if (joinedRoomRef.current && joinedRoomRef.current !== id) {
      socket.emit("stopTrackBus", joinedRoomRef.current);
      resetMapState();
    }

    socket.emit("trackBus", id);
    joinedRoomRef.current = id;
  }, [resetMapState]);


  // 8. Cancel any in-progress marker animation.
  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);


  // 9. Snap the marker straight to a position with no animation.
  const jumpToPosition = useCallback((pos: LatLng) => {
    currentPosRef.current = pos;
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = L.marker(pos, { icon: makeBusIcon() }).addTo(map);
    } else {
      markerRef.current.setLatLng(pos);
    }
    setStatus("waiting");
  }, []);


  // 10. Animate the bus marker smoothly from one ping to the next.
  const animateSegment = useCallback(
    (from: LatLng, to: LatLng, durationMs: number = DEFAULT_ANIM_MS) => {
      const map = mapRef.current;
      if (!map) return;

      if (document.visibilityState === "hidden") {
        jumpToPosition(to);
        return;
      }

      stopAnimation();

      const routePoints: LatLng[] = [from, to];
      routePointsRef.current = routePoints;
      cumulDistRef.current   = buildCumulativeDist(routePoints);

      if (!markerRef.current) {
        markerRef.current = L.marker(from, { icon: makeBusIcon() }).addTo(map);
      } else {
        markerRef.current.setLatLng(from);
      }

      startTimeRef.current = null;
      setStatus("riding");

      const animate = (ts: number): void => {
        if (document.visibilityState === "hidden") {
          jumpToPosition(to);
          animFrameRef.current = null;
          return;
        }

        if (startTimeRef.current === null) startTimeRef.current = ts;
        const raw = Math.min((ts - startTimeRef.current) / durationMs, 1);
        const t   = easeInOut(raw);
        const pos = getPositionAt(t, routePointsRef.current, cumulDistRef.current);

        markerRef.current?.setLatLng(pos);
        currentPosRef.current = pos;

        if (raw < 1) {
          const nextPos = getPositionAt(
            easeInOut(Math.min(raw + 0.01, 1)),
            routePointsRef.current,
            cumulDistRef.current
          );
          const deg = bearing(pos, nextPos);
          const iconEl = markerRef.current
            ?.getElement()
            ?.querySelector<HTMLDivElement>(".smt-bike-icon");
          if (iconEl) iconEl.style.transform = `rotate(${deg}deg)`;
        }

        if (raw < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          currentPosRef.current = to;
          markerRef.current?.setLatLng(to);
          setStatus("waiting");
          animFrameRef.current = null;
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [stopAnimation, jumpToPosition]
  );

  const joinRoomRef       = useRef(joinRoom);
  const animateSegmentRef = useRef(animateSegment);
  useEffect(() => { joinRoomRef.current = joinRoom; }, [joinRoom]);
  useEffect(() => { animateSegmentRef.current = animateSegment; }, [animateSegment]);

  const scheduleNextRef = useRef<() => void>(() => { });


  // 11. Pop the next queued location update & animate to it once the current animation's duration has elapsed.
  const scheduleNext = useCallback(() => {
    if (updateQueueRef.current.length === 0) {
      schedulerRef.current = null;
      return;
    }

    const now      = Date.now();
    const elapsed  = now - lastAnimStartRef.current;
    const isHidden = document.visibilityState === "hidden";
    const delay    = isHidden ? 0 : Math.max(0, lastSegmentDurationRef.current - elapsed);

    schedulerRef.current = setTimeout(() => {
      schedulerRef.current = null;

      const next = updateQueueRef.current.shift();
      if (!next) return;

      lastAnimStartRef.current = Date.now();
      const newPos: LatLng = [next.lat, next.lon];

      const prevTs   = lastUpdateTimestampRef.current;
      const rawGap   = prevTs !== null ? next.timestamp - prevTs : NaN;
      const duration = Number.isFinite(rawGap) && rawGap > 0
        ? Math.min(MAX_ANIM_MS, Math.max(MIN_ANIM_MS, rawGap))
        : DEFAULT_ANIM_MS;
      lastUpdateTimestampRef.current = next.timestamp;
      lastSegmentDurationRef.current = duration;

      if (currentPosRef.current === null) {
        currentPosRef.current = newPos;
        setStatus("waiting");
        const map = mapRef.current;
        if (map) {
          map.setView(newPos, 15);
          if (!markerRef.current) {
            markerRef.current = L.marker(newPos, { icon: makeBusIcon() }).addTo(map);
          }
        }
      } else {
        animateSegmentRef.current(currentPosRef.current, newPos, duration);
      }

      scheduleNextRef.current();
    }, delay);
  }, []);

  useEffect(() => { scheduleNextRef.current = scheduleNext; }, [scheduleNext]);


  // 12. Push a fresh location update onto the queue and kick off the scheduler if idle.
  const enqueueUpdate = useCallback((data: LocationUpdate) => {
    updateQueueRef.current.push(data);
    if (schedulerRef.current === null) {
      scheduleNextRef.current();
    }
  }, []);


  // 13. When the tab becomes visible again, drop any stale queued updates & resume the scheduler immediately.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const queue = updateQueueRef.current;
        if (queue.length > 1) {
          const latest = queue[queue.length - 1];
          updateQueueRef.current = [latest];
        }
        if (updateQueueRef.current.length > 0 && schedulerRef.current === null) {
          lastAnimStartRef.current = 0;
          scheduleNextRef.current();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);


  // 14. Initialize the Leaflet map once on mount.
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([20.2961, 85.8245], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    map.whenReady(() => {
      loadRouteStops();
      setTimeout(() => map.invalidateSize(), 0);
    });

    const handleResize = () => map.invalidateSize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      map.remove();
      mapRef.current = null;
    };
  }, [loadRouteStops]);


  // 15. Connect to the tracking socket.
  useEffect(() => {
    if (!tripId) return;

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connecting");
      setTimeout(() => joinRoomRef.current(tripId), 100);
    });

    socket.on("disconnect", () => {
      setStatus("idle");
      joinedRoomRef.current = null;
    });

    socket.on("locationUpdate", (data: LocationUpdate) => {
      if (data.tripId !== joinedRoomRef.current) return;
      enqueueUpdate(data);
    });

    socket.on("lastKnownLocation", (data: LocationUpdate) => {
      if (data.tripId !== joinedRoomRef.current) return;
      const pos: LatLng = [data.lat, data.lon];
      currentPosRef.current = pos;
      setStatus("last_known");
      const map = mapRef.current;
      if (map) {
        map.setView(pos, 15);
        if (!markerRef.current) {
          markerRef.current = L.marker(pos, { icon: makeBusIcon(0.6) }).addTo(map);
        }
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);


  // 16. Fly the map to a stop when it's tapped in the sidebar.
  const flyToStop = useCallback((stop: Stop) => {
    mapRef.current?.flyTo([stop.lat, stop.lng], 16, { duration: 0.8 });
  }, []);

  const lastIdx = stops.length - 1;

  return (
    <div className="smt-root" data-theme={theme}>

      {/* Header */}
      <div className="smt-header">
        <div className="smt-brand">
          <svg className="smt-brand-icon" width="30" height="30" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="18" fill="rgba(26,115,232,0.12)" stroke="#1a73e8" strokeWidth="1.5"/>
            <polygon points="20,6 30,30 20,25 10,30" fill="#1a73e8" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="20" cy="20" r="2.5" fill="#ffffff"/>
          </svg>
          <h1 className="smt-title">Live<span>BUS</span></h1>
        </div>

        <div className="smt-header-actions">
          <div className={`smt-status-pill ${status === "idle" ? "disconnected" : ""}`}>
            <span className={`smt-status-dot ${status === "riding" ? "riding" : ""}`} />
            {STATUS_LABELS[status]}
          </div>

          <button
            type="button"
            className="smt-theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="5" fill="currentColor"/>
                <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="12" y1="1.5" x2="12" y2="4"/>
                  <line x1="12" y1="20" x2="12" y2="22.5"/>
                  <line x1="1.5" y1="12" x2="4" y2="12"/>
                  <line x1="20" y1="12" x2="22.5" y2="12"/>
                  <line x1="4.2" y1="4.2" x2="6" y2="6"/>
                  <line x1="18" y1="18" x2="19.8" y2="19.8"/>
                  <line x1="4.2" y1="19.8" x2="6" y2="18"/>
                  <line x1="18" y1="6" x2="19.8" y2="4.2"/>
                </g>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Personal ETA banner for the user's chosen boarding/alighting stops */}
      {(boardAlight.board || boardAlight.alight) && (() => {
        const boardStop  = stops.find((s) => s.stop_name === boardAlight.board);
        const alightStop = stops.find((s) => s.stop_name === boardAlight.alight);
        const boardEta   = boardStop  ? etaMap[boardStop.seq]  : undefined;
        const alightEta  = alightStop ? etaMap[alightStop.seq] : undefined;
        if (!boardEta && !alightEta) return null;

        const describe = (eta: StopEta | undefined, label: string) => {
          if (!eta) return null;
          if (eta.passed) return `${label}: already passed`;
          if (eta.etaMinutes === null) return `${label}: ETA unknown`;
          return `${label} in ~${eta.etaMinutes} min`;
        };

        return (
          <div className="smt-eta-banner">
            {describe(boardEta, "Your boarding stop") && (
              <span className="smt-eta-banner-item">{describe(boardEta, "Your boarding stop")}</span>
            )}
            {describe(alightEta, "Your stop") && (
              <span className="smt-eta-banner-item">{describe(alightEta, "Your stop")}</span>
            )}
          </div>
        );
      })()}

      {/* Body: map + stops sidebar */}
      <div className="smt-body">

        {/* Map */}
        <div className="smt-map-wrap">
          <div className={`smt-map-div ${theme === "dark" ? "smt-map-dark" : ""}`} ref={mapContainerRef} />
        </div>

        {/* Stops sidebar */}
        <div className="smt-sidebar">
          <div className="smt-sidebar-header">
            <span className="smt-sidebar-title">Route Stops</span>
            {stops.length > 0 && <span className="smt-sidebar-count">{stops.length}</span>}
          </div>

          <div className="smt-stop-list">
            {stops.length === 0 && (
              <div className="smt-stop-empty">No stops loaded yet…</div>
            )}

            {stops.map((stop, i) => {
              const kind = i === 0 ? "source" : i === lastIdx ? "destination" : "mid";
              const eta  = etaMap[stop.seq];
              const isBoard  = !!boardAlight.board  && stop.stop_name === boardAlight.board;
              const isAlight = !!boardAlight.alight && stop.stop_name === boardAlight.alight;

              const etaLabel = !eta
                ? "—"
                : eta.passed
                  ? "Passed"
                  : eta.etaMinutes !== null
                    ? `${eta.etaMinutes} min`
                    : "—";

              return (
                <div
                  key={`${stop.seq}-${i}`}
                  className={`smt-stop-item ${kind} ${isBoard ? "user-board" : ""} ${isAlight ? "user-alight" : ""}`}
                  onClick={() => flyToStop(stop)}
                >
                  <div className={`smt-stop-marker ${kind}`}>
                    {kind === "source" ? "S" : kind === "destination" ? "D" : i + 1}
                  </div>
                  <div className="smt-stop-info">
                    <div className="smt-stop-name">{stop.stop_name}</div>
                    <div className="smt-stop-tag">
                      {kind === "source" ? "Source" : kind === "destination" ? "Destination" : `Stop ${i + 1}`}
                      {isBoard  && " · You board here"}
                      {isAlight && " · You alight here"}
                    </div>
                  </div>
                  <div className={`smt-stop-eta ${eta?.passed ? "passed" : ""}`}>{etaLabel}</div>
                  {i < lastIdx && <div className="smt-stop-connector" />}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}