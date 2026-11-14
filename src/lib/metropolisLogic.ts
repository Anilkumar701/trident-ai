export type DrivingFSMState =
  | 'CRUISE'
  | 'FOLLOW'
  | 'AVOID'
  | 'YIELD'
  | 'EMERGENCY_BRAKE'

export type CitizenHazardCategory =
  | 'Pothole'
  | 'Broken Streetlight'
  | 'Open Manhole'
  | 'Blocked Drainage'

export type AssignedDepartment =
  | 'Municipal Engineering Bureau'
  | 'Electrical Supply Board'
  | 'Solid Waste & Flood Management Authority'

export interface TelemetryState {
  egoSpeedKmh: number
  distanceM: number
  closingVelMs: number
  ttcSec: number
  obstacle: 'none' | 'pothole' | 'manhole' | 'pedestrian' | 'vehicle'
  state: DrivingFSMState
}

export type IntersectionKey =
  | 'MG Road'
  | 'Silk Board'
  | 'Majestic'
  | 'Electronic City'

export type SignalMode = 'NORMAL' | 'EMERGENCY_GREEN'

export interface IntersectionInfo {
  name: IntersectionKey
  mode: SignalMode
  densityPercent: number
  activeGreenSeconds: number
  overrideActive: boolean
  queueLengthVehicles: number
}

export interface ParsedImageComplaint {
  category: CitizenHazardCategory
  severity: 'Low' | 'Medium' | 'Critical'
  department: AssignedDepartment
  suggestedNotes: string
  confidenceScore: number
}

/**
 * Resolves the destination government authority based on hazard checklist
 */
export function resolveTargetAuthority(issue: CitizenHazardCategory): AssignedDepartment {
  switch (issue) {
    case 'Pothole':
    case 'Open Manhole':
      return 'Municipal Engineering Bureau'
    case 'Broken Streetlight':
      return 'Electrical Supply Board'
    case 'Blocked Drainage':
      return 'Solid Waste & Flood Management Authority'
    default:
      return 'Municipal Engineering Bureau'
  }
}

/**
 * Automated image filename / metadata inspection script.
 * Parses file strings, regex patterns, or types and generates structured complaint metadata.
 */
export function parseComplaintImageMetadata(
  fileName: string,
  _fileSize?: number,
): ParsedImageComplaint {
  const lower = fileName.toLowerCase()

  if (/(street|light|lamp|bulb|pole|wire|electric)/i.test(lower)) {
    return {
      category: 'Broken Streetlight',
      severity: 'Medium',
      department: 'Electrical Supply Board',
      suggestedNotes:
        'Optical inspection: Luminaire failure / electrical wire exposure detected on arterial pole.',
      confidenceScore: 0.94,
    }
  }

  if (/(manhole|chamber|pit\s*cover|iron\s*lid|manhole_cover)/i.test(lower)) {
    return {
      category: 'Open Manhole',
      severity: 'Critical',
      department: 'Municipal Engineering Bureau',
      suggestedNotes:
        'Optical inspection: Dislodged utility chamber lid or open manhole cavity exposing high fall risk.',
      confidenceScore: 0.97,
    }
  }

  if (/(flood|water|sewage|drain|clog|submerge|rain|gutter)/i.test(lower)) {
    return {
      category: 'Blocked Drainage',
      severity: 'Medium',
      department: 'Solid Waste & Flood Management Authority',
      suggestedNotes:
        'Optical inspection: Stormwater intake silt accumulation and localized runoff pooling detected.',
      confidenceScore: 0.91,
    }
  }

  // Default road defect classification (Pothole / Asphalt fissure)
  return {
    category: 'Pothole',
    severity: 'Critical',
    department: 'Municipal Engineering Bureau',
    suggestedNotes:
      'Optical inspection: Severe road asphalt crater detected with sub-base gravel deterioration.',
    confidenceScore: 0.96,
  }
}

/**
 * Calculates dynamic pedestrian crossing clearance window.
 * Dynamically appends +15s buffer when vulnerable or elderly pedestrians or clusters are present.
 */
export function calculatePedestrianCrossingWindow(
  baseSeconds: number,
  isVulnerablePresent: boolean,
): { totalSeconds: number; bufferAppliedSeconds: number; isExtended: boolean } {
  const safeBase = Math.max(10, baseSeconds)
  const buffer = isVulnerablePresent ? 15 : 0
  return {
    totalSeconds: safeBase + buffer,
    bufferAppliedSeconds: buffer,
    isExtended: isVulnerablePresent,
  }
}

/**
 * Evaluates road surface hazard and relative velocity matrix to determine if
 * "CRITICAL ACCIDENT PRONE AREA AHEAD" warning must trip.
 */
