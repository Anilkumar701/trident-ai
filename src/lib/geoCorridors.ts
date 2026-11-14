export interface LatLngLiteral {
  lat: number
  lng: number
}

/** Real-world Bengaluru locations for Smart Waste Ecosystem (S3). */
export const WASTE_DEPOT_LOCATION: LatLngLiteral & { name: string } = {
  lat: 12.9562,
  lng: 77.6184,
  name: 'S3 Koramangala-Domlur Transfer Hub',
}

export const WASTE_BIN_LOCATIONS: Record<string, LatLngLiteral & { area: string }> = {
  'BIN-101': { lat: 12.9716, lng: 77.5946, area: 'MG Road CBD' },
  'BIN-102': { lat: 12.9279, lng: 77.6762, area: 'Bellandur EcoSpace' },
  'BIN-103': { lat: 12.9982, lng: 77.553, area: 'Rajajinagar Ind.' },
  'BIN-104': { lat: 12.925, lng: 77.5938, area: 'Jayanagar 4th Blk' },
  'BIN-105': { lat: 12.9766, lng: 77.5713, area: 'Majestic Transit Hub' },
}

/** Real-world Bengaluru street corridor used for Pedestrian & Fleet AV simulation. */
export const AV_CORRIDOR_PATH: LatLngLiteral[] = [
  { lat: 12.9756, lng: 77.6012 }, // Anil Kumble / MG Road West
  { lat: 12.9746, lng: 77.6078 }, // MG Road Metro
  { lat: 12.9735, lng: 77.6152 }, // Mayo Hall
  { lat: 12.9729, lng: 77.6203 }, // Trinity Circle
  { lat: 12.9748, lng: 77.6295 }, // Ulsoor / Old Madras Rd
  { lat: 12.9768, lng: 77.6386 }, // Indiranagar 100ft Jn
]

/** Real-world New Delhi GPS coordinates mapped 1:1 to the 10 TrafficGridMap NCR nodes. */
export const DELHI_GRID_NODES: Record<string, LatLngLiteral & { name: string }> = {
  CP: { lat: 28.6315, lng: 77.2167, name: 'Connaught Place' },
  ITO: { lat: 28.6289, lng: 77.2415, name: 'ITO Crossing' },
  IG: { lat: 28.6129, lng: 77.2295, name: 'India Gate' },
  AIIMS: { lat: 28.5672, lng: 77.21, name: 'AIIMS Junction' },
  KB: { lat: 28.6517, lng: 77.1909, name: 'Karol Bagh' },
  NP: { lat: 28.5494, lng: 77.2501, name: 'Nehru Place' },
  AKS: { lat: 28.6127, lng: 77.2773, name: 'Akshardham' },
  SJ: { lat: 28.5679, lng: 77.2044, name: 'Safdarjung' },
  RK: { lat: 28.6422, lng: 77.1525, name: 'Rajouri Kalan' },
  LP: { lat: 28.5677, lng: 77.2433, name: 'Lajpat Nagar' },
}

export function computeBearingDeg(a: LatLngLiteral, b: LatLngLiteral): number {
  const rad = Math.PI / 180
  const lat1 = a.lat * rad
  const lat2 = b.lat * rad
  const dLng = (b.lng - a.lng) * rad
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function interpolateGeoPath(
  path: LatLngLiteral[],
  progress01: number,
): { point: LatLngLiteral; headingDeg: number } {
  if (path.length === 0) return { point: { lat: 12.9716, lng: 77.5946 }, headingDeg: 0 }
  if (path.length === 1) return { point: path[0], headingDeg: 0 }

  const clamped = Math.max(0, Math.min(0.9999, progress01))
  const totalSegs = path.length - 1
  const scaled = clamped * totalSegs
  const idx = Math.min(totalSegs - 1, Math.floor(scaled))
  const t = scaled - idx
  const a = path[idx]
  const b = path[idx + 1]

  const lat = a.lat + (b.lat - a.lat) * t
  const lng = a.lng + (b.lng - a.lng) * t
  const headingDeg = computeBearingDeg(a, b)
  return { point: { lat, lng }, headingDeg }
}

export function projectPointAhead(
  origin: LatLngLiteral,
  bearingDeg: number,
  distanceMeters: number,
  lateralMeters = 0,
): LatLngLiteral {
  const rad = Math.PI / 180
  const bRad = bearingDeg * rad
  const rRad = ((bearingDeg + 90) % 360) * rad
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos(origin.lat * rad)

  const northM = Math.cos(bRad) * distanceMeters + Math.cos(rRad) * lateralMeters
  const eastM = Math.sin(bRad) * distanceMeters + Math.sin(rRad) * lateralMeters

  return {
    lat: origin.lat + northM / metersPerDegLat,
    lng: origin.lng + eastM / metersPerDegLng,
  }
}
