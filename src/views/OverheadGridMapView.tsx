import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { useDashboard } from '../context/DashboardContext';
import type { IntersectionKey } from '../lib/metropolisLogic';
import {
  Navigation2,
  AlertTriangle,
  Siren,
  Layers,
  Car,
  Shield,
  Radio,
  Eye,
  RotateCcw,
  PlusCircle,
  Truck,
  Gauge,
} from 'lucide-react';
import { GmpCircle } from '../components/map/GmpPrimitives';
import { computeBearingDeg, interpolateGeoPath } from '../lib/geoCorridors';

export interface AutonomousVehicle {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  targetLat: number;
  targetLng: number;
  heading: number;
  speedKmh: number;
  batteryPct: number;
  fsmState: 'CRUISE' | 'FOLLOW' | 'AVOID' | 'YIELD' | 'EMERGENCY_BRAKE';
  targetDestination: string;
  lidarDistanceM: number;
  closingVelMs: number;
  hardwareHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  path: { lat: number; lng: number }[];
}

export interface GridIncident {
  id: string;
  title: string;
  type: 'AMBULANCE' | 'CONGESTION' | 'ACCIDENT' | 'HAZARD';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  lat: number;
  lng: number;
  corridor: string;
  description: string;
  reportedAt: string;
  status: 'ACTIVE' | 'RESOLVING' | 'CLEAR';
  speedImpactKmh: number;
}

// Initial Bangalore AV Fleet Positions & Trajectories
const INITIAL_FLEET: AutonomousVehicle[] = [
  {
    id: 'av-01',
    code: 'EGO-01',
    name: 'Metropolis AV-Alpha (Ego Vehicle)',
    lat: 12.9345,
    lng: 77.6101,
    targetLat: 12.9716,
    targetLng: 77.5946,
    heading: 335,
    speedKmh: 42,
    batteryPct: 88,
    fsmState: 'CRUISE',
    targetDestination: 'MG Road Junction',
    lidarDistanceM: 48.2,
    closingVelMs: 0.4,
    hardwareHealth: 'HEALTHY',
    path: [
      { lat: 12.9176, lng: 77.6238 }, // Silk Board
      { lat: 12.9345, lng: 77.6101 }, // Koramangala
      { lat: 12.955, lng: 77.602 },  // Richmond Circle
      { lat: 12.9716, lng: 77.5946 }, // MG Road
    ],
  },
  {
    id: 'av-02',
    code: 'FLEET-02',
    name: 'Logistics Shuttle Bravo',
    lat: 12.9742,
    lng: 77.5815,
    targetLat: 12.9766,
    targetLng: 77.5713,
    heading: 260,
    speedKmh: 34,
    batteryPct: 76,
    fsmState: 'FOLLOW',
    targetDestination: 'Majestic Multi-Modal Hub',
    lidarDistanceM: 22.5,
    closingVelMs: 1.2,
    hardwareHealth: 'HEALTHY',
    path: [
      { lat: 12.9716, lng: 77.5946 },
      { lat: 12.9742, lng: 77.5815 },
      { lat: 12.9766, lng: 77.5713 },
    ],
  },
  {
    id: 'av-03',
    code: 'FLEET-03',
    name: 'Autonomous Feeder Gamma',
    lat: 12.875,
    lng: 77.645,
    targetLat: 12.8452,
    targetLng: 77.6602,
    heading: 145,
    speedKmh: 55,
    batteryPct: 92,
    fsmState: 'CRUISE',
    targetDestination: 'Electronic City Tollway',
    lidarDistanceM: 65.0,
    closingVelMs: 0.1,
    hardwareHealth: 'HEALTHY',
    path: [
      { lat: 12.9176, lng: 77.6238 },
      { lat: 12.875, lng: 77.645 },
      { lat: 12.8452, lng: 77.6602 },
    ],
  },
  {
    id: 'av-04',
    code: 'FLEET-04',
    name: 'Sanitation Robocart Delta',
    lat: 12.968,
    lng: 77.642,
    targetLat: 12.9716,
    targetLng: 77.5946,
    heading: 280,
    speedKmh: 28,
    batteryPct: 64,
    fsmState: 'YIELD',
    targetDestination: 'Indiranagar Metro Corridor',
    lidarDistanceM: 14.8,
    closingVelMs: 2.1,
    hardwareHealth: 'DEGRADED',
    path: [
      { lat: 12.978, lng: 77.644 },
      { lat: 12.968, lng: 77.642 },
      { lat: 12.9716, lng: 77.5946 },
    ],
  },
];

// Initial Real-World Bengaluru Grid Incidents
const INITIAL_INCIDENTS: GridIncident[] = [
  {
    id: 'inc-01',
    title: 'EMR-108 Emergency Green Corridor',
    type: 'AMBULANCE',
    severity: 'CRITICAL',
    lat: 12.923,
    lng: 77.618,
    corridor: 'Hosur Road -> Silk Board Junction',
    description: 'Rapid cardiac life support transit. Preemptive green wave active on signals.',
    reportedAt: '17:02 IST',
    status: 'ACTIVE',
    speedImpactKmh: 0,
  },
  {
    id: 'inc-02',
    title: 'Underpass Waterlogging & Lane Obstruction',
    type: 'HAZARD',
    severity: 'HIGH',
    lat: 12.972,
    lng: 77.578,
    corridor: 'Krantivira Sangolli Rayanna Underpass',
    description: 'Monsoon runoff accumulation. Sensor alerts recommend AV trajectory avoidance.',
    reportedAt: '16:45 IST',
    status: 'ACTIVE',
    speedImpactKmh: -25,
  },
  {
    id: 'inc-03',
    title: 'Commercial Freight Bottleneck',
    type: 'CONGESTION',
    severity: 'MEDIUM',
    lat: 12.915,
    lng: 77.628,
    corridor: 'Outer Ring Road Silk Board Merge',
    description: 'Heavy peak vehicle density. Stop-and-go autonomous queueing engaged.',
    reportedAt: '16:55 IST',
    status: 'ACTIVE',
    speedImpactKmh: -18,
  },
];

// Bangalore Intersection Coordinates
const INTERSECTION_NODES: Record<IntersectionKey, { lat: number; lng: number; label: string }> = {
  'MG Road': { lat: 12.9716, lng: 77.5946, label: 'MG Road Junction' },
  'Silk Board': { lat: 12.9176, lng: 77.6238, label: 'Central Silk Board Interchange' },
  'Majestic': { lat: 12.9766, lng: 77.5713, label: 'Kempegowda Majestic Hub' },
  'Electronic City': { lat: 12.8452, lng: 77.6602, label: 'Electronic City Phase 1 Toll' },
};

function TrafficLayerControl({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib) return;
    const trafficLayer = new mapsLib.TrafficLayer();
    if (enabled) {
      trafficLayer.setMap(map);
    } else {
      trafficLayer.setMap(null);
    }
    return () => {
      trafficLayer.setMap(null);
    };
  }, [map, mapsLib, enabled]);

  return null;
}

function PolylineOverlay({
  path,
  color,
  strokeWeight = 3,
}: {
  path: { lat: number; lng: number }[];
  color: string;
  strokeWeight?: number;
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || path.length < 2) return;
    const polyline = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: 0.85,
      strokeWeight,
      map,
    });
    return () => {
      polyline.setMap(null);
    };
  }, [map, mapsLib, path, color, strokeWeight]);

  return null;
}

function FollowCamera({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
  }, [map, target]);

  return null;
}

