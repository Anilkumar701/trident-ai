import { useEffect, useMemo, useRef, useState } from 'react'
import { APIProvider, AdvancedMarker, Map } from '@vis.gl/react-google-maps'
import {
  AlertTriangle,
  Cpu,
  Gauge,
  Layers,
  MapPin,
  Navigation,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Users,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDashboard } from '../../context/DashboardContext'
import type { DrivingFSMState } from '../../lib/metropolisLogic'
import {
  GmpCircle,
  GmpMissingKeyBanner,
  GmpPanTo,
  GmpPolygon,
  GmpPolyline,
  GmpTrafficLayer,
  useGmpApiKey,
} from '../map/GmpPrimitives'
import {
  AV_CORRIDOR_PATH,
  interpolateGeoPath,
  projectPointAhead,
} from '../../lib/geoCorridors'

interface TelemetryPoint {
  t: string
  speedKmh: number
  distanceM: number
  ttcSec: number
}

const FSM_STATES: DrivingFSMState[] = [
  'CRUISE',
  'FOLLOW',
  'AVOID',
  'YIELD',
  'EMERGENCY_BRAKE',
]

const METHOD_DETAILS: Record<
  'kinematic_ttc' | 'vulnerable_buffer' | 'evasive_corridor',
  { label: string; formula: string; summary: string }
> = {
  kinematic_ttc: {
    label: 'Kinematic TTC Envelope',
    formula: 'TTC = d_obs / max(0.1, v_ego - v_obs)',
    summary:
      'Continuously solves longitudinal closing velocity and stopping distance d_stop = v²/(2·a_max) to arbitrate CRUISE vs. EMERGENCY_BRAKE.',
  },
  vulnerable_buffer: {
    label: 'VRU Crossing +15s Buffer',
    formula: 'T_green = T_base(25s) + I_vru · 15s',
    summary:
      'YOLOv11n pedestrian pose & school/elderly cohort detection locks crosswalk signals to 40s and biases Ego AV into early YIELD.',
  },
  evasive_corridor: {
    label: 'Lateral Evasive Spline',
    formula: 'Δy(s) = w_lane · [3(s/L)² - 2(s/L)³]',
    summary:
      'Computes a minimum-jerk cubic lane-offset trajectory around surface defects (potholes & open manholes) while verifying adjacent blindspots.',
  },
}

