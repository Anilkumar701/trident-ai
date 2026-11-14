import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CarFront,
  Clock,
  Compass,
  Cpu,
  Eye,
  Navigation,
  RotateCcw,
  Siren,
  Sliders,
  Truck,
  Volume2,
  VolumeX,
  Waves,
  Zap,
  MapPin,
} from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import {
  type DrivingFSMState,
  type IntersectionKey,
} from '../lib/metropolisLogic'
import { TrafficGridMap } from './map/TrafficGridMap'
import { GoogleTrafficMap } from './map/GoogleTrafficMap'
import { CitizenReportingEngine } from './CitizenReportingEngine'
import { OverheadGridMapView } from '../views/OverheadGridMapView'
import { FieldVisionEngine } from './vision/FieldVisionEngine'

export function DashboardViews() {
  const { activeTab } = useDashboard()

  switch (activeTab) {
    case 'traffic':
      return <TrafficControlView />
    case 'gridmap':
      return <OverheadGridMapView />
    case 'simulation':
      return <TrafficSimulationView />
    case 'citizen':
      return <CitizenReportingView />
    case 'fleet':
      return <PedestrianFleetHubView />
    case 'waste':
      return <SmartWasteView />
    case 'flood':
      return <FloodAnalyticsView />
    default:
      return <TrafficControlView />
  }
}