export function OverheadGridMapView() {
  const {
    intersections,
    visionStream,
    geoLocation,
    triggerEmergencyOverride,
    resetIntersectionOverride,
    simulateSirenEvent,
    clearSirenEvent,
  } = useDashboard()
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || ''

  const [fleet, setFleet] = useState<AutonomousVehicle[]>(INITIAL_FLEET);
  const [incidents, setIncidents] = useState<GridIncident[]>(INITIAL_INCIDENTS);
  const [filterMode, setFilterMode] = useState<'ALL' | 'AV_ONLY' | 'INCIDENTS_ONLY'>('ALL');
  const [trafficLayerEnabled, setTrafficLayerEnabled] = useState(true);
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'satellite' | 'hybrid'>('roadmap');

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<GridIncident | null>(null);
  const [selectedIntersection, setSelectedIntersection] = useState<IntersectionKey | null>(null);
  const [followingAvId, setFollowingAvId] = useState<string | null>(null);

  const selectedVehicle = useMemo(
    () => fleet.find((v) => v.id === selectedVehicleId) || null,
    [fleet, selectedVehicleId]
  );

  const defaultCenter = useMemo(() => ({ lat: 12.955, lng: 77.61 }), []);

  // Fetch verified hazard complaints from Cloud SQL backend
  useEffect(() => {
    const fetchDbIncidents = async () => {
      try {
        const res = await fetch('/api/reports');
        if (res.ok) {
          const data = await res.json();
          const mapped: GridIncident[] = data
            .filter((r: any) => r.latitude && r.longitude)
            .map((r: any) => ({
              id: `db-${r.id}`,
              title: `${r.trackingId}: ${r.category}`,
              type: 'HAZARD',
              severity: r.severity === 'Critical' ? 'CRITICAL' : 'HIGH',
              lat: parseFloat(r.latitude),
              lng: parseFloat(r.longitude),
              corridor: r.address || 'Bengaluru Urban Ward',
              description: r.description,
              reportedAt: 'Recent',
              status: 'ACTIVE',
              speedImpactKmh: -15,
            }));
          if (mapped.length > 0) {
            setIncidents((prev) => {
              const existingIds = new Set(prev.map((i) => i.id));
              const fresh = mapped.filter((m: GridIncident) => !existingIds.has(m.id));
              return [...prev, ...fresh];
            });
          }
        }
      } catch (err) {
        console.warn('Could not load Cloud SQL incidents:', err);
      }
    };
    fetchDbIncidents();
  }, []);

  // Smooth multi-waypoint kinematics loop along real Bengaluru road corridors
  const avProgressRef = useRef<Record<string, number>>({
    'av-01': 0.35,
    'av-02': 0.45,
    'av-03': 0.5,
    'av-04': 0.4,
  });
  const avDirRef = useRef<Record<string, 1 | -1>>({
    'av-01': 1,
    'av-02': 1,
    'av-03': 1,
    'av-04': 1,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setFleet((prevFleet) =>
        prevFleet.map((av) => {
          if (av.fsmState === 'EMERGENCY_BRAKE') {
            return {
              ...av,
              speedKmh: Math.max(0, av.speedKmh - 12),
              lidarDistanceM: Math.max(3.0, av.lidarDistanceM - 0.5),
            };
          }

          const dir = avDirRef.current[av.id] ?? 1;
          const step = Math.max(0.004, (av.speedKmh / 60) * 0.015);
          let p = (avProgressRef.current[av.id] ?? 0.25) + dir * step;
          if (p >= 0.98) {
            p = 0.98;
            avDirRef.current[av.id] = -1;
          } else if (p <= 0.02) {
            p = 0.02;
            avDirRef.current[av.id] = 1;
          }
          avProgressRef.current[av.id] = p;

          const sample = interpolateGeoPath(av.path, p);
          const nextLook = interpolateGeoPath(
            av.path,
            Math.min(0.999, Math.max(0.001, p + (avDirRef.current[av.id] ?? 1) * 0.02)),
          );
          const heading = Math.round(computeBearingDeg(sample.point, nextLook.point));

          // Detect proximity to any active urban bottleneck or hazard (~450m)
          const nearIncident = incidents.find((inc) => {
            const d = Math.hypot(inc.lat - sample.point.lat, inc.lng - sample.point.lng);
            return d < 0.0045;
          });

          const lidarDelta = (Math.random() - 0.5) * 1.4;
          const newLidar = nearIncident
            ? Math.max(9.5, Math.min(18.0, av.lidarDistanceM - 1.2))
            : Math.max(14.0, Math.min(72.0, av.lidarDistanceM + lidarDelta));

          let state: AutonomousVehicle['fsmState'] = av.fsmState;
          let speed = av.speedKmh;
          if (nearIncident || newLidar < 15.0) {
            state = nearIncident ? 'AVOID' : 'YIELD';
            speed = Math.max(18, Math.min(30, av.speedKmh));
          } else {
            state = 'CRUISE';
            speed = Math.min(54, Math.max(34, av.speedKmh + 1));
          }

          return {
            ...av,
            lat: sample.point.lat,
            lng: sample.point.lng,
            heading,
            speedKmh: speed,
            lidarDistanceM: parseFloat(newLidar.toFixed(1)),
            fsmState: state,
          };
        }),
      );
    }, 350);

    return () => clearInterval(interval);
  }, [incidents]);

  // Emergency brake trigger for whole fleet
  const handleEmergencyStopAll = useCallback(() => {
    setFleet((prev) =>
      prev.map((v) => ({
        ...v,
        fsmState: 'EMERGENCY_BRAKE',
        speedKmh: 0,
      }))
    );
  }, []);

  // Resume standard cruising
  const handleResumeCruising = useCallback(() => {
    setFleet((prev) =>
      prev.map((v, idx) => ({
        ...v,
        fsmState: 'CRUISE',
        speedKmh: 35 + idx * 5,
      }))
    );
  }, []);

  // Inject a simulated urban grid incident
  const handleInjectIncident = useCallback(() => {
    const newInc: GridIncident = {
      id: `sim-inc-${Date.now().toString().slice(-4)}`,
      title: 'Stalled Heavy Vehicle in Fast Lane',
      type: 'ACCIDENT',
      severity: 'HIGH',
      lat: 12.952 + (Math.random() - 0.5) * 0.02,
      lng: 77.605 + (Math.random() - 0.5) * 0.02,
      corridor: 'Intermediate Arterial Spine',
      description: 'Disabled transit bus blocking northbound carriageway. AV fleet advised to yield.',
      reportedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      status: 'ACTIVE',
      speedImpactKmh: -20,
    };
    setIncidents((prev) => [newInc, ...prev]);

    // Send nearby AV to AVOID
    setFleet((prev) =>
      prev.map((v, i) => (i === 0 ? { ...v, fsmState: 'AVOID', lidarDistanceM: 12.4 } : v))
    );
  }, []);

  const followTarget = useMemo(() => {
    if (!followingAvId) return null;
    const v = fleet.find((av) => av.id === followingAvId);
    return v ? { lat: v.lat, lng: v.lng } : null;
  }, [fleet, followingAvId]);

  if (!apiKey) {
    return (
      <div className="flex h-[500px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/40 bg-slate-900/60 p-8 text-center text-slate-400">
        <AlertTriangle className="mb-3 h-10 w-10 text-amber-400" />
        <h3 className="text-base font-bold text-slate-200">Google Maps Platform Key Required</h3>
        <p className="mt-1 max-w-md text-xs text-slate-400">
          The real-time urban traffic grid overhead map relies on the Google Maps JavaScript API.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Tactical Command Strip */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/60 text-cyan-400 shadow-lg shadow-cyan-950/50">
              <Navigation2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold tracking-wider text-cyan-400 uppercase">
                  METROPOLIS OVERHEAD GIS
                </span>
                <span className="text-slate-600">·</span>
                <span className="rounded bg-emerald-950/80 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-800/50">
                  LIVE GRID SYNC
                </span>
              </div>
              <h2 className="text-lg font-bold text-white">
                Real-Time Urban Traffic Grid &amp; Autonomous Telemetry
              </h2>
            </div>
          </div>

          {/* Operational Metrics Badges */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-slate-300">
              <Car className="h-3.5 w-3.5 text-cyan-400" />
              <span>AV Fleet:</span>
              <strong className="text-cyan-300">{fleet.length} Active</strong>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-slate-300">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              <span>Incidents:</span>
              <strong className="text-rose-300">{incidents.length} Bottlenecks</strong>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-slate-300">
              <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
              <span>Inference FPS:</span>
              <strong className="text-emerald-400">{visionStream.fps}</strong>
            </div>
          </div>
        </div>

        {/* Toolbar & Filter Switches */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3 text-xs">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 p-1 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`rounded px-2.5 py-1 font-semibold transition ${
                filterMode === 'ALL'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Overlays
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('AV_ONLY')}
              className={`rounded px-2.5 py-1 font-semibold transition flex items-center gap-1 ${
                filterMode === 'AV_ONLY'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Car className="h-3 w-3" />
              <span>AV Fleet Only</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('INCIDENTS_ONLY')}
              className={`rounded px-2.5 py-1 font-semibold transition flex items-center gap-1 ${
                filterMode === 'INCIDENTS_ONLY'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              <span>Incidents Only</span>
            </button>
          </div>

          {/* Interactive Tactical Command Buttons */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => setTrafficLayerEnabled((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition ${
                trafficLayerEnabled
                  ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Google Traffic: {trafficLayerEnabled ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMapTypeId((prev) => (prev === 'roadmap' ? 'hybrid' : 'roadmap'))}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-slate-300 hover:border-slate-700 hover:text-white transition"
            >
              <Eye className="h-3.5 w-3.5 text-cyan-400" />
              <span>View: {mapTypeId === 'roadmap' ? 'Standard' : 'Satellite Hybrid'}</span>
            </button>

            <button
              type="button"
              onClick={handleInjectIncident}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 font-semibold text-amber-300 hover:bg-amber-900/60 transition shadow-sm"
            >
              <PlusCircle className="h-3.5 w-3.5 text-amber-400" />
              <span>Inject Grid Bottleneck</span>
            </button>

            <button
              type="button"
              onClick={() =>
                visionStream.ambulancePresent
                  ? clearSirenEvent()
                  : simulateSirenEvent('Silk Board')
              }
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-semibold transition shadow-sm ${
                visionStream.ambulancePresent
                  ? 'border-emerald-400 bg-emerald-600 text-white'
                  : 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/70'
              }`}
            >
              <Siren className="h-3.5 w-3.5" />
              <span>
                {visionStream.ambulancePresent ? 'Clear Emergency Wave' : 'EMR-108 Green Wave Demo'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleEmergencyStopAll}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-950/60 px-3 py-1.5 font-bold text-rose-300 hover:bg-rose-900/80 transition shadow-sm"
            >
              <Shield className="h-3.5 w-3.5 text-rose-400" />
              <span>FSM Emergency Stop All</span>
            </button>

            <button
              type="button"
              onClick={handleResumeCruising}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Resume Fleet</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Viewport & Telemetry Grid Container */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        {/* Main Overhead Google Map Canvas */}
        <div className="xl:col-span-3">
          <div className="relative h-[620px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <APIProvider apiKey={apiKey} solutionChannel="gmp_mcp_codeassist_v1_aistudio">
              <Map
                defaultCenter={defaultCenter}
                defaultZoom={12}
                mapId="DEMO_MAP_ID"
                mapTypeId={mapTypeId}
                disableDefaultUI={false}
                gestureHandling="greedy"
                style={{ width: '100%', height: '100%' }}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              >
                <TrafficLayerControl enabled={trafficLayerEnabled} />
                <FollowCamera target={followTarget} />

                {/* Trajectory Polylines for Active AVs */}
                {filterMode !== 'INCIDENTS_ONLY' &&
                  fleet.map((av) => (
                    <PolylineOverlay
                      key={`path-${av.id}`}
                      path={av.path}
                      color={
                        av.fsmState === 'EMERGENCY_BRAKE'
                          ? '#f43f5e'
                          : av.fsmState === 'AVOID'
                            ? '#fbbf24'
                            : '#06b6d4'
                      }
                      strokeWeight={selectedVehicle?.id === av.id ? 4 : 2.5}
                    />
                  ))}

                {/* Autonomous Vehicle Custom Marker Overlays */}
                {filterMode !== 'INCIDENTS_ONLY' &&
                  fleet.map((av) => {
                    const isSelected = selectedVehicle?.id === av.id;
                    const isBraking = av.fsmState === 'EMERGENCY_BRAKE';
                    const isYielding = av.fsmState === 'YIELD' || av.fsmState === 'AVOID';

                    return (
                      <AdvancedMarker
                        key={av.id}
                        position={{ lat: av.lat, lng: av.lng }}
                        title={`${av.name} [${av.fsmState}] - ${av.speedKmh} km/h`}
                        onClick={() => {
                          setSelectedVehicleId(av.id);
                          setSelectedIncident(null);
                          setSelectedIntersection(null);
                        }}
                      >
                        <div
                          className={`relative flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 shadow-lg transition-transform hover:scale-110 ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-950 ring-2 ring-cyan-400 scale-110'
                              : isBraking
                                ? 'border-rose-500 bg-rose-950/90 text-rose-300'
                                : isYielding
                                  ? 'border-amber-500 bg-amber-950/90 text-amber-300'
                                  : 'border-cyan-500/70 bg-slate-950/90 text-cyan-300'
                          }`}
                        >
                          {/* Heading arrow */}
                          <div
                            style={{ transform: `rotate(${av.heading}deg)` }}
                            className="transition-transform duration-500"
                          >
                            <Navigation2 className="h-3.5 w-3.5 fill-current" />
                          </div>

                          <div className="flex flex-col font-mono text-[9px] leading-tight">
                            <span className="font-bold">{av.code}</span>
                            <span className="text-[8px] text-slate-300">{av.speedKmh} km/h</span>
                          </div>

                          {/* Pulsing state pip */}
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isBraking
                                ? 'bg-rose-500 animate-ping'
                                : isYielding
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                            }`}
                          />
                        </div>
                      </AdvancedMarker>
                    );
                  })}

                {/* Traffic Incident Custom Marker Overlays */}
                {filterMode !== 'AV_ONLY' &&
                  incidents.map((inc) => (
                    <AdvancedMarker
                      key={inc.id}
                      position={{ lat: inc.lat, lng: inc.lng }}
                      title={`${inc.title} (${inc.severity})`}
                      onClick={() => {
                        setSelectedIncident(inc);
                        setSelectedVehicleId(null);
                        setSelectedIntersection(null);
                      }}
                    >
                      <div className="cursor-pointer group relative">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 shadow-2xl transition-transform hover:scale-110 ${
                            inc.type === 'AMBULANCE'
                              ? 'border-rose-400 bg-rose-600 text-white animate-bounce'
                              : inc.severity === 'CRITICAL'
                                ? 'border-rose-500 bg-rose-950 text-rose-300'
                                : 'border-amber-500 bg-amber-950 text-amber-300'
                          }`}
                        >
                          {inc.type === 'AMBULANCE' ? (
                            <Siren className="h-5 w-5" />
                          ) : inc.type === 'ACCIDENT' ? (
                            <Car className="h-4 w-4" />
                          ) : inc.type === 'HAZARD' ? (
                            <AlertTriangle className="h-4 w-4" />
                          ) : (
                            <Truck className="h-4 w-4" />
                          )}
                        </div>

                        {/* Floating tooltip label */}
                        <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white shadow border border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity">
                          {inc.title}
                        </div>
                      </div>
                    </AdvancedMarker>
                  ))}

                {/* Bangalore Arterial Intersection Pins & Signal Wave Rings */}
                {(Object.keys(INTERSECTION_NODES) as IntersectionKey[]).map((key) => {
                  const node = INTERSECTION_NODES[key];
                  const info = intersections[key];
                  const isGreen = info?.mode === 'EMERGENCY_GREEN';

                  return (
                    <span key={`wrap-${key}`}>
                      <GmpCircle
                        center={node}
                        radiusMeters={isGreen ? 900 : 350 + (info?.queueLengthVehicles ?? 15) * 9}
                        color={isGreen ? '#10b981' : (info?.densityPercent ?? 50) >= 80 ? '#f43f5e' : '#0ea5e9'}
                        fillOpacity={isGreen ? 0.2 : 0.11}
                        strokeWeight={isGreen ? 2 : 1}
                      />
                      <AdvancedMarker
                        key={`node-${key}`}
                        position={node}
                        title={`${node.label} [${info?.mode || 'NORMAL'}]`}
                        onClick={() => {
                          setSelectedIntersection(key);
                          setSelectedVehicleId(null);
                          setSelectedIncident(null);
                        }}
                      >
                        <div
                          className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] shadow-md transition-all cursor-pointer ${
                            isGreen
                              ? 'border-emerald-400 bg-emerald-950 text-emerald-300 animate-pulse'
                              : 'border-slate-700 bg-slate-900/95 text-slate-200'
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isGreen ? 'bg-emerald-400' : 'bg-cyan-400'
                            }`}
                          />
                          <span className="font-semibold">{key}</span>
                          <span className="text-emerald-300 tabular-nums">{info?.activeGreenSeconds}s</span>
                        </div>
                      </AdvancedMarker>
                    </span>
                  );
                })}

                {/* Operator Live GPS Position */}
                {geoLocation?.lat && geoLocation?.lng && (
                  <AdvancedMarker
                    position={{ lat: geoLocation.lat, lng: geoLocation.lng }}
                    title="Current Terminal Location"
                  >
                    <div className="relative flex h-5 w-5 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-500 border border-white shadow-md" />
                    </div>
                  </AdvancedMarker>
                )}

                {/* AV Telemetry InfoWindow */}
                {selectedVehicle && (
                  <InfoWindow
                    position={{ lat: selectedVehicle.lat, lng: selectedVehicle.lng }}
                    onCloseClick={() => setSelectedVehicleId(null)}
                  >
                    <div className="p-1 max-w-[260px] text-slate-900 font-sans">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5">
                        <span className="font-bold text-xs text-slate-900">
                          {selectedVehicle.name}
                        </span>
                        <span className="rounded bg-cyan-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-cyan-800">
                          {selectedVehicle.code}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">5-State FSM:</span>
                          <span
                            className={`font-mono font-bold rounded px-1.5 py-0.5 text-[10px] ${
                              selectedVehicle.fsmState === 'EMERGENCY_BRAKE'
                                ? 'bg-rose-100 text-rose-700'
                                : selectedVehicle.fsmState === 'AVOID' || selectedVehicle.fsmState === 'YIELD'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {selectedVehicle.fsmState}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Speed / Heading:</span>
                          <span className="font-mono text-slate-800">
                            {selectedVehicle.speedKmh} km/h · {selectedVehicle.heading}°
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">LiDAR Distance:</span>
                          <span className="font-mono text-slate-800">
                            {selectedVehicle.lidarDistanceM} m
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Battery State:</span>
                          <span className="font-mono text-emerald-700 font-semibold">
                            {selectedVehicle.batteryPct}%
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Target Node:</span>
                          <span className="font-mono text-slate-700 text-[10px] truncate max-w-[130px]">
                            {selectedVehicle.targetDestination}
                          </span>
                        </div>

                        <div className="pt-2 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setFollowingAvId((prev) =>
                                prev === selectedVehicle.id ? null : selectedVehicle.id
                              );
                            }}
                            className={`w-full rounded px-2 py-1 font-mono text-[10px] font-semibold text-white transition ${
                              followingAvId === selectedVehicle.id
                                ? 'bg-cyan-700'
                                : 'bg-slate-800 hover:bg-slate-900'
                            }`}
                          >
                            {followingAvId === selectedVehicle.id
                              ? 'Unfollow Cam'
                              : 'Follow Camera'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFleet((prev) =>
                                prev.map((v) =>
                                  v.id === selectedVehicle.id
                                    ? { ...v, fsmState: 'EMERGENCY_BRAKE', speedKmh: 0 }
                                    : v
                                )
                              );
                            }}
                            className="w-full rounded bg-rose-600 px-2 py-1 font-mono text-[10px] font-semibold text-white hover:bg-rose-700"
                          >
                            Remote E-Brake
                          </button>
                        </div>
                      </div>
                    </div>
                  </InfoWindow>
                )}

                {/* Incident Detail InfoWindow */}
                {selectedIncident && (
                  <InfoWindow
                    position={{ lat: selectedIncident.lat, lng: selectedIncident.lng }}
                    onCloseClick={() => setSelectedIncident(null)}
                  >
                    <div className="p-1 max-w-[260px] text-slate-900 font-sans">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5">
                        <span className="font-bold text-xs text-slate-900">
                          {selectedIncident.title}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            selectedIncident.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {selectedIncident.severity}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-700 mb-1 leading-snug">
                        {selectedIncident.description}
                      </p>

                      <div className="space-y-1 text-[10px] text-slate-600">
                        <div className="flex items-center justify-between">
                          <span>Corridor Location:</span>
                          <span className="font-mono text-slate-800 font-medium">
                            {selectedIncident.corridor}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Speed Impact:</span>
                          <span className="font-mono text-rose-600 font-bold">
                            {selectedIncident.speedImpactKmh} km/h
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Log Timestamp:</span>
                          <span className="font-mono text-slate-500">
                            {selectedIncident.reportedAt}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => {
                            // Clear incident
                            setIncidents((prev) => prev.filter((i) => i.id !== selectedIncident.id));
                            setSelectedIncident(null);
                          }}
                          className="w-full rounded bg-emerald-600 px-2 py-1 font-mono text-[10px] font-semibold text-white hover:bg-emerald-700"
                        >
                          Mark Resolved &amp; Clear Path
                        </button>
                      </div>
                    </div>
                  </InfoWindow>
                )}

                {/* Intersection Signal InfoWindow */}
                {selectedIntersection && INTERSECTION_NODES[selectedIntersection] && (
                  <InfoWindow
                    position={INTERSECTION_NODES[selectedIntersection]}
                    onCloseClick={() => setSelectedIntersection(null)}
                  >
                    <div className="p-1 max-w-[220px] text-slate-900 font-sans">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5">
                        <span className="font-bold text-xs text-slate-800">
                          {INTERSECTION_NODES[selectedIntersection].label}
                        </span>
                      </div>
                      <div className="space-y-1 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Signal Mode:</span>
                          <span
                            className={`font-mono font-bold ${
                              intersections[selectedIntersection]?.mode === 'EMERGENCY_GREEN'
                                ? 'text-emerald-600'
                                : 'text-cyan-700'
                            }`}
                          >
                            {intersections[selectedIntersection]?.mode || 'NORMAL'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Density:</span>
                          <span className="font-mono text-slate-700">
                            {intersections[selectedIntersection]?.densityPercent}%
                          </span>
                        </div>
                        <div className="pt-2">
                          {intersections[selectedIntersection]?.mode === 'EMERGENCY_GREEN' ? (
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
                              Preempt Green Wave
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </Map>
            </APIProvider>
          </div>
        </div>

        {/* Right Tactical Telemetry & Fleet Diagnostics Panel */}
        <div className="space-y-4 xl:col-span-1">
          {/* Active Unit Focus Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-cyan-400 uppercase">
                <Gauge className="h-4 w-4" /> AV TELEMETRY STREAM
              </span>
              <span className="rounded bg-cyan-950/80 px-2 py-0.5 font-mono text-[10px] text-cyan-300 border border-cyan-800/40">
                {selectedVehicle ? selectedVehicle.code : 'SELECT A UNIT'}
              </span>
            </div>

            {selectedVehicle ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs font-bold text-white">{selectedVehicle.name}</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>FSM STATE:</span>
                    <span
                      className={`font-bold ${
                        selectedVehicle.fsmState === 'EMERGENCY_BRAKE'
                          ? 'text-rose-400'
                          : selectedVehicle.fsmState === 'AVOID' || selectedVehicle.fsmState === 'YIELD'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }`}
                    >
                      {selectedVehicle.fsmState}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <span className="text-[10px] text-slate-400">SPEED</span>
                    <div className="text-sm font-bold text-cyan-300">
                      {selectedVehicle.speedKmh} <span className="text-[10px]">km/h</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <span className="text-[10px] text-slate-400">LIDAR GAP</span>
                    <div className="text-sm font-bold text-emerald-400">
                      {selectedVehicle.lidarDistanceM} <span className="text-[10px]">m</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <span className="text-[10px] text-slate-400">BATTERY</span>
                    <div className="text-sm font-bold text-slate-200">
                      {selectedVehicle.batteryPct}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <span className="text-[10px] text-slate-400">HEALTH</span>
                    <div className="text-sm font-bold text-emerald-400">
                      {selectedVehicle.hardwareHealth}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px]">
                  <span className="text-slate-400">CORRIDOR DESTINATION:</span>
                  <p className="mt-0.5 text-slate-200 truncate">{selectedVehicle.targetDestination}</p>
                </div>
              </div>
            ) : (
              <div className="flex h-36 flex-col items-center justify-center text-center text-slate-500 font-mono text-xs">
                <Car className="mb-2 h-7 w-7 text-slate-600" />
                <p>Click any vehicle icon on the map to pin real-time kinematic telemetry</p>
              </div>
            )}
          </div>

          {/* Incident Feed from Urban Grid */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-rose-400 uppercase">
                <AlertTriangle className="h-4 w-4" /> GRID INCIDENT QUEUE
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {incidents.length} FLAGGED
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => {
                    setSelectedIncident(inc);
                    setSelectedVehicleId(null);
                  }}
                  className="cursor-pointer rounded-xl border border-slate-800/80 bg-slate-950 p-2.5 text-xs transition hover:border-slate-700 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-slate-200 truncate">{inc.title}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                        inc.severity === 'CRITICAL'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/50'
                          : 'bg-amber-950 text-amber-300 border border-amber-800/50'
                      }`}
                    >
                      {inc.severity}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-slate-400 truncate">
                    {inc.corridor}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
