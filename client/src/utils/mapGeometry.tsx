import type { LatLng, Stop } from "../types/map.types";


// 1. Linear interpolation between two values.
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;


// 2. Ease-in-out timing function.
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);


// 3. Build a cumulative-distance array along a series of points.
export function buildCumulativeDist(coords: LatLng[]): number[] {
  const cd: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const dlat = coords[i][0] - coords[i - 1][0];
    const dlng = coords[i][1] - coords[i - 1][1];
    cd.push(cd[cd.length - 1] + Math.sqrt(dlat * dlat + dlng * dlng));
  }
  return cd;
}


// 4. Get the interpolated lat/lng position at progress t along a route.
export function getPositionAt(t: number, points: LatLng[], cumulDist: number[]): LatLng {
  const total  = cumulDist[cumulDist.length - 1];
  const target = t * total;

  let lo = 0, hi = cumulDist.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulDist[mid + 1] < target) lo = mid + 1;
    else hi = mid;
  }

  const seg  = cumulDist[lo + 1] - cumulDist[lo];
  const segT = seg === 0 ? 0 : (target - cumulDist[lo]) / seg;

  return [
    lerp(points[lo][0], points[lo + 1][0], segT),
    lerp(points[lo][1], points[lo + 1][1], segT),
  ];
}


// 5. Compute the compass bearing (in degrees) from one point to another.
export function bearing(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const dLng = toRad(to[1] - from[1]);
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}


// 6. Sort stops into route order using their seq number.
export function sortBySeq(stops: Stop[]): Stop[] {
  return [...stops].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}