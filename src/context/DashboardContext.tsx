/* oxlint-disable react/only-export-components */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { emergencyBuzzer } from '../lib/audioService'
import {
  BENGALURU_DEFAULT_COORDS,
  requestNativeLocation,
  watchNativeLocation,
  type GeoLocationState,
} from '../lib/geolocation'
import {
  computeEmergencyTrack,
  nearestIntersection,
  type EmergencyTrack,
} from '../lib/bengaluruGrid'
import { computeAdaptivePhase, queueFromCounts } from '../lib/signalAutomation'
import type { ClassCounts } from '../types'
import {
  advanceTelemetry,
  calculatePedestrianCrossingWindow,
  checkAccidentProneArea,
  resolveTargetAuthority,
  type AssignedDepartment,
  type CitizenHazardCategory,
  type DrivingFSMState,
  type IntersectionInfo,
  type IntersectionKey,
  type TelemetryState,
} from '../lib/metropolisLogic'

export type SectorTab = 'traffic' | 'simulation' | 'gridmap' | 'citizen' | 'fleet' | 'waste' | 'flood'

export interface HazardProfile {
  id: string
  timestamp: string
  issue: CitizenHazardCategory
  severity: 'Low' | 'Medium' | 'Critical'
  department: AssignedDepartment
  status: 'Pending Review' | 'Verified' | 'Dispatched'
  location: string
  gpsCoords?: { lat: number; lng: number }
  notes: string
  imageThumbnail: string
}

export interface WasteCollectionNode {
  id: string
  zone: string
  locationName: string
  fillLevelPercent: number
  capacityKg: number
  lastClearedTime: string
  status: 'Optimal' | 'Near Capacity' | 'Overflow Flagged' | 'Missed Pick-up'
}

export interface RouteCoord {
  name: string
  lat: number
  lng: number
  congestionPenaltyMin: number
}

export interface RouteSimulatorData {
  corridorName: string
  standardDistanceKm: number
  standardDurationMin: number
  standardSafetyScore: number
  aiOptimizedDistanceKm: number
  aiOptimizedDurationMin: number
  aiSafetyScore: number
  rerouteSavingsMin: number
  standardWaypoints: RouteCoord[]
  aiWaypoints: RouteCoord[]
}

export interface DashboardContextType {
  // Navigation
  activeTab: SectorTab
  setActiveTab: (tab: SectorTab) => void

  // Native Geolocation
  geoLocation: GeoLocationState
  refreshLocation: () => void

  // Traffic Intersections
  intersections: Record<IntersectionKey, IntersectionInfo>
  triggerEmergencyOverride: (key: IntersectionKey) => void
  resetIntersectionOverride: (key: IntersectionKey) => void
  toggleManualSignal: (key: IntersectionKey) => void

  // Live Vision & Siren Stream
  visionStream: {
    fps: number
    activeCars: number
    activeBikes: number
    activeTrucks: number
    pedestrianCount: number
    ambulancePresent: boolean
    audioBuzzerActive: boolean
    inferenceLatencyMs: number
    autoCvScannerActive: boolean
    flaggedThreatIntersection: IntersectionKey | null
  }
  simulateSirenEvent: (targetIntersection?: IntersectionKey) => void
  clearSirenEvent: () => void
  toggleAutoCvScanner: () => void
  liveVisionLocked: boolean
  setLiveVisionLocked: (locked: boolean) => void
  ingestLiveVision: (payload: {
    fps: number
    inferenceLatencyMs: number
    counts: ClassCounts
    ambulanceDetected: boolean
  }) => void
  emergencyTrack: EmergencyTrack | null
  fieldTrail: Array<{ lat: number; lng: number }>
  planEmergencyTrack: (destination: IntersectionKey) => void

  // Citizen Complaint Pipeline
  complaints: HazardProfile[]
  submitHazardReport: (payload: {
    issue: CitizenHazardCategory
    severity: 'Low' | 'Medium' | 'Critical'
    location: string
    notes: string
    imageThumbnail?: string
    gpsCoords?: { lat: number; lng: number }
  }) => void
  updateComplaintStatus: (
    id: string,
    status: 'Pending Review' | 'Verified' | 'Dispatched',
  ) => void

  // Route Simulator
  routeData: RouteSimulatorData

