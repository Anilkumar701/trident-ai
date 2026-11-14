import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CarFront,
  Cpu,
  GitBranch,
  MapPin,
  Play,
  RotateCcw,
  Siren,
  Square,
  Terminal,
  Waves,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDashboard } from '../../context/DashboardContext'
import type { SignalControlStrategy } from '../../lib/trafficSimulation'
import {
  TrafficGridMap,
  type TrafficGridSample,
  type TrafficScenarioCommand,
} from '../map/TrafficGridMap'
import { TrafficGridGoogleMap } from '../map/TrafficGridGoogleMap'

interface ShowcaseStage {
  id: number
  title: string
  command: TrafficScenarioCommand['type']
  badge: string
  mechanism: string
  formula: string
}

const SHOWCASE_STAGES: ShowcaseStage[] = [
  {
    id: 1,
    title: '1. Fixed-Timer Baseline',
    command: 'fixed_demo',
    badge: 'BASELINE',
    mechanism:
      'Static 12s NS/EW cycles ignore empty lanes and pick turns uniformly, causing red-light queues to stack under 52-vehicle load.',
    formula: 'G_ns = 12s, G_ew = 12s · P(turn) = 1/k',
  },
  {
    id: 2,
    title: '2. AI Adaptive Webster',
    command: 'webster_demo',
    badge: 'ADAPTIVE AI',
    mechanism:
      'Shortens green phases on empty approaches early, allocates 7–20s proportional to queue differential, and routes around jammed links.',
    formula: 'G = clamp(7..20, 9 + 1.4·(Q_act - Q_cross))',
  },
  {
    id: 3,
    title: '3. Monsoon Hazard Detour',
    command: 'monsoon',
    badge: 'HAZARD PHYSICS',
    mechanism:
      'Waterlogged segments impose a 58% speed cap; car-following headway brakes trailing traffic while AI routing steers around flooded links.',
    formula: 'v_cap = v_max·(1 - 0.58) · d_gap ≥ max(3.5, 0.4·v)',
  },
  {
    id: 4,
    title: '4. V2X Emergency Wave',
    command: 'ambulance',
    badge: 'V2X PREEMPT',
    mechanism:
      'Emergency responder broadcasts a V2X beacon 75% ahead of arrival, snapping downstream approaches to a 10s locked GREEN phase.',
    formula: 'if d_emg > 0.25 → override(approach, GREEN, 10s)',
  },
]

const STRATEGY_LABELS: Record<SignalControlStrategy, string> = {
  fixed: 'Fixed-Timer',
  webster_ai: 'AI Webster',
  v2x_emergency: 'V2X Preempt',
  green_wave: 'EW Green Wave',
}

interface StrategyStats {
  samples: number
  sumSpeed: number
  sumQueued: number
  sumThroughput: number
}