/* ========================================================================= */
/* TAB 1: TRAFFIC CONTROL TERMINAL                                           */
/* ========================================================================= */
function TrafficControlView() {
  const {
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
    setActiveTab,
  } = useDashboard()

  const [viewMode, setViewMode] = useState<'google-maps' | 'simulation' | 'matrix'>('google-maps')

  const intersectionKeys: IntersectionKey[] = [
    'MG Road',
    'Silk Board',
    'Majestic',
    'Electronic City',
  ]

  return (
    <div className="space-y-5">
      {/* Geolocation & Telemetry Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/50 text-cyan-400">
            <Compass className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                NATIVE GPS FIX: {geoLocation.city}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                  geoLocation.status === 'granted'
                    ? 'border border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                    : 'border border-amber-500/40 bg-amber-950/60 text-amber-300'
                }`}
              >
                {geoLocation.status}
              </span>
            </div>
            <p className="font-mono text-xs text-slate-400">
              {geoLocation.area} · [Lat: {geoLocation.lat}°, Lng: {geoLocation.lng}°] · Accuracy: ±{geoLocation.accuracy}m
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshLocation}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-700/80 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refresh GPS Fix
          </button>
          <button
            type="button"
            onClick={toggleAutoCvScanner}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              visionStream.autoCvScannerActive
                ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                : 'border-slate-700 bg-slate-800/60 text-slate-400'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            CV Auto-Scanner: {visionStream.autoCvScannerActive ? 'ENGAGED' : 'PAUSED'}
          </button>
        </div>
      </div>

      {/* Viewport Dispatch Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span className="font-mono text-xs font-bold text-slate-200">
            INTEGRATED TRAFFIC VIEW:
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => setViewMode('google-maps')}
            className={`rounded-md px-3 py-1 font-mono text-xs font-semibold transition flex items-center gap-1.5 ${
              viewMode === 'google-maps'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="h-3.5 w-3.5 text-cyan-400" />
            <span>Google Maps Platform</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('simulation')}
            className={`rounded-md px-3 py-1 font-mono text-xs font-semibold transition flex items-center gap-1.5 ${
              viewMode === 'simulation'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>D3 Grid Simulation</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('matrix')}
            className={`rounded-md px-3 py-1 font-mono text-xs font-semibold transition ${
              viewMode === 'matrix'
                ? 'bg-slate-700/60 text-slate-200 border border-slate-600 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Signal Nodes Matrix
          </button>
        </div>
      </div>

      {viewMode === 'google-maps' ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-cyan-400" />
                Google Maps Platform - Real-World Bengaluru Arterial GIS
              </h3>
              <p className="font-mono text-xs text-slate-400">
                Official Google Maps Platform integration: live traffic overlays, Advanced Markers, and Cloud SQL citizen hazard pins
              </p>
            </div>
          </div>
          <GoogleTrafficMap tall />
        </div>
      ) : null}

      {viewMode === 'simulation' ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Real-Time D3.js Multi-Agent Traffic Grid Simulation
              </h3>
              <p className="font-mono text-xs text-slate-400">
                Interactive autonomous vehicle kinetics, dynamic congestion nodes, and signal interlocking
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('simulation')}
              className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 font-mono text-xs text-cyan-300 hover:bg-cyan-900/60"
            >
              Open Dedicated Simulation Tab &rarr;
            </button>
          </div>
          <TrafficGridMap tall />
        </div>
      ) : null}

      {/* Critical Inbound Siren Banner */}
      {visionStream.ambulancePresent ? (
        <div className="relative overflow-hidden rounded-xl border-2 border-rose-500 bg-rose-950/80 p-4 shadow-[0_0_35px_rgba(244,63,94,0.4)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-600 text-white shadow-lg animate-bounce">
                <Siren className="h-6 w-6" />
              </div>
              <div>
                <p className="font-mono text-xs font-bold tracking-widest text-rose-300 uppercase">
                  CRITICAL TRANSMISSION: AMBULANCE INBOUND DETECTED
                </p>
                <p className="text-sm font-semibold text-white">
                  EMR-108 Emergency Responder · Automated Green Corridor provisioned on{' '}
                  {visionStream.flaggedThreatIntersection || 'Silk Board'} Corridor!
                </p>
                <p className="font-mono text-xs text-rose-300/80">
                  800Hz Web Audio Siren Active · Cross-traffic held at Red
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={clearSirenEvent}
                className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-500 transition"
              >
                <VolumeX className="h-4 w-4" />
                Clear Threat & Silence Buzzer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Manual Emergency Trigger & Siren Node Panel */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-amber-400">
            <Volume2 className="h-5 w-5" />
          </div>
          <div>
            <span className="font-mono text-xs font-bold text-slate-200 tracking-wider uppercase">
              ACOUSTIC EMERGENCY TEST NODE (800Hz BUZZER)
            </span>
            <p className="text-xs text-slate-400">
              Triggers the HTML5 Web Audio API 800Hz pulse buzzer and forces an immediate emergency green wave.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!visionStream.ambulancePresent ? (
            <button
              type="button"
              onClick={() => simulateSirenEvent('Silk Board')}
              className="flex items-center gap-2 rounded-lg border border-rose-500/50 bg-rose-950/40 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 transition"
            >
              <Siren className="h-4 w-4" />
              Simulate Inbound Ambulance (Silk Board)
            </button>
          ) : (
            <button
              type="button"
              onClick={clearSirenEvent}
              className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-950/40 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-900/60 transition"
            >
              <VolumeX className="h-4 w-4" />
              Mute 800Hz Buzzer
            </button>
          )}
        </div>
      </div>

      {/* Operations Grid: 4 Bangalore Intersections */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {intersectionKeys.map((name) => {
          const item = intersections[name]
          const isEmergency = item.mode === 'EMERGENCY_GREEN'

          return (
            <div
              key={name}
              className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ${
                isEmergency
                  ? 'border-emerald-400 bg-emerald-950/50 shadow-[0_0_25px_rgba(52,211,153,0.3)]'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      isEmergency ? 'bg-emerald-400 animate-ping' : 'bg-emerald-500'
                    }`}
                  />
                  <h3 className="font-bold text-sm text-slate-100">{name}</h3>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase ${
                    isEmergency
                      ? 'border border-emerald-400/50 bg-emerald-900/60 text-emerald-200'
                      : 'border border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  {isEmergency ? 'EMERGENCY GREEN' : 'AI DYNAMIC'}
                </span>
              </div>

              {/* Signal Visualization Head */}
              <div className="my-3 flex items-center justify-between rounded-lg bg-slate-950/80 p-3 border border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1.5 rounded-md bg-slate-900 p-1.5 border border-slate-800">
                    <div
                      className={`h-3 w-3 rounded-full transition ${
                        isEmergency ? 'bg-slate-800' : 'bg-rose-500/30'
                      }`}
                    />
                    <div className="h-3 w-3 rounded-full bg-slate-800" />
                    <div
                      className={`h-3 w-3 rounded-full transition ${
                        isEmergency
                          ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                          : 'bg-emerald-500'
                      }`}
                    />
                  </div>
                  <div>
                    <span className="font-mono text-[11px] text-slate-400 block">
                      ACTIVE PHASE
                    </span>
                    <span className="font-mono text-sm font-bold text-emerald-400">
                      {isEmergency ? 'GREEN CORRIDOR' : 'CYCLIC GREEN'}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono text-[10px] text-slate-500 block">TIMER</span>
                  <span className="font-mono text-2xl font-bold text-slate-100">
                    {item.activeGreenSeconds}s
                  </span>
                </div>
              </div>

              {/* Real-world Bangalore congestion metrics */}
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="rounded-lg bg-slate-950/50 p-2 border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">DENSITY</span>
                  <span className="font-bold text-slate-200">{item.densityPercent}%</span>
                </div>
                <div className="rounded-lg bg-slate-950/50 p-2 border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block">QUEUE</span>
                  <span className="font-bold text-slate-200">{item.queueLengthVehicles} veh</span>
                </div>
              </div>

              {/* Action Buttons: Emergency & User Manual Override */}
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    isEmergency
                      ? resetIntersectionOverride(name)
                      : triggerEmergencyOverride(name)
                  }
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    isEmergency
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60'
                  }`}
                >
                  {isEmergency ? 'Reset Signal' : 'Priority Override'}
                </button>

                <button
                  type="button"
                  title="Manual Toggle Signal Node"
                  onClick={() => toggleManualSignal(name)}
                  className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 transition"
                >
                  <Sliders className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <FieldVisionEngine />

      {/* CCTV Analytic Monitoring Node Component */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <h4 className="font-bold text-sm text-slate-200">
              CCTV COMPUTER VISION INFERENCE ENGINE
            </h4>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs">
            <span className="text-slate-400">
              FPS: <span className="font-bold text-emerald-400">{visionStream.fps}</span>
            </span>
            <span className="text-slate-400">
              LATENCY: <span className="font-bold text-cyan-400">{visionStream.inferenceLatencyMs}ms</span>
            </span>
            <span className="text-slate-400">
              CARS: <span className="font-bold text-slate-200">{visionStream.activeCars}</span>
            </span>
            <span className="text-slate-400">
              BIKES: <span className="font-bold text-slate-200">{visionStream.activeBikes}</span>
            </span>
            <span className="text-slate-400">
              TRUCKS: <span className="font-bold text-slate-200">{visionStream.activeTrucks}</span>
            </span>
            <span className="text-slate-400">
              PEDS: <span className="font-bold text-slate-200">{visionStream.pedestrianCount}</span>
            </span>
          </div>
        </div>

        {/* Multi-channel CCTV Preview Grid */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {intersectionKeys.map((name, idx) => (
            <div
              key={name}
              className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-3"
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  CAM-0{idx + 1} [{name}]
                </span>
                <span className="text-slate-500">LIVE FEED</span>
              </div>

              {/* Minimalist CCTV Visual Node with AI Bounding Box Sim */}
              <div className="relative h-28 rounded bg-slate-900 border border-slate-800/80 flex flex-col justify-between p-2 font-mono text-[10px]">
                <div className="flex justify-between text-slate-400">
                  <span>FOV: 94.2° N-S</span>
                  <span className="text-emerald-400">
                    DETECTED:{' '}
                    {visionStream.activeCars +
                      visionStream.activeBikes +
                      visionStream.activeTrucks +
                      visionStream.pedestrianCount}{' '}
                    OBJECTS
                  </span>
                </div>

                {visionStream.ambulancePresent && name === 'Silk Board' ? (
                  <div className="self-center rounded border-2 border-rose-500 bg-rose-950/80 px-2 py-1 text-center font-bold text-rose-300 animate-pulse">
                    EMERGENCY VEHICLE (98.6%)
                  </div>
                ) : (
                  <div className="self-center text-center text-slate-500">
                    [OPTICAL FLOW STEADY]
                  </div>
                )}

                <div className="flex justify-between text-slate-400">
                  <span>RES: 1920x1080</span>
                  <span className="text-cyan-400">YOLOv8 TENSOR OK</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ========================================================================= */
/* TAB 2: CITIZEN REPORTING ENGINE                                           */
/* ========================================================================= */
function CitizenReportingView() {
  return <CitizenReportingEngine />
}

/* ========================================================================= */
/* TAB: REAL-TIME TRAFFIC GRID SIMULATION (D3.JS)                            */
/* ========================================================================= */
function TrafficSimulationView() {
  const { visionStream, simulateSirenEvent, clearSirenEvent } = useDashboard()
  const [activeScenario, setActiveScenario] = useState<string>('Standard Multi-Corridor Flow')

  return (
    <div className="space-y-5">
      {/* Simulation Command & Scenario Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/60 text-cyan-400">
            <Activity className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-cyan-400 uppercase tracking-wider">
                D3.JS REAL-TIME TRAFFIC GRID SIMULATION
              </span>
              <span className="rounded border border-emerald-500/40 bg-emerald-950/60 px-2 py-0.5 font-mono text-[10px] text-emerald-300 uppercase">
                60 FPS KINEMATICS ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Active Scenario: <strong className="text-slate-200">{activeScenario}</strong> · Real-time multi-agent vehicle movement, signal interlocking &amp; dynamic routing
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveScenario('Priority Emergency Green Wave')
              simulateSirenEvent('Silk Board')
            }}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 font-mono text-xs font-semibold text-rose-300 hover:bg-rose-900/60 transition"
          >
            <Siren className="h-3.5 w-3.5" />
            Ambulance Green Wave
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveScenario('Peak Hour Traffic Surge (+25 Veh)')
            }}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 font-mono text-xs font-semibold text-amber-300 hover:bg-amber-900/60 transition"
          >
            <CarFront className="h-3.5 w-3.5" />
            Peak Rush Surge
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveScenario('Monsoon Road Hazards & Waterlogging')
            }}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 font-mono text-xs font-semibold text-cyan-300 hover:bg-cyan-900/60 transition"
          >
            <Waves className="h-3.5 w-3.5" />
            Monsoon Hazards
          </button>
          {visionStream.ambulancePresent && (
            <button
              type="button"
              onClick={clearSirenEvent}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
            >
              Reset Siren
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive D3 Simulation Grid */}
      <TrafficGridMap tall />
    </div>
  )
}

/* ========================================================================= */
/* TAB 3: PEDESTRIAN & FLEET HUB (AV TELEMETRY & 5-STATE FSM)                */
/* ========================================================================= */
function PedestrianFleetHubView() {
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
  } = useDashboard()

  const fsmStates: DrivingFSMState[] = [
    'CRUISE',
    'FOLLOW',
    'AVOID',
    'YIELD',
    'EMERGENCY_BRAKE',
  ]

  return (
    <div className="space-y-5">
      {/* Critical Accident Prone Area Trip Banner */}
      {accidentProneWarning.isAccidentProne ? (
        <div className="relative overflow-hidden rounded-xl border-2 border-rose-500 bg-rose-950/80 p-4 shadow-[0_0_30px_rgba(244,63,94,0.4)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-600 text-white animate-bounce">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <p className="font-mono text-xs font-bold tracking-widest text-rose-300 uppercase">
                  {accidentProneWarning.reason}
                </p>
                <p className="text-xs text-rose-200">
                  Autonomous Vehicle Trajectory Planner engaged override deceleration bounds.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={resetTelemetry}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 transition"
            >
              Reset Telemetry Vector
            </button>
          </div>
        </div>
      ) : null}

      {/* 5-State Finite State Machine Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-slate-100">
              AUTONOMOUS VEHICLE 5-STATE FINITE STATE MACHINE (FSM)
            </h3>
          </div>
          <span className="font-mono text-xs text-slate-400">
            Current State: <span className="font-bold text-cyan-300">{fsmState}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {fsmStates.map((st) => {
            const isActive = fsmState === st
            return (
              <div
                key={st}
                className={`rounded-lg border p-3 text-center transition-all ${
                  isActive
                    ? st === 'EMERGENCY_BRAKE'
                      ? 'border-rose-500 bg-rose-950/70 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                      : st === 'YIELD'
                        ? 'border-amber-500 bg-amber-950/70 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                        : st === 'AVOID'
                          ? 'border-orange-500 bg-orange-950/70 text-orange-200 shadow-[0_0_15px_rgba(249,115,22,0.4)]'
                          : 'border-emerald-500 bg-emerald-950/70 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                    : 'border-slate-800 bg-slate-950/50 text-slate-500'
                }`}
              >
                <div
                  className={`h-2 w-2 rounded-full mx-auto mb-1.5 ${
                    isActive ? 'bg-current animate-ping' : 'bg-slate-700'
                  }`}
                />
                <span className="font-mono text-xs font-bold block">{st}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Real-time Telemetry Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="font-mono text-xs text-slate-400 block">EGO VEHICLE SPEED</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-3xl font-bold text-slate-100">
              {telemetry.egoSpeedKmh}
            </span>
            <span className="font-mono text-xs text-slate-400">km/h</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="font-mono text-xs text-slate-400 block">OBSTACLE DISTANCE</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-3xl font-bold text-cyan-400">
              {telemetry.distanceM}
            </span>
            <span className="font-mono text-xs text-slate-400">meters</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="font-mono text-xs text-slate-400 block">CLOSING VELOCITY</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-3xl font-bold text-amber-400">
              {telemetry.closingVelMs}
            </span>
            <span className="font-mono text-xs text-slate-400">m/s</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="font-mono text-xs text-slate-400 block">TIME-TO-COLLISION (TTC)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`font-mono text-3xl font-bold ${
                telemetry.ttcSec < 2.0 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
              }`}
            >
              {telemetry.ttcSec}
            </span>
            <span className="font-mono text-xs text-slate-400">sec</span>
          </div>
        </div>
      </div>

      {/* Pedestrian Crossing Window Widget (+15s Buffer) & Hazard Stream Controls */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Dynamic Pedestrian Crossing Clearance Widget */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Navigation className="h-4 w-4 text-emerald-400" />
              DYNAMIC PEDESTRIAN CROSSING CLEARANCE WIDGET
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
            Dynamically recalculates safe zebra crossing green phase duration. When vulnerable, elderly, or crowded pedestrian groups are detected, the system appends a +15 second clearance buffer.
          </p>

          <div className="flex items-center justify-between rounded-lg bg-slate-950 p-4 border border-slate-800">
            <div>
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
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                isVulnerablePedestrianPresent
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              {isVulnerablePedestrianPresent
                ? 'Dismiss Vulnerable Pedestrian Group'
                : 'Flag Vulnerable / Elderly Group (+15s)'}
            </button>
          </div>
        </div>

        {/* Hazard Stream Simulator Injections */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-400" />
              ROAD SURFACE HAZARD SIMULATOR STREAM
            </h3>
            <span className="font-mono text-xs text-slate-400">Interactive Telemetry Controls</span>
          </div>

          <p className="text-xs text-slate-400">
            Inject real-world road defects and obstacle vectors to observe the autonomous vehicle's FSM state transitions and TTC emergency braking in real-time.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => injectObstacle('pothole')}
              className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700/80 px-3 py-2 text-xs font-medium text-slate-200 transition"
            >
              Inject Pothole (AVOID)
            </button>
            <button
              type="button"
              onClick={() => injectObstacle('manhole')}
              className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700/80 px-3 py-2 text-xs font-medium text-slate-200 transition"
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
              Rapid Acceleration (EMERGENCY BRAKE)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ========================================================================= */
/* TAB 4: GEOSPATIAL SMART WASTE                                             */
/* ========================================================================= */
function SmartWasteView() {
  const { geoLocation, wasteEcosystem, reportMissedPickup, flagWasteOverflow } = useDashboard()

  return (
    <div className="space-y-5">
      {/* Primary Operations Header with Unified Geolocation API Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950 text-emerald-400">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-emerald-400 uppercase tracking-wider">
                MUNICIPAL SMART FLEET OPERATIONS
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                {geoLocation.city} Urban Division
              </span>
            </div>
            <p className="font-mono text-xs text-slate-400">
              Operational Base: {geoLocation.area} · Coords: [Lat: {geoLocation.lat}°, Lng: {geoLocation.lng}°] · Precision: ±{geoLocation.accuracy}m
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 font-mono text-xs">
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

      {/* Smart Bin Monitoring Grid & Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {wasteEcosystem.collectionNodes.map((bin) => {
          const isOverflow = bin.status === 'Overflow Flagged'
          const isNearCapacity = bin.status === 'Near Capacity'

          return (
            <div
              key={bin.id}
              className={`rounded-xl border p-4 space-y-3 transition ${
                isOverflow
                  ? 'border-rose-500 bg-rose-950/40'
                  : isNearCapacity
                    ? 'border-amber-500/60 bg-amber-950/20'
                    : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-cyan-400">{bin.id}</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase font-semibold ${
                    isOverflow
                      ? 'border border-rose-500/40 bg-rose-900/60 text-rose-200'
                      : isNearCapacity
                        ? 'border border-amber-500/40 bg-amber-900/60 text-amber-200'
                        : 'border border-emerald-500/40 bg-emerald-900/60 text-emerald-200'
                  }`}
                >
                  {bin.status}
                </span>
              </div>

              <div>
                <p className="font-bold text-xs text-slate-200">{bin.locationName}</p>
                <p className="font-mono text-[10px] text-slate-500">{bin.zone}</p>
              </div>

              {/* Fill Level Progress Bar */}
              <div>
                <div className="flex justify-between font-mono text-[10px] text-slate-400 mb-1">
                  <span>Fill Level</span>
                  <span className="font-bold text-slate-200">{bin.fillLevelPercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      bin.fillLevelPercent > 90
                        ? 'bg-rose-500'
                        : bin.fillLevelPercent > 70
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${bin.fillLevelPercent}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => reportMissedPickup(bin.id)}
                  className="flex-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-semibold text-slate-300 transition"
                >
                  Missed Pick-up
                </button>
                <button
                  type="button"
                  onClick={() => flagWasteOverflow(bin.id)}
                  className="flex-1 rounded border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 py-1 text-[10px] font-semibold text-rose-300 transition"
                >
                  Flag Overflow
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Autonomous Dispatch & Optimization Activity Log */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
        <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          AUTONOMOUS DISPATCH & ROUTE OPTIMIZATION ACTIVITY LOG
        </h3>

        <div className="space-y-2">
          {wasteEcosystem.routingLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 rounded-lg bg-slate-950 p-2.5 font-mono text-xs border border-slate-800/80"
            >
              <span className="text-cyan-400 font-bold shrink-0">{log.timestamp}</span>
              <span className="text-slate-300">{log.log}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ========================================================================= */
/* TAB 5: FLOOD & VIDEO ANALYTICS MONITOR                                    */
/* ========================================================================= */
function FloodAnalyticsView() {
  const { visionStream, floodTelemetry } = useDashboard()

  const underpassCameras = [
    { id: 'CAM-FL-01', name: 'Majestic City Railway Underpass', depth: floodTelemetry.underpassDepthCm, status: 'NORMAL' },
    { id: 'CAM-FL-02', name: 'Koramangala 80ft Storm Canal', depth: 22.1, status: 'ELEVATED' },
    { id: 'CAM-FL-03', name: 'Silk Board South Flyover Incline', depth: 14.2, status: 'OPTIMAL' },
    { id: 'CAM-FL-04', name: 'Bellandur Lake Spillway Gate', depth: 31.8, status: 'MONITORING' },
  ]

  return (
    <div className="space-y-5">
      <FieldVisionEngine />
      {/* Stream Metrics Header */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="font-mono text-xs text-slate-400 block">BOUND INFERENCE FPS</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-3xl font-bold text-emerald-400">
              {visionStream.fps}
            </span>
            <span className="font-mono text-xs text-slate-500">target 45–50 FPS</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="font-mono text-xs text-slate-400 block">TOTAL VEHICLES ENUMERATED</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-3xl font-bold text-slate-100">
              {visionStream.activeCars + visionStream.activeBikes + visionStream.activeTrucks}
            </span>
            <span className="font-mono text-xs text-slate-400">active targets</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="font-mono text-xs text-slate-400 block">TRAFFIC DELAY MINIMIZATION</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-3xl font-bold text-cyan-400">
              {floodTelemetry.delayMinimizationPercent}%
            </span>
            <span className="font-mono text-xs text-slate-400">vs fixed timer baseline</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="font-mono text-xs text-slate-400 block">STORMWATER PUMP STATUS</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-xl font-bold text-emerald-400">
              {floodTelemetry.drainagePumpStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Underpass Water Depth Telemetry Grid */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-slate-100">
              MONSOON FLOOD & UNDERPASS WATER DEPTH SENSOR TELEMETRY
            </h3>
          </div>
          <span className="font-mono text-xs text-slate-400">
            Sensor Accuracy: {floodTelemetry.sensorAccuracyPercent}%
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {underpassCameras.map((node) => (
            <div
              key={node.id}
              className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-cyan-400 font-bold">{node.id}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[9px] text-slate-300">
                  {node.status}
                </span>
              </div>
              <h4 className="font-semibold text-xs text-slate-200">{node.name}</h4>
              <div className="pt-2">
                <span className="text-[10px] font-mono text-slate-400 block">WATER LEVEL</span>
                <span className="font-mono text-2xl font-bold text-slate-100">
                  {node.depth} cm
                </span>
                <span className="text-[10px] text-slate-500 block">Threshold Limit: 45 cm</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
