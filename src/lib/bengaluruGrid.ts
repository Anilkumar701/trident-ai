import type { IntersectionKey } from './metropolisLogic'

export interface GridCoord {
  lat: number
  lng: number
  label: string
}

export const INTERSECTION_COORDINATES: Record<IntersectionKey, GridCoord> = {
  'MG Road': { lat: 12.9716, lng: 77.5946, label: 'MG Road Junction' },
  'Silk Board': { lat: 12.9176, lng: 77.6238, label: 'Central Silk Board Interchange' },
  Majestic: { lat: 12.9766, lng: 77.5713, label: 'Kempegowda Majestic Hub' },
  'Electronic City': { lat: 12.8452, lng: 77.6602, label: 'Electronic City Phase 1 Toll' },
}

/** Intermediate Bengaluru waypoints used for realistic emergency polylines. */
export const CORRIDOR_WAYPOINTS: Record<string, GridCoord> = {
  Koramangala: { lat: 12.9352, lng: 77.6245, label: 'Koramangala 80ft Junction' },
  Hosur: { lat: 12.9554, lng: 77.6089, label: 'Hosur Road Arterial' },
  Richmond: { lat: 12.9644, lng: 77.5992, label: 'Richmond Circle' },
}

interface CorridorEdge {
  from: IntersectionKey
  to: IntersectionKey
  distanceKm: number
  travelMin: number
  via: GridCoord[]
}

const CORRIDOR_EDGES: CorridorEdge[] = [
  {
    from: 'Electronic City',
    to: 'Silk Board',
    distanceKm: 8.6,
    travelMin: 18,
    via: [{ lat: 12.88, lng: 77.643, label: 'Hosur Rd flyover' }],
  },
  {
    from: 'Silk Board',
    to: 'MG Road',
    distanceKm: 9.4,
    travelMin: 22,
    via: [CORRIDOR_WAYPOINTS.Koramangala, CORRIDOR_WAYPOINTS.Hosur, CORRIDOR_WAYPOINTS.Richmond],
  },
  {
    from: 'Silk Board',
    to: 'Majestic',
    distanceKm: 12.1,
    travelMin: 28,
    via: [CORRIDOR_WAYPOINTS.Koramangala, CORRIDOR_WAYPOINTS.Richmond],
  },
  {
    from: 'MG Road',
    to: 'Majestic',
    distanceKm: 3.8,
    travelMin: 11,
    via: [{ lat: 12.975, lng: 77.582, label: 'Anand Rao Circle' }],
  },
  {
    from: 'Electronic City',
    to: 'MG Road',
    distanceKm: 16.8,
    travelMin: 36,
    via: [
      { lat: 12.88, lng: 77.643, label: 'Hosur Rd flyover' },
      CORRIDOR_WAYPOINTS.Koramangala,
      CORRIDOR_WAYPOINTS.Richmond,
    ],
  },
]

export interface EmergencyTrack {
  nodes: IntersectionKey[]
  coords: Array<{ lat: number; lng: number; label: string }>
  distanceKm: number
  etaMin: number
  origin: IntersectionKey
  destination: IntersectionKey
}

function undirectedNeighbors(id: IntersectionKey): Array<CorridorEdge & { next: IntersectionKey }> {
  return CORRIDOR_EDGES.filter((e) => e.from === id || e.to === id).map((e) => ({
    ...e,
    next: e.from === id ? e.to : e.from,
    via: e.from === id ? e.via : [...e.via].reverse(),
  }))
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s1 = Math.sin(dLat / 2)
  const s2 = Math.sin(dLng / 2)
  const h =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function nearestIntersection(lat: number, lng: number): IntersectionKey {
  const keys = Object.keys(INTERSECTION_COORDINATES) as IntersectionKey[]
  let best: IntersectionKey = 'MG Road'
  let bestD = Number.POSITIVE_INFINITY
  for (const key of keys) {
    const d = haversineKm({ lat, lng }, INTERSECTION_COORDINATES[key])
    if (d < bestD) {
      bestD = d
      best = key
    }
  }
  return best
}

/**
 * Time-optimal emergency corridor (108/112) across Bengaluru arterial nodes.
 * Uses travel minutes as edge weight so ambulances take the fastest, not shortest-km, path.
 */
export function computeEmergencyTrack(
  origin: IntersectionKey,
  destination: IntersectionKey,
): EmergencyTrack {
  if (origin === destination) {
    const coord = INTERSECTION_COORDINATES[origin]
    return {
      nodes: [origin],
      coords: [{ lat: coord.lat, lng: coord.lng, label: coord.label }],
      distanceKm: 0,
      etaMin: 2,
      origin,
      destination,
    }
  }

  const keys = Object.keys(INTERSECTION_COORDINATES) as IntersectionKey[]
  const dist = new Map<IntersectionKey, number>()
  const prev = new Map<IntersectionKey, { node: IntersectionKey; edge: ReturnType<typeof undirectedNeighbors>[number] }>()
  const open = new Set(keys)
  keys.forEach((k) => dist.set(k, Number.POSITIVE_INFINITY))
  dist.set(origin, 0)

  while (open.size) {
    let u: IntersectionKey | null = null
    let best = Number.POSITIVE_INFINITY
    for (const id of open) {
      const d = dist.get(id) ?? Number.POSITIVE_INFINITY
      if (d < best) {
        best = d
        u = id
      }
    }
    if (!u || best === Number.POSITIVE_INFINITY) break
    open.delete(u)
    if (u === destination) break
    for (const edge of undirectedNeighbors(u)) {
      if (!open.has(edge.next)) continue
      const alt = best + edge.travelMin
      if (alt < (dist.get(edge.next) ?? Number.POSITIVE_INFINITY)) {
        dist.set(edge.next, alt)
        prev.set(edge.next, { node: u, edge })
      }
    }
  }

  const nodes: IntersectionKey[] = [destination]
  const reverseEdges: Array<ReturnType<typeof undirectedNeighbors>[number]> = []
  let cur = destination
  while (cur !== origin) {
    const step = prev.get(cur)
    if (!step) break
    reverseEdges.unshift(step.edge)
    cur = step.node
    nodes.unshift(cur)
  }

  if (nodes[0] !== origin) {
    const a = INTERSECTION_COORDINATES[origin]
    const b = INTERSECTION_COORDINATES[destination]
    return {
      nodes: [origin, destination],
      coords: [
        { lat: a.lat, lng: a.lng, label: a.label },
        { lat: b.lat, lng: b.lng, label: b.label },
      ],
      distanceKm: Number(haversineKm(a, b).toFixed(1)),
      etaMin: Math.max(4, Math.round(haversineKm(a, b) * 2.4)),
      origin,
      destination,
    }
  }

  const coords: EmergencyTrack['coords'] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const c = INTERSECTION_COORDINATES[node]
    coords.push({ lat: c.lat, lng: c.lng, label: c.label })
    const edge = reverseEdges[i]
    if (edge) {
      for (const wp of edge.via) {
        coords.push({ lat: wp.lat, lng: wp.lng, label: wp.label })
      }
    }
  }

  const distanceKm = reverseEdges.reduce((s, e) => s + e.distanceKm, 0)
  const etaMin = reverseEdges.reduce((s, e) => s + e.travelMin, 0)

  return {
    nodes,
    coords,
    distanceKm: Number(distanceKm.toFixed(1)),
    etaMin: Math.max(2, Math.round(etaMin * 0.72)),
    origin,
    destination,
  }
}
