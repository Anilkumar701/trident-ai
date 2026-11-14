export type SignalColor = 'green' | 'yellow' | 'red'

export interface SignalState {
  id: string
  nsColor: SignalColor
  ewColor: SignalColor
  timer: number // countdown seconds remaining in current phase
  greenDuration: number
  yellowDuration: number
  redDuration: number
  isOverridden?: boolean
  overrideTimer?: number
}

export type VehicleType = 'car' | 'bus' | 'truck' | 'bike' | 'emergency'
export type VehicleDriveStatus = 'cruising' | 'braking' | 'stopped' | 'accelerating' | 'hazard_slowdown'

export interface GridIntersection {
  id: string
  name: string
  x: number // canvas / svg coordinates
  y: number
  density: number
  signal: SignalState
}

export interface GridRoad {
  id: string
  from: string
  to: string
  fromName: string
  toName: string
  lengthMeters: number
  lanes: number
  speedLimitKmh: number
  hazard?: {
    type: string
    penalty: number
  }
}

export interface Vehicle {
  id: string
  type: VehicleType
  color: string
  roadId: string
  progress: number // 0 to 1 along the road
  speedKmh: number
  targetSpeedKmh: number
  distanceTraveledM: number
  status: VehicleDriveStatus
  pathHistory: string[]
  lengthM: number
}

export const VEHICLE_CONFIGS: Record<VehicleType, { maxSpeedKmh: number; lengthM: number; color: string; label: string }> = {
  car: { maxSpeedKmh: 50, lengthM: 4.5, color: '#34d399', label: 'Sedan' },
  bus: { maxSpeedKmh: 40, lengthM: 10, color: '#38bdf8', label: 'Transit Bus' },
  truck: { maxSpeedKmh: 35, lengthM: 12, color: '#fbbf24', label: 'Freight Truck' },
  bike: { maxSpeedKmh: 45, lengthM: 2, color: '#c084fc', label: 'Two-Wheeler' },
  emergency: { maxSpeedKmh: 75, lengthM: 6, color: '#f43f5e', label: 'Emergency Responder' },
}

/**
 * Creates initial interlocking signal state for an intersection
 */
export function createSignalState(
  id: string,
  initialNs: SignalColor = 'green',
  initialTimer = 12,
  greenDuration = 12,
  yellowDuration = 3,
): SignalState {
  return {
    id,
    nsColor: initialNs,
    ewColor: initialNs === 'green' ? 'red' : 'green',
    timer: initialTimer,
    greenDuration,
    yellowDuration,
    redDuration: greenDuration + yellowDuration,
    isOverridden: false,
  }
}

/**
 * Advances interlocking traffic signal state by delta seconds
 */
export function advanceSignal(signal: SignalState, deltaSec: number): SignalState {
  if (deltaSec <= 0) return signal

  // If manual override active, count down override
  if (signal.isOverridden && signal.overrideTimer && signal.overrideTimer > 0) {
    const nextTimer = signal.overrideTimer - deltaSec
    if (nextTimer <= 0) {
      return {
        ...signal,
        isOverridden: false,
        overrideTimer: 0,
        timer: signal.greenDuration,
      }
    }
    return { ...signal, overrideTimer: nextTimer }
  }

  let timer = signal.timer - deltaSec
  let nsColor = signal.nsColor
  let ewColor = signal.ewColor

  if (timer <= 0) {
    if (nsColor === 'green') {
      nsColor = 'yellow'
      ewColor = 'red'
      timer = signal.yellowDuration
    } else if (nsColor === 'yellow') {
      nsColor = 'red'
      ewColor = 'green'
      timer = signal.greenDuration
    } else if (ewColor === 'green') {
      nsColor = 'red'
      ewColor = 'yellow'
      timer = signal.yellowDuration
    } else {
      // ew was yellow -> NS turns green
      nsColor = 'green'
      ewColor = 'red'
      timer = signal.greenDuration
    }
  }

  return {
    ...signal,
    timer: Math.max(0.1, Number(timer.toFixed(2))),
    nsColor,
    ewColor,
  }
}

/**
 * Forces a signal into manual override (e.g. green wave or manual click)
 */
export function overrideSignal(
  signal: SignalState,
  direction: 'NS' | 'EW',
  durationSec = 20,
): SignalState {
  return {
    ...signal,
    isOverridden: true,
    overrideTimer: durationSec,
    nsColor: direction === 'NS' ? 'green' : 'red',
    ewColor: direction === 'EW' ? 'green' : 'red',
    timer: durationSec,
  }
}

/**
 * Calculates vehicle deceleration and stopping behavior at signal / obstacle
 */