  // Autonomous Telemetry & FSM
  telemetry: TelemetryState
  fsmState: DrivingFSMState
  accidentProneWarning: {
    isAccidentProne: boolean
    warningLevel: 'NONE' | 'ELEVATED' | 'CRITICAL'
    reason: string
  }
  isVulnerablePedestrianPresent: boolean
  toggleVulnerablePedestrian: () => void
  crossingWindow: { totalSeconds: number; bufferAppliedSeconds: number; isExtended: boolean }
  injectObstacle: (type?: 'pothole' | 'manhole' | 'vehicle') => void
  triggerPedestrianWalkway: () => void
  accelerateEgoCar: () => void
  resetTelemetry: () => void

  // Hardware Telemetry Handshake
  hardwareLink: {
    isLinked: boolean
    isConnecting: boolean
    progress: number
    statusMessage: string
  }
  toggleHardwareLink: () => void

  // Smart Waste Ecosystem
  wasteEcosystem: {
    activeTrucks: number
    routeEfficiencyScore: number
    wasteWeightCollectedTons: number
    routingLogs: Array<{ id: string; timestamp: string; log: string }>
    collectionNodes: WasteCollectionNode[]
  }
  reportMissedPickup: (nodeId: string) => void
  flagWasteOverflow: (nodeId: string) => void

  // Flood & Underpass Telemetry
  floodTelemetry: {
    underpassDepthCm: number
    drainagePumpStatus: 'RUNNING' | 'STANDBY' | 'MAX_DISCHARGE'
    sensorAccuracyPercent: number
    totalVehiclesDiverted: number
    delayMinimizationPercent: number
  }
}

const INITIAL_INTERSECTIONS: Record<IntersectionKey, IntersectionInfo> = {
  'MG Road': {
    name: 'MG Road',
    mode: 'NORMAL',
    densityPercent: 78,
    activeGreenSeconds: 14,
    overrideActive: false,
    queueLengthVehicles: 24,
  },
  'Silk Board': {
    name: 'Silk Board',
    mode: 'NORMAL',
    densityPercent: 94,
    activeGreenSeconds: 22,
    overrideActive: false,
    queueLengthVehicles: 48,
  },
  Majestic: {
    name: 'Majestic',
    mode: 'NORMAL',
    densityPercent: 82,
    activeGreenSeconds: 18,
    overrideActive: false,
    queueLengthVehicles: 31,
  },
  'Electronic City': {
    name: 'Electronic City',
    mode: 'NORMAL',
    densityPercent: 64,
    activeGreenSeconds: 16,
    overrideActive: false,
    queueLengthVehicles: 17,
  },
}

const INITIAL_HAZARDS: HazardProfile[] = [
  {
    id: 'MH-9021',
    timestamp: '2026-10-30T10:14:20Z',
    issue: 'Pothole',
    severity: 'Critical',
    department: 'Municipal Engineering Bureau',
    status: 'Dispatched',
    location: '100 Feet Road, Indiranagar Near Metro Pillar 142',
    gpsCoords: { lat: 12.9784, lng: 77.6408 },
    notes: 'Asphalt collapse spanning lane 2 with high two-wheeler puncture risk.',
    imageThumbnail: '/hazards/pothole.svg',
  },
  {
    id: 'MH-9022',
    timestamp: '2026-10-30T10:48:15Z',
    issue: 'Broken Streetlight',
    severity: 'Medium',
    department: 'Electrical Supply Board',
    status: 'Verified',
    location: 'Outer Ring Road, Bellandur Flyover Service Lane',
    gpsCoords: { lat: 12.926, lng: 77.6762 },
    notes: 'Fixture pole 18 sparking intermittently during damp evenings.',
    imageThumbnail: '/hazards/crack.svg',
  },
  {
    id: 'MH-9023',
    timestamp: '2026-10-30T11:22:04Z',
    issue: 'Open Manhole',
    severity: 'Critical',
    department: 'Municipal Engineering Bureau',
    status: 'Dispatched',
    location: '80 Feet Road, Koramangala 4th Block Junction',
    gpsCoords: { lat: 12.9345, lng: 77.6241 },
    notes: 'Cast iron cover dislodged by heavy monsoon drainage runoff.',
    imageThumbnail: '/hazards/obstruction.svg',
  },
  {
    id: 'MH-9024',
    timestamp: '2026-10-30T11:58:33Z',
    issue: 'Blocked Drainage',
    severity: 'Medium',
    department: 'Solid Waste & Flood Management Authority',
    status: 'Pending Review',
    location: 'Majestic Underpass North Incline, Subhash Nagar',
    gpsCoords: { lat: 12.9767, lng: 77.5713 },
    notes: 'Plastic debris silt accumulated near stormwater intake grill.',
    imageThumbnail: '/hazards/water.svg',
  },
]

