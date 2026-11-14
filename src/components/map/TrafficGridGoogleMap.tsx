import { useMemo, useState } from 'react'
import { APIProvider, AdvancedMarker, InfoWindow, Map as GoogleMap } from '@vis.gl/react-google-maps'
import { Activity, Layers, Siren, Zap } from 'lucide-react'
import {
  GmpCircle,
  GmpMissingKeyBanner,
  GmpPolyline,
  GmpTrafficLayer,
  useGmpApiKey,
} from './GmpPrimitives'
import { DELHI_GRID_NODES } from '../../lib/geoCorridors'
import type {
  IntersectionQueueSnapshot,
  TrafficGridSample,
} from './TrafficGridMap'
import { ROUTE_EDGES } from '../../data/mock'

interface TrafficGridGoogleMapProps {
  sample: TrafficGridSample | undefined
  onToggleNode: (nodeId: string) => void
  onToggleRoadHazard: (roadId: string) => void
  tall?: boolean
}

export function TrafficGridGoogleMap({
  sample,
  onToggleNode,
  onToggleRoadHazard,
  tall = false,
}: TrafficGridGoogleMapProps) {
  const apiKey = useGmpApiKey()
  const [trafficLayerOn, setTrafficLayerOn] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const intersectionById = useMemo(() => {
    const map = new Map<string, IntersectionQueueSnapshot>()
    ;(sample?.intersectionsSnapshot ?? []).forEach((item) => map.set(item.id, item))
    return map
  }, [sample?.intersectionsSnapshot])

  const roadPairStats = useMemo(() => {
    const map = new Map<string, { load: number; hasHazard: boolean; hazardType?: string; roadId: string }>()
    ;(sample?.roadsSnapshot ?? []).forEach((r) => {
      const key = [r.from, r.to].sort().join('--')
      const cur = map.get(key)
      if (!cur) {
        map.set(key, { load: r.load, hasHazard: r.hasHazard, hazardType: r.hazardType, roadId: r.id })
      } else {
        map.set(key, {
          load: cur.load + r.load,
          hasHazard: cur.hasHazard || r.hasHazard,
          hazardType: cur.hazardType || r.hazardType,
          roadId: cur.roadId,
        })
      }
    })
    return map
  }, [sample?.roadsSnapshot])

  const vehiclePositions = useMemo(() => {
    return (sample?.vehiclesSnapshot ?? []).map((v) => {
      const from = DELHI_GRID_NODES[v.from]
      const to = DELHI_GRID_NODES[v.to]
      if (!from || !to) return null
      const lat = from.lat + (to.lat - from.lat) * v.progress
      const lng = from.lng + (to.lng - from.lng) * v.progress
      return { ...v, lat, lng }
    }).filter((x): x is NonNullable<typeof x> => Boolean(x))
  }, [sample?.vehiclesSnapshot])

  const selectedNode = selectedNodeId ? intersectionById.get(selectedNodeId) : undefined
  const selectedCoord = selectedNodeId ? DELHI_GRID_NODES[selectedNodeId] : undefined

  if (!apiKey) {
    return <GmpMissingKeyBanner label="New Delhi Simulation Real Map" />
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
      {/* Map Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-cyan-400" />
          <span className="font-mono font-bold text-slate-200 uppercase">
            REAL-WORLD DELHI NCR GOOGLE MAP TWIN
          </span>
          <span className="hidden sm:inline font-mono text-[10px] text-emerald-300">
            10 Live Signal Nodes · {vehiclePositions.length} Synced Agents
          </span>
        </div>

        <button
          type="button"
          onClick={() => setTrafficLayerOn((v) => !v)}
          className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] font-medium transition ${
            trafficLayerOn
              ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300'
              : 'border-slate-700 bg-slate-800 text-slate-400'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Google Traffic: {trafficLayerOn ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Real Google Map Canvas */}
      <div className={`relative w-full ${tall ? 'h-[572px]' : 'h-[452px]'}`}>
        <APIProvider apiKey={apiKey} solutionChannel="gmp_mcp_codeassist_v1_aistudio">
          <GoogleMap
            defaultCenter={{ lat: 28.605, lng: 77.216 }}
            defaultZoom={12}
            mapId="DEMO_MAP_ID"
            gestureHandling="greedy"
            disableDefaultUI={false}
            style={{ width: '100%', height: '100%' }}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          >
            <GmpTrafficLayer enabled={trafficLayerOn} />

            {/* Live Simulated Road Corridors connecting real Delhi NCR nodes */}
            {ROUTE_EDGES.map((edge) => {
              const a = DELHI_GRID_NODES[edge.from]
              const b = DELHI_GRID_NODES[edge.to]
              if (!a || !b) return null
              const pairKey = [edge.from, edge.to].sort().join('--')
              const stats = roadPairStats.get(pairKey)
              const hasHazard = stats?.hasHazard ?? Boolean(edge.hazard)
              const load = stats?.load ?? 0
              const color = hasHazard
                ? '#f59e0b'
                : load >= 6
                  ? '#f43f5e'
                  : load >= 3
                    ? '#38bdf8'
                    : '#10b981'

              return (
                <GmpPolyline
                  key={pairKey}
                  path={[
                    { lat: a.lat, lng: a.lng },
                    { lat: b.lat, lng: b.lng },
                  ]}
                  color={color}
                  strokeWeight={hasHazard ? 5 : 3.5}
                  strokeOpacity={0.85}
                  dashed={hasHazard}
                  onClick={() => onToggleRoadHazard(stats?.roadId ?? `${edge.from}->${edge.to}`)}
                />
              )
            })}

            {/* V2X Preemption Circles & Intersections */}
            {(Object.keys(DELHI_GRID_NODES) as string[]).map((id) => {
              const coord = DELHI_GRID_NODES[id]
              const snap = intersectionById.get(id)
              const isOverridden = Boolean(snap?.isOverridden)
              const nsGreen = snap?.nsColor === 'green'

              return (
                <span key={`del-${id}`}>
                  {isOverridden && (
                    <GmpCircle
                      center={{ lat: coord.lat, lng: coord.lng }}
                      radiusMeters={680}
                      color="#10b981"
                      fillOpacity={0.22}
                      strokeWeight={2}
                    />
                  )}

                  <AdvancedMarker
                    position={{ lat: coord.lat, lng: coord.lng }}
                    title={`${coord.name} (${id})`}
                    onClick={() => setSelectedNodeId(id)}
                  >
                    <div
                      className={`cursor-pointer rounded-lg border px-2 py-0.5 font-mono text-[9.5px] shadow-lg transition hover:scale-105 ${
                        isOverridden
                          ? 'border-emerald-300 bg-emerald-950/95 text-emerald-100 animate-pulse'
                          : 'border-slate-700 bg-slate-950/95 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1 font-bold">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            nsGreen ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                        <span>{id}</span>
                        {snap && <span className="text-cyan-300 tabular-nums">{snap.timer}s</span>}
                      </div>
                      {snap && (
                        <div className="text-[8px] text-slate-400 tabular-nums">
                          NS:{snap.nsQueue} · EW:{snap.ewQueue}
                        </div>
                      )}
                    </div>
                  </AdvancedMarker>
                </span>
              )
            })}

            {/* Live Moving Simulated Vehicles on Real New Delhi Map */}
            {vehiclePositions.map((v) => {
              const isEmergency = v.type === 'emergency'
              return (
                <span key={`veh-${v.id}`}>
                  {isEmergency && (
                    <GmpCircle
                      center={{ lat: v.lat, lng: v.lng }}
                      radiusMeters={550}
                      color="#f43f5e"
                      fillOpacity={0.2}
                      strokeWeight={2}
                    />
                  )}
                  <AdvancedMarker
                    position={{ lat: v.lat, lng: v.lng }}
                    title={`${v.id} (${v.type}) · ${v.speedKmh} km/h`}
                  >
                    {isEmergency ? (
                      <div className="flex items-center gap-1 rounded-full border-2 border-white bg-rose-600 px-2 py-0.5 font-mono text-[9px] font-bold text-white shadow-lg animate-pulse">
                        <Siren className="h-3 w-3" />
                        <span>V2X</span>
                      </div>
                    ) : (
                      <div
                        className={`h-2.5 w-2.5 rounded-full border border-white shadow ${
                          v.status === 'stopped'
                            ? 'bg-rose-500'
                            : v.status === 'hazard_slowdown'
                              ? 'bg-amber-400'
                              : v.type === 'bus'
                                ? 'bg-sky-400'
                                : 'bg-emerald-400'
                        }`}
                      />
                    )}
                  </AdvancedMarker>
                </span>
              )
            })}

            {selectedNode && selectedCoord && (
              <InfoWindow
                position={{ lat: selectedCoord.lat, lng: selectedCoord.lng }}
                onCloseClick={() => setSelectedNodeId(null)}
              >
                <div className="p-1 max-w-[210px] text-slate-900 font-sans space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                    <span className="font-bold text-xs text-slate-900">{selectedCoord.name}</span>
                    <span className="font-mono text-[10px] text-cyan-700">{selectedNode.timer}s</span>
                  </div>
                  <div className="font-mono text-[10px] space-y-0.5 text-slate-700">
                    <div>NS: {selectedNode.nsColor.toUpperCase()} (Q:{selectedNode.nsQueue})</div>
                    <div>EW: {selectedNode.ewColor.toUpperCase()} (Q:{selectedNode.ewQueue})</div>
                    <div>Green Alloc: {selectedNode.greenDuration}s</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleNode(selectedNode.id)
                      setSelectedNodeId(null)
                    }}
                    className="w-full rounded bg-cyan-600 px-2 py-1 font-mono text-[10px] font-semibold text-white hover:bg-cyan-700"
                  >
                    Flip Signal Phase
                  </button>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </APIProvider>

        {/* Bottom Map Interaction Tip */}
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-slate-950/90 px-3 py-1.5 font-mono text-[10px] text-slate-300 backdrop-blur">
          <span className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-amber-400" />
            Click any Delhi road line to inject/clear a -55% hazard · Click any junction badge to flip phase
          </span>
          <span className="text-emerald-300">Synced with D3 Engine</span>
        </div>
      </div>
    </div>
  )
}