export function TrafficGridShowcase() {
  const { visionStream, simulateSirenEvent, clearSirenEvent } = useDashboard()
  const [activeStageIdx, setActiveStageIdx] = useState<number>(1)
  const [autoTour, setAutoTour] = useState<boolean>(false)
  const [viewLayout, setViewLayout] = useState<'split' | 'real_map' | 'd3_grid'>('split')
  const [scenarioCommand, setScenarioCommand] = useState<TrafficScenarioCommand | null>(null)
  const [samples, setSamples] = useState<TrafficGridSample[]>([])
  const [strategyStats, setStrategyStats] = useState<Record<SignalControlStrategy, StrategyStats>>({
    fixed: { samples: 0, sumSpeed: 0, sumQueued: 0, sumThroughput: 0 },
    webster_ai: { samples: 0, sumSpeed: 0, sumQueued: 0, sumThroughput: 0 },
    v2x_emergency: { samples: 0, sumSpeed: 0, sumQueued: 0, sumThroughput: 0 },
    green_wave: { samples: 0, sumSpeed: 0, sumQueued: 0, sumThroughput: 0 },
  })

  const dispatchCommand = useCallback(
    (type: TrafficScenarioCommand['type'], nodeId?: string, roadId?: string) => {
      setScenarioCommand({ type, nodeId, roadId, nonce: Date.now() })
    },
    [],
  )

  const activateStage = useCallback(
    (idx: number) => {
      const stage = SHOWCASE_STAGES[idx]
      if (!stage) return
      setActiveStageIdx(idx)
      dispatchCommand(stage.command)
      if (stage.command === 'ambulance') {
        simulateSirenEvent('Silk Board')
      }
    },
    [dispatchCommand, simulateSirenEvent],
  )

  // Optional automated walkthrough cycling all 4 showcase stages every 8s
  useEffect(() => {
    if (!autoTour) return
    const timer = window.setInterval(() => {
      setActiveStageIdx((prev) => {
        const nextIdx = (prev + 1) % SHOWCASE_STAGES.length
        const stage = SHOWCASE_STAGES[nextIdx]
        dispatchCommand(stage.command)
        if (stage.command === 'ambulance') {
          simulateSirenEvent('Silk Board')
        }
        return nextIdx
      })
    }, 8000)
    return () => window.clearInterval(timer)
  }, [autoTour, dispatchCommand, simulateSirenEvent])

  const handleTelemetrySample = useCallback((sample: TrafficGridSample) => {
    setSamples((prev) => [...prev.slice(-29), sample])
    setStrategyStats((prev) => {
      const cur = prev[sample.strategy]
      return {
        ...prev,
        [sample.strategy]: {
          samples: cur.samples + 1,
          sumSpeed: cur.sumSpeed + sample.avgSpeed,
          sumQueued: cur.sumQueued + sample.queued,
          sumThroughput: cur.sumThroughput + sample.throughput,
        },
      }
    })
  }, [])

  const latestSample = samples[samples.length - 1]
  const currentStage = SHOWCASE_STAGES[activeStageIdx] ?? SHOWCASE_STAGES[1]

  const busiestJunction = useMemo(() => {
    if (!latestSample?.intersectionsSnapshot?.length) return null
    return [...latestSample.intersectionsSnapshot].sort(
      (a, b) => b.nsQueue + b.ewQueue - (a.nsQueue + a.ewQueue),
    )[0]
  }, [latestSample])

  const benchmarkChartData = useMemo(() => {
    return (Object.keys(STRATEGY_LABELS) as SignalControlStrategy[]).map((key) => {
      const st = strategyStats[key]
      const count = st.samples
      return {
        strategy: STRATEGY_LABELS[key],
        avgSpeed: count > 0 ? Math.round(st.sumSpeed / count) : 0,
        avgQueued: count > 0 ? Number((st.sumQueued / count).toFixed(1)) : 0,
        avgFlow: count > 0 ? Math.round(st.sumThroughput / count) : 0,
      }
    })
  }, [strategyStats])

  return (
    <div className="space-y-5">
      {/* Guided Prototype Showcase Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/85 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/60 text-cyan-400 shrink-0">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  INTERACTIVE TRAFFIC GRID WORKING PROTOTYPE
                </span>
                <span className="rounded border border-emerald-500/40 bg-emerald-950/60 px-2 py-0.5 font-mono text-[10px] text-emerald-300 uppercase">
                  60 FPS KINEMATICS &amp; SIGNAL ENGINE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Follow the 4-stage prototype tour or click any junction, road, or vehicle directly on the D3 grid to test live behavior.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!autoTour) activateStage(0)
                setAutoTour((v) => !v)
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition whitespace-nowrap ${
                autoTour
                  ? 'border-emerald-400 bg-emerald-600 text-white'
                  : 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/60'
              }`}
            >
              {autoTour ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {autoTour ? 'Stop Guided Tour' : 'Run 4-Stage Guided Tour'}
            </button>

            <button
              type="button"
              onClick={() => dispatchCommand('platoon')}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 font-mono text-xs font-semibold text-cyan-300 hover:bg-cyan-900/60 transition whitespace-nowrap"
            >
              <Zap className="h-3.5 w-3.5" />
              +6 Platoon
            </button>

            <button
              type="button"
              onClick={() => {
                setAutoTour(false)
                dispatchCommand('rush')
              }}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 font-mono text-xs font-semibold text-amber-300 hover:bg-amber-900/60 transition whitespace-nowrap"
            >
              <CarFront className="h-3.5 w-3.5" />
              Peak Rush (56)
            </button>

            <button
              type="button"
              onClick={() => {
                setAutoTour(false)
                dispatchCommand('monsoon')
              }}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 font-mono text-xs font-semibold text-cyan-300 hover:bg-cyan-900/60 transition whitespace-nowrap"
            >
              <Waves className="h-3.5 w-3.5" />
              Monsoon
            </button>

            <button
              type="button"
              onClick={() => {
                setAutoTour(false)
                activateStage(3)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 font-mono text-xs font-semibold text-rose-300 hover:bg-rose-900/60 transition whitespace-nowrap"
            >
              <Siren className="h-3.5 w-3.5" />
              V2X Ambulance
            </button>

            <button
              type="button"
              onClick={() => {
                setAutoTour(false)
                setActiveStageIdx(1)
                dispatchCommand('reset')
                if (visionStream.ambulancePresent) clearSirenEvent()
              }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-xs font-semibold text-slate-300 hover:bg-slate-700 transition whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        {/* 4 Clickable Prototype Walkthrough Steps */}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {SHOWCASE_STAGES.map((stage, idx) => {
            const isActive = activeStageIdx === idx
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => {
                  setAutoTour(false)
                  activateStage(idx)
                }}
                className={`text-left rounded-lg border p-3 transition ${
                  isActive
                    ? 'border-cyan-400/70 bg-cyan-950/40'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-slate-100">{stage.title}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {stage.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{stage.mechanism}</p>
              </button>
            )
          })}
        </div>

        {/* Active Stage Math & Map Layout Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 font-mono text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <GitBranch className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>
              Active Model: <strong className="text-emerald-300">{currentStage.title}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <code className="text-cyan-300 text-[11px] tabular-nums hidden md:inline">{currentStage.formula}</code>
            <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 p-0.5 text-[11px]">
              {(
                [
                  ['split', 'Split: Real Map + D3'],
                  ['real_map', 'Real Map Only'],
                  ['d3_grid', 'D3 Grid Only'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewLayout(mode)}
                  className={`flex items-center gap-1 rounded px-2 py-1 transition ${
                    viewLayout === mode
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode !== 'd3_grid' && <MapPin className="h-3 w-3" />}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Synchronized Real Delhi NCR Google Map + 60fps D3 Vector Simulation */}
      <div className={`grid gap-4 ${viewLayout === 'split' ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
        {viewLayout !== 'd3_grid' && (
          <TrafficGridGoogleMap
            tall
            sample={latestSample}
            onToggleNode={(nodeId) => dispatchCommand('toggle_node', nodeId)}
            onToggleRoadHazard={(roadId) => dispatchCommand('toggle_road_hazard', undefined, roadId)}
          />
        )}

        <div className={viewLayout === 'real_map' ? 'hidden' : 'block'}>
          <TrafficGridMap
            tall
            scenarioCommand={scenarioCommand}
            onTelemetrySample={handleTelemetrySample}
          />
        </div>
      </div>

      {/* Under-the-Hood Explainability: Algorithm State + Decision Event Feed */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Live Physics & Webster Inspector */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-cyan-400" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                HOW IT WORKS · LIVE ENGINE STATE
              </h3>
            </div>
            <span className="font-mono text-[11px] text-emerald-300 uppercase">
              {latestSample ? STRATEGY_LABELS[latestSample.strategy] : 'AI Webster'}
            </span>
          </div>

          {/* Fleet Kinematic Status Breakdown */}
          <div className="grid grid-cols-5 gap-1.5 font-mono text-center tabular-nums">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <span className="text-[9px] text-slate-500 block">CRUISING</span>
              <span className="text-sm font-bold text-emerald-400">
                {latestSample?.fleetBreakdown.cruising ?? 0}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <span className="text-[9px] text-slate-500 block">BRAKING</span>
              <span className="text-sm font-bold text-amber-400">
                {latestSample?.fleetBreakdown.braking ?? 0}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <span className="text-[9px] text-slate-500 block">STOPPED</span>
              <span className="text-sm font-bold text-rose-400">
                {latestSample?.fleetBreakdown.stopped ?? 0}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <span className="text-[9px] text-slate-500 block">HAZARD</span>
              <span className="text-sm font-bold text-orange-300">
                {latestSample?.fleetBreakdown.hazardSlowdown ?? 0}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <span className="text-[9px] text-slate-500 block">V2X EMG</span>
              <span className="text-sm font-bold text-rose-300">
                {latestSample?.fleetBreakdown.emergency ?? 0}
              </span>
            </div>
          </div>

          {/* Live Busiest Junction Computation */}
          {busiestJunction ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5 font-mono text-xs tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Busiest Node Right Now:</span>
                <span className="font-bold text-cyan-300">
                  {busiestJunction.name} ({busiestJunction.id})
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Approach Queues (NS / EW):</span>
                <span className="text-slate-200">
                  {busiestJunction.nsQueue} veh / {busiestJunction.ewQueue} veh
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Computed Green Allocation:</span>
                <span className="text-emerald-300">
                  {busiestJunction.greenDuration}s (rem {busiestJunction.timer}s)
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-500">
              Sampling intersection queues...
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Tip: Click any road segment on the D3 map to inject/clear a <strong className="text-amber-300">-55% hazard</strong> and watch AI routing divert downstream vehicles around it. Click <strong className="text-slate-200">Pause → Step +0.5s</strong> to inspect stop-line braking frame by frame.
          </p>
        </div>

        {/* Live Signal & Physics Decision Feed */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                REAL-TIME DECISION &amp; TELEMETRY EVENT FEED
              </h3>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              Emitted live by signal &amp; routing kernels
            </span>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 font-mono text-xs">
            {(latestSample?.recentEvents ?? []).map((evt) => (
              <div
                key={evt.id}
                className="flex items-start gap-2.5 rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2"
              >
                <span className="text-slate-500 shrink-0 tabular-nums">{evt.timestamp}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0 ${
                    evt.kind === 'v2x'
                      ? 'bg-rose-500/20 text-rose-300'
                      : evt.kind === 'hazard'
                        ? 'bg-amber-500/20 text-amber-300'
                        : evt.kind === 'routing'
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {evt.kind}
                </span>
                <span className="text-slate-300 leading-snug">{evt.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live 10-Junction Queue & Signal Phase Matrix */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
            LIVE 10-JUNCTION QUEUE &amp; SIGNAL PHASE MATRIX (CLICK TO FLIP PHASE)
          </h3>
          <span className="font-mono text-[11px] text-slate-400">
            Synchronized directly with D3 SVG nodes
          </span>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {(latestSample?.intersectionsSnapshot ?? []).map((node) => (
            <div
              key={node.id}
              className={`rounded-lg border p-2.5 space-y-2 transition ${
                node.isOverridden
                  ? 'border-emerald-500/60 bg-emerald-950/25'
                  : 'border-slate-800 bg-slate-950/90'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-xs text-slate-100 truncate">{node.name}</span>
                <span className="font-mono text-[10px] text-cyan-300 tabular-nums shrink-0">
                  {node.timer}s
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] tabular-nums">
                <div className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 flex items-center justify-between">
                  <span
                    className={
                      node.nsColor === 'green'
                        ? 'text-emerald-400 font-bold'
                        : node.nsColor === 'yellow'
                          ? 'text-amber-400 font-bold'
                          : 'text-rose-400 font-bold'
                    }
                  >
                    NS
                  </span>
                  <span className="text-slate-300">Q:{node.nsQueue}</span>
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 flex items-center justify-between">
                  <span
                    className={
                      node.ewColor === 'green'
                        ? 'text-emerald-400 font-bold'
                        : node.ewColor === 'yellow'
                          ? 'text-amber-400 font-bold'
                          : 'text-rose-400 font-bold'
                    }
                  >
                    EW
                  </span>
                  <span className="text-slate-300">Q:{node.ewQueue}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => dispatchCommand('toggle_node', node.id)}
                className="w-full rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 py-1 font-mono text-[10px] font-medium text-slate-200 transition"
              >
                Flip Signal Phase
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Dual Recharts Analytics: Live Waveform + Observed Strategy Benchmark */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              REAL-TIME SPEED, QUEUE &amp; THROUGHPUT STREAM
            </h3>
            {latestSample && (
              <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
                {latestSample.avgSpeed} km/h · {latestSample.queued} queued
              </span>
            )}
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={samples} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
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
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="avgSpeed"
                  name="Mean Speed (km/h)"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="queued"
                  name="Queued Vehicles"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="throughput"
                  name="Grid Flow (vph)"
                  stroke="#38bdf8"
                  fill="#38bdf8"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
              OBSERVED STRATEGY A/B BENCHMARK (ACCUMULATED)
            </h3>
            <span className="font-mono text-[11px] text-slate-400">
              Switch strategies to compare live averages
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={benchmarkChartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="strategy" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="avgSpeed" name="Avg Speed (km/h)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avgQueued" name="Avg Queued Veh" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avgFlow" name="Avg Flow (vph)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