const INITIAL_WASTE_NODES: WasteCollectionNode[] = [
  {
    id: 'BIN-101',
    zone: 'Zone 1 - Central CBD',
    locationName: 'Brigade Road Commercial Hub',
    fillLevelPercent: 91,
    capacityKg: 850,
    lastClearedTime: '4 hrs ago',
    status: 'Near Capacity',
  },
  {
    id: 'BIN-102',
    zone: 'Zone 2 - Tech Corridor',
    locationName: 'EcoSpace Tech Park Gate 2',
    fillLevelPercent: 62,
    capacityKg: 1200,
    lastClearedTime: '2 hrs ago',
    status: 'Optimal',
  },
  {
    id: 'BIN-103',
    zone: 'Zone 3 - West Urban',
    locationName: 'Rajajinagar Industrial Enclave',
    fillLevelPercent: 98,
    capacityKg: 900,
    lastClearedTime: '7 hrs ago',
    status: 'Overflow Flagged',
  },
  {
    id: 'BIN-104',
    zone: 'Zone 4 - South Residential',
    locationName: 'Jayanagar 4th Block Market Complex',
    fillLevelPercent: 44,
    capacityKg: 1000,
    lastClearedTime: '1 hr ago',
    status: 'Optimal',
  },
  {
    id: 'BIN-105',
    zone: 'Zone 5 - Transit Terminal',
    locationName: 'Majestic Bus Stand Platform 12',
    fillLevelPercent: 88,
    capacityKg: 1500,
    lastClearedTime: '5 hrs ago',
    status: 'Near Capacity',
  },
]

const INITIAL_ROUTING_LOGS = [
  {
    id: 'LOG-01',
    timestamp: '12:31:04',
    log: 'Truck #14: Rerouted from Silk Board Junction via Outer HSR Ring (+6.2 min saved).',
  },
  {
    id: 'LOG-02',
    timestamp: '12:33:18',
    log: 'Truck #08: Organic waste corridor dynamically adjusted around Indiranagar utility work.',
  },
  {
    id: 'LOG-03',
    timestamp: '12:35:45',
    log: 'Truck #21: EcoSpace collection expedited before 17:00 tech park departure wave.',
  },
  {
    id: 'LOG-04',
    timestamp: '12:37:12',
    log: 'Truck #03: Majestic bottleneck detected. Diverted via Anand Rao Circle link.',
  },
]

const INITIAL_ROUTE_DATA: RouteSimulatorData = {
  corridorName: 'Silk Board Junction ↔ MG Road Urban Transit',
  standardDistanceKm: 11.4,
  standardDurationMin: 42.0,
  standardSafetyScore: 61,
  aiOptimizedDistanceKm: 12.8,
  aiOptimizedDurationMin: 28.5,
  aiSafetyScore: 94,
  rerouteSavingsMin: 13.5,
  standardWaypoints: [
    { name: 'Silk Board Core Choke', lat: 12.9177, lng: 77.6238, congestionPenaltyMin: 14.5 },
    { name: 'Koramangala 100ft Bottleneck', lat: 12.9352, lng: 77.6245, congestionPenaltyMin: 8.2 },
    { name: 'Hosur Road Straightway', lat: 12.9554, lng: 77.6089, congestionPenaltyMin: 5.3 },
    { name: 'Richmond Circle Congestion', lat: 12.9644, lng: 77.5992, congestionPenaltyMin: 6.0 },
    { name: 'MG Road Terminal', lat: 12.9756, lng: 77.6095, congestionPenaltyMin: 0.0 },
  ],
  aiWaypoints: [
    { name: 'Silk Board Bypass Ramp', lat: 12.919, lng: 77.632, congestionPenaltyMin: 1.2 },
    { name: 'HSR Layout 14th Main Corridor', lat: 12.912, lng: 77.641, congestionPenaltyMin: 1.5 },
    { name: 'Intermediate Ring Road Flyover', lat: 12.946, lng: 77.639, congestionPenaltyMin: 2.0 },
    { name: 'Old Airport Green Arterial', lat: 12.961, lng: 77.618, congestionPenaltyMin: 1.8 },
    { name: 'MG Road Terminal (Elevated)', lat: 12.9756, lng: 77.6095, congestionPenaltyMin: 0.0 },
  ],
}

