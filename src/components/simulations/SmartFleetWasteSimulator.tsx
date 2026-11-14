import { useEffect, useMemo, useState } from 'react'
import { APIProvider, AdvancedMarker, InfoWindow, Map } from '@vis.gl/react-google-maps'
import {
  CheckCircle2,
  Clock,
  Flame,
  Fuel,
  Layers,
  MapPin,
  Navigation,
  Play,
  Route,
  Sparkles,
  Square,
  Truck,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDashboard, type WasteCollectionNode } from '../../context/DashboardContext'
import {
  GmpMissingKeyBanner,
  GmpPolyline,
  GmpTrafficLayer,
  useGmpApiKey,
  useGmpComputedRoute,
} from '../map/GmpPrimitives'
import {
  WASTE_BIN_LOCATIONS,
  WASTE_DEPOT_LOCATION,
  interpolateGeoPath,
  type LatLngLiteral,
} from '../../lib/geoCorridors'

const NODE_COORDS: Record<string, { x: number; y: number; short: string }> = {
  'BIN-101': { x: 250, y: 74, short: 'CBD' },
  'BIN-102': { x: 540, y: 120, short: 'EcoSpace' },
  'BIN-103': { x: 118, y: 112, short: 'Rajajinagar' },
  'BIN-104': { x: 292, y: 196, short: 'Jayanagar' },
  'BIN-105': { x: 185, y: 140, short: 'Majestic' },
}

const DEPOT_COORD = { x: 380, y: 138 }