export function computeNextVehicleState(
  vehicle: Vehicle,
  roadLengthMeters: number,
  deltaSec: number,
  distanceToLeadM: number,
  signalColorAtEnd: SignalColor,
  isEndOfRoadIntersection: boolean,
  hazardPenalty = 0,
): { progress: number; speedKmh: number; status: VehicleDriveStatus } {
  const currentPosM = vehicle.progress * roadLengthMeters
  const distanceToEndM = roadLengthMeters - currentPosM

  const baseConfig = VEHICLE_CONFIGS[vehicle.type]
  let desiredSpeedKmh = baseConfig.maxSpeedKmh

  // Emergency vehicles have priority and ignore standard red signals unless physically blocked
  const isEmergency = vehicle.type === 'emergency'

  // If there's a hazard penalty on this road, cap speed
  if (hazardPenalty > 0) {
    desiredSpeedKmh = Math.max(15, desiredSpeedKmh * (1 - Math.min(0.65, hazardPenalty)))
  }

  // Check if we need to stop for a signal at the end of the road
  let mustStopForSignal = false
  if (isEndOfRoadIntersection && !isEmergency) {
    if (signalColorAtEnd === 'red' && distanceToEndM < 45) {
      mustStopForSignal = true
    } else if (signalColorAtEnd === 'yellow' && distanceToEndM < 25 && distanceToEndM > 8) {
      mustStopForSignal = true
    }
  }

  // Check vehicle-following distance
  const safeGapM = Math.max(3.5, vehicle.speedKmh * 0.4) // headway gap
  let mustStopForLead = false
  if (distanceToLeadM < safeGapM * 1.5) {
    mustStopForLead = true
  }

  let status: VehicleDriveStatus = 'cruising'
  let newSpeedKmh = vehicle.speedKmh

  const accelRate = 4.5 * 3.6 // km/h per sec
  const decelRate = 8.0 * 3.6 // km/h per sec
  const hardBrakeRate = 14.0 * 3.6 // km/h per sec

  if (mustStopForLead && distanceToLeadM < 3) {
    newSpeedKmh = Math.max(0, newSpeedKmh - hardBrakeRate * deltaSec)
    status = newSpeedKmh < 0.5 ? 'stopped' : 'braking'
  } else if (mustStopForSignal && distanceToEndM < 3) {
    newSpeedKmh = Math.max(0, newSpeedKmh - hardBrakeRate * deltaSec)
    status = newSpeedKmh < 0.5 ? 'stopped' : 'braking'
  } else if (mustStopForSignal || mustStopForLead) {
    newSpeedKmh = Math.max(0, newSpeedKmh - decelRate * deltaSec)
    status = newSpeedKmh < 0.5 ? 'stopped' : 'braking'
  } else if (hazardPenalty > 0 && newSpeedKmh > desiredSpeedKmh) {
    newSpeedKmh = Math.max(desiredSpeedKmh, newSpeedKmh - decelRate * deltaSec)
    status = 'hazard_slowdown'
  } else if (newSpeedKmh < desiredSpeedKmh) {
    newSpeedKmh = Math.min(desiredSpeedKmh, newSpeedKmh + accelRate * deltaSec)
    status = newSpeedKmh > vehicle.speedKmh + 0.1 ? 'accelerating' : 'cruising'
  } else {
    newSpeedKmh = desiredSpeedKmh
    status = 'cruising'
  }

  // Advance position
  const speedMs = (newSpeedKmh * 1000) / 3600
  const distanceCoveredM = speedMs * deltaSec
  const nextPosM = currentPosM + distanceCoveredM
  const nextProgress = Math.min(1.0, nextPosM / roadLengthMeters)

  return {
    progress: nextProgress,
    speedKmh: Number(newSpeedKmh.toFixed(1)),
    status,
  }
}

/**
 * Point along a road segment.
 * Positive laneOffset sits on the left of travel (Indian left-hand drive).
 * headingDeg is the SVG rotation that points a nose-down sprite along travel.
 */
export function interpolateSegment(
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number,
  laneOffset = 3,
): { x: number; y: number; angleDeg: number; headingDeg: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const angleRad = Math.atan2(dy, dx)
  const angleDeg = (angleRad * 180) / Math.PI

  // Left-hand side of the direction of travel (screen y grows downward).
  const perpX = Math.sin(angleRad) * laneOffset
  const perpY = -Math.cos(angleRad) * laneOffset

  const baseX = from.x + dx * progress
  const baseY = from.y + dy * progress

  return {
    x: baseX + perpX,
    y: baseY + perpY,
    angleDeg,
    headingDeg: angleDeg - 90,
  }
}
