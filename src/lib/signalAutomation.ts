import type { ClassCounts } from '../types'

export interface AdaptivePhase {
  greenSeconds: number
  pedestrianPhaseSeconds: number
  densityPercent: number
  pcu: number
  mode: 'VEHICLE_PRIORITY' | 'PEDESTRIAN_PRIORITY' | 'BALANCED'
}

/**
 * Indian Roads Congress PCU factors for mixed Bengaluru traffic.
 * Two-wheelers 0.5, cars 1.0, HCV 2.8, pedestrians as crossing demand.
 */
export function computePassengerCarUnits(counts: ClassCounts): number {
  return counts.cars * 1.0 + counts.bikes * 0.5 + counts.trucks * 2.8 + counts.pedestrians * 0.2
}

/**
 * Adaptive signal timing from live frame counts.
 * Webster-style split with a 12–42s green clamp used by Indian urban ATC systems.
 */
export function computeAdaptivePhase(counts: ClassCounts): AdaptivePhase {
  const pcu = computePassengerCarUnits(counts)
  const vehicleDemand = counts.cars + counts.bikes * 0.6 + counts.trucks * 1.8
  const pedDemand = counts.pedestrians
  const densityPercent = Math.min(99, Math.round(18 + pcu * 4.2))

  let mode: AdaptivePhase['mode'] = 'BALANCED'
  if (pedDemand >= 6 && pedDemand >= vehicleDemand * 0.45) {
    mode = 'PEDESTRIAN_PRIORITY'
  } else if (vehicleDemand >= 8) {
    mode = 'VEHICLE_PRIORITY'
  }

  const baseGreen = 12 + Math.round(Math.min(24, vehicleDemand * 1.15))
  const pedPhase = 8 + Math.min(18, pedDemand * 2) + (mode === 'PEDESTRIAN_PRIORITY' ? 15 : 0)
  const greenSeconds =
    mode === 'PEDESTRIAN_PRIORITY'
      ? Math.max(10, baseGreen - 4)
      : Math.min(42, Math.max(12, baseGreen))

  return {
    greenSeconds,
    pedestrianPhaseSeconds: Math.min(32, pedPhase),
    densityPercent,
    pcu: Number(pcu.toFixed(1)),
    mode,
  }
}

export function queueFromCounts(counts: ClassCounts): number {
  return Math.max(0, Math.round(counts.cars + counts.bikes * 0.45 + counts.trucks * 1.4))
}
