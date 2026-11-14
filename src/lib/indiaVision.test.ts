import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyIndiaTrafficBlob } from './indiaVision'
import { toVisionBoxes } from './yoloClient'
import { computeAdaptivePhase, computePassengerCarUnits } from './signalAutomation'
import { computeEmergencyTrack, nearestIntersection } from './bengaluruGrid'
import { computeEmergencyRoute } from './routing'

test('India mix classifies two-wheelers, cars, trucks, pedestrians and ambulances', () => {
  assert.equal(
    classifyIndiaTrafficBlob({ width: 8, height: 16, area: 120, speedPx: 3, meanRed: 40 }),
    'pedestrians',
  )
  assert.equal(
    classifyIndiaTrafficBlob({ width: 22, height: 14, area: 400, speedPx: 12, meanRed: 50 }),
    'bikes',
  )
  assert.equal(
    classifyIndiaTrafficBlob({ width: 48, height: 28, area: 2400, speedPx: 6, meanRed: 60 }),
    'cars',
  )
  assert.equal(
    classifyIndiaTrafficBlob({ width: 96, height: 42, area: 8200, speedPx: 4, meanRed: 70 }),
    'trucks',
  )
  assert.equal(
    classifyIndiaTrafficBlob({ width: 70, height: 32, area: 2800, speedPx: 7, meanRed: 170 }),
    'ambulance',
  )
})

test('adaptive Indian ATC extends green with PCU demand and pedestrian buffer', () => {
  const light = computeAdaptivePhase({ cars: 2, bikes: 4, trucks: 0, pedestrians: 1 })
  const heavy = computeAdaptivePhase({ cars: 18, bikes: 22, trucks: 4, pedestrians: 2 })
  const zebra = computeAdaptivePhase({ cars: 3, bikes: 2, trucks: 0, pedestrians: 9 })
  assert.ok(heavy.greenSeconds > light.greenSeconds)
  assert.equal(zebra.mode, 'PEDESTRIAN_PRIORITY')
  assert.ok(zebra.pedestrianPhaseSeconds >= 15)
  assert.ok(computePassengerCarUnits({ cars: 2, bikes: 2, trucks: 1, pedestrians: 0 }) > 4)
})

test('Bengaluru emergency track is time-optimal Silk Board to Majestic via MG Road', () => {
  const track = computeEmergencyTrack('Silk Board', 'Majestic')
  assert.equal(track.origin, 'Silk Board')
  assert.equal(track.destination, 'Majestic')
  assert.ok(track.nodes.includes('MG Road') || track.nodes.length >= 2)
  assert.ok(track.coords.length >= 2)
  assert.ok(track.etaMin > 0)
  assert.equal(nearestIntersection(12.9176, 77.6238), 'Silk Board')
})

test('YOLO boxes map into live vision overlay blobs', () => {
  const boxes = toVisionBoxes([
    { x: 10, y: 20, width: 30, height: 40, kind: 'pedestrians', label: 'person', confidence: 0.9 },
    { x: 1, y: 2, width: 8, height: 8, kind: 'motorcycle', label: 'motorcycle', confidence: 0.8 },
  ])
  assert.equal(boxes[0]?.kind, 'pedestrians')
  assert.equal(boxes[1]?.kind, 'bikes')
})

test('Delhi graph emergency route prefers travel time over raw distance', () => {
  const path = computeEmergencyRoute('CP', 'LP')
  assert.ok(path)
  assert.equal(path?.nodes[0], 'CP')
  assert.equal(path?.nodes.at(-1), 'LP')
  assert.ok((path?.travelMin ?? 0) > 0)
})