export function PedestrianFleetSimulator() {
  const {
    telemetry,
    fsmState,
    accidentProneWarning,
    isVulnerablePedestrianPresent,
    toggleVulnerablePedestrian,
    crossingWindow,
    injectObstacle,
    triggerPedestrianWalkway,
    accelerateEgoCar,
    resetTelemetry,
    runFleetScenario,
  } = useDashboard()

  const apiKey = useGmpApiKey()
  const [simMethod, setSimMethod] = useState<'kinematic_ttc' | 'vulnerable_buffer' | 'evasive_corridor'>(
    'kinematic_ttc',
  )
  const [corridorView, setCorridorView] = useState<'split' | 'real_map' | 'lidar_2d'>('split')
  const [mapTrafficOn, setMapTrafficOn] = useState<boolean>(true)
  const [followEgoCam, setFollowEgoCam] = useState<boolean>(true)
  const [corridorProgress, setCorridorProgress] = useState<number>(0.18)
  const [ttcAlertThreshold, setTtcAlertThreshold] = useState<number>(2.2)
  const [decelMaxMs2, setDecelMaxMs2] = useState<number>(7.5)
  const [history, setHistory] = useState<TelemetryPoint[]>(() => [
    {
      t: '00:00',
      speedKmh: Number(telemetry.egoSpeedKmh.toFixed(1)),
      distanceM: Number(telemetry.distanceM.toFixed(1)),
      ttcSec: Number(Math.min(15, telemetry.ttcSec).toFixed(2)),
    },
  ])
  const latestTelemetryRef = useRef(telemetry)

  useEffect(() => {
    latestTelemetryRef.current = telemetry
  }, [telemetry])

  // Record rolling telemetry waveform & advance Ego AV along real Bengaluru MG Road corridor
  useEffect(() => {
    const timer = window.setInterval(() => {
      const snap = latestTelemetryRef.current
      const speedFactor = Math.max(0, snap.egoSpeedKmh) / 60
      setCorridorProgress((prev) => (prev + 0.0045 * speedFactor) % 0.88)

      const label = new Date().toLocaleTimeString('en-IN', {
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      setHistory((prev) => [
        ...prev.slice(-23),
        {
          t: label,
          speedKmh: Number(snap.egoSpeedKmh.toFixed(1)),
          distanceM: Number(snap.distanceM.toFixed(1)),
          ttcSec: Number(Math.min(15, snap.ttcSec).toFixed(2)),
        },
      ])
    }, 550)
    return () => window.clearInterval(timer)
  }, [])

  const physicsSummary = useMemo(() => {
    const vMs = telemetry.egoSpeedKmh / 3.6
    const reactionDistM = vMs * 0.45
    const brakingDistM = (vMs * vMs) / (2 * decelMaxMs2)
    const stoppingDistM = reactionDistM + brakingDistM
    const safetyMarginM = telemetry.distanceM - stoppingDistM
    const thresholdTripped = telemetry.ttcSec <= ttcAlertThreshold && telemetry.obstacle !== 'none'
    return {
      stoppingDistM: Number(stoppingDistM.toFixed(1)),
      safetyMarginM: Number(safetyMarginM.toFixed(1)),
      thresholdTripped,
    }
  }, [telemetry.egoSpeedKmh, telemetry.distanceM, telemetry.ttcSec, telemetry.obstacle, decelMaxMs2, ttcAlertThreshold])

  // Map distance (0..50m) onto SVG lane coordinate (ego at x=120, obstacle up to x=620)
  const clampedDist = Math.max(4, Math.min(48, telemetry.distanceM))
  const obstacleX = 145 + (clampedDist / 48) * 465
  const isEvasiveArc = fsmState === 'AVOID'
  const isBraking = fsmState === 'EMERGENCY_BRAKE'
  const isYielding = fsmState === 'YIELD' || isVulnerablePedestrianPresent

  const coneColor =
    fsmState === 'EMERGENCY_BRAKE'
      ? '#f43f5e'
      : fsmState === 'YIELD'
        ? '#f59e0b'
        : fsmState === 'AVOID'
          ? '#fb923c'
          : '#10b981'

  const activeMethod = METHOD_DETAILS[simMethod]

  const geoTelemetry = useMemo(() => {
    const ego = interpolateGeoPath(AV_CORRIDOR_PATH, corridorProgress)
    const sensorRangeM = Math.max(24, Math.min(110, physicsSummary.stoppingDistM * 2.2))
    const leftTip = projectPointAhead(ego.point, ego.headingDeg, sensorRangeM, -14)
    const rightTip = projectPointAhead(ego.point, ego.headingDeg, sensorRangeM, 14)
    const obsDistM = Math.max(12, Math.min(95, telemetry.distanceM * 1.8))
    const obstaclePos = projectPointAhead(ego.point, ego.headingDeg, obsDistM, 0)
    const evasivePath = isEvasiveArc
      ? [
          ego.point,
          projectPointAhead(ego.point, ego.headingDeg, obsDistM * 0.45, -14),
          projectPointAhead(ego.point, ego.headingDeg, obsDistM * 0.95, -15),
          projectPointAhead(ego.point, ego.headingDeg, obsDistM * 1.4, 0),
        ]
      : []

    return {
      egoPoint: ego.point,
      headingDeg: ego.headingDeg,
      lidarCone: [ego.point, leftTip, rightTip],
      obstaclePos,
      evasivePath,
    }
  }, [corridorProgress, physicsSummary.stoppingDistM, telemetry.distanceM, isEvasiveArc])

  return (
    <div className="space-y-5">
      {/* Critical Accident Prone Warning Banner */}
      {(accidentProneWarning.isAccidentProne || physicsSummary.thresholdTripped) && (
        <div className="rounded-xl border border-rose-500/80 bg-rose-950/75 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-600 text-white shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-xs font-bold tracking-wider text-rose-200 uppercase">
                  {accidentProneWarning.isAccidentProne
                    ? accidentProneWarning.reason
                    : `CUSTOM TTC THRESHOLD BREACHED (${telemetry.ttcSec}s ≤ ${ttcAlertThreshold.toFixed(1)}s)`}
                </p>
                <p className="text-xs text-rose-200/85 tabular-nums">
                  Required stopping distance {physicsSummary.stoppingDistM}m vs. obstacle range{' '}
                  {telemetry.distanceM.toFixed(1)}m · Margin {physicsSummary.safetyMarginM}m
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetTelemetry}
              className="rounded-lg bg-rose-600 px-3 py-1.5 font-mono text-xs font-semibold text-white hover:bg-rose-500 transition whitespace-nowrap"
            >
              Reset Telemetry Vector
            </button>
          </div>
        </div>
      )}

      {/* Simulation Method & Scenario Selector Header */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/60 text-cyan-400 shrink-0">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <span className="font-mono text-xs font-bold text-cyan-400 uppercase tracking-wider block">
                PEDESTRIAN &amp; AV FLEET MULTI-METHOD SIMULATOR
              </span>
              <p className="text-xs text-slate-400">
                Switch verification algorithms and inject Bengaluru road scenarios to validate FSM transitions
              </p>
            </div>
          </div>

          {/* 3 Verification Methods */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 p-1">
            {(
              [
                ['kinematic_ttc', 'Kinematic TTC'],
                ['vulnerable_buffer', 'VRU +15s Buffer'],
                ['evasive_corridor', 'Lateral Spline'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSimMethod(key)
                  if (key === 'vulnerable_buffer') {
                    runFleetScenario('school_zone')
                  } else if (key === 'evasive_corridor') {
                    runFleetScenario('monsoon_pothole')
                  } else {
                    runFleetScenario('platoon_cruise')
                  }
                }}
                className={`rounded-md px-2.5 py-1.5 font-mono text-xs font-semibold transition whitespace-nowrap ${
                  simMethod === key
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Method Mathematical Formulation Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/80 px-3.5 py-2.5">
          <div>
            <span className="font-mono text-[11px] font-bold text-emerald-400 uppercase">
              {activeMethod.label}
            </span>
            <p className="text-xs text-slate-400 mt-0.5">{activeMethod.summary}</p>
          </div>
          <code className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-xs text-cyan-300 tabular-nums">
            {activeMethod.formula}
          </code>
        </div>

        {/* Scenario Sweep Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-slate-500 uppercase mr-1">
            Scenario Sweeps:
          </span>
          <button
            type="button"
            onClick={() => {
              setSimMethod('vulnerable_buffer')
              runFleetScenario('school_zone')
            }}
            className="rounded-lg border border-amber-500/40 bg-amber-950/35 px-3 py-1.5 font-mono text-xs font-medium text-amber-200 hover:bg-amber-900/45 transition whitespace-nowrap"
          >
            School Zone (+15s Elderly Group)
          </button>
          <button
            type="button"
            onClick={() => {
              setSimMethod('evasive_corridor')
              runFleetScenario('monsoon_pothole')
            }}
            className="rounded-lg border border-orange-500/40 bg-orange-950/35 px-3 py-1.5 font-mono text-xs font-medium text-orange-200 hover:bg-orange-900/45 transition whitespace-nowrap"
          >
            Monsoon Pothole Avoidance
          </button>
          <button
            type="button"
            onClick={() => {
              setSimMethod('kinematic_ttc')
              runFleetScenario('cut_in')
            }}
            className="rounded-lg border border-rose-500/40 bg-rose-950/35 px-3 py-1.5 font-mono text-xs font-medium text-rose-200 hover:bg-rose-900/45 transition whitespace-nowrap"
          >
            Lead Vehicle Cut-In (AEB)
          </button>
          <button
            type="button"
            onClick={() => {
              setSimMethod('kinematic_ttc')
              runFleetScenario('platoon_cruise')
            }}
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/35 px-3 py-1.5 font-mono text-xs font-medium text-emerald-200 hover:bg-emerald-900/45 transition whitespace-nowrap"
          >
            Urban Platoon Cruise
          </button>
          <button
            type="button"
            onClick={resetTelemetry}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-xs text-slate-300 hover:bg-slate-700 transition whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Real-World Bengaluru Map + Interactive 2D SVG Ego-Vehicle Corridor */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-cyan-400" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
              LIVE EGO-AV CORRIDOR MAP &amp; LIDAR TTC SENSOR ENVELOPE
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-0.5">
              {(
                [
                  ['split', 'Split: Map + LiDAR'],
                  ['real_map', 'Real Map Only'],
                  ['lidar_2d', '2D LiDAR Only'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCorridorView(mode)}
                  className={`rounded px-2 py-1 transition ${
                    corridorView === mode
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {corridorView !== 'lidar_2d' && (
              <>
                <button
                  type="button"
                  onClick={() => setMapTrafficOn((v) => !v)}
                  className={`flex items-center gap-1 rounded border px-2 py-1 transition ${
                    mapTrafficOn
                      ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300'
                      : 'border-slate-700 bg-slate-950 text-slate-400'
                  }`}
                >
                  <Layers className="h-3 w-3" />
                  Traffic
                </button>
                <button
                  type="button"
                  onClick={() => setFollowEgoCam((v) => !v)}
                  className={`flex items-center gap-1 rounded border px-2 py-1 transition ${
                    followEgoCam
                      ? 'border-cyan-500/40 bg-cyan-950/50 text-cyan-300'
                      : 'border-slate-700 bg-slate-950 text-slate-400'
                  }`}
                >
                  <MapPin className="h-3 w-3" />
                  {followEgoCam ? 'Cam Lock' : 'Free Pan'}
                </button>
              </>
            )}

            <div className="hidden sm:flex items-center gap-3 text-xs tabular-nums pl-1">
              <span className="text-slate-400">
                Stop: <strong className="text-slate-100">{physicsSummary.stoppingDistM}m</strong>
              </span>
              <span className="text-slate-400">
                Margin:{' '}
                <strong className={physicsSummary.safetyMarginM < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  {physicsSummary.safetyMarginM >= 0 ? '+' : ''}
                  {physicsSummary.safetyMarginM}m
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div className={`grid gap-3 ${corridorView === 'split' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          {corridorView !== 'lidar_2d' && (
            <div className="relative h-64 sm:h-72 w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              {apiKey ? (
                <APIProvider apiKey={apiKey} solutionChannel="gmp_mcp_codeassist_v1_aistudio">
                  <Map
                    defaultCenter={geoTelemetry.egoPoint}
                    defaultZoom={16}
                    mapId="DEMO_MAP_ID"
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                    style={{ width: '100%', height: '100%' }}
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  >
                    <GmpTrafficLayer enabled={mapTrafficOn} />
                    <GmpPanTo target={followEgoCam ? geoTelemetry.egoPoint : null} />

                    {/* MG Road -> Trinity -> Indiranagar AV Test Corridor */}
                    <GmpPolyline path={AV_CORRIDOR_PATH} color="#38bdf8" strokeWeight={4} strokeOpacity={0.75} />

                    {/* Lateral Evasive Spline around Road Defect */}
                    {geoTelemetry.evasivePath.length >= 2 && (
                      <GmpPolyline
                        path={geoTelemetry.evasivePath}
                        color="#fb923c"
                        strokeWeight={4}
                        strokeOpacity={0.95}
                        dashed
                      />
                    )}

                    {/* Dynamic Forward LiDAR / TTC Cone */}
                    <GmpPolygon
                      paths={geoTelemetry.lidarCone}
                      color={coneColor}
                      fillOpacity={0.28}
                      strokeWeight={2}
                    />

                    {/* Crosswalk Safety Buffer Zone Circle */}
                    {isYielding && (
                      <GmpCircle
                        center={geoTelemetry.obstaclePos}
                        radiusMeters={28}
                        color="#f59e0b"
                        fillOpacity={0.2}
                      />
                    )}

                    {/* Moving Ego AV Marker */}
                    <AdvancedMarker
                      position={geoTelemetry.egoPoint}
                      title={`Ego AV · ${fsmState} · ${telemetry.egoSpeedKmh.toFixed(1)} km/h`}
                    >
                      <div
                        className="flex items-center gap-1 rounded-full border-2 border-white px-2 py-1 font-mono text-[10px] font-bold text-white shadow-lg"
                        style={{ backgroundColor: isBraking ? '#e11d48' : '#0284c7' }}
                      >
                        <span>EGO</span>
                        <span>{telemetry.egoSpeedKmh.toFixed(0)} km/h</span>
                      </div>
                    </AdvancedMarker>

                    {/* Projected Hazard / Pedestrian Obstacle on Real Street */}
                    {telemetry.obstacle !== 'none' && (
                      <AdvancedMarker
                        position={geoTelemetry.obstaclePos}
                        title={`Detected ${telemetry.obstacle.toUpperCase()} (${telemetry.distanceM.toFixed(1)}m ahead)`}
                      >
                        <div className="rounded-md border border-amber-300 bg-slate-950/95 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300 shadow-lg">
                          {telemetry.obstacle === 'pedestrian'
                            ? `VRU CROSSWALK (+${crossingWindow.bufferAppliedSeconds}s)`
                            : telemetry.obstacle.toUpperCase()}
                        </div>
                      </AdvancedMarker>
                    )}
                  </Map>
                </APIProvider>
              ) : (
                <GmpMissingKeyBanner label="AV Corridor Real Map" />
              )}

              <div className="pointer-events-none absolute bottom-2 left-2 rounded border border-slate-700/80 bg-slate-950/90 px-2.5 py-1 font-mono text-[10px] text-slate-300">
                MG Road → Trinity Corridor · FSM: <strong className="text-cyan-300">{fsmState}</strong>
              </div>
            </div>
          )}

          {corridorView !== 'real_map' && (
            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              <svg
                viewBox="0 0 700 185"
                className="w-full h-64 sm:h-72 block"
                role="img"
                aria-label="Autonomous vehicle corridor and LiDAR sensor cone visualization"
              >
            {/* Asphalt road & shoulders */}
            <rect x="0" y="24" width="700" height="136" fill="#0f172a" />
            <line x1="0" y1="24" x2="700" y2="24" stroke="#334155" strokeWidth="2" />
            <line x1="0" y1="160" x2="700" y2="160" stroke="#334155" strokeWidth="2" />
            {/* Lane divider */}
            <line
              x1="0"
              y1="92"
              x2="700"
              y2="92"
              stroke="#475569"
              strokeWidth="2"
              strokeDasharray="16 14"
            />

            {/* Zebra Crosswalk when pedestrian or yield active */}
            {isYielding && (
              <g opacity="0.88">
                {[36, 52, 68, 84, 100, 116, 132, 146].map((yPos) => (
                  <rect key={yPos} x="515" y={yPos} width="34" height="8" rx="1.5" fill="#e2e8f0" />
                ))}
                <text
                  x="532"
                  y="17"
                  textAnchor="middle"
                  fill="#fbbf24"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="700"
                >
                  CROSSWALK {crossingWindow.totalSeconds}s
                </text>
              </g>
            )}

            {/* LiDAR / TTC forward sensor cone */}
            <polygon
              points={`130,126 ${Math.min(680, obstacleX + 18)},88 ${Math.min(680, obstacleX + 18)},162`}
              fill={coneColor}
              fillOpacity="0.14"
              stroke={coneColor}
              strokeOpacity="0.45"
              strokeWidth="1.2"
            />

            {/* Lateral evasive cubic spline trajectory when AVOID */}
            {isEvasiveArc && (
              <path
                d={`M 128 126 C 210 126, 240 58, ${Math.min(580, obstacleX + 35)} 58`}
                fill="none"
                stroke="#fb923c"
                strokeWidth="3"
                strokeDasharray="7 5"
              />
            )}

            {/* Stopping distance ruler bar */}
            <line
              x1="130"
              y1="173"
              x2={Math.min(680, 130 + (physicsSummary.stoppingDistM / 48) * 465)}
              y2="173"
              stroke={physicsSummary.safetyMarginM < 0 ? '#f43f5e' : '#38bdf8'}
              strokeWidth="3"
            />
            <text x="130" y="182" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
              d_stop {physicsSummary.stoppingDistM}m
            </text>

            {/* Ego Autonomous Vehicle */}
            <g transform={`translate(56, ${isEvasiveArc ? 80 : 108})`}>
              <rect
                x="0"
                y="0"
                width="74"
                height="36"
                rx="7"
                fill={isBraking ? '#881337' : '#0c4a6e'}
                stroke={coneColor}
                strokeWidth="2"
              />
              <rect x="46" y="5" width="16" height="26" rx="3" fill="#020617" opacity="0.7" />
              <circle cx="14" cy="36" r="5" fill="#334155" />
              <circle cx="58" cy="36" r="5" fill="#334155" />
              {/* Brake tail lights */}
              {isBraking && <rect x="-3" y="4" width="4" height="28" rx="1" fill="#fb7185" />}
              <text
                x="25"
                y="22"
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize="10"
                fontFamily="monospace"
                fontWeight="700"
              >
                EGO
              </text>
            </g>

            {/* Target Obstacle / Pedestrian / Defect */}
            {telemetry.obstacle !== 'none' ? (
              <g transform={`translate(${obstacleX}, 110)`}>
                {telemetry.obstacle === 'pedestrian' ? (
                  <>
                    <circle cx="14" cy="10" r="8" fill="#f59e0b" />
                    <rect x="6" y="18" width="16" height="18" rx="4" fill="#fbbf24" />
                    <text
                      x="14"
                      y="-6"
                      textAnchor="middle"
                      fill="#fde68a"
                      fontSize="9.5"
                      fontFamily="monospace"
                      fontWeight="700"
                    >
                      PEDESTRIAN
                    </text>
                  </>
                ) : telemetry.obstacle === 'vehicle' ? (
                  <>
                    <rect
                      x="0"
                      y="0"
                      width="66"
                      height="34"
                      rx="6"
                      fill="#7f1d1d"
                      stroke="#fb7185"
                      strokeWidth="2"
                    />
                    <text
                      x="33"
                      y="21"
                      textAnchor="middle"
                      fill="#fecdd3"
                      fontSize="9.5"
                      fontFamily="monospace"
                      fontWeight="700"
                    >
                      CUT-IN
                    </text>
                  </>
                ) : (
                  <>
                    <ellipse
                      cx="18"
                      cy="18"
                      rx="20"
                      ry="12"
                      fill={telemetry.obstacle === 'manhole' ? '#1e293b' : '#451a03'}
                      stroke="#fb923c"
                      strokeWidth="2"
                      strokeDasharray={telemetry.obstacle === 'pothole' ? '4 2' : undefined}
                    />
                    <text
                      x="18"
                      y="-6"
                      textAnchor="middle"
                      fill="#fdba74"
                      fontSize="9.5"
                      fontFamily="monospace"
                      fontWeight="700"
                    >
                      {telemetry.obstacle.toUpperCase()}
                    </text>
                  </>
                )}
              </g>
            ) : (
              <text
                x="420"
                y="130"
                textAnchor="middle"
                fill="#64748b"
                fontSize="11"
                fontFamily="monospace"
              >
                LANE CLEAR · NOMINAL PLATOON SPACING ({telemetry.distanceM.toFixed(1)}m)
              </text>
            )}
              </svg>
            </div>
          )}
        </div>

        {/* 5-State Finite State Machine Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {FSM_STATES.map((st) => {
            const isActive = fsmState === st
            return (
              <div
                key={st}
                className={`rounded-lg border px-3 py-2 text-center transition ${
                  isActive
                    ? st === 'EMERGENCY_BRAKE'
                      ? 'border-rose-500 bg-rose-950/70 text-rose-200'
                      : st === 'YIELD'
                        ? 'border-amber-500 bg-amber-950/70 text-amber-200'
                        : st === 'AVOID'
                          ? 'border-orange-500 bg-orange-950/70 text-orange-200'
                          : 'border-emerald-500 bg-emerald-950/70 text-emerald-200'
                    : 'border-slate-800 bg-slate-950/50 text-slate-500'
                }`}
              >
                <span className="font-mono text-[11px] font-bold block">{st}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Real-time Telemetry Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <span className="font-mono text-xs text-slate-400 block">EGO VEHICLE SPEED</span>
          <div className="flex items-baseline gap-2 mt-1 tabular-nums">
            <span className="font-mono text-3xl font-bold text-slate-100">
              {telemetry.egoSpeedKmh.toFixed(1)}
            </span>
            <span className="font-mono text-xs text-slate-400">km/h</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <span className="font-mono text-xs text-slate-400 block">OBSTACLE DISTANCE</span>
          <div className="flex items-baseline gap-2 mt-1 tabular-nums">
            <span className="font-mono text-3xl font-bold text-cyan-400">
              {telemetry.distanceM.toFixed(1)}
            </span>
            <span className="font-mono text-xs text-slate-400">meters</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <span className="font-mono text-xs text-slate-400 block">CLOSING VELOCITY</span>
          <div className="flex items-baseline gap-2 mt-1 tabular-nums">
            <span className="font-mono text-3xl font-bold text-amber-400">
              {telemetry.closingVelMs.toFixed(1)}
            </span>
            <span className="font-mono text-xs text-slate-400">m/s</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <span className="font-mono text-xs text-slate-400 block">TIME-TO-COLLISION (TTC)</span>
          <div className="flex items-baseline gap-2 mt-1 tabular-nums">
            <span
              className={`font-mono text-3xl font-bold ${
                telemetry.ttcSec <= ttcAlertThreshold ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {telemetry.ttcSec.toFixed(2)}
            </span>
            <span className="font-mono text-xs text-slate-400">sec</span>
          </div>
        </div>
      </div>

      {/* Telemetry Waveform Chart + Interactive Calibration Controls */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-xs font-mono uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-cyan-400" />
              KINEMATIC TELEMETRY STREAM (SPEED VS. OBSTACLE RANGE &amp; TTC)
            </h3>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {history.length} samples
            </span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="t" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <ReferenceLine
                  y={ttcAlertThreshold}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                  label={{ value: 'TTC Limit', fill: '#fb7185', fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="speedKmh"
                  name="Speed (km/h)"
                  stroke="#38bdf8"
                  fill="#0ea5e9"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="distanceM"
                  name="Range (m)"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="ttcSec"
                  name="TTC (s)"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Calibration Sliders */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
            <Sliders className="h-4 w-4 text-cyan-400" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
              SAFETY ENVELOPE CALIBRATION
            </h3>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between font-mono text-xs tabular-nums">
              <span className="text-slate-400">TTC Alert Threshold</span>
              <span className="text-rose-300 font-bold">{ttcAlertThreshold.toFixed(1)} s</span>
            </div>
            <input
              type="range"
              min={1.2}
              max={3.5}
              step={0.1}
              value={ttcAlertThreshold}
              onChange={(e) => setTtcAlertThreshold(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between font-mono text-xs tabular-nums">
              <span className="text-slate-400">Max Friction Deceleration</span>
              <span className="text-cyan-300 font-bold">{decelMaxMs2.toFixed(1)} m/s²</span>
            </div>
            <input
              type="range"
              min={4.0}
              max={9.5}
              step={0.5}
              value={decelMaxMs2}
              onChange={(e) => setDecelMaxMs2(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
            <p className="text-[11px] text-slate-500">
              Lower m/s² models wet monsoon asphalt friction vs. dry asphalt (9.0 m/s²).
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-400">Active Hazard</span>
              <span className="text-slate-200 uppercase">{telemetry.obstacle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Stopping Distance</span>
              <span className="text-cyan-300">{physicsSummary.stoppingDistM} m</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pedestrian Crossing Window Widget (+15s Buffer) & Hazard Stream Controls */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-400" />
              DYNAMIC PEDESTRIAN CROSSING CLEARANCE (+15s BUFFER)
            </h3>
            <span
              className={`font-mono text-xs px-2 py-0.5 rounded ${
                crossingWindow.isExtended
                  ? 'border border-amber-500/40 bg-amber-950/60 text-amber-300'
                  : 'border border-slate-700 bg-slate-800 text-slate-300'
              }`}
            >
              {crossingWindow.isExtended ? '+15s BUFFER ACTIVE' : 'STANDARD WINDOW'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Recalculates safe zebra crossing green phase duration. When elderly, school, or dense pedestrian groups are detected, the controller appends a +15s clearance buffer.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-950 p-4 border border-slate-800">
            <div className="tabular-nums">
              <span className="font-mono text-xs text-slate-400 block">
                CALCULATED CROSSING TIME
              </span>
              <span className="font-mono text-2xl font-bold text-emerald-400">
                {crossingWindow.totalSeconds} Seconds
              </span>
              <span className="font-mono text-[11px] text-slate-500 block mt-0.5">
                Base: 25s · Extension: +{crossingWindow.bufferAppliedSeconds}s
              </span>
            </div>

            <button
              type="button"
              onClick={toggleVulnerablePedestrian}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap ${
                isVulnerablePedestrianPresent
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              {isVulnerablePedestrianPresent
                ? 'Dismiss Vulnerable Group'
                : 'Flag Vulnerable / Elderly Group (+15s)'}
            </button>
          </div>
        </div>

        {/* Road Surface Hazard Injections */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-400" />
              ROAD SURFACE HAZARD SIMULATOR STREAM
            </h3>
            <span className="font-mono text-xs text-slate-400 flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> Live Telemetry
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Inject individual defects and kinematic overrides to test Ego AV reaction latency and state machine recovery.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => injectObstacle('pothole')}
              className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition"
            >
              Inject Pothole (AVOID)
            </button>
            <button
              type="button"
              onClick={() => injectObstacle('manhole')}
              className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition"
            >
              Inject Open Manhole (AVOID)
            </button>
            <button
              type="button"
              onClick={triggerPedestrianWalkway}
              className="rounded-lg border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 px-3 py-2 text-xs font-medium text-amber-200 transition"
            >
              Pedestrian in Lane (YIELD)
            </button>
            <button
              type="button"
              onClick={accelerateEgoCar}
              className="rounded-lg border border-rose-500/40 bg-rose-950/30 hover:bg-rose-900/40 px-3 py-2 text-xs font-medium text-rose-200 transition"
            >
              Rapid Acceleration (AEB)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
