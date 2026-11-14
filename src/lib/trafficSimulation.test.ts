import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceSignal,
  advanceSignalWithStrategy,
  chooseNextRoad,
  createSignalState,
  overrideSignal,
  computeNextVehicleState,
  interpolateSegment,
  type GridRoad,
  type Vehicle,
} from './trafficSimulation'

test('createSignalState initializes interlocking NS and EW phases', () => {
  const signal = createSignalState('INT-1', 'green', 10, 10, 3)
  assert.equal(signal.id, 'INT-1')
  assert.equal(signal.nsColor, 'green')
  assert.equal(signal.ewColor, 'red')
  assert.equal(signal.timer, 10)
})

test('advanceSignal cycles through Green -> Yellow -> Red -> Green phases', () => {
  let signal = createSignalState('INT-1', 'green', 2, 10, 3)

  // Step 1: NS green expires after 2s
  signal = advanceSignal(signal, 2.1)
  assert.equal(signal.nsColor, 'yellow')
  assert.equal(signal.ewColor, 'red')
  assert.equal(signal.timer, 3)

  // Step 2: Yellow expires after 3s -> EW becomes green
  signal = advanceSignal(signal, 3.1)
  assert.equal(signal.nsColor, 'red')
  assert.equal(signal.ewColor, 'green')
  assert.equal(signal.timer, 10)

  // Step 3: EW green expires -> EW becomes yellow
  signal = advanceSignal(signal, 10.1)
  assert.equal(signal.nsColor, 'red')
  assert.equal(signal.ewColor, 'yellow')
  assert.equal(signal.timer, 3)

  // Step 4: EW yellow expires -> NS becomes green again
  signal = advanceSignal(signal, 3.1)
  assert.equal(signal.nsColor, 'green')
  assert.equal(signal.ewColor, 'red')
})

test('overrideSignal locks directions into priority green wave', () => {
  const base = createSignalState('INT-1', 'green', 5)
  const overridden = overrideSignal(base, 'EW', 15)

  assert.equal(overridden.isOverridden, true)
  assert.equal(overridden.ewColor, 'green')
  assert.equal(overridden.nsColor, 'red')
  assert.equal(overridden.timer, 15)

  // After 5 seconds, still overridden
  const step = advanceSignal(overridden, 5)
  assert.equal(step.isOverridden, true)
  assert.equal(step.ewColor, 'green')

  // After remaining 11 seconds, override releases
  const released = advanceSignal(step, 11)
  assert.equal(released.isOverridden, false)
})

test('computeNextVehicleState accelerates from stop on open green road', () => {
  const vehicle: Vehicle = {
    id: 'veh-1',
    type: 'car',
    color: '#34d399',
    roadId: 'road-1',
    progress: 0.1,
    speedKmh: 0,
    targetSpeedKmh: 50,
    distanceTraveledM: 10,
    status: 'stopped',
    pathHistory: [],
    lengthM: 4.5,
  }

  const result = computeNextVehicleState(
    vehicle,
    100, // 100m road
    1.0, // 1s delta
    50,  // lead distance 50m
    'green',
    true,
  )

  assert.ok(result.speedKmh > 0, 'Vehicle should have accelerated')
  assert.ok(result.progress > vehicle.progress, 'Progress should advance')
  assert.equal(result.status, 'accelerating')
})

test('computeNextVehicleState decelerates and stops at a red signal', () => {
  const vehicle: Vehicle = {
    id: 'veh-2',
    type: 'car',
    color: '#34d399',
    roadId: 'road-1',
    progress: 0.85, // 85m into a 100m road (15m from red light)
    speedKmh: 30,
    targetSpeedKmh: 50,
    distanceTraveledM: 85,
    status: 'cruising',
    pathHistory: [],
    lengthM: 4.5,
  }

  const result = computeNextVehicleState(
    vehicle,
    100,
    1.0,
    100, // lead vehicle far away
    'red', // Red light!
    true,  // At intersection
  )

  assert.ok(result.speedKmh < vehicle.speedKmh, 'Speed should decrease approaching red')
  assert.equal(result.status, 'braking')
})

test('computeNextVehicleState obeys road hazard slowdown cap', () => {
  const vehicle: Vehicle = {
    id: 'veh-3',
    type: 'truck',
    color: '#fbbf24',
    roadId: 'road-hazard',
    progress: 0.3,
    speedKmh: 35,
    targetSpeedKmh: 35,
    distanceTraveledM: 30,
    status: 'cruising',
    pathHistory: [],
    lengthM: 12,
  }

  const result = computeNextVehicleState(
    vehicle,
    100,
    1.0,
    100,
    'green',
    false,
    0.5, // 50% hazard penalty
  )

  assert.ok(result.speedKmh < 35, 'Vehicle should slow down due to hazard penalty')
  assert.equal(result.status, 'hazard_slowdown')
})

test('interpolateSegment calculates 2D position and lane offset correctly', () => {
  const from = { x: 0, y: 0 }
  const to = { x: 100, y: 0 }

  const midpoint = interpolateSegment(from, to, 0.5, 4)
  assert.equal(midpoint.x, 50)
  assert.equal(midpoint.y, -4) // Left-hand lane is north of an eastbound road
  assert.equal(midpoint.angleDeg, 0)
  assert.equal(midpoint.headingDeg, -90)
})

test('advanceSignalWithStrategy preempts signal immediately for V2X emergency approach', () => {
  const signal = createSignalState('INT-V2X', 'green', 8, 12, 3) // EW is currently red
  const updated = advanceSignalWithStrategy(
    signal,
    {
      nsQueue: 3,
      ewQueue: 1,
      emergencyNS: false,
      emergencyEW: true,
      strategy: 'v2x_emergency',
    },
    0.5,
  )

  assert.equal(updated.isOverridden, true)
  assert.equal(updated.ewColor, 'green')
  assert.equal(updated.nsColor, 'red')
})

test('advanceSignalWithStrategy shortens empty green lane early under Webster AI', () => {
  const signal = createSignalState('INT-WEB', 'green', 9, 12, 3)
  const updated = advanceSignalWithStrategy(
    signal,
    {
      nsQueue: 0,
      ewQueue: 5,
      emergencyNS: false,
      emergencyEW: false,
      strategy: 'webster_ai',
    },
    1.1,
  )

  assert.equal(updated.nsColor, 'yellow')
  assert.equal(updated.ewColor, 'red')
})

test('chooseNextRoad avoids hazardous roads under Webster AI strategy', () => {
  const hazardousRoad: GridRoad = {
    id: 'A->B',
    from: 'A',
    to: 'B',
    fromName: 'A',
    toName: 'B',
    lengthMeters: 500,
    lanes: 2,
    speedLimitKmh: 50,
    hazard: { type: 'Waterlogging', penalty: 0.6 },
  }
  const clearRoad: GridRoad = {
    id: 'A->C',
    from: 'A',
    to: 'C',
    fromName: 'A',
    toName: 'C',
    lengthMeters: 500,
    lanes: 2,
    speedLimitKmh: 50,
  }
  const loads = new Map<string, number>([
    ['A->B', 2],
    ['A->C', 1],
  ])

  const picked = chooseNextRoad([hazardousRoad, clearRoad], loads, 'webster_ai', false)
  assert.equal(picked?.id, 'A->C')
})

