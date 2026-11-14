import { useState } from 'react'
import {
  Activity,
  Compass,
  Cpu,
  Eye,
  RotateCcw,
  Siren,
  Sliders,
  Volume2,
  VolumeX,
  MapPin,
} from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { type IntersectionKey } from '../lib/metropolisLogic'
import { TrafficGridMap } from './map/TrafficGridMap'
import { GoogleTrafficMap } from './map/GoogleTrafficMap'
import { CitizenReportingEngine } from './CitizenReportingEngine'
import { OverheadGridMapView } from '../views/OverheadGridMapView'
import { FieldVisionEngine } from './vision/FieldVisionEngine'
import { PedestrianFleetSimulator } from './simulations/PedestrianFleetSimulator'
import { SmartFleetWasteSimulator } from './simulations/SmartFleetWasteSimulator'
import { FloodAnalyticsSimulator } from './simulations/FloodAnalyticsSimulator'
import { TrafficGridShowcase } from './simulations/TrafficGridShowcase'
import { HardwareBridgeHub } from './simulations/HardwareBridgeHub'

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
    case 'hardware':
      return <HardwareBridgeHub />
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
  return <TrafficGridShowcase />
}

/* ========================================================================= */
/* TAB 3: PEDESTRIAN & FLEET HUB (AV TELEMETRY & 5-STATE FSM)                */
/* ========================================================================= */
function PedestrianFleetHubView() {
  return <PedestrianFleetSimulator />
}

/* ========================================================================= */
/* TAB 4: GEOSPATIAL SMART WASTE                                             */
/* ========================================================================= */
function SmartWasteView() {
  return <SmartFleetWasteSimulator />
}

/* ========================================================================= */
/* TAB 5: FLOOD & VIDEO ANALYTICS MONITOR                                    */
/* ========================================================================= */
function FloodAnalyticsView() {
  return <FloodAnalyticsSimulator />
}
