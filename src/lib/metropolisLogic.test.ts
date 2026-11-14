import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveTargetAuthority,
  calculateTTC,
  deriveFSMState,
  advanceTelemetry,
  parseComplaintImageMetadata,
  calculatePedestrianCrossingWindow,
  checkAccidentProneArea,
  type TelemetryState,
} from './metropolisLogic'

test('resolveTargetAuthority accurately maps citizen hazard issues to departments', () => {
  assert.equal(resolveTargetAuthority('Pothole'), 'Municipal Engineering Bureau')
  assert.equal(resolveTargetAuthority('Open Manhole'), 'Municipal Engineering Bureau')
  assert.equal(resolveTargetAuthority('Broken Streetlight'), 'Electrical Supply Board')
  assert.equal(
    resolveTargetAuthority('Blocked Drainage'),
    'Solid Waste & Flood Management Authority',
  )
})

test('calculateTTC computes time-to-collision correctly with boundary checks', () => {
  assert.equal(calculateTTC(50, 10), 5.0)
  assert.equal(calculateTTC(15, 10), 1.5)
  assert.equal(calculateTTC(0, 10), 0.0)
  assert.equal(calculateTTC(50, 0), 99.9)
  assert.equal(calculateTTC(50, -5), 99.9)
})

test('deriveFSMState accurately evaluates 5 driving states', () => {
  // Emergency brake when TTC < 1.8 with obstacle
  assert.equal(
    deriveFSMState({ ttcSec: 1.2, distanceM: 10, obstacle: 'vehicle' }),
    'EMERGENCY_BRAKE',
  )

  // Yield on pedestrian
  assert.equal(
    deriveFSMState({ ttcSec: 4.5, distanceM: 30, obstacle: 'pedestrian' }),
    'YIELD',
  )

  // Avoid on pothole or manhole
  assert.equal(
    deriveFSMState({ ttcSec: 5.0, distanceM: 35, obstacle: 'pothole' }),
    'AVOID',
  )
  assert.equal(
    deriveFSMState({ ttcSec: 5.0, distanceM: 35, obstacle: 'manhole' }),
    'AVOID',
  )

  // Follow when lead vehicle is within 26m
  assert.equal(
    deriveFSMState({ ttcSec: 6.2, distanceM: 20, obstacle: 'none' }),
    'FOLLOW',
  )

  // Cruise when open road
  assert.equal(
    deriveFSMState({ ttcSec: 12.0, distanceM: 60, obstacle: 'none' }),
    'CRUISE',
  )
})

test('advanceTelemetry calculates deceleration and state shifts on emergency brake', () => {
  const initial: TelemetryState = {
    egoSpeedKmh: 45,
    distanceM: 15,
    closingVelMs: 8.5,
    ttcSec: 1.76,
    obstacle: 'vehicle',
    state: 'EMERGENCY_BRAKE',
  }

  const next = advanceTelemetry(initial)
  assert.ok(next.egoSpeedKmh < initial.egoSpeedKmh, 'Ego speed must decrease under braking')
  assert.equal(next.state, 'EMERGENCY_BRAKE')
})

test('parseComplaintImageMetadata identifies category and department from filename patterns', () => {
  const light = parseComplaintImageMetadata('broken_streetlight_pole_4.jpg')
  assert.equal(light.category, 'Broken Streetlight')
  assert.equal(light.department, 'Electrical Supply Board')

  const manhole = parseComplaintImageMetadata('open_manhole_drain_chamber.png')
  assert.equal(manhole.category, 'Open Manhole')
  assert.equal(manhole.department, 'Municipal Engineering Bureau')

  const flood = parseComplaintImageMetadata('underpass_flood_drainage_block.jpg')
  assert.equal(flood.category, 'Blocked Drainage')
  assert.equal(flood.department, 'Solid Waste & Flood Management Authority')

  const pothole = parseComplaintImageMetadata('asphalt_pothole_defect.jpg')
  assert.equal(pothole.category, 'Pothole')
  assert.equal(pothole.department, 'Municipal Engineering Bureau')
})

test('calculatePedestrianCrossingWindow appends +15s buffer for vulnerable clusters', () => {
  const regular = calculatePedestrianCrossingWindow(25, false)
  assert.equal(regular.totalSeconds, 25)
  assert.equal(regular.bufferAppliedSeconds, 0)
  assert.equal(regular.isExtended, false)

  const extended = calculatePedestrianCrossingWindow(25, true)
  assert.equal(extended.totalSeconds, 40)
  assert.equal(extended.bufferAppliedSeconds, 15)
  assert.equal(extended.isExtended, true)
})

test('checkAccidentProneArea trips warning on critical TTC or proximate hazard', () => {
  const critical = checkAccidentProneArea({
    ttcSec: 1.5,
    distanceM: 12,
    obstacle: 'pothole',
    egoSpeedKmh: 45,
  })
  assert.equal(critical.isAccidentProne, true)
  assert.equal(critical.warningLevel, 'CRITICAL')
  assert.ok(critical.reason.includes('CRITICAL ACCIDENT PRONE AREA AHEAD'))

  const clear = checkAccidentProneArea({
    ttcSec: 8.5,
    distanceM: 50,
    obstacle: 'none',
    egoSpeedKmh: 45,
  })
  assert.equal(clear.isAccidentProne, false)
  assert.equal(clear.warningLevel, 'NONE')
})
