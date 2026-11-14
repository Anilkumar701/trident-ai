import { useState, useEffect, useCallback, useMemo } from 'react'
import { APIProvider, AdvancedMarker, Pin, InfoWindow, Map } from '@vis.gl/react-google-maps'
import { useDashboard } from '../../context/DashboardContext'
import type { IntersectionKey } from '../../lib/metropolisLogic'
import { CORRIDOR_WAYPOINTS, INTERSECTION_COORDINATES } from '../../lib/bengaluruGrid'
import {
  GmpCircle,
  GmpMissingKeyBanner,
  GmpPanTo,
  GmpPolyline,
  GmpTrafficLayer,
  useGmpApiKey,
} from './GmpPrimitives'
import { interpolateGeoPath, type LatLngLiteral } from '../../lib/geoCorridors'
import {
  Activity,
  Siren,
  Locate,
  Layers,
  ShieldCheck,
  Building2,
  Clock,
  Radio,
} from 'lucide-react'

interface GoogleTrafficMapProps {
  tall?: boolean
}

interface IncidentReportMarker {
  id: string
  trackingId: string
  category: string
  department: string
  severity: string
  status: string
  latitude: string | null
  longitude: string | null
  description: string
  address: string | null
}

const ARTERIAL_PATHS: Array<{
  id: string
  label: string
  intersection: IntersectionKey
  path: LatLngLiteral[]
}> = [
  {
    id: 'hosur-ecity',
    label: 'Hosur Rd (E-City -> Silk Board)',
    intersection: 'Electronic City',
    path: [
      INTERSECTION_COORDINATES['Electronic City'],
      { lat: 12.88, lng: 77.643 },
      INTERSECTION_COORDINATES['Silk Board'],
    ],
  },
  {
    id: 'silk-mg',
    label: 'Koramangala-Hosur Arterial',
    intersection: 'Silk Board',
    path: [
      INTERSECTION_COORDINATES['Silk Board'],
      CORRIDOR_WAYPOINTS.Koramangala,
      CORRIDOR_WAYPOINTS.Hosur,
      CORRIDOR_WAYPOINTS.Richmond,
      INTERSECTION_COORDINATES['MG Road'],
    ],
  },
  {
    id: 'mg-majestic',
    label: 'CBD Central Spine (MG Rd -> Majestic)',
    intersection: 'Majestic',
    path: [
      INTERSECTION_COORDINATES['MG Road'],
      { lat: 12.975, lng: 77.582 },
      INTERSECTION_COORDINATES.Majestic,
    ],
  },
]

interface SimCorridorAgent {
  id: string
  corridorIdx: number
  progress: number
  direction: 1 | -1
  kind: 'car' | 'bus'
}

const INITIAL_AGENTS: SimCorridorAgent[] = [
  { id: 'SIM-A1', corridorIdx: 0, progress: 0.15, direction: 1, kind: 'car' },
  { id: 'SIM-A2', corridorIdx: 0, progress: 0.72, direction: -1, kind: 'bus' },
  { id: 'SIM-B1', corridorIdx: 1, progress: 0.2, direction: 1, kind: 'car' },
  { id: 'SIM-B2', corridorIdx: 1, progress: 0.65, direction: -1, kind: 'car' },
  { id: 'SIM-C1', corridorIdx: 2, progress: 0.3, direction: 1, kind: 'bus' },
  { id: 'SIM-C2', corridorIdx: 2, progress: 0.8, direction: -1, kind: 'car' },
]