export function checkAccidentProneArea(telemetry: {
  ttcSec: number
  distanceM: number
  obstacle: 'none' | 'pothole' | 'manhole' | 'pedestrian' | 'vehicle'
  egoSpeedKmh: number
}): { isAccidentProne: boolean; warningLevel: 'NONE' | 'ELEVATED' | 'CRITICAL'; reason: string } {
  if (telemetry.obstacle !== 'none' && telemetry.ttcSec <= 2.2) {
    return {
      isAccidentProne: true,
      warningLevel: 'CRITICAL',
      reason: `CRITICAL ACCIDENT PRONE AREA AHEAD: ${telemetry.obstacle.toUpperCase()} detected at ${telemetry.distanceM.toFixed(1)}m with TTC of ${telemetry.ttcSec.toFixed(2)}s!`,
    }
  }

  if (
    (telemetry.obstacle === 'pothole' || telemetry.obstacle === 'manhole') &&
    telemetry.distanceM < 22 &&
    telemetry.egoSpeedKmh > 35
  ) {
    return {
      isAccidentProne: true,
      warningLevel: 'ELEVATED',
      reason: `ELEVATED ROAD SURFACE HAZARD: Deep ${telemetry.obstacle} ahead at ${telemetry.distanceM.toFixed(1)}m. Deceleration required.`,
    }
  }

  return {
    isAccidentProne: false,
    warningLevel: 'NONE',
    reason: 'Clear corridor trajectory.',
  }
}

/**
 * Calculates Time-To-Collision (TTC) in seconds based on distance and closing velocity
 */
export function calculateTTC(distanceM: number, closingVelMs: number): number {
  if (distanceM <= 0) return 0.0
  if (closingVelMs <= 0.05) return 99.9
  const ttc = distanceM / closingVelMs
  return Number(Math.min(99.9, Math.max(0.1, ttc)).toFixed(2))
}

/**
 * Derives the 5-state autonomous driving FSM state from current telemetry parameters
 */
export function deriveFSMState(telemetry: {
  ttcSec: number
  distanceM: number
  obstacle: 'none' | 'pothole' | 'manhole' | 'pedestrian' | 'vehicle'
  previousState?: DrivingFSMState
  egoSpeedKmh?: number
}): DrivingFSMState {
  // Latch emergency braking if vehicle is still decelerating towards an imminent obstacle
  if (
    telemetry.previousState === 'EMERGENCY_BRAKE' &&
    telemetry.obstacle !== 'none' &&
    (telemetry.egoSpeedKmh ?? 1) > 0 &&
    telemetry.distanceM < 18
  ) {
    return 'EMERGENCY_BRAKE'
  }

  // 1. Emergency Braking: TTC drops critically below 1.8 seconds with active obstacle
  if (telemetry.ttcSec < 1.8 && telemetry.obstacle !== 'none') {
    return 'EMERGENCY_BRAKE'
  }

  // 2. Pedestrian Yield Priority: Active pedestrian inside lane corridor
  if (telemetry.obstacle === 'pedestrian') {
    return 'YIELD'
  }

  // 3. Hazard Avoidance: Road surface defect requiring trajectory lateral deviation
  if (telemetry.obstacle === 'pothole' || telemetry.obstacle === 'manhole') {
    return 'AVOID'
  }

  // 4. Car Following: Lead vehicle within safe buffer
  if (telemetry.distanceM < 26) {
    return 'FOLLOW'
  }

  // 5. Open Corridor Cruise
  return 'CRUISE'
}

/**
 * Calculates updated telemetry vector upon simulation tick
 */
export function advanceTelemetry(current: TelemetryState): TelemetryState {
  let speed = current.egoSpeedKmh
  let dist = current.distanceM

  switch (current.state) {
    case 'EMERGENCY_BRAKE':
      speed = Math.max(0, speed - 9.5)
      dist = Math.max(1.5, dist - (speed * 0.28) / 3.6)
      break
    case 'YIELD':
      speed = Math.max(12, speed - 3.2)
      dist = Math.max(8.0, dist - 0.5)
      break
    case 'AVOID':
      speed = Math.max(22, speed - 1.8)
      dist = Math.max(12.0, dist + 0.4)
      break
    case 'FOLLOW':
      speed = Math.max(28, speed * 0.99)
      dist = Math.max(14.0, dist + (Math.random() - 0.48) * 1.1)
      break
    case 'CRUISE':
    default:
      speed = Math.min(65, speed + (Math.random() - 0.35) * 1.6)
      dist = Math.max(18.0, dist + (Math.random() - 0.42) * 1.8)
      break
  }

  const speedMs = speed / 3.6
  const closingVel = Math.max(0.1, speedMs - 5.5)
  const ttc = calculateTTC(dist, closingVel)
  const nextTelemetry = {
    ...current,
    egoSpeedKmh: Number(speed.toFixed(1)),
    distanceM: Number(dist.toFixed(1)),
    closingVelMs: Number(closingVel.toFixed(2)),
    ttcSec: ttc,
  }

  return {
    ...nextTelemetry,
    state: deriveFSMState({
      ...nextTelemetry,
      previousState: current.state,
    }),
  }
}
