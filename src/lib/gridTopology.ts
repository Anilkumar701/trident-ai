import { MAP_NODES, ROUTE_EDGES } from '../data/mock'
import {
  createSignalState,
  type GridIntersection,
  type GridRoad,
  type Vehicle,
  type VehicleType,
  VEHICLE_CONFIGS,
} from './trafficSimulation'

// Scaled 2D coordinates for the D3 map view (bounds ~ 920 x 580)
export const SCALED_NODES: Record<string, { x: number; y: number; name: string; density: number }> = {
  CP: { x: 380, y: 140, name: 'Connaught Place', density: 86 },
  ITO: { x: 590, y: 170, name: 'ITO Crossing', density: 92 },
  IG: { x: 500, y: 280, name: 'India Gate', density: 61 },
  AIIMS: { x: 440, y: 420, name: 'AIIMS Junction', density: 78 },
  KB: { x: 210, y: 200, name: 'Karol Bagh', density: 71 },
  NP: { x: 670, y: 440, name: 'Nehru Place', density: 69 },
  AKS: { x: 800, y: 230, name: 'Akshardham', density: 54 },
  SJ: { x: 340, y: 490, name: 'Safdarjung', density: 66 },
  RK: { x: 130, y: 350, name: 'Rajouri Kalan', density: 48 },
  LP: { x: 560, y: 510, name: 'Lajpat Nagar', density: 73 },
}

export function buildGridIntersections(): GridIntersection[] {
  return MAP_NODES.map((node, index) => {
    const coords = SCALED_NODES[node.id] ?? { x: node.x * 9, y: node.y * 6, name: node.label, density: node.density }
    // Stagger initial phases so city signals are not all in lockstep
    const initialNs = index % 2 === 0 ? 'green' : 'red'
    const initialTimer = 8 + (index * 3) % 10
    return {
      id: node.id,
      name: node.label,
      x: coords.x,
      y: coords.y,
      density: node.density,
      signal: createSignalState(node.id, initialNs, initialTimer, 12, 3),
    }
  })
}

export function buildGridRoads(): GridRoad[] {
  const roads: GridRoad[] = []

  ROUTE_EDGES.forEach((edge) => {
    const fromNode = SCALED_NODES[edge.from]
    const toNode = SCALED_NODES[edge.to]
    if (!fromNode || !toNode) return

    // Forward road
    roads.push({
      id: `${edge.from}->${edge.to}`,
      from: edge.from,
      to: edge.to,
      fromName: fromNode.name,
      toName: toNode.name,
      lengthMeters: edge.distanceKm * 1000,
      lanes: 2,
      speedLimitKmh: 50,
      hazard: edge.hazard ? { type: edge.hazard.type, penalty: edge.hazard.penalty } : undefined,
    })

    // Return road
    roads.push({
      id: `${edge.to}->${edge.from}`,
      from: edge.to,
      to: edge.from,
      fromName: toNode.name,
      toName: fromNode.name,
      lengthMeters: edge.distanceKm * 1000,
      lanes: 2,
      speedLimitKmh: 50,
      hazard: edge.hazard ? { type: edge.hazard.type, penalty: edge.hazard.penalty } : undefined,
    })
  })

  return roads
}

let vehicleSeq = 100

export function spawnVehicle(
  roads: GridRoad[],
  roadId?: string,
  forceType?: VehicleType,
): Vehicle | null {
  if (roads.length === 0) return null

  const targetRoad = roadId
    ? roads.find((r) => r.id === roadId) || roads[0]
    : roads[Math.floor(Math.random() * roads.length)]

  const types: VehicleType[] = ['car', 'car', 'car', 'bike', 'bike', 'bus', 'truck']
  const type: VehicleType = forceType || types[Math.floor(Math.random() * types.length)]
  const config = VEHICLE_CONFIGS[type]

  vehicleSeq += 1
  return {
    id: `VH-${vehicleSeq}`,
    type,
    color: config.color,
    roadId: targetRoad.id,
    progress: Math.random() * 0.4, // spawn near beginning
    speedKmh: Math.floor(config.maxSpeedKmh * (0.6 + Math.random() * 0.4)),
    targetSpeedKmh: config.maxSpeedKmh,
    distanceTraveledM: 0,
    status: 'cruising',
    pathHistory: [targetRoad.from],
    lengthM: config.lengthM,
  }
}