export function GoogleTrafficMap({ tall = false }: GoogleTrafficMapProps) {
  const {
    intersections,
    visionStream,
    geoLocation,
    triggerEmergencyOverride,
    resetIntersectionOverride,
    complaints,
    emergencyTrack,
    fieldTrail,
  } = useDashboard()
  const apiKey = useGmpApiKey()

  const [trafficLayerEnabled, setTrafficLayerEnabled] = useState(true)
  const [simOverlayEnabled, setSimOverlayEnabled] = useState(true)
  const [selectedIntersection, setSelectedIntersection] = useState<IntersectionKey | null>(null)
  const [selectedReport, setSelectedReport] = useState<IncidentReportMarker | null>(null)
  const [reports, setReports] = useState<IncidentReportMarker[]>([])
  const [panTarget, setPanTarget] = useState<LatLngLiteral | null>(null)
  const [agents, setAgents] = useState<SimCorridorAgent[]>(INITIAL_AGENTS)
  const [ambulanceProgress, setAmbulanceProgress] = useState<number>(0)

  // Fetch verified hazard complaints from backend
  useEffect(() => {
    const fetchDbReports = async () => {
      try {
        const res = await fetch('/api/reports')
        if (res.ok) {
          const data: IncidentReportMarker[] = await res.json()
          setReports(data.filter((r) => r.latitude && r.longitude))
        }
      } catch {
        // Ignore transient network errors
      }
    }
    fetchDbReports()
    const interval = setInterval(fetchDbReports, 10000)
    return () => clearInterval(interval)
  }, [])

  // Real-time vehicle kinetics synced with signal congestion & emergency overrides
  useEffect(() => {
    if (!simOverlayEnabled) return
    const timer = window.setInterval(() => {
      setAgents((prev) =>
        prev.map((a) => {
          const corridor = ARTERIAL_PATHS[a.corridorIdx]
          const node = intersections[corridor.intersection]
          const isGreen = node?.mode === 'EMERGENCY_GREEN'
          const congestionFactor = isGreen ? 1.55 : Math.max(0.22, 1 - (node?.densityPercent ?? 50) / 110)
          const step = 0.016 * congestionFactor
          let next = a.progress + a.direction * step
          let dir = a.direction
          if (next >= 0.98) {
            next = 0.98
            dir = -1
          } else if (next <= 0.02) {
            next = 0.02
            dir = 1
          }
          return { ...a, progress: next, direction: dir }
        }),
      )

      if (visionStream.ambulancePresent) {
        setAmbulanceProgress((p) => (p + 0.028) % 1)
      }
    }, 240)
    return () => window.clearInterval(timer)
  }, [simOverlayEnabled, intersections, visionStream.ambulancePresent])

  const handleLocateUser = useCallback(() => {
    if (geoLocation?.lat && geoLocation?.lng) {
      setPanTarget({ lat: geoLocation.lat, lng: geoLocation.lng })
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setPanTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      })
    }
  }, [geoLocation])

  const defaultCenter = useMemo(() => ({ lat: 12.948, lng: 77.61 }), [])

  const emergencyPath: LatLngLiteral[] = useMemo(() => {
    if (emergencyTrack && emergencyTrack.coords.length >= 2) {
      return emergencyTrack.coords.map((c) => ({ lat: c.lat, lng: c.lng }))
    }
    return ARTERIAL_PATHS[1].path
  }, [emergencyTrack])

  const ambulancePos = useMemo(() => {
    return interpolateGeoPath(emergencyPath, ambulanceProgress).point
  }, [emergencyPath, ambulanceProgress])

  if (!apiKey) {
    return <GmpMissingKeyBanner label="Traffic Control Real Map" />
  }

  const selectedIntersectionData = selectedIntersection ? intersections[selectedIntersection] : null

  return (
    <div className="space-y-2.5">
      {/* Map Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono font-semibold text-slate-200">GOOGLE MAPS PLATFORM</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-[11px] text-cyan-400">Bengaluru Signal &amp; Flow Twin</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSimOverlayEnabled((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] font-medium transition ${
              simOverlayEnabled
                ? 'border-cyan-500/50 bg-cyan-950/50 text-cyan-300'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Sim Vehicles &amp; Waves: {simOverlayEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setTrafficLayerEnabled((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] font-medium transition ${
              trafficLayerEnabled
                ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Live Traffic: {trafficLayerEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={handleLocateUser}
            className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-300 hover:border-cyan-500 hover:text-cyan-300 transition"
          >
            <Locate className="h-3.5 w-3.5 text-cyan-400" />
            <span>Locate Device</span>
          </button>
        </div>
      </div>

      {/* Main Map Container */}
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl ${
          tall ? 'h-[540px]' : 'h-[440px]'
        }`}
      >
        <APIProvider apiKey={apiKey} solutionChannel="gmp_mcp_codeassist_v1_aistudio">
          <Map
            defaultCenter={defaultCenter}
            defaultZoom={12}
            mapId="DEMO_MAP_ID"
            disableDefaultUI={false}
            gestureHandling="greedy"
            style={{ width: '100%', height: '100%' }}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          >
            <GmpTrafficLayer enabled={trafficLayerEnabled} />
            <GmpPanTo target={panTarget} zoom={14} />

            {/* Simulation Arterial Polylines */}
            {simOverlayEnabled &&
              ARTERIAL_PATHS.map((c) => {
                const info = intersections[c.intersection]
                const isEmg = info?.mode === 'EMERGENCY_GREEN'
                const color = isEmg
                  ? '#10b981'
                  : (info?.densityPercent ?? 0) >= 80
                    ? '#f59e0b'
                    : '#38bdf8'
                return (
                  <GmpPolyline
                    key={c.id}
                    path={c.path}
                    color={color}
                    strokeWeight={isEmg ? 5 : 3}
                    strokeOpacity={0.7}
                  />
                )
              })}

            {/* Active Emergency Track */}
            {emergencyTrack && emergencyTrack.coords.length >= 2 && (
              <GmpPolyline
                path={emergencyPath}
                color="#f43f5e"
                strokeOpacity={0.95}
                strokeWeight={5}
              />
            )}

            {fieldTrail.length >= 2 && (
              <GmpPolyline path={fieldTrail} color="#22d3ee" strokeOpacity={0.75} strokeWeight={3} />
            )}

            {/* Congestion & Green-Wave Radius Circles around Intersections */}
            {simOverlayEnabled &&
              (Object.keys(INTERSECTION_COORDINATES) as IntersectionKey[]).map((key) => {
                const coord = INTERSECTION_COORDINATES[key]
                const info = intersections[key]
                const isEmergency = info?.mode === 'EMERGENCY_GREEN'
                const radius = isEmergency
                  ? 950
                  : 320 + ((info?.queueLengthVehicles ?? 15) * 10)
                const color = isEmergency
                  ? '#10b981'
                  : (info?.densityPercent ?? 50) >= 80
                    ? '#f43f5e'
                    : '#0ea5e9'
                return (
                  <GmpCircle
                    key={`halo-${key}`}
                    center={coord}
                    radiusMeters={radius}
                    color={color}
                    fillOpacity={isEmergency ? 0.2 : 0.13}
                    strokeWeight={isEmergency ? 2 : 1}
                  />
                )
              })}

            {/* Moving Simulated Corridor Vehicles */}
            {simOverlayEnabled &&
              agents.map((a) => {
                const corridor = ARTERIAL_PATHS[a.corridorIdx]
                const pt = interpolateGeoPath(corridor.path, a.progress).point
                return (
                  <AdvancedMarker key={a.id} position={pt} title={`${a.id} (${corridor.label})`}>
                    <div
                      className={`h-3 w-3 rounded-full border border-white shadow ${
                        a.kind === 'bus' ? 'bg-amber-400' : 'bg-cyan-400'
                      }`}
                    />
                  </AdvancedMarker>
                )
              })}

            {/* GPS User Position Indicator */}
            {geoLocation?.lat && geoLocation?.lng && (
              <AdvancedMarker
                position={{ lat: geoLocation.lat, lng: geoLocation.lng }}
                title="Active Operator Terminal"
              >
                <div className="relative flex h-5 w-5 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-500 border border-white shadow-md" />
                </div>
              </AdvancedMarker>
            )}

            {/* Intersection Signal Phase Markers */}
            {(Object.keys(INTERSECTION_COORDINATES) as IntersectionKey[]).map((key) => {
              const coord = INTERSECTION_COORDINATES[key]
              const info = intersections[key]
              const isEmergency = info?.mode === 'EMERGENCY_GREEN'

              return (
                <AdvancedMarker
                  key={key}
                  position={coord}
                  title={`${coord.label} - ${info?.mode || 'NORMAL'}`}
                  onClick={() => setSelectedIntersection(key)}
                >
                  <div
                    className={`cursor-pointer rounded-lg border px-2 py-1 font-mono text-[10px] shadow-xl transition hover:scale-105 ${
                      isEmergency
                        ? 'border-emerald-300 bg-emerald-950/95 text-emerald-200 animate-pulse'
                        : 'border-cyan-500/60 bg-slate-950/95 text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isEmergency ? 'bg-emerald-400' : 'bg-cyan-400'
                        }`}
                      />
                      <span>{key}</span>
                      <span className="text-emerald-300 tabular-nums">{info?.activeGreenSeconds}s</span>
                    </div>
                    <div className="text-[8px] text-slate-400 tabular-nums">
                      {isEmergency ? 'GREEN WAVE ACTIVE' : `Density ${info?.densityPercent}% · Q:${info?.queueLengthVehicles}`}
                    </div>
                  </div>
                </AdvancedMarker>
              )
            })}

            {/* Animated Inbound Emergency Vehicle (EMR-108 Ambulance) */}
            {visionStream.ambulancePresent && (
              <AdvancedMarker position={ambulancePos} title="EMR-108 Emergency Responder">
                <div className="flex items-center gap-1.5 rounded-full border-2 border-white bg-rose-600 px-2.5 py-1 text-white shadow-[0_0_20px_rgba(244,63,94,0.9)] animate-pulse">
                  <Siren className="h-3.5 w-3.5" />
                  <span className="font-mono text-[10px] font-bold">EMR-108</span>
                </div>
              </AdvancedMarker>
            )}

            {complaints
              .filter((c) => c.gpsCoords)
              .map((c) => (
                <AdvancedMarker
                  key={c.id}
                  position={{ lat: c.gpsCoords!.lat, lng: c.gpsCoords!.lng }}
                  title={`${c.id}: ${c.issue}`}
                >
                  <Pin
                    background={c.issue === 'Pothole' || c.severity === 'Critical' ? '#e11d48' : '#f59e0b'}
                    borderColor="#ffffff"
                    glyphColor="#ffffff"
                    scale={0.85}
                  />
                </AdvancedMarker>
              ))}

            {/* Citizen Hazard Reports */}
            {reports.map((report) => {
              const lat = parseFloat(report.latitude || '0')
              const lng = parseFloat(report.longitude || '0')
              if (isNaN(lat) || isNaN(lng) || lat === 0) return null

              return (
                <AdvancedMarker
                  key={report.id}
                  position={{ lat, lng }}
                  title={`${report.trackingId}: ${report.category}`}
                  onClick={() => setSelectedReport(report)}
                >
                  <Pin
                    background={report.severity === 'Critical' ? '#e11d48' : '#f59e0b'}
                    borderColor="#ffffff"
                    glyphColor="#ffffff"
                    scale={0.9}
                  />
                </AdvancedMarker>
              )
            })}

            {/* Selected Intersection Info Window */}
            {selectedIntersection && INTERSECTION_COORDINATES[selectedIntersection] && selectedIntersectionData && (
              <InfoWindow
                position={INTERSECTION_COORDINATES[selectedIntersection]}
                onCloseClick={() => setSelectedIntersection(null)}
              >
                <div className="p-1 max-w-[220px] text-slate-900 font-sans">
                  <div className="flex items-center justify-between gap-1 border-b border-slate-200 pb-1 mb-1.5">
                    <span className="font-bold text-xs text-slate-800">
                      {INTERSECTION_COORDINATES[selectedIntersection].label}
                    </span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Signal Status:</span>
                      <span
                        className={`font-mono font-bold ${
                          selectedIntersectionData.mode === 'EMERGENCY_GREEN'
                            ? 'text-emerald-600'
                            : 'text-cyan-700'
                        }`}
                      >
                        {selectedIntersectionData.mode}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Traffic Density:</span>
                      <span className="font-mono text-slate-700">{selectedIntersectionData.densityPercent}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Active Queue:</span>
                      <span className="font-mono text-slate-700">{selectedIntersectionData.queueLengthVehicles} veh</span>
                    </div>
                    <div className="pt-2 flex gap-1">
                      {selectedIntersectionData.mode === 'EMERGENCY_GREEN' ? (
                        <button
                          type="button"
                          onClick={() => resetIntersectionOverride(selectedIntersection)}
                          className="w-full rounded bg-slate-700 px-2 py-1 font-mono text-[10px] font-semibold text-white hover:bg-slate-800"
                        >
                          Reset Signal
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => triggerEmergencyOverride(selectedIntersection)}
                          className="w-full rounded bg-emerald-600 px-2 py-1 font-mono text-[10px] font-semibold text-white hover:bg-emerald-700"
                        >
                          Grant Green Wave
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </InfoWindow>
            )}

            {/* Selected Citizen Hazard Report Info Window */}
            {selectedReport && selectedReport.latitude && selectedReport.longitude && (
              <InfoWindow
                position={{
                  lat: parseFloat(selectedReport.latitude),
                  lng: parseFloat(selectedReport.longitude),
                }}
                onCloseClick={() => setSelectedReport(null)}
              >
                <div className="p-1 max-w-[240px] text-slate-900 font-sans">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1">
                    <span className="font-mono text-[10px] font-bold text-cyan-700">
                      {selectedReport.trackingId}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        selectedReport.severity === 'Critical'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {selectedReport.severity}
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-800 mb-1">
                    {selectedReport.description}
                  </p>
                  <div className="text-[10px] text-slate-600 space-y-0.5">
                    <p className="flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-slate-400" />
                      <span>{selectedReport.department}</span>
                    </p>
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span>Status: {selectedReport.status}</span>
                    </p>
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>

      {/* Legend & How Simulation Works Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-300 font-mono">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Emergency Green Wave</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            <span>Simulated Flow Agents</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span>Congested Queue Halo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-rose-400" />
            <span>EMR-108 Moving Corridor</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Click any junction pin to test Green Wave speedups</span>
        </div>
      </div>
    </div>
  )
}
