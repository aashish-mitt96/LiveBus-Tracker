import L from "leaflet";


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


export function makeBusIcon(opacity = 1) {
  return L.divIcon({
    className: "",
    html: `
      <div class="smt-bike-icon" style="opacity:${opacity};width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
        <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="18" fill="rgba(26,115,232,0.15)" stroke="#1a73e8" stroke-width="1.5"/>
          <polygon
            points="20,6 30,30 20,25 10,30"
            fill="#1a73e8"
            stroke="#ffffff"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <circle cx="20" cy="20" r="2.5" fill="#ffffff"/>
        </svg>
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}


export function makeStopIcon(kind: "source" | "destination" | "mid", label: number) {

  if (kind === "source") {
    return L.divIcon({
      className: "",
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(60,64,67,0.3));">
          <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 0C6.72 0 0 6.72 0 15c0 11.25 15 25 15 25s15-13.75 15-25C30 6.72 23.28 0 15 0z" fill="#34a853"/>
            <circle cx="15" cy="15" r="10.5" fill="#ffffff"/>
            <path d="M10 15.5l3.2 3.2L20.5 11" stroke="#34a853" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>`,
      iconSize: [30, 40],
      iconAnchor: [15, 40],
      popupAnchor: [0, -36],
    });
  }

  if (kind === "destination") {
    return L.divIcon({
      className: "",
      html: `
        <div style="filter:drop-shadow(0 2px 4px rgba(60,64,67,0.3));">
          <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 0C6.72 0 0 6.72 0 15c0 11.25 15 25 15 25s15-13.75 15-25C30 6.72 23.28 0 15 0z" fill="#ea4335"/>
            <circle cx="15" cy="15" r="10.5" fill="#ffffff"/>
            <g transform="translate(9.5,9)">
              <rect width="1.6" height="12.5" fill="#ea4335"/>
              <path d="M1.6 0h9l-2.2 2.6 2.2 2.6h-9z" fill="#ea4335"/>
            </g>
          </svg>
        </div>`,
      iconSize: [30, 40],
      iconAnchor: [15, 40],
      popupAnchor: [0, -36],
    });
  }

  return L.divIcon({
    className: "",
    html: `
      <div style="filter:drop-shadow(0 1px 3px rgba(60,64,67,0.25));">
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="11" fill="#1a73e8" stroke="#ffffff" stroke-width="2"/>
          <text x="12" y="16" text-anchor="middle" font-family="DM Mono, monospace" font-size="10" font-weight="600" fill="#ffffff">${label}</text>
        </svg>
      </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}


export function makeStopPopupHtml(kind: "source" | "destination" | "mid", index: number, stopName: string) {
  const dotColor = kind === "source" ? "#34a853" : kind === "destination" ? "#ea4335" : "#1a73e8";
  const label    = kind === "source" ? "Source" : kind === "destination" ? "Destination" : `Stop ${index + 1}`;

  return `
    <div style="font-family:'DM Mono',monospace; min-width:170px; background:#ffffff; border:1px solid #dadce0; border-radius:10px; padding:10px 14px; box-shadow:0 2px 8px rgba(60,64,67,0.2);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
        <div style="width:20px; height:20px; border-radius:50%; background:${dotColor}; color:#fff; font-size:11px; font-weight:600; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${index + 1}
        </div>
        <span style="color:#202124; font-size:13px; font-weight:600; letter-spacing:0.02em;">
          ${label}
        </span>
      </div>
      <div style="color:#5f6368; font-size:11px; padding-left:28px; line-height:1.4;">
        ${escapeHtml(stopName)}
      </div>
    </div>`;
}