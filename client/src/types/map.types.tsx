export type LatLng = [number, number];

export type Stop = {
  lat:       number;
  lng:       number;
  stop_name: string;
  seq:       number;
};

export type StopEta = {
  seq:                number;
  stopName:           string;
  distanceRemainingM: number | null;
  etaSeconds:         number | null;
  etaMinutes:         number | null;
  etaTimestamp:       number | null;
  passed:             boolean;
};

export type BoardAlight = { board?: string; alight?: string };

export type Status = "idle" | "connecting" | "riding" | "waiting" | "stopped" | "last_known";

export interface LocationUpdate {
  tripId:    string;
  lat:       number;
  lon:       number;
  vel?:      number | null;
  acc?:      number | null;
  timestamp: number;
}