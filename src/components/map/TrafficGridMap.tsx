import { useEffect, useId, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import {
  CarFront,
  Gauge,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Siren,
  Sliders,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  advanceSignalWithStrategy,
  chooseNextRoad,
  computeNextVehicleState,
  interpolateSegment,
  overrideSignal,
  type GridIntersection,
  type GridRoad,
  type SignalColor,
  type SignalControlStrategy,
  type Vehicle,
  VEHICLE_CONFIGS,
} from '../../lib/trafficSimulation'
import { buildGridIntersections, buildGridRoads, spawnVehicle } from '../../lib/gridTopology'

export interface IntersectionQueueSnapshot {
  id: string
  name: string
  nsColor: SignalColor
  ewColor: SignalColor
  timer: number
  greenDuration: number
  nsQueue: number
  ewQueue: number
  isOverridden: boolean
}

export interface GridDecisionEvent {
  id: string
  timestamp: string
  kind: 'signal' | 'v2x' | 'hazard' | 'routing' | 'physics'
  message: string
}

export interface VehicleMapSnapshot {
  id: string
  type: Vehicle['type']
  roadId: string
  from: string
  to: string
  progress: number
  speedKmh: number
  status: Vehicle['status']
}

export interface RoadMapSnapshot {
  id: string
  from: string
  to: string
  load: number
  hasHazard: boolean
  hazardType?: string
}

export interface TrafficGridSample {
  t: string
  avgSpeed: number
  queued: number
  throughput: number
  strategy: SignalControlStrategy
  intersectionsSnapshot: IntersectionQueueSnapshot[]
  vehiclesSnapshot: VehicleMapSnapshot[]
  roadsSnapshot: RoadMapSnapshot[]
  fleetBreakdown: {
    cruising: number
    braking: number
    stopped: number
    hazardSlowdown: number
    emergency: number
  }
  recentEvents: GridDecisionEvent[]
}

export interface TrafficScenarioCommand {
  type:
    | 'rush'
    | 'monsoon'
    | 'ambulance'
    | 'reset'
    | 'fixed_demo'
    | 'webster_demo'
    | 'green_wave_demo'
    | 'platoon'
    | 'toggle_node'
    | 'toggle_road_hazard'
  nodeId?: string
  roadId?: string
  nonce: number
}

interface TrafficGridMapProps {
  tall?: boolean
  onVehicleSelect?: (vehicle: Vehicle | null) => void
  scenarioCommand?: TrafficScenarioCommand | null
  onTelemetrySample?: (sample: TrafficGridSample) => void
}

export function TrafficGridMap({
  tall = false,
  onVehicleSelect,
  scenarioCommand,
  onTelemetrySample,
}: TrafficGridMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Simulation state
  const [isPlaying, setIsPlaying] = useState(true)
  const [simSpeed, setSimSpeed] = useState<1 | 2 | 4>(1)
  const [densityTarget, setDensityTarget] = useState<number>(32) // target fleet size
  const [strategy, setStrategy] = useState<SignalControlStrategy>('webster_ai')
  const [monsoonMode, setMonsoonMode] = useState(false)

  // Layers
  const [showSignals, setShowSignals] = useState(true)
  const [showSpeedTags, setShowSpeedTags] = useState(false)
  const [showRoadLabels, setShowRoadLabels] = useState(true)
  const [showHazards, setShowHazards] = useState(true)
  const [showCongestionHeat, setShowCongestionHeat] = useState(true)
  const [showV2xRings, setShowV2xRings] = useState(true)

  // Selection
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [selectedIntersection, setSelectedIntersection] = useState<GridIntersection | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Live simulation data held in refs for 60fps D3 render loops
  const intersectionsRef = useRef<GridIntersection[]>(buildGridIntersections())
  const roadsRef = useRef<GridRoad[]>(buildGridRoads())
  const [roadsDisplay, setRoadsDisplay] = useState<GridRoad[]>(() => buildGridRoads())
  const vehiclesRef = useRef<Vehicle[]>([])
  const eventsRef = useRef<GridDecisionEvent[]>([
    {
      id: 'EVT-INIT',
      timestamp: 'BOOT',
      kind: 'signal',
      message: 'AI Adaptive Webster controller initialized across 10 NCR intersections.',
    },
  ])
  const pendingStepSecRef = useRef<number>(0)
  const onVehicleSelectRef = useRef(onVehicleSelect)
  const onTelemetrySampleRef = useRef(onTelemetrySample)
  const selectedVehicleIdRef = useRef(selectedVehicle?.id)
  const selectedIntersectionIdRef = useRef(selectedIntersection?.id)
  const strategyRef = useRef<SignalControlStrategy>(strategy)
  const initialDensityRef = useRef(densityTarget)

  useEffect(() => {
    onVehicleSelectRef.current = onVehicleSelect
    onTelemetrySampleRef.current = onTelemetrySample
    selectedVehicleIdRef.current = selectedVehicle?.id
    selectedIntersectionIdRef.current = selectedIntersection?.id
    strategyRef.current = strategy
  }, [onVehicleSelect, onTelemetrySample, selectedVehicle?.id, selectedIntersection?.id, strategy])

  // Telemetry summary metrics
  const [metrics, setMetrics] = useState({
    activeCount: 0,
    avgSpeedKmh: 42,
    stoppedCount: 0,
    emergencyCount: 0,
    gridFlowRate: 148,
  })

  // D3 zoom instance ref
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  // Initialize initial vehicle fleet
  useEffect(() => {
    const initialVehicles: Vehicle[] = []
    const target = initialDensityRef.current
    for (let i = 0; i < target; i++) {
      const v = spawnVehicle(roadsRef.current)
      if (v) {
        // Disperse progress initially
        v.progress = Math.random() * 0.95
        initialVehicles.push(v)
      }
    }
    vehiclesRef.current = initialVehicles
  }, [])

  // Manage target fleet size when slider changes
  useEffect(() => {
    const currentCount = vehiclesRef.current.length
    if (currentCount < densityTarget) {
      const diff = densityTarget - currentCount
      for (let i = 0; i < diff; i++) {
        const v = spawnVehicle(roadsRef.current)
        if (v) vehiclesRef.current.push(v)
      }
    } else if (currentCount > densityTarget) {
      vehiclesRef.current = vehiclesRef.current.slice(0, densityTarget)
    }
  }, [densityTarget])

  // Setup D3 Zoom on SVG
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.65, 3.5])
      .on('zoom', (event) => {
        d3.select(svg).select('.zoom-container').attr('transform', event.transform)
      })

    zoomBehaviorRef.current = zoom
    d3.select(svg).call(zoom)

    // Set initial comfortable transform
    d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(20, 10).scale(0.96))
  }, [])

  // Zoom controls
  const handleZoom = (direction: 'in' | 'out' | 'reset') => {
    const svg = svgRef.current
    const zoom = zoomBehaviorRef.current
    if (!svg || !zoom) return

    if (direction === 'reset') {
      d3.select(svg).transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(20, 10).scale(0.96))
    } else {
      const factor = direction === 'in' ? 1.3 : 0.75
      d3.select(svg).transition().duration(250).call(zoom.scaleBy, factor)
    }
  }

  const pushDecisionEvent = (kind: GridDecisionEvent['kind'], message: string) => {
    const evt: GridDecisionEvent = {
      id: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
      kind,
      message,
    }
    eventsRef.current = [evt, ...eventsRef.current.slice(0, 17)]
  }

  // Spawn Emergency Vehicle
  const handleSpawnEmergency = () => {
    const emergencyV = spawnVehicle(roadsRef.current, undefined, 'emergency')
    if (emergencyV) {
      emergencyV.progress = 0.05
      emergencyV.speedKmh = 72
      vehiclesRef.current.push(emergencyV)
      setSelectedVehicle(emergencyV)
      pushDecisionEvent('v2x', `${emergencyV.id} Emergency Responder deployed on ${emergencyV.roadId}.`)
    }
  }

  // Spawn a coordinated 6-vehicle platoon on the central corridor
  const handleSpawnPlatoon = () => {
    const centralRoad = roadsRef.current[0]?.id
    for (let i = 0; i < 6; i++) {
      const v = spawnVehicle(roadsRef.current, centralRoad)
      if (v) {
        v.progress = Math.max(0.02, 0.06 + i * 0.08)
        vehiclesRef.current.push(v)
      }
    }
    setDensityTarget((d) => Math.min(64, d + 6))
    pushDecisionEvent('physics', `Injected 6-vehicle platoon wave on ${centralRoad || 'primary corridor'}.`)
  }

  // Toggle Signal Phase on selected intersection
  const handleToggleSignal = (intersectionId: string) => {
    intersectionsRef.current = intersectionsRef.current.map((item) => {
      if (item.id === intersectionId) {
        const nextNs: SignalColor = item.signal.nsColor === 'green' ? 'red' : 'green'
        const updated = overrideSignal(item.signal, nextNs === 'green' ? 'NS' : 'EW', 25)
        pushDecisionEvent('signal', `Manual override at ${item.name}: ${nextNs === 'green' ? 'NS' : 'EW'} locked GREEN (25s).`)
        return { ...item, signal: updated }
      }
      return item
    })
    // Update local state if inspector open
    const updated = intersectionsRef.current.find((i) => i.id === intersectionId)
    if (updated) setSelectedIntersection(updated)
  }

  // Green Wave action across major East-West or North-South arterial
  const handleTriggerGreenWave = () => {
    intersectionsRef.current = intersectionsRef.current.map((item) => {
      const updated = overrideSignal(item.signal, 'EW', 30)
      return { ...item, signal: updated }
    })
    pushDecisionEvent('signal', 'EW Green Wave locked across all 10 junctions for 30s arterial progression.')
    if (selectedIntersection) {
      const refreshed = intersectionsRef.current.find((i) => i.id === selectedIntersection.id)
      if (refreshed) setSelectedIntersection(refreshed)
    }
  }

  // Inject or clear hazard on current road
  const handleToggleRoadHazard = (roadId: string) => {
    let added = false
    const updated = roadsRef.current.map((r) => {
      if (r.id === roadId) {
        const nextHazard = r.hazard
          ? undefined
          : { type: 'Road Obstruction / Pothole', penalty: 0.55 }
        added = Boolean(nextHazard)
        return { ...r, hazard: nextHazard }
      }
      return r
    })
    roadsRef.current = updated
    setRoadsDisplay(updated)
    pushDecisionEvent(
      'hazard',
      added
        ? `Hazard injected on ${roadId} (-55% speed cap). AI routing shifting traffic.`
        : `Hazard cleared on ${roadId}. Speed limit restored.`,
    )
  }

  // Handle external scenario commands from TrafficSimulationView
  useEffect(() => {
    if (!scenarioCommand) return
    const timer = window.setTimeout(() => {
      if (scenarioCommand.type === 'rush') {
        setDensityTarget(56)
        setSimSpeed(2)
        setMonsoonMode(false)
        setStrategy('webster_ai')
        pushDecisionEvent('physics', 'Peak Rush Surge active: 56-vehicle load at 2x simulation speed.')
      } else if (scenarioCommand.type === 'fixed_demo') {
        setDensityTarget(52)
        setSimSpeed(2)
        setMonsoonMode(false)
        setStrategy('fixed')
        pushDecisionEvent('signal', 'Switched to Fixed-Timer baseline (static 12s phases, random routing).')
      } else if (scenarioCommand.type === 'webster_demo') {
        setDensityTarget(52)
        setSimSpeed(2)
        setStrategy('webster_ai')
        pushDecisionEvent('signal', 'Engaged AI Adaptive Webster controller + congestion-aware routing.')
      } else if (scenarioCommand.type === 'green_wave_demo') {
        setStrategy('green_wave')
        intersectionsRef.current = intersectionsRef.current.map((item) => ({
          ...item,
          signal: overrideSignal(item.signal, 'EW', 18),
        }))
        pushDecisionEvent('signal', 'Engaged EW Arterial Green Wave corridor synchronization.')
      } else if (scenarioCommand.type === 'monsoon') {
        setMonsoonMode(true)
        setShowHazards(true)
        setDensityTarget(40)
        const flooded = roadsRef.current.map((r, idx) =>
          idx % 4 === 0
            ? { ...r, hazard: { type: 'Monsoon Waterlogging', penalty: 0.58 } }
            : r,
        )
        roadsRef.current = flooded
        setRoadsDisplay(flooded)
        pushDecisionEvent('hazard', 'Monsoon Waterlogging active on 25% of corridors (-58% speed cap).')
      } else if (scenarioCommand.type === 'ambulance') {
        setStrategy('v2x_emergency')
        const emergencyV = spawnVehicle(roadsRef.current, undefined, 'emergency')
        if (emergencyV) {
          emergencyV.progress = 0.05
          emergencyV.speedKmh = 72
          vehiclesRef.current.push(emergencyV)
          setSelectedVehicle(emergencyV)
          pushDecisionEvent('v2x', `V2X Emergency Preemption triggered for ${emergencyV.id} on ${emergencyV.roadId}.`)
        }
      } else if (scenarioCommand.type === 'platoon') {
        const centralRoad = roadsRef.current[0]?.id
        for (let i = 0; i < 6; i++) {
          const v = spawnVehicle(roadsRef.current, centralRoad)
          if (v) {
            v.progress = Math.max(0.02, 0.06 + i * 0.08)
            vehiclesRef.current.push(v)
          }
        }
        setDensityTarget((d) => Math.min(64, d + 6))
        pushDecisionEvent('physics', `Platoon wave injected on ${centralRoad || 'grid corridor'}.`)
      } else if (scenarioCommand.type === 'toggle_node' && scenarioCommand.nodeId) {
        const targetId = scenarioCommand.nodeId
        intersectionsRef.current = intersectionsRef.current.map((item) => {
          if (item.id === targetId) {
            const nextNs: SignalColor = item.signal.nsColor === 'green' ? 'red' : 'green'
            const updated = overrideSignal(item.signal, nextNs === 'green' ? 'NS' : 'EW', 20)
            pushDecisionEvent('signal', `Junction ${item.name} overridden to ${nextNs === 'green' ? 'NS' : 'EW'} GREEN.`)
            return { ...item, signal: updated }
          }
          return item
        })
      } else if (scenarioCommand.type === 'toggle_road_hazard' && scenarioCommand.roadId) {
        const targetId = scenarioCommand.roadId
        const clicked = roadsRef.current.find((r) => r.id === targetId)
        const reverseId = clicked ? `${clicked.to}->${clicked.from}` : ''
        const toggled = roadsRef.current.map((r) => {
          if (r.id === targetId || (reverseId && r.id === reverseId)) {
            const nextHazard = r.hazard ? undefined : { type: 'Map Hazard Injection', penalty: 0.55 }
            return { ...r, hazard: nextHazard }
          }
          return r
        })
        roadsRef.current = toggled
        setRoadsDisplay(toggled)
        pushDecisionEvent(
          'hazard',
          `${clicked?.hazard ? 'Cleared hazard on' : 'Injected -55% hazard on'} ${targetId} from Google Map.`,
        )
      } else if (scenarioCommand.type === 'reset') {
        setDensityTarget(32)
        setSimSpeed(1)
        setMonsoonMode(false)
        setStrategy('webster_ai')
        const freshRoads = buildGridRoads()
        roadsRef.current = freshRoads
        setRoadsDisplay(freshRoads)
        intersectionsRef.current = buildGridIntersections()
        vehiclesRef.current = vehiclesRef.current.filter((v) => v.type !== 'emergency').slice(0, 32)
        setSelectedVehicle(null)
        pushDecisionEvent('signal', 'Grid simulation reset to nominal 32-vehicle AI Webster baseline.')
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [scenarioCommand])

  // Core Simulation & D3 Render Loop
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    let lastTime = performance.now()
    let animationFrameId = 0
    let metricCounter = 0

    const intersectionMap = new Map<string, GridIntersection>()
    intersectionsRef.current.forEach((i) => intersectionMap.set(i.id, i))

    const zoomGroup = d3.select(svg).select<SVGGElement>('.zoom-container')
    const roadsGroup = zoomGroup.select<SVGGElement>('.roads-layer')
    const vehiclesGroup = zoomGroup.select<SVGGElement>('.vehicles-layer')
    const signalsGroup = zoomGroup.select<SVGGElement>('.signals-layer')

    const tick = (now: number) => {
      const rawDelta = (now - lastTime) / 1000
      lastTime = now

      const manualStep = pendingStepSecRef.current
      if (manualStep > 0) {
        pendingStepSecRef.current = 0
      }

      // Cap delta to prevent huge jumps on tab switch
      const deltaSec =
        manualStep > 0
          ? manualStep
          : Math.min(0.12, Math.max(0.001, rawDelta)) * (isPlaying ? simSpeed : 0)

      const roadMap = new Map<string, GridRoad>()
      roadsRef.current.forEach((r) => roadMap.set(r.id, r))

      // Compute road loads & per-intersection approach queues
      const roadLoads = new Map<string, number>()
      const approachStats = new Map<
        string,
        { nsQueue: number; ewQueue: number; emergencyNS: boolean; emergencyEW: boolean }
      >()
      intersectionsRef.current.forEach((node) => {
        approachStats.set(node.id, {
          nsQueue: 0,
          ewQueue: 0,
          emergencyNS: false,
          emergencyEW: false,
        })
      })
      vehiclesRef.current.forEach((v) => {
        roadLoads.set(v.roadId, (roadLoads.get(v.roadId) ?? 0) + 1)
        const road = roadMap.get(v.roadId)
        if (!road) return
        const endNode = intersectionMap.get(road.to)
        const fromNode = intersectionMap.get(road.from)
        if (!endNode || !fromNode) return
        const stat = approachStats.get(endNode.id)
        if (!stat) return
        const isMostlyEW = Math.abs(endNode.x - fromNode.x) >= Math.abs(endNode.y - fromNode.y)
        if (v.progress > 0.45) {
          if (isMostlyEW) stat.ewQueue += 1
          else stat.nsQueue += 1
        }
        if (v.type === 'emergency' && v.progress > 0.25) {
          if (isMostlyEW) stat.emergencyEW = true
          else stat.emergencyNS = true
        }
      })

      if (deltaSec > 0) {
        // 1. Advance all intersection signals using selected strategy
        intersectionsRef.current = intersectionsRef.current.map((node) => {
          const stat = approachStats.get(node.id) ?? {
            nsQueue: 0,
            ewQueue: 0,
            emergencyNS: false,
            emergencyEW: false,
          }
          const nextSig = advanceSignalWithStrategy(
            node.signal,
            { ...stat, strategy: strategyRef.current },
            deltaSec,
          )
          // Log V2X emergency preemptions or phase switches cleanly
          if (!node.signal.isOverridden && nextSig.isOverridden && (stat.emergencyNS || stat.emergencyEW)) {
            pushDecisionEvent(
              'v2x',
              `V2X Preemption at ${node.name}: locked ${stat.emergencyNS ? 'NS' : 'EW'} GREEN for inbound responder.`,
            )
          } else if (node.signal.nsColor !== nextSig.nsColor && metricCounter % 4 === 0) {
            if (strategyRef.current === 'webster_ai') {
              pushDecisionEvent(
                'signal',
                `Webster AI @ ${node.name}: NS(${stat.nsQueue}) vs EW(${stat.ewQueue}) -> ${nextSig.nsColor === 'green' ? 'NS' : nextSig.ewColor === 'green' ? 'EW' : 'CLEAR'} (${nextSig.greenDuration}s)`,
              )
            }
          }
          const updated = { ...node, signal: nextSig }
          intersectionMap.set(node.id, updated)
          return updated
        })

        // 2. Sort vehicles by road and progress to detect lead vehicles
        const roadVehicles = new Map<string, Vehicle[]>()
        vehiclesRef.current.forEach((v) => {
          if (!roadVehicles.has(v.roadId)) roadVehicles.set(v.roadId, [])
          roadVehicles.get(v.roadId)!.push(v)
        })
        roadVehicles.forEach((list) => list.sort((a, b) => b.progress - a.progress))

        // 3. Update vehicles
        const survivingVehicles: Vehicle[] = []
        vehiclesRef.current.forEach((vehicle) => {
          const road = roadMap.get(vehicle.roadId)
          if (!road) return

          const endNode = intersectionMap.get(road.to)
          const fromNode = intersectionMap.get(road.from)

          let signalColorAtEnd: SignalColor = 'green'
          if (endNode && fromNode) {
            const dx = Math.abs(endNode.x - fromNode.x)
            const dy = Math.abs(endNode.y - fromNode.y)
            const isMostlyEW = dx >= dy
            signalColorAtEnd = isMostlyEW ? endNode.signal.ewColor : endNode.signal.nsColor
          }

          const list = roadVehicles.get(vehicle.roadId) || []
          const myIndex = list.findIndex((x) => x.id === vehicle.id)
          let distanceToLeadM = 9999
          if (myIndex > 0) {
            const lead = list[myIndex - 1]
            distanceToLeadM = Math.max(0, (lead.progress - vehicle.progress) * road.lengthMeters - lead.lengthM)
          }

          const hazardPenalty = road.hazard?.penalty ?? 0
          const { progress, speedKmh, status } = computeNextVehicleState(
            vehicle,
            road.lengthMeters,
            deltaSec,
            distanceToLeadM,
            signalColorAtEnd,
            true,
            hazardPenalty,
          )

          vehicle.progress = progress
          vehicle.speedKmh = speedKmh
          vehicle.status = status
          vehicle.distanceTraveledM += (speedKmh * 1000 * deltaSec) / 3600

          // Check if vehicle reached end of road
          if (vehicle.progress >= 0.99) {
            const candidates = roadsRef.current.filter((r) => r.from === road.to && r.to !== road.from)
            const chosen = chooseNextRoad(
              candidates.length > 0 ? candidates : roadsRef.current.filter((r) => r.from === road.to),
              roadLoads,
              strategyRef.current,
              vehicle.type === 'emergency',
            )

            if (chosen) {
              if (
                strategyRef.current !== 'fixed' &&
                candidates.some((c) => Boolean(c.hazard)) &&
                !chosen.hazard &&
                Math.random() < 0.16
              ) {
                pushDecisionEvent(
                  'routing',
                  `${vehicle.id} bypassed hazardous link at ${road.toName} via ${chosen.toName}.`,
                )
              }
              vehicle.roadId = chosen.id
              vehicle.progress = 0.01
              vehicle.pathHistory = [...vehicle.pathHistory.slice(-4), road.to]
              survivingVehicles.push(vehicle)
            } else {
              const spawned = spawnVehicle(roadsRef.current, undefined, vehicle.type)
              if (spawned) survivingVehicles.push(spawned)
            }
          } else {
            survivingVehicles.push(vehicle)
          }
        })

        // Ensure target density maintained
        while (survivingVehicles.length < densityTarget) {
          const extra = spawnVehicle(roadsRef.current)
          if (extra) survivingVehicles.push(extra)
        }

        vehiclesRef.current = survivingVehicles
      }

      // 3b. D3 Render Updates: Road Congestion Heat Overlay
      roadsRef.current.forEach((road) => {
        const el = roadsGroup.select<SVGLineElement>(`[data-heat-id="${road.id}"]`)
        if (el.empty()) return
        if (!showCongestionHeat) {
          el.attr('opacity', 0)
          return
        }
        const load = roadLoads.get(road.id) ?? 0
        const color = road.hazard
          ? '#f59e0b'
          : load >= 4
            ? '#f43f5e'
            : load >= 2
              ? '#fbbf24'
              : '#10b981'
        const opacity = road.hazard ? 0.55 : load >= 4 ? 0.55 : load >= 2 ? 0.35 : 0.18
        el.attr('stroke', color).attr('opacity', opacity)
      })

      // 4. D3 Render Updates: Signals & Live Queue Badges
      if (showSignals) {
        intersectionsRef.current.forEach((node) => {
          const g = signalsGroup.select<SVGGElement>(`[data-node-id="${node.id}"]`)
          if (g.empty()) return

          const { nsColor, ewColor, timer, isOverridden } = node.signal
          const stat = approachStats.get(node.id)
          const totalQ = (stat?.nsQueue ?? 0) + (stat?.ewQueue ?? 0)
          const nsFill = nsColor === 'green' ? '#10b981' : nsColor === 'yellow' ? '#f59e0b' : '#f43f5e'
          const ewFill = ewColor === 'green' ? '#10b981' : ewColor === 'yellow' ? '#f59e0b' : '#f43f5e'

          g.select('.ns-light').attr('fill', nsFill)
          g.select('.ew-light').attr('fill', ewFill)
          g.select('.timer-badge').text(`${Math.ceil(timer)}s`)
          g.select('.override-ring').attr('opacity', isOverridden ? '0.9' : '0')
          g.select('.queue-badge').text(totalQ > 0 ? `Q:${stat?.nsQueue ?? 0}/${stat?.ewQueue ?? 0}` : '')
        })
      }

      // 5. D3 Render Updates: Vehicles + V2X Radar Halos
      const vehicleNodes = vehiclesGroup
        .selectAll<SVGGElement, Vehicle>('g.vehicle-marker')
        .data(vehiclesRef.current, (d) => d.id)

      const enter = vehicleNodes
        .enter()
        .append('g')
        .attr('class', 'vehicle-marker cursor-pointer transition-transform duration-75')
        .on('click', (_, d) => {
          setSelectedVehicle(d)
          if (onVehicleSelectRef.current) onVehicleSelectRef.current(d)
        })

      enter.append('circle').attr('class', 'v2x-halo')
      enter.append('rect').attr('class', 'veh-body')
      enter.append('circle').attr('class', 'headlight-l')
      enter.append('circle').attr('class', 'headlight-r')
      enter.append('circle').attr('class', 'brakelight-l')
      enter.append('circle').attr('class', 'brakelight-r')
      enter.append('text').attr('class', 'veh-label')

      vehicleNodes.exit().remove()

      const merged = enter.merge(vehicleNodes)

      merged.each(function (d) {
        const road = roadMap.get(d.roadId)
        if (!road) return
        const fromNode = intersectionMap.get(road.from)
        const toNode = intersectionMap.get(road.to)
        if (!fromNode || !toNode) return

        const { x, y, headingDeg } = interpolateSegment(
          { x: fromNode.x, y: fromNode.y },
          { x: toNode.x, y: toNode.y },
          d.progress,
          6,
        )

        const isEmergency = d.type === 'emergency'
        const isBraking = d.status === 'braking' || d.status === 'stopped'
        const isSelected = selectedVehicleIdRef.current === d.id

        const el = d3.select(this)
        el.attr('transform', `translate(${x}, ${y}) rotate(${headingDeg})`)

        const width = d.type === 'bus' || d.type === 'truck' ? 14 : d.type === 'bike' ? 5 : 8
        const height = d.type === 'bus' || d.type === 'truck' ? 24 : d.type === 'bike' ? 8 : 14

        el.select('.v2x-halo')
          .attr('cx', 0)
          .attr('cy', 0)
          .attr('r', isEmergency && showV2xRings ? 28 + Math.sin(now / 150) * 6 : 0)
          .attr('fill', '#f43f5e')
          .attr('fill-opacity', isEmergency && showV2xRings ? 0.14 : 0)
          .attr('stroke', '#fb7185')
          .attr('stroke-width', isEmergency && showV2xRings ? 1.5 : 0)
          .attr('stroke-dasharray', '4 3')

        el.select('.veh-body')
          .attr('x', -width / 2)
          .attr('y', -height / 2)
          .attr('width', width)
          .attr('height', height)
          .attr('rx', d.type === 'bike' ? 2 : 3)
          .attr('fill', d.color)
          .attr('stroke', isSelected ? '#ffffff' : isEmergency ? '#f43f5e' : '#09090b')
          .attr('stroke-width', isSelected ? 2 : 1)

        el.select('.headlight-l')
          .attr('cx', -width / 3)
          .attr('cy', height / 2 + 1)
          .attr('r', 1.4)
          .attr('fill', '#fef08a')
          .attr('opacity', 0.9)

        el.select('.headlight-r')
          .attr('cx', width / 3)
          .attr('cy', height / 2 + 1)
          .attr('r', 1.4)
          .attr('fill', '#fef08a')
          .attr('opacity', 0.9)

        el.select('.brakelight-l')
          .attr('cx', -width / 3)
          .attr('cy', -height / 2 - 0.5)
          .attr('r', isBraking ? 1.8 : 1)
          .attr('fill', '#f43f5e')
          .attr('opacity', isBraking ? 1 : 0.4)

        el.select('.brakelight-r')
          .attr('cx', width / 3)
          .attr('cy', -height / 2 - 0.5)
          .attr('r', isBraking ? 1.8 : 1)
          .attr('fill', '#f43f5e')
          .attr('opacity', isBraking ? 1 : 0.4)

        const label = el.select('.veh-label')
        if (showSpeedTags) {
          label
            .attr('x', width + 2)
            .attr('y', 3)
            .attr('font-size', '7px')
            .attr('font-family', 'IBM Plex Mono')
            .attr('fill', '#e4e4e7')
            .text(`${Math.round(d.speedKmh)}`)
        } else {
          label.text('')
        }
      })

      // 6. Periodic UI Metrics & Live Telemetry Snapshot updates
      metricCounter += 1
      if (metricCounter % 20 === 0 || manualStep > 0) {
        const fleet = vehiclesRef.current
        const stopped = fleet.filter((v) => v.status === 'stopped' || v.speedKmh < 1.0).length
        const braking = fleet.filter((v) => v.status === 'braking').length
        const cruising = fleet.filter((v) => v.status === 'cruising' || v.status === 'accelerating').length
        const hazardSlowdown = fleet.filter((v) => v.status === 'hazard_slowdown').length
        const totalSpeed = fleet.reduce((sum, v) => sum + v.speedKmh, 0)
        const avgSpeed = fleet.length > 0 ? Math.round(totalSpeed / fleet.length) : 0
        const emergencyCount = fleet.filter((v) => v.type === 'emergency').length
        const throughput = Math.round(fleet.length * (avgSpeed / 10 + 1.8))

        setMetrics({
          activeCount: fleet.length,
          avgSpeedKmh: avgSpeed,
          stoppedCount: stopped,
          emergencyCount,
          gridFlowRate: throughput,
        })

        if (onTelemetrySampleRef.current && (metricCounter % 15 === 0 || manualStep > 0)) {
          const intersectionsSnapshot: IntersectionQueueSnapshot[] = intersectionsRef.current.map((node) => {
            const st = approachStats.get(node.id)
            return {
              id: node.id,
              name: node.name,
              nsColor: node.signal.nsColor,
              ewColor: node.signal.ewColor,
              timer: Math.ceil(node.signal.timer),
              greenDuration: node.signal.greenDuration,
              nsQueue: st?.nsQueue ?? 0,
              ewQueue: st?.ewQueue ?? 0,
              isOverridden: Boolean(node.signal.isOverridden),
            }
          })

          const vehiclesSnapshot: VehicleMapSnapshot[] = fleet.map((v) => {
            const r = roadMap.get(v.roadId)
            return {
              id: v.id,
              type: v.type,
              roadId: v.roadId,
              from: r?.from ?? 'CP',
              to: r?.to ?? 'ITO',
              progress: v.progress,
              speedKmh: v.speedKmh,
              status: v.status,
            }
          })

          const roadsSnapshot: RoadMapSnapshot[] = roadsRef.current.map((r) => ({
            id: r.id,
            from: r.from,
            to: r.to,
            load: roadLoads.get(r.id) ?? 0,
            hasHazard: Boolean(r.hazard),
            hazardType: r.hazard?.type,
          }))

          onTelemetrySampleRef.current({
            t: new Date().toLocaleTimeString('en-IN', {
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            }),
            avgSpeed,
            queued: stopped + braking,
            throughput,
            strategy: strategyRef.current,
            intersectionsSnapshot,
            vehiclesSnapshot,
            roadsSnapshot,
            fleetBreakdown: {
              cruising,
              braking,
              stopped,
              hazardSlowdown,
              emergency: emergencyCount,
            },
            recentEvents: eventsRef.current,
          })
        }

        const curVehId = selectedVehicleIdRef.current
        if (curVehId) {
          const fresh = fleet.find((v) => v.id === curVehId)
          if (fresh) setSelectedVehicle({ ...fresh })
        }

        const curIntId = selectedIntersectionIdRef.current
        if (curIntId) {
          const freshInt = intersectionsRef.current.find((i) => i.id === curIntId)
          if (freshInt) setSelectedIntersection({ ...freshInt })
        }
      }

      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrameId)
  }, [isPlaying, simSpeed, densityTarget, showSignals, showSpeedTags, showCongestionHeat, showV2xRings])

  // Initial road and intersection DOM setup inside D3
  const staticGridData = useMemo(() => {
    return {
      intersections: buildGridIntersections(),
      roads: buildGridRoads(),
    }
  }, [])

  const uniqueId = useId()

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 font-sans ${
        isFullscreen ? 'fixed inset-4 z-50 shadow-2xl' : tall ? 'h-[620px]' : 'h-[500px]'
      }`}
    >
      {/* Top Operations HUD & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-xs font-semibold tracking-wider text-emerald-400 uppercase">
              D3.js Traffic Grid Engine
            </span>
          </div>

          <span className="text-zinc-600">|</span>

          {/* Quick HUD Metrics */}
          <div className="hidden items-center gap-3 text-xs sm:flex">
            <div className="flex items-center gap-1.5 font-mono text-zinc-300">
              <CarFront className="h-3.5 w-3.5 text-zinc-400" />
              <span className="font-semibold text-emerald-400">{metrics.activeCount}</span>
              <span className="text-[10px] text-zinc-500">FLEET</span>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-zinc-300">
              <Gauge className="h-3.5 w-3.5 text-zinc-400" />
              <span className="font-semibold text-zinc-100">{metrics.avgSpeedKmh}</span>
              <span className="text-[10px] text-zinc-500">KM/H AVG</span>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span className="font-semibold text-rose-300">{metrics.stoppedCount}</span>
              <span className="text-[10px] text-zinc-500">QUEUED</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Play / Pause */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 font-mono text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-700"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5 text-amber-400" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-emerald-400" /> Resume
              </>
            )}
          </button>

          {!isPlaying && (
            <button
              type="button"
              onClick={() => {
                pendingStepSecRef.current = 0.5
              }}
              className="flex h-8 items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 font-mono text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/25"
            >
              Step +0.5s
            </button>
          )}

          {/* Sim Speed Multiplier */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
            {([1, 2, 4] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setSimSpeed(spd)}
                aria-label={`Set speed to ${spd}x`}
                className={`rounded px-2 py-1 font-mono text-[10px] font-semibold transition ${
                  simSpeed === spd
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Spawn Platoon */}
          <button
            type="button"
            onClick={handleSpawnPlatoon}
            title="Inject 6-vehicle corridor platoon"
            className="hidden sm:flex h-8 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/20"
          >
            +Platoon
          </button>

          {/* Spawn Emergency */}
          <button
            type="button"
            onClick={handleSpawnEmergency}
            aria-label="Deploy Priority Emergency Vehicle"
            title="Deploy Priority Emergency Vehicle with Siren"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
          >
            <Siren className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden sm:inline">Priority Unit</span>
          </button>

          {/* Green Wave corridor button */}
          <button
            type="button"
            onClick={handleTriggerGreenWave}
            aria-label="Trigger Green Wave"
            title="Synchronize all East-West signals to green wave"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden md:inline">Green Wave</span>
          </button>

          {/* Zoom buttons */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
            <button
              type="button"
              onClick={() => handleZoom('in')}
              aria-label="Zoom In"
              className="p-1 text-zinc-400 hover:text-zinc-100"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom('out')}
              aria-label="Zoom Out"
              className="p-1 text-zinc-400 hover:text-zinc-100"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom('reset')}
              aria-label="Reset View"
              className="p-1 text-zinc-400 hover:text-zinc-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            aria-label={isFullscreen ? 'Exit full viewport' : 'Expand full viewport'}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:text-zinc-200"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Signal Control Strategy Selector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold tracking-wider text-zinc-400 mr-1">
            CONTROL METHOD:
          </span>
          {(
            [
              { id: 'fixed', label: 'Fixed-Timer' },
              { id: 'webster_ai', label: 'AI Adaptive Webster' },
              { id: 'v2x_emergency', label: 'V2X Preemption' },
              { id: 'green_wave', label: 'EW Green Wave' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setStrategy(opt.id)}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium whitespace-nowrap transition ${
                strategy === opt.id
                  ? 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : 'border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-400 tabular-nums">
          <span>
            Throughput: <strong className="text-cyan-300">{metrics.gridFlowRate} veh/hr</strong>
          </span>
          {monsoonMode ? (
            <span className="text-amber-300 font-semibold">Monsoon Friction Active</span>
          ) : null}
        </div>
      </div>

      {/* SVG Canvas with D3 Zoom */}
      <div className="relative flex-1 select-none overflow-hidden bg-zinc-950">
        <svg
          ref={svgRef}
          viewBox="0 0 940 600"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img"
          aria-label="Interactive Traffic Grid Map"
        >
          <defs>
            {/* Dark background grid texture */}
            <radialGradient id={`mapBackdrop-${uniqueId}`} cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="#102a1e" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#09090b" stopOpacity="1" />
            </radialGradient>

            {/* Glowing signal filters */}
            <filter id={`glow-green-${uniqueId}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`glow-red-${uniqueId}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Backdrop */}
          <rect width="940" height="600" fill={`url(#mapBackdrop-${uniqueId})`} />

          {/* Subtle blueprint coordinate grid */}
          <g opacity="0.12">
            {Array.from({ length: 24 }).map((_, i) => (
              <line key={`x-${i}`} x1={i * 40} y1="0" x2={i * 40} y2="600" stroke="#34d399" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 16 }).map((_, i) => (
              <line key={`y-${i}`} x1="0" y1={i * 40} x2="940" y2={i * 40} stroke="#34d399" strokeWidth="0.5" />
            ))}
          </g>

          {/* Zoomable Container */}
          <g className="zoom-container">
            {/* 1. Roads Network Base */}
            <g className="roads-layer">
              {roadsDisplay.map((road) => {
                const fromNode = staticGridData.intersections.find((n) => n.id === road.from)
                const toNode = staticGridData.intersections.find((n) => n.id === road.to)
                if (!fromNode || !toNode) return null

                // Compute midpoint for road labels and hazards
                const midX = (fromNode.x + toNode.x) / 2
                const midY = (fromNode.y + toNode.y) / 2
                const angle = (Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x) * 180) / Math.PI

                return (
                  <g
                    key={road.id}
                    className="road-corridor cursor-pointer"
                    onClick={() => handleToggleRoadHazard(road.id)}
                  >
                    {/* Asphalt road pavement */}
                    <line
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke="#18181b"
                      strokeWidth="20"
                      strokeLinecap="round"
                    />
                    {/* Road curbs */}
                    <line
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke="#3f3f46"
                      strokeWidth="22"
                      strokeLinecap="round"
                      opacity="0.35"
                    />
                    {/* Road inner lane */}
                    <line
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke="#27272a"
                      strokeWidth="18"
                    />
                    {/* Dynamic congestion heat overlay updated by D3 */}
                    <line
                      data-heat-id={road.id}
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke="#10b981"
                      strokeWidth="12"
                      strokeLinecap="round"
                      opacity="0.18"
                    />
                    {/* Center yellow divider line */}
                    <line
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke="#eab308"
                      strokeWidth="1.2"
                      strokeDasharray="4 6"
                      opacity="0.6"
                    />

                    {/* Road hazard flag if active */}
                    {showHazards && road.hazard ? (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <circle r="9" fill="#f59e0b" fillOpacity="0.2" className="animate-ping" />
                        <circle r="7" fill="#f59e0b" fillOpacity="0.8" />
                        <polygon points="0,-4 3,3 -3,3" fill="#09090b" />
                        <text
                          y="16"
                          textAnchor="middle"
                          fontSize="9"
                          fontFamily="IBM Plex Mono"
                          fill="#fbbf24"
                          fontWeight="bold"
                        >
                          HAZARD -55%
                        </text>
                      </g>
                    ) : null}

                    {/* Corridor name label */}
                    {showRoadLabels ? (
                      <text
                        x={midX}
                        y={midY - 12}
                        transform={`rotate(${Math.abs(angle) > 90 ? angle + 180 : angle}, ${midX}, ${midY - 12})`}
                        textAnchor="middle"
                        fontSize="8.5"
                        fontFamily="IBM Plex Sans"
                        fontWeight="500"
                        fill="#71717a"
                        pointerEvents="none"
                      >
                        {road.fromName.split(' ')[0]} ↔ {road.toName.split(' ')[0]}
                      </text>
                    ) : null}
                  </g>
                )
              })}
            </g>

            {/* 2. Vehicles Layer (Updated in real-time by D3 loop) */}
            <g className="vehicles-layer" />

            {/* 3. Intersections & Traffic Signals Layer */}
            <g className="signals-layer">
              {staticGridData.intersections.map((node) => {
                return (
                  <g
                    key={node.id}
                    data-node-id={node.id}
                    className="intersection-node cursor-pointer"
                    onClick={() => {
                      setSelectedIntersection(node)
                      handleToggleSignal(node.id)
                    }}
                  >
                    {/* Junction base circle */}
                    <circle cx={node.x} cy={node.y} r="22" fill="#09090b" stroke="#3f3f46" strokeWidth="2" />
                    <circle cx={node.x} cy={node.y} r="18" fill="#18181b" />

                    {/* Override ring when manual green-wave or locked */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r="25"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeDasharray="4 3"
                      className="override-ring"
                      opacity="0"
                    />

                    {/* Dual Signal Heads */}
                    <g transform={`translate(${node.x}, ${node.y - 10})`}>
                      <rect x="-6" y="-6" width="12" height="12" rx="3" fill="#09090b" stroke="#27272a" />
                      <circle cx="0" cy="0" r="4.2" className="ns-light" fill="#10b981" />
                    </g>

                    <g transform={`translate(${node.x + 10}, ${node.y})`}>
                      <rect x="-6" y="-6" width="12" height="12" rx="3" fill="#09090b" stroke="#27272a" />
                      <circle cx="0" cy="0" r="4.2" className="ew-light" fill="#f43f5e" />
                    </g>

                    {/* Timer Countdown Badge */}
                    <text
                      x={node.x - 4}
                      y={node.y + 7}
                      textAnchor="middle"
                      className="timer-badge"
                      fontSize="9"
                      fontFamily="IBM Plex Mono"
                      fontWeight="600"
                      fill="#e4e4e7"
                    >
                      10s
                    </text>

                    {/* Live Approach Queue Badge */}
                    <text
                      x={node.x}
                      y={node.y - 28}
                      textAnchor="middle"
                      className="queue-badge"
                      fontSize="8.5"
                      fontFamily="IBM Plex Mono"
                      fontWeight="700"
                      fill="#38bdf8"
                    />

                    {/* Node Name Badge */}
                    <text
                      x={node.x}
                      y={node.y + 36}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="IBM Plex Sans"
                      fontWeight="600"
                      fill="#f4f4f5"
                      className="drop-shadow-sm"
                    >
                      {node.name}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        </svg>

        {/* Floating Quick Legend, Layer Toggles & Density Control Bar */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-1.5 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden items-center gap-3 pr-2 font-mono text-[11px] text-zinc-400 md:flex">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Green Phase
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Caution
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400" /> Red Halt
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-400" /> Two-Wheeler
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-400" /> Transit
              </span>
            </div>

            {/* Toggle Switches */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowSignals(!showSignals)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                  showSignals ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Signals
              </button>
              <button
                type="button"
                onClick={() => setShowSpeedTags(!showSpeedTags)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                  showSpeedTags ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Speed Tags
              </button>
              <button
                type="button"
                onClick={() => setShowCongestionHeat(!showCongestionHeat)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                  showCongestionHeat ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Heat Map
              </button>
              <button
                type="button"
                onClick={() => setShowV2xRings(!showV2xRings)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                  showV2xRings ? 'bg-rose-500/20 text-rose-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                V2X Rings
              </button>
              <button
                type="button"
                onClick={() => setShowRoadLabels(!showRoadLabels)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                  showRoadLabels ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Corridors
              </button>
              <button
                type="button"
                onClick={() => setShowHazards(!showHazards)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                  showHazards ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Hazards
              </button>
            </div>
          </div>

          {/* Fleet Density Slider Control */}
          <div className="flex items-center gap-2">
            <Sliders className="h-3.5 w-3.5 text-zinc-400" />
            <span className="font-mono text-[11px] text-zinc-400">Fleet:</span>
            <input
              type="range"
              min={12}
              max={64}
              step={4}
              value={densityTarget}
              onChange={(e) => setDensityTarget(Number(e.target.value))}
              className="h-1.5 w-20 cursor-pointer accent-emerald-500"
              aria-label="Adjust vehicle density"
            />
            <span className="font-mono text-xs font-semibold text-emerald-400">{densityTarget}</span>
          </div>
        </div>

        {/* Selected Vehicle Telemetry Card */}
        {selectedVehicle ? (
          <div className="absolute top-3 left-3 z-10 w-72 rounded-xl border border-zinc-700 bg-zinc-900/95 p-3.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: selectedVehicle.color }}
                />
                <span className="font-mono text-xs font-semibold text-zinc-100">
                  {selectedVehicle.id}
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 uppercase">
                  {VEHICLE_CONFIGS[selectedVehicle.type].label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVehicle(null)}
                className="font-mono text-xs text-zinc-400 hover:text-zinc-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-2.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Velocity:</span>
                <span className="font-mono font-semibold text-emerald-400">
                  {selectedVehicle.speedKmh.toFixed(1)} km/h
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Current Status:</span>
                <span
                  className={`font-mono text-[11px] font-medium capitalize ${
                    selectedVehicle.status === 'stopped'
                      ? 'text-rose-400'
                      : selectedVehicle.status === 'braking'
                        ? 'text-amber-400'
                        : selectedVehicle.status === 'hazard_slowdown'
                          ? 'text-yellow-300'
                          : 'text-emerald-300'
                  }`}
                >
                  {selectedVehicle.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Corridor Route:</span>
                <span className="font-mono text-[11px] text-zinc-300">{selectedVehicle.roadId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Segment Progress:</span>
                <span className="font-mono text-[11px] text-zinc-300">
                  {Math.round(selectedVehicle.progress * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Distance Logged:</span>
                <span className="font-mono text-[11px] text-zinc-300">
                  {Math.round(selectedVehicle.distanceTraveledM)} m
                </span>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const targetId = selectedVehicle.id
                  const newSpeed = Math.min(85, selectedVehicle.speedKmh + 20)
                  const target = vehiclesRef.current.find((v) => v.id === targetId)
                  if (target) target.speedKmh = newSpeed
                  setSelectedVehicle((prev) => (prev ? { ...prev, speedKmh: newSpeed } : null))
                }}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 py-1.5 font-mono text-[11px] font-medium text-zinc-200 transition hover:bg-zinc-700"
              >
                Accelerate
              </button>
              <button
                type="button"
                onClick={() => {
                  vehiclesRef.current = vehiclesRef.current.filter((v) => v.id !== selectedVehicle.id)
                  setSelectedVehicle(null)
                }}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 font-mono text-[11px] text-rose-300 hover:bg-rose-500/20"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {/* Selected Intersection Signal Inspector Card */}
        {selectedIntersection ? (
          <div className="absolute top-3 right-3 z-10 w-80 rounded-xl border border-zinc-700 bg-zinc-900/95 p-3.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div>
                <p className="text-xs font-semibold text-zinc-100">{selectedIntersection.name}</p>
                <p className="font-mono text-[10px] text-zinc-400">
                  NODE {selectedIntersection.id} · NCR SMART JUNCTION
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIntersection(null)}
                className="font-mono text-xs text-zinc-400 hover:text-zinc-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              {/* North-South Phase status */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <span className="text-xs text-zinc-300">North-South Corridor</span>
                <span
                  className={`flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-xs font-semibold ${
                    selectedIntersection.signal.nsColor === 'green'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : selectedIntersection.signal.nsColor === 'yellow'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      selectedIntersection.signal.nsColor === 'green'
                        ? 'bg-emerald-400'
                        : selectedIntersection.signal.nsColor === 'yellow'
                          ? 'bg-amber-400'
                          : 'bg-rose-400'
                    }`}
                  />
                  {selectedIntersection.signal.nsColor.toUpperCase()}
                </span>
              </div>

              {/* East-West Phase status */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <span className="text-xs text-zinc-300">East-West Arterial</span>
                <span
                  className={`flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-xs font-semibold ${
                    selectedIntersection.signal.ewColor === 'green'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : selectedIntersection.signal.ewColor === 'yellow'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      selectedIntersection.signal.ewColor === 'green'
                        ? 'bg-emerald-400'
                        : selectedIntersection.signal.ewColor === 'yellow'
                          ? 'bg-amber-400'
                          : 'bg-rose-400'
                    }`}
                  />
                  {selectedIntersection.signal.ewColor.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Phase Remaining:</span>
                <span className="font-mono font-semibold text-zinc-100">
                  {Math.ceil(selectedIntersection.signal.timer)} seconds
                </span>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => handleToggleSignal(selectedIntersection.id)}
                className="flex-1 rounded-lg bg-emerald-500 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400"
              >
                Force Toggle Signal
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