export const DashboardContext = createContext<DashboardContextType | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<SectorTab>('traffic')

  // Geolocation
  const [geoLocation, setGeoLocation] = useState<GeoLocationState>(BENGALURU_DEFAULT_COORDS)

  const refreshLocation = useCallback(() => {
    requestNativeLocation(
      (loc) => setGeoLocation(loc),
      (err) => setGeoLocation(err),
    )
  }, [])

  useEffect(() => {
    refreshLocation()
    return watchNativeLocation((loc) => {
      setGeoLocation(loc)
      if (loc.status === 'granted') {
        setFieldTrail((prev) => {
          const next = [...prev, { lat: loc.lat, lng: loc.lng }]
          return next.slice(-48)
        })
      }
    })
  }, [refreshLocation])

  const [intersections, setIntersections] =
    useState<Record<IntersectionKey, IntersectionInfo>>(INITIAL_INTERSECTIONS)

  // Vision stream with automated CV scanning and buzzer support
  const [visionStream, setVisionStream] = useState({
    fps: 48.2,
    activeCars: 26,
    activeBikes: 16,
    activeTrucks: 5,
    pedestrianCount: 8,
    ambulancePresent: false,
    audioBuzzerActive: false,
    inferenceLatencyMs: 17.4,
    autoCvScannerActive: true,
    flaggedThreatIntersection: null as IntersectionKey | null,
  })
  const [liveVisionLocked, setLiveVisionLocked] = useState(false)
  const [emergencyTrack, setEmergencyTrack] = useState<EmergencyTrack | null>(null)
  const [fieldTrail, setFieldTrail] = useState<Array<{ lat: number; lng: number }>>([])
  const lastSignalAdaptRef = useRef(0)
  const ambulanceLatchRef = useRef(false)

  // Citizen complaints
  const [complaints, setComplaints] = useState<HazardProfile[]>(INITIAL_HAZARDS)

  // Autonomous Telemetry & FSM
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    egoSpeedKmh: 46.5,
    distanceM: 42.0,
    closingVelMs: 3.2,
    ttcSec: 13.1,
    obstacle: 'none',
    state: 'CRUISE',
  })

  const [isVulnerablePedestrianPresent, setIsVulnerablePedestrianPresent] = useState(false)
  const toggleVulnerablePedestrian = useCallback(() => {
    setIsVulnerablePedestrianPresent((prev) => !prev)
  }, [])

  const crossingWindow = useMemo(
    () => calculatePedestrianCrossingWindow(25, isVulnerablePedestrianPresent),
    [isVulnerablePedestrianPresent],
  )

  const accidentProneWarning = useMemo(
    () =>
      checkAccidentProneArea({
        ttcSec: telemetry.ttcSec,
        distanceM: telemetry.distanceM,
        obstacle: telemetry.obstacle,
        egoSpeedKmh: telemetry.egoSpeedKmh,
      }),
    [telemetry],
  )

  // Hardware Link
  const [hardwareLink, setHardwareLink] = useState({
    isLinked: false,
    isConnecting: false,
    progress: 0,
    statusMessage: 'HARDWARE LINK STANDBY (PORT 8000 DISCONNECTED)',
  })

  // Smart Waste
  const [wasteEcosystem, setWasteEcosystem] = useState({
    activeTrucks: 28,
    routeEfficiencyScore: 94.6,
    wasteWeightCollectedTons: 142.8,
    routingLogs: INITIAL_ROUTING_LOGS,
    collectionNodes: INITIAL_WASTE_NODES,
  })

  // Flood & Underpass Telemetry
  const [floodTelemetry, setFloodTelemetry] = useState({
    underpassDepthCm: 18.4,
    drainagePumpStatus: 'RUNNING' as const,
    sensorAccuracyPercent: 98.7,
    totalVehiclesDiverted: 142,
    delayMinimizationPercent: -38.4,
  })

  // Route Data
  const [routeData] = useState<RouteSimulatorData>(INITIAL_ROUTE_DATA)

  // Emergency override trigger for specific intersection
  const triggerEmergencyOverride = useCallback((key: IntersectionKey) => {
    setIntersections((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        mode: 'EMERGENCY_GREEN',
        overrideActive: true,
        activeGreenSeconds: 30, // 30s locked green window
        queueLengthVehicles: Math.max(2, Math.floor(prev[key].queueLengthVehicles * 0.35)),
      },
    }))
  }, [])

  const resetIntersectionOverride = useCallback((key: IntersectionKey) => {
    setIntersections((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        mode: 'NORMAL',
        overrideActive: false,
        activeGreenSeconds: 16,
      },
    }))
  }, [])

  // User manual control override node toggle
  const toggleManualSignal = useCallback(
    (key: IntersectionKey) => {
      // If emergency is active globally, ignore or alert
      if (visionStream.ambulancePresent) {
        return
      }
      setIntersections((prev) => {
        const current = prev[key]
        const isCurrentEmergencyGreen = current.mode === 'EMERGENCY_GREEN'
        return {
          ...prev,
          [key]: {
            ...current,
            mode: isCurrentEmergencyGreen ? 'NORMAL' : 'EMERGENCY_GREEN',
            overrideActive: !isCurrentEmergencyGreen,
            activeGreenSeconds: isCurrentEmergencyGreen ? 16 : 35,
          },
        }
      })
    },
    [visionStream.ambulancePresent],
  )

  // Siren / Ambulance simulation triggering 800Hz Web Audio API Buzzer
  const simulateSirenEvent = useCallback(
    (targetIntersection: IntersectionKey = 'Silk Board') => {
      // Trigger Web Audio API repeating 800Hz tone
      emergencyBuzzer.startBuzzer(800)

      setVisionStream((prev) => ({
        ...prev,
        ambulancePresent: true,
        audioBuzzerActive: true,
        flaggedThreatIntersection: targetIntersection,
      }))

      // Automatically override that intersection's active signal status instantly to EMERGENCY GREEN
      triggerEmergencyOverride(targetIntersection)
      if (targetIntersection === 'Silk Board') {
        triggerEmergencyOverride('MG Road')
      }
    },
    [triggerEmergencyOverride],
  )

  const clearSirenEvent = useCallback(() => {
    emergencyBuzzer.stopBuzzer()
    ambulanceLatchRef.current = false
    setEmergencyTrack(null)

    setVisionStream((prev) => ({
      ...prev,
      ambulancePresent: false,
      audioBuzzerActive: false,
      flaggedThreatIntersection: null,
    }))

    resetIntersectionOverride('Silk Board')
    resetIntersectionOverride('MG Road')
    resetIntersectionOverride('Majestic')
    resetIntersectionOverride('Electronic City')
  }, [resetIntersectionOverride])

  const toggleAutoCvScanner = useCallback(() => {
    setVisionStream((prev) => ({
      ...prev,
      autoCvScannerActive: !prev.autoCvScannerActive,
    }))
  }, [])

  const planEmergencyTrack = useCallback(
    (destination: IntersectionKey) => {
      const origin = nearestIntersection(geoLocation.lat, geoLocation.lng)
      const track = computeEmergencyTrack(origin, destination)
      setEmergencyTrack(track)
      track.nodes.forEach((node) => triggerEmergencyOverride(node))
      setVisionStream((prev) => ({
        ...prev,
        ambulancePresent: true,
        audioBuzzerActive: true,
        flaggedThreatIntersection: destination,
      }))
      emergencyBuzzer.startBuzzer(800)
    },
    [geoLocation.lat, geoLocation.lng, triggerEmergencyOverride],
  )

  const ingestLiveVision = useCallback(
    (payload: {
      fps: number
      inferenceLatencyMs: number
      counts: ClassCounts
      ambulanceDetected: boolean
    }) => {
      setVisionStream((prev) => ({
        ...prev,
        fps: payload.fps,
        inferenceLatencyMs: payload.inferenceLatencyMs,
        activeCars: payload.counts.cars,
        activeBikes: payload.counts.bikes,
        activeTrucks: payload.counts.trucks,
        pedestrianCount: payload.counts.pedestrians,
      }))

      const now = Date.now()
      if (now - lastSignalAdaptRef.current > 900) {
        lastSignalAdaptRef.current = now
        const phase = computeAdaptivePhase(payload.counts)
        const target = nearestIntersection(geoLocation.lat, geoLocation.lng)
        setIntersections((prev) => {
          const current = prev[target]
          if (current.overrideActive) return prev
          return {
            ...prev,
            [target]: {
              ...current,
              densityPercent: phase.densityPercent,
              queueLengthVehicles: queueFromCounts(payload.counts),
              activeGreenSeconds: Math.max(current.activeGreenSeconds, phase.greenSeconds),
            },
          }
        })
        if (phase.mode === 'PEDESTRIAN_PRIORITY') {
          setIsVulnerablePedestrianPresent(true)
        }
      }

      if (payload.ambulanceDetected && !ambulanceLatchRef.current) {
        ambulanceLatchRef.current = true
        planEmergencyTrack('Majestic')
      }
    },
    [geoLocation.lat, geoLocation.lng, planEmergencyTrack],
  )

  // Simulation tick loop for live vision FPS (45-50), telemetry kinetics, and signal timers
  useEffect(() => {
    let tickCount = 0
    const interval = window.setInterval(() => {
      tickCount += 1

      // 1. Advance telemetry
      setTelemetry((prev) => advanceTelemetry(prev))

      // 2. Bound FPS tightly between 45.0 and 50.0 as requested
      setVisionStream((prev) => {
        if (liveVisionLocked) return prev
        const nextFps = 45.2 + (Math.sin(tickCount * 0.4) + 1) * 2.2
        return {
          ...prev,
          fps: Number(nextFps.toFixed(1)),
          inferenceLatencyMs: Number((16.2 + Math.random() * 2.8).toFixed(1)),
          activeCars: Math.max(4, prev.activeCars + Math.round((Math.random() - 0.5) * 2)),
          activeBikes: Math.max(6, prev.activeBikes + Math.round((Math.random() - 0.5) * 2)),
          activeTrucks: Math.max(1, prev.activeTrucks + Math.round((Math.random() - 0.55) * 1)),
          pedestrianCount: Math.max(2, prev.pedestrianCount + Math.round((Math.random() - 0.5) * 1)),
        }
      })

      // 3. Fluctuating underpass flood depth
      setFloodTelemetry((prev) => {
        const jitter = (Math.random() - 0.5) * 0.4
        return {
          ...prev,
          underpassDepthCm: Number(Math.max(12.0, Math.min(48.0, prev.underpassDepthCm + jitter)).toFixed(1)),
        }
      })

      // 4. Countdown active intersection green times
      setIntersections((prev) => {
        const next = { ...prev }
        ;(Object.keys(next) as IntersectionKey[]).forEach((key) => {
          const item = next[key]
          if (item.overrideActive) {
            if (item.activeGreenSeconds <= 1) {
              next[key] = {
                ...item,
                mode: 'NORMAL',
                overrideActive: false,
                activeGreenSeconds: 16,
              }
            } else {
              next[key] = {
                ...item,
                activeGreenSeconds: item.activeGreenSeconds - 1,
              }
            }
          } else {
            if (item.activeGreenSeconds <= 1) {
              next[key] = {
                ...item,
                activeGreenSeconds: 18 + Math.floor(Math.random() * 8),
                densityPercent: Math.min(
                  99,
                  Math.max(45, item.densityPercent + Math.floor((Math.random() - 0.48) * 4)),
                ),
              }
            } else {
              next[key] = {
                ...item,
                activeGreenSeconds: item.activeGreenSeconds - 1,
              }
            }
          }
        })
        return next
      })

      if (
        !liveVisionLocked &&
        visionStream.autoCvScannerActive &&
        !visionStream.ambulancePresent &&
        tickCount % 90 === 0
      ) {
        if (Math.random() < 0.08) {
          simulateSirenEvent('Silk Board')
        }
      }
    }, 450)

    return () => window.clearInterval(interval)
  }, [
    liveVisionLocked,
    visionStream.autoCvScannerActive,
    visionStream.ambulancePresent,
    simulateSirenEvent,
  ])

  // Citizen Complaint submission
  const submitHazardReport = useCallback(
    (payload: {
      issue: CitizenHazardCategory
      severity: 'Low' | 'Medium' | 'Critical'
      location: string
      notes: string
      imageThumbnail?: string
      gpsCoords?: { lat: number; lng: number }
    }) => {
      const department = resolveTargetAuthority(payload.issue)
      const nextProfile: HazardProfile = {
        id: `MH-${Math.floor(9100 + Math.random() * 800)}`,
        timestamp: new Date().toISOString(),
        issue: payload.issue,
        severity: payload.severity,
        department,
        status: 'Pending Review',
        location: payload.location,
        gpsCoords: payload.gpsCoords || { lat: geoLocation.lat, lng: geoLocation.lng },
        notes: payload.notes,
        imageThumbnail: payload.imageThumbnail || '/hazards/pothole.svg',
      }
      setComplaints((prev) => [nextProfile, ...prev])
    },
    [geoLocation.lat, geoLocation.lng],
  )

  const updateComplaintStatus = useCallback(
    (id: string, status: 'Pending Review' | 'Verified' | 'Dispatched') => {
      setComplaints((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item)),
      )
    },
    [],
  )

  // Simulation Telemetry Actions
  const injectObstacle = useCallback((type: 'pothole' | 'manhole' | 'vehicle' = 'pothole') => {
    setTelemetry((prev) => ({
      ...prev,
      obstacle: type,
      distanceM: Math.min(prev.distanceM, 14.5),
      speedKmh: Math.max(38, prev.egoSpeedKmh),
      closingVelMs: 7.2,
      ttcSec: 2.01,
      state: type === 'vehicle' ? 'EMERGENCY_BRAKE' : 'AVOID',
    }))
  }, [])

  const triggerPedestrianWalkway = useCallback(() => {
    setTelemetry((prev) => ({
      ...prev,
      obstacle: 'pedestrian',
      distanceM: Math.min(prev.distanceM, 13.0),
      closingVelMs: 6.8,
      ttcSec: 1.91,
      state: 'YIELD',
    }))
  }, [])

  const accelerateEgoCar = useCallback(() => {
    setTelemetry((prev) => {
      const nextSpeed = Math.min(92, prev.egoSpeedKmh + 22.0)
      const nextDist = Math.max(6.0, prev.distanceM - 8.5)
      const closing = Math.max(0.1, nextSpeed / 3.6 - 4.5)
      const ttc = nextDist / closing
      const isCritical = ttc < 1.8 && prev.obstacle !== 'none'
      return {
        ...prev,
        egoSpeedKmh: nextSpeed,
        distanceM: nextDist,
        closingVelMs: closing,
        ttcSec: Number(ttc.toFixed(2)),
        state: isCritical ? 'EMERGENCY_BRAKE' : prev.state,
      }
    })
  }, [])

  const resetTelemetry = useCallback(() => {
    setTelemetry({
      egoSpeedKmh: 46.5,
      distanceM: 42.0,
      closingVelMs: 3.2,
      ttcSec: 13.1,
      obstacle: 'none',
      state: 'CRUISE',
    })
  }, [])

  // Hardware Link toggle with progressive handshake
  const toggleHardwareLink = useCallback(() => {
    if (hardwareLink.isLinked) {
      setHardwareLink({
        isLinked: false,
        isConnecting: false,
        progress: 0,
        statusMessage: 'HARDWARE LINK STANDBY (PORT 8000 DISCONNECTED)',
      })
      return
    }

    setHardwareLink({
      isLinked: false,
      isConnecting: true,
      progress: 10,
      statusMessage: 'PINGING METROPOLIS AV SERVER ON HTTP://0.0.0.0:8000...',
    })

    const t1 = setTimeout(() => {
      setHardwareLink((prev) => ({
        ...prev,
        progress: 45,
        statusMessage: 'SOCKET HANDSHAKE ESTABLISHED · VERIFYING TENSOR DRIVERS...',
      }))
    }, 500)

    const t2 = setTimeout(() => {
      setHardwareLink((prev) => ({
        ...prev,
        progress: 85,
        statusMessage: 'CALIBRATING STEREO DISPARITY & LIDAR POINTCLOUD...',
      }))
    }, 1000)

    const t3 = setTimeout(() => {
      setHardwareLink({
        isLinked: true,
        isConnecting: false,
        progress: 100,
        statusMessage: 'YOLOv8 AUTOMATED CAR TELEMETRY FEED SYNCHRONIZED',
      })
    }, 1500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [hardwareLink.isLinked])

  // Waste Management Actions
  const reportMissedPickup = useCallback((nodeId: string) => {
    setWasteEcosystem((prev) => {
      const updatedNodes = prev.collectionNodes.map((n) =>
        n.id === nodeId ? { ...n, status: 'Missed Pick-up' as const } : n,
      )
      const target = prev.collectionNodes.find((n) => n.id === nodeId)
      const newLog = {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        log: `DISPATCH ALERT: Citizen flagged missed pickup at ${target?.locationName || nodeId}. Priority collection route assigned.`,
      }
      return {
        ...prev,
        collectionNodes: updatedNodes,
        routingLogs: [newLog, ...prev.routingLogs.slice(0, 9)],
      }
    })
  }, [])

  const flagWasteOverflow = useCallback((nodeId: string) => {
    setWasteEcosystem((prev) => {
      const updatedNodes = prev.collectionNodes.map((n) =>
        n.id === nodeId ? { ...n, fillLevelPercent: 100, status: 'Overflow Flagged' as const } : n,
      )
      const target = prev.collectionNodes.find((n) => n.id === nodeId)
      const newLog = {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        log: `OVERFLOW WARNING: High compaction overflow detected at ${target?.locationName || nodeId}. Autonomous compactor truck #19 rerouted.`,
      }
      return {
        ...prev,
        collectionNodes: updatedNodes,
        wasteWeightCollectedTons: Number((prev.wasteWeightCollectedTons + 1.4).toFixed(1)),
        routingLogs: [newLog, ...prev.routingLogs.slice(0, 9)],
      }
    })
  }, [])

  const value = useMemo<DashboardContextType>(
    () => ({
      activeTab,
      setActiveTab,
      geoLocation,
      refreshLocation,
      intersections,
      triggerEmergencyOverride,
      resetIntersectionOverride,
      toggleManualSignal,
      visionStream,
      simulateSirenEvent,
      clearSirenEvent,
      toggleAutoCvScanner,
      liveVisionLocked,
      setLiveVisionLocked,
      ingestLiveVision,
      emergencyTrack,
      fieldTrail,
      planEmergencyTrack,
      complaints,
      submitHazardReport,
      updateComplaintStatus,
      routeData,
      telemetry,
      fsmState: telemetry.state,
      accidentProneWarning,
      isVulnerablePedestrianPresent,
      toggleVulnerablePedestrian,
      crossingWindow,
      injectObstacle,
      triggerPedestrianWalkway,
      accelerateEgoCar,
      resetTelemetry,
      hardwareLink,
      toggleHardwareLink,
      wasteEcosystem,
      reportMissedPickup,
      flagWasteOverflow,
      floodTelemetry,
    }),
    [
      activeTab,
      geoLocation,
      refreshLocation,
      intersections,
      triggerEmergencyOverride,
      resetIntersectionOverride,
      toggleManualSignal,
      visionStream,
      simulateSirenEvent,
      clearSirenEvent,
      toggleAutoCvScanner,
      liveVisionLocked,
      ingestLiveVision,
      emergencyTrack,
      fieldTrail,
      planEmergencyTrack,
      complaints,
      submitHazardReport,
      updateComplaintStatus,
      routeData,
      telemetry,
      accidentProneWarning,
      isVulnerablePedestrianPresent,
      toggleVulnerablePedestrian,
      crossingWindow,
      injectObstacle,
      triggerPedestrianWalkway,
      accelerateEgoCar,
      resetTelemetry,
      hardwareLink,
      toggleHardwareLink,
      wasteEcosystem,
      reportMissedPickup,
      flagWasteOverflow,
      floodTelemetry,
    ],
  )

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  )
}

export { useDashboard } from './useDashboard'