function WasteRealMapCanvas({
  nodes,
  activeBinIds,
  dispatchMode,
  fillThreshold,
  truckPulseStep,
  trafficLayer,
  routesApiEnabled,
  onClearNode,
}: {
  nodes: WasteCollectionNode[]
  activeBinIds: Set<string>
  dispatchMode: 'fixed_beat' | 'ai_threshold'
  fillThreshold: number
  truckPulseStep: number
  trafficLayer: boolean
  routesApiEnabled: boolean
  onClearNode: (id: string) => void
}) {
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null)

  const legacyBeatLoop: LatLngLiteral[] = useMemo(
    () => [
      { lat: WASTE_DEPOT_LOCATION.lat, lng: WASTE_DEPOT_LOCATION.lng },
      ...nodes.map((n) => WASTE_BIN_LOCATIONS[n.id] ?? WASTE_DEPOT_LOCATION),
      { lat: WASTE_DEPOT_LOCATION.lat, lng: WASTE_DEPOT_LOCATION.lng },
    ],
    [nodes],
  )

  const activeStops: LatLngLiteral[] = useMemo(() => {
    const selected =
      dispatchMode === 'fixed_beat'
        ? nodes
        : nodes.filter((n) => activeBinIds.has(n.id))
    if (selected.length === 0) return []
    return [
      { lat: WASTE_DEPOT_LOCATION.lat, lng: WASTE_DEPOT_LOCATION.lng },
      ...selected.map((n) => WASTE_BIN_LOCATIONS[n.id] ?? WASTE_DEPOT_LOCATION),
      { lat: WASTE_DEPOT_LOCATION.lat, lng: WASTE_DEPOT_LOCATION.lng },
    ]
  }, [dispatchMode, nodes, activeBinIds])

  const computedRoute = useGmpComputedRoute({
    enabled: routesApiEnabled && activeStops.length >= 2,
    stops: activeStops,
    fallbackPath: activeStops,
  })

  const truckGeo = useMemo(() => {
    if (computedRoute.path.length < 2) {
      return { point: { lat: WASTE_DEPOT_LOCATION.lat, lng: WASTE_DEPOT_LOCATION.lng }, headingDeg: 0 }
    }
    return interpolateGeoPath(computedRoute.path, truckPulseStep / 100)
  }, [computedRoute.path, truckPulseStep])

  const selectedBin = useMemo(
    () => nodes.find((n) => n.id === selectedBinId) ?? null,
    [nodes, selectedBinId],
  )

  return (
    <div className="space-y-2">
      <div className="relative h-[360px] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        <Map
          defaultCenter={{ lat: 12.955, lng: 77.61 }}
          defaultZoom={12}
          mapId="DEMO_MAP_ID"
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: '100%', height: '100%' }}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        >
          <GmpTrafficLayer enabled={trafficLayer} />

          {/* Dashed Legacy Fixed-Beat All-Stop Reference */}
          <GmpPolyline
            path={legacyBeatLoop}
            color="#64748b"
            strokeWeight={2.5}
            strokeOpacity={0.65}
            dashed
          />

          {/* Solid Active Dispatch Path */}
          {computedRoute.path.length >= 2 && (
            <GmpPolyline
              path={computedRoute.path}
              color={dispatchMode === 'ai_threshold' ? '#10b981' : '#f59e0b'}
              strokeWeight={4}
              strokeOpacity={0.95}
            />
          )}

          {/* Central S3 Transfer Depot Marker */}
          <AdvancedMarker
            position={{ lat: WASTE_DEPOT_LOCATION.lat, lng: WASTE_DEPOT_LOCATION.lng }}
            title={WASTE_DEPOT_LOCATION.name}
          >
            <div className="flex items-center gap-1 rounded-lg border-2 border-cyan-400 bg-slate-950/95 px-2 py-1 font-mono text-[10px] font-bold text-cyan-300 shadow-lg">
              <span>S3 DEPOT</span>
            </div>
          </AdvancedMarker>

          {/* 5 Real-World Bengaluru Smart Bins */}
          {nodes.map((bin) => {
            const loc = WASTE_BIN_LOCATIONS[bin.id]
            if (!loc) return null
            const inRoute = dispatchMode === 'fixed_beat' || activeBinIds.has(bin.id)
            const isCritical = bin.fillLevelPercent >= 90 || bin.status === 'Overflow Flagged'
            const isWarn = bin.fillLevelPercent >= fillThreshold || bin.status === 'Missed Pick-up'

            return (
              <AdvancedMarker
                key={bin.id}
                position={{ lat: loc.lat, lng: loc.lng }}
                title={`${bin.id} (${loc.area}) — ${bin.fillLevelPercent}%`}
                onClick={() => setSelectedBinId(bin.id)}
              >
                <div
                  className={`cursor-pointer rounded-lg border px-2 py-1 font-mono text-[10px] shadow-lg transition hover:scale-105 ${
                    !inRoute
                      ? 'border-slate-600/80 bg-slate-900/75 text-slate-400 opacity-75'
                      : isCritical
                        ? 'border-rose-400 bg-rose-950/95 text-rose-200 animate-pulse'
                        : isWarn
                          ? 'border-amber-400 bg-amber-950/95 text-amber-200'
                          : 'border-emerald-400 bg-emerald-950/95 text-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <span>{bin.id}</span>
                    <span>{bin.fillLevelPercent}%</span>
                  </div>
                  <div className="text-[8px] opacity-80">
                    {inRoute ? loc.area : 'SKIPPED (< THRESHOLD)'}
                  </div>
                </div>
              </AdvancedMarker>
            )
          })}

          {/* Animated Compactor Truck Marker */}
          {activeStops.length >= 2 && (
            <AdvancedMarker position={truckGeo.point} title="S3 Compactor Fleet Unit">
              <div className="flex items-center gap-1 rounded-full border-2 border-white bg-emerald-500 px-2 py-1 text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.9)]">
                <Truck className="h-3.5 w-3.5" />
                <span className="font-mono text-[9px] font-bold">COMP-01</span>
              </div>
            </AdvancedMarker>
          )}

          {selectedBin && WASTE_BIN_LOCATIONS[selectedBin.id] && (
            <InfoWindow
              position={{
                lat: WASTE_BIN_LOCATIONS[selectedBin.id].lat,
                lng: WASTE_BIN_LOCATIONS[selectedBin.id].lng,
              }}
              onCloseClick={() => setSelectedBinId(null)}
            >
              <div className="p-1 max-w-[210px] text-slate-900 font-sans space-y-1.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                  <span className="font-mono text-xs font-bold text-slate-900">{selectedBin.id}</span>
                  <span className="font-mono text-[10px] font-bold text-cyan-700">
                    {selectedBin.fillLevelPercent}% Fill
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-700">{selectedBin.locationName}</p>
                <p className="font-mono text-[10px] text-slate-500">Status: {selectedBin.status}</p>
                <button
                  type="button"
                  onClick={() => {
                    onClearNode(selectedBin.id)
                    setSelectedBinId(null)
                  }}
                  className="w-full rounded bg-emerald-600 px-2 py-1 font-mono text-[10px] font-semibold text-white hover:bg-emerald-700"
                >
                  Dispatch Clearance
                </button>
              </div>
            </InfoWindow>
          )}
        </Map>

        {/* On-Map Live Simulation Legend Overlay */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-slate-950/90 px-3 py-1.5 font-mono text-[10px] text-slate-300 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-emerald-400 inline-block" />
              Active Simulated Route ({computedRoute.source === 'routes_api' && computedRoute.distanceKm ? `${computedRoute.distanceKm} km · ${computedRoute.durationMin}m` : 'Corridor Geometry'})
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-400 inline-block" />
              Legacy Fixed Beat (28.4 km)
            </span>
          </div>
          <span className="text-emerald-300">Click any bin on map to clear</span>
        </div>
      </div>
    </div>
  )
}

export function SmartFleetWasteSimulator() {
  const {
    geoLocation,
    wasteEcosystem,
    reportMissedPickup,
    flagWasteOverflow,
    clearWasteNode,
    dispatchAutoCollectorFleet,
    simulateWasteSurge,
    tickWasteAutoFill,
  } = useDashboard()

  const apiKey = useGmpApiKey()
  const [dispatchMode, setDispatchMode] = useState<'fixed_beat' | 'ai_threshold'>('ai_threshold')
  const [visualMode, setVisualMode] = useState<'real_map' | 'topology'>('real_map')
  const [trafficLayer, setTrafficLayer] = useState<boolean>(true)
  const [routesApiEnabled, setRoutesApiEnabled] = useState<boolean>(false)
  const [fillThreshold, setFillThreshold] = useState<number>(75)
  const [autoStreamActive, setAutoStreamActive] = useState<boolean>(false)
  const [truckPulseStep, setTruckPulseStep] = useState<number>(0)

  // Optional live IoT bin ultrasonic auto-fill stream
  useEffect(() => {
    if (!autoStreamActive) return
    const timer = window.setInterval(() => {
      tickWasteAutoFill()
    }, 1800)
    return () => window.clearInterval(timer)
  }, [autoStreamActive, tickWasteAutoFill])

  // Smooth compactor truck motion progress along active route
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTruckPulseStep((p) => (p + 1) % 100)
    }, 110)
    return () => window.clearInterval(timer)
  }, [])

  const routeComparison = useMemo(() => {
    const nodes = wasteEcosystem.collectionNodes
    const priorityNodes = nodes.filter(
      (n) =>
        n.fillLevelPercent >= fillThreshold ||
        n.status === 'Overflow Flagged' ||
        n.status === 'Missed Pick-up',
    )

    const fixedStops = nodes.length
    const aiStops = priorityNodes.length
    const fixedKm = 28.4
    const aiKm = aiStops === 0 ? 0 : Number((5.2 + aiStops * 3.65).toFixed(1))
    const kmSaved = Number(Math.max(0, fixedKm - aiKm).toFixed(1))
    const fuelSavedLiters = Number((kmSaved * 0.42).toFixed(1))
    const co2AvoidedKg = Number((fuelSavedLiters * 2.68).toFixed(1))

    return {
      priorityIds: new Set(priorityNodes.map((n) => n.id)),
      fixedStops,
      aiStops,
      fixedKm,
      aiKm,
      kmSaved,
      fuelSavedLiters,
      co2AvoidedKg,
    }
  }, [wasteEcosystem.collectionNodes, fillThreshold])

  const activeRouteNodes = useMemo(() => {
    const list =
      dispatchMode === 'fixed_beat'
        ? wasteEcosystem.collectionNodes
        : wasteEcosystem.collectionNodes.filter((n) => routeComparison.priorityIds.has(n.id))
    return list.map((n) => ({
      ...n,
      ...(NODE_COORDS[n.id] ?? { x: 300, y: 120, short: n.id }),
    }))
  }, [dispatchMode, wasteEcosystem.collectionNodes, routeComparison.priorityIds])

  // Compute animated truck position along abstract polygon loop
  const truckPos = useMemo(() => {
    const pts = [DEPOT_COORD, ...activeRouteNodes, DEPOT_COORD]
    if (pts.length <= 2) return DEPOT_COORD
    const segments = pts.length - 1
    const scaled = (truckPulseStep / 100) * segments
    const idx = Math.min(segments - 1, Math.floor(scaled))
    const localT = scaled - idx
    const a = pts[idx]
    const b = pts[idx + 1]
    return {
      x: a.x + (b.x - a.x) * localT,
      y: a.y + (b.y - a.y) * localT,
    }
  }, [activeRouteNodes, truckPulseStep])

  const chartData = useMemo(
    () =>
      wasteEcosystem.collectionNodes.map((n) => ({
        id: n.id,
        zone: NODE_COORDS[n.id]?.short ?? n.id,
        fill: n.fillLevelPercent,
        tons: Number(((n.fillLevelPercent / 100) * (n.capacityKg / 1000)).toFixed(2)),
      })),
    [wasteEcosystem.collectionNodes],
  )

  return (
    <div className="space-y-5">
      {/* Municipal Smart Fleet Operations Header */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950 text-emerald-400 shrink-0">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  MUNICIPAL SMART FLEET OPERATIONS (S3)
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                  {geoLocation.city} Live Map &amp; Simulation
                </span>
              </div>
              <p className="font-mono text-xs text-slate-400 tabular-nums">
                Hub: Koramangala-Domlur Transfer Station · Compactor skips low-fill wards (&lt;{fillThreshold}%) directly on Bengaluru streets
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
            <div className="rounded-lg bg-slate-950 px-3 py-1.5 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">ACTIVE TRUCKS</span>
              <span className="font-bold text-slate-200">{wasteEcosystem.activeTrucks} units</span>
            </div>
            <div className="rounded-lg bg-slate-950 px-3 py-1.5 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">ROUTE EFFICIENCY</span>
              <span className="font-bold text-emerald-400">{wasteEcosystem.routeEfficiencyScore}%</span>
            </div>
            <div className="rounded-lg bg-slate-950 px-3 py-1.5 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">TOTAL COLLECTED</span>
              <span className="font-bold text-cyan-400">{wasteEcosystem.wasteWeightCollectedTons} Tons</span>
            </div>
          </div>
        </div>

        {/* Simulation Method & Surge Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setDispatchMode('ai_threshold')}
              className={`rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition whitespace-nowrap ${
                dispatchMode === 'ai_threshold'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              AI Threshold Skip-Routing
            </button>
            <button
              type="button"
              onClick={() => setDispatchMode('fixed_beat')}
              className={`rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition whitespace-nowrap ${
                dispatchMode === 'fixed_beat'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Legacy All-Stop Fixed Beat
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => simulateWasteSurge('morning')}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/35 px-3 py-1.5 font-mono text-xs font-medium text-amber-200 hover:bg-amber-900/45 transition whitespace-nowrap"
            >
              <Clock className="h-3.5 w-3.5" />
              Morning Surge
            </button>
            <button
              type="button"
              onClick={() => simulateWasteSurge('market')}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/35 px-3 py-1.5 font-mono text-xs font-medium text-rose-200 hover:bg-rose-900/45 transition whitespace-nowrap"
            >
              <Flame className="h-3.5 w-3.5" />
              Festival / Market Surge
            </button>
            <button
              type="button"
              onClick={dispatchAutoCollectorFleet}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 font-mono text-xs font-semibold text-white transition whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Auto-Dispatch Compactor Fleet
            </button>
            <button
              type="button"
              onClick={() => setAutoStreamActive((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition whitespace-nowrap ${
                autoStreamActive
                  ? 'border-cyan-500 bg-cyan-950/60 text-cyan-200'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {autoStreamActive ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {autoStreamActive ? 'Stop Bin Stream' : 'Live Bin Sensor Stream'}
            </button>
          </div>
        </div>
      </div>

      {/* Spatial Dispatch Real Map + Threshold Comparison Analytics */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Real Google Map / SVG Topology Switcher */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-400" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                REAL-WORLD BENGALURU WASTE ROUTE SIMULATION
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => setVisualMode('real_map')}
                className={`rounded border px-2 py-1 transition ${
                  visualMode === 'real_map'
                    ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-300'
                    : 'border-slate-700 bg-slate-950 text-slate-400'
                }`}
              >
                Real Map (Bengaluru)
              </button>
              <button
                type="button"
                onClick={() => setVisualMode('topology')}
                className={`rounded border px-2 py-1 transition ${
                  visualMode === 'topology'
                    ? 'border-cyan-500/50 bg-cyan-950/60 text-cyan-300'
                    : 'border-slate-700 bg-slate-950 text-slate-400'
                }`}
              >
                Topology Graph
              </button>
              {visualMode === 'real_map' && (
                <>
                  <button
                    type="button"
                    onClick={() => setTrafficLayer((v) => !v)}
                    className={`flex items-center gap-1 rounded border px-2 py-1 transition ${
                      trafficLayer
                        ? 'border-cyan-500/40 bg-cyan-950/50 text-cyan-300'
                        : 'border-slate-700 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <Layers className="h-3 w-3" />
                    Traffic
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutesApiEnabled((v) => !v)}
                    className={`flex items-center gap-1 rounded border px-2 py-1 transition ${
                      routesApiEnabled
                        ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-300'
                        : 'border-slate-700 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <Navigation className="h-3 w-3" />
                    {routesApiEnabled ? 'Road Snap ON' : 'Snap to Roads'}
                  </button>
                </>
              )}
            </div>
          </div>

          {visualMode === 'real_map' ? (
            apiKey ? (
              <APIProvider apiKey={apiKey} solutionChannel="gmp_mcp_codeassist_v1_aistudio">
                <WasteRealMapCanvas
                  nodes={wasteEcosystem.collectionNodes}
                  activeBinIds={routeComparison.priorityIds}
                  dispatchMode={dispatchMode}
                  fillThreshold={fillThreshold}
                  truckPulseStep={truckPulseStep}
                  trafficLayer={trafficLayer}
                  routesApiEnabled={routesApiEnabled}
                  onClearNode={clearWasteNode}
                />
              </APIProvider>
            ) : (
              <GmpMissingKeyBanner label="Smart Waste Real Map" />
            )
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              <svg
                viewBox="0 0 640 240"
                className="w-full h-[360px] block"
                role="img"
                aria-label="Municipal smart waste dispatch route graph"
              >
                {[60, 120, 180].map((y) => (
                  <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="#0f172a" strokeWidth="1" />
                ))}
                {[128, 256, 384, 512].map((x) => (
                  <line key={x} x1={x} y1="0" x2={x} y2="240" stroke="#0f172a" strokeWidth="1" />
                ))}

                <polygon
                  points={`${DEPOT_COORD.x},${DEPOT_COORD.y} ${wasteEcosystem.collectionNodes
                    .map((n) => `${NODE_COORDS[n.id].x},${NODE_COORDS[n.id].y}`)
                    .join(' ')}`}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                />

                {activeRouteNodes.length > 0 && (
                  <polygon
                    points={`${DEPOT_COORD.x},${DEPOT_COORD.y} ${activeRouteNodes
                      .map((n) => `${n.x},${n.y}`)
                      .join(' ')}`}
                    fill={dispatchMode === 'ai_threshold' ? '#10b981' : '#f59e0b'}
                    fillOpacity="0.06"
                    stroke={dispatchMode === 'ai_threshold' ? '#10b981' : '#f59e0b'}
                    strokeWidth="2.5"
                  />
                )}

                <g transform={`translate(${DEPOT_COORD.x}, ${DEPOT_COORD.y})`}>
                  <rect x="-14" y="-14" width="28" height="28" rx="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
                  <text x="0" y="4" textAnchor="middle" fill="#38bdf8" fontSize="9.5" fontFamily="monospace" fontWeight="700">
                    HUB
                  </text>
                  <text x="0" y="27" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                    S3 Depot
                  </text>
                </g>

                {wasteEcosystem.collectionNodes.map((bin) => {
                  const coord = NODE_COORDS[bin.id]
                  const inRoute =
                    dispatchMode === 'fixed_beat' || routeComparison.priorityIds.has(bin.id)
                  const color =
                    bin.fillLevelPercent >= 90 || bin.status === 'Overflow Flagged'
                      ? '#f43f5e'
                      : bin.fillLevelPercent >= fillThreshold || bin.status === 'Missed Pick-up'
                        ? '#f59e0b'
                        : '#10b981'
                  return (
                    <g
                      key={bin.id}
                      transform={`translate(${coord.x}, ${coord.y})`}
                      className="cursor-pointer"
                      onClick={() => clearWasteNode(bin.id)}
                    >
                      <circle
                        r={inRoute ? 18 : 14}
                        fill="#020617"
                        stroke={color}
                        strokeWidth={inRoute ? 2.5 : 1.5}
                        strokeDasharray={inRoute ? undefined : '3 3'}
                      />
                      <text y="3" textAnchor="middle" fill={color} fontSize="10" fontFamily="monospace" fontWeight="700">
                        {bin.fillLevelPercent}%
                      </text>
                      <text y="-22" textAnchor="middle" fill="#e2e8f0" fontSize="9.5" fontFamily="monospace">
                        {bin.id} · {coord.short}
                      </text>
                    </g>
                  )
                })}

                {activeRouteNodes.length > 0 && (
                  <g transform={`translate(${truckPos.x}, ${truckPos.y})`}>
                    <circle r="8" fill="#10b981" stroke="#022c22" strokeWidth="2" />
                    <text y="3" textAnchor="middle" fill="#022c22" fontSize="8" fontFamily="monospace" fontWeight="700">
                      T
                    </text>
                  </g>
                )}
              </svg>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3 flex-1 min-w-[220px]">
              <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
                Dispatch Fill Threshold:
              </span>
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={fillThreshold}
                onChange={(e) => setFillThreshold(Number(e.target.value))}
                className="flex-1 accent-emerald-500"
              />
              <span className="font-mono text-xs font-bold text-emerald-300 tabular-nums w-10 text-right">
                {fillThreshold}%
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              Stops: <strong className="text-emerald-300">{activeRouteNodes.length}/{wasteEcosystem.collectionNodes.length}</strong>
            </span>
          </div>
        </div>

        {/* Route Method Benchmark & Fill BarChart */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/75 p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Fuel className="h-4 w-4 text-cyan-400" />
                HOW S3 SIMULATION SAVES FUEL
              </h3>
              <span className="font-mono text-[11px] text-emerald-300 tabular-nums">
                -{routeComparison.kmSaved} km/cycle
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono tabular-nums">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                <span className="text-[10px] text-slate-500 block">ACTIVE ROUTE</span>
                <span className="text-base font-bold text-slate-100">
                  {dispatchMode === 'fixed_beat' ? routeComparison.fixedKm : routeComparison.aiKm} km
                </span>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                <span className="text-[10px] text-slate-500 block">FUEL SAVED</span>
                <span className="text-base font-bold text-emerald-400">
                  {routeComparison.fuelSavedLiters} L
                </span>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                <span className="text-[10px] text-slate-500 block">CO₂ AVOIDED</span>
                <span className="text-base font-bold text-cyan-400">
                  {routeComparison.co2AvoidedKg} kg
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-2.5 text-[11px] text-slate-400 leading-relaxed">
              <Route className="h-3.5 w-3.5 text-emerald-400 inline mr-1.5" />
              Bins below <strong className="text-slate-200">{fillThreshold}%</strong> (e.g., triggered by gas/ultrasonic levels) are skipped on the real Bengaluru map while live Google Traffic shows congested wards to bypass.
            </div>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="zone" stroke="#64748b" fontSize={10} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <ReferenceLine y={fillThreshold} stroke="#38bdf8" strokeDasharray="4 4" />
                <Bar dataKey="fill" name="Fill %" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={
                        entry.fill >= 90
                          ? '#f43f5e'
                          : entry.fill >= fillThreshold
                            ? '#f59e0b'
                            : '#10b981'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Smart Bin Monitoring Grid & Per-Node Controls */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {wasteEcosystem.collectionNodes.map((bin) => {
          const isOverflow = bin.status === 'Overflow Flagged'
          const isNearCapacity = bin.status === 'Near Capacity'
          const isMissed = bin.status === 'Missed Pick-up'

          return (
            <div
              key={bin.id}
              className={`rounded-xl border p-4 space-y-3 transition ${
                isOverflow
                  ? 'border-rose-500/80 bg-rose-950/35'
                  : isNearCapacity || isMissed
                    ? 'border-amber-500/60 bg-amber-950/20'
                    : 'border-slate-800 bg-slate-900/65'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-xs font-bold text-cyan-400">{bin.id}</span>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase font-semibold ${
                    isOverflow
                      ? 'border border-rose-500/40 bg-rose-900/60 text-rose-200'
                      : isNearCapacity || isMissed
                        ? 'border border-amber-500/40 bg-amber-900/60 text-amber-200'
                        : 'border border-emerald-500/40 bg-emerald-900/60 text-emerald-200'
                  }`}
                >
                  {bin.status}
                </span>
              </div>

              <div>
                <p className="font-bold text-xs text-slate-200">{bin.locationName}</p>
                <p className="font-mono text-[10px] text-slate-500">
                  {bin.zone} · Cleared {bin.lastClearedTime}
                </p>
              </div>

              <div>
                <div className="flex justify-between font-mono text-[10px] text-slate-400 mb-1 tabular-nums">
                  <span>Ultrasonic Fill</span>
                  <span className="font-bold text-slate-200">{bin.fillLevelPercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      bin.fillLevelPercent >= 90
                        ? 'bg-rose-500'
                        : bin.fillLevelPercent >= fillThreshold
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${bin.fillLevelPercent}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => reportMissedPickup(bin.id)}
                  className="rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-semibold text-slate-300 transition"
                >
                  Missed
                </button>
                <button
                  type="button"
                  onClick={() => flagWasteOverflow(bin.id)}
                  className="rounded border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 py-1 text-[10px] font-semibold text-rose-300 transition"
                >
                  Overflow
                </button>
                <button
                  type="button"
                  onClick={() => clearWasteNode(bin.id)}
                  className="flex items-center justify-center gap-0.5 rounded border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 py-1 text-[10px] font-semibold text-emerald-300 transition"
                >
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Clear
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Autonomous Dispatch & Optimization Activity Log */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5 space-y-3">
        <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          AUTONOMOUS DISPATCH &amp; ROUTE OPTIMIZATION ACTIVITY LOG
        </h3>

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {wasteEcosystem.routingLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 rounded-lg bg-slate-950 p-2.5 font-mono text-xs border border-slate-800/80"
            >
              <span className="text-cyan-400 font-bold shrink-0 tabular-nums">{log.timestamp}</span>
              <span className="text-slate-300">{log.log}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
