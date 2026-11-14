import { useState } from 'react'
import { Activity, Camera, CarFront, Radio, TriangleAlert } from 'lucide-react'
import { LiveCctvNode } from '../components/cctv/LiveCctvNode'
import { OpsMap } from '../components/map/OpsMap'
import { TrafficGridMap } from '../components/map/TrafficGridMap'
import { MetricCard } from '../components/ui/MetricCard'
import { Panel } from '../components/ui/Panel'
import { useTrident } from '../context/useTrident'
import { MAP_NODES } from '../data/mock'

export function TrafficControl() {
  const { metrics, reports, setMapLayer } = useTrident()
  const critical = reports.filter((r) => r.severity === 'Critical').length
  const [mapMode, setMapMode] = useState<'simulation' | 'density'>('simulation')

  return (
    <div className="space-y-4">
      {/* Top Metric Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="System Status"
          value="ACTIVE"
          hint="D3 Grid inference engine synced"
          tone="emerald"
          icon={Activity}
        />
        <MetricCard
          label="Video Inference Nodes"
          value={String(metrics.videoNodes)}
          hint="Active CCTV feeds online"
          tone="zinc"
          icon={Camera}
        />
        <MetricCard
          label="Tracked Vehicles"
          value={metrics.trackedVehicles.toLocaleString('en-IN')}
          hint="Simulated multi-node fleet"
          tone="amber"
          icon={CarFront}
        />
        <MetricCard
          label="Active Hazard Reports"
          value={String(metrics.hazardReports)}
          hint={`${critical} critical in queue`}
          tone="rose"
          icon={TriangleAlert}
        />
      </div>

      {/* Main Grid: D3 Map + CCTV */}
      <div className="grid gap-4 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title="City Operations Viewport"
          subtitle={
            mapMode === 'simulation'
              ? 'Real-time D3.js traffic simulation · vehicle kinetics & interlocking signals'
              : 'Simulated NCR vector grid · density / accident / hazard layers'
          }
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Mode switch */}
              <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
                <button
                  type="button"
                  onClick={() => setMapMode('simulation')}
                  className={`rounded px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                    mapMode === 'simulation'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  D3 Grid Sim
                </button>
                <button
                  type="button"
                  onClick={() => setMapMode('density')}
                  className={`rounded px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                    mapMode === 'density'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Density Map
                </button>
              </div>

              {mapMode === 'density' ? (
                <div className="flex gap-1">
                  {(
                    [
                      ['congestion', 'Density'],
                      ['accidents', 'Accidents'],
                      ['potholes', 'Hazards'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMapLayer(id)}
                      className="rounded border border-zinc-700 px-2 py-1 font-mono text-[10px] text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-300"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          }
        >
          {mapMode === 'simulation' ? <TrafficGridMap tall /> : <OpsMap tall />}
        </Panel>

        {/* Live CCTV node */}
        <Panel
          className="xl:col-span-2"
          title="Live CCTV analytics node"
          subtitle="Bounding boxes · classification · density score"
        >
          <LiveCctvNode />
        </Panel>
      </div>

      {/* Signal Status Ledger Across All Dashboard Intersections */}
      <Panel
        title="Signal Status Matrix & NCR Arterial Corridors"
        subtitle="Real-time interlocking signal phases across 10 key intersections"
        action={
          <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-400">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            <span>10 / 10 NODES SYNCED</span>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {MAP_NODES.map((node, index) => {
            const isNsGreen = index % 2 === 0
            return (
              <div
                key={node.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 transition hover:border-zinc-700"
              >
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
                  <span className="font-medium text-zinc-200">{node.label}</span>
                  <span className="font-mono text-[10px] text-zinc-500">[{node.id}]</span>
                </div>

                <div className="mt-2 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">N-S Corridor:</span>
                    <span
                      className={`inline-flex items-center gap-1 font-mono font-medium ${
                        isNsGreen ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${isNsGreen ? 'bg-emerald-400' : 'bg-rose-400'}`}
                      />
                      {isNsGreen ? 'GREEN' : 'RED'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">E-W Arterial:</span>
                    <span
                      className={`inline-flex items-center gap-1 font-mono font-medium ${
                        !isNsGreen ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${!isNsGreen ? 'bg-emerald-400' : 'bg-rose-400'}`}
                      />
                      {!isNsGreen ? 'GREEN' : 'RED'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 font-mono text-[10px] text-zinc-500">
                    <span>Density: {node.density}%</span>
                    <span className="text-zinc-400">Auto-Adaptive</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
