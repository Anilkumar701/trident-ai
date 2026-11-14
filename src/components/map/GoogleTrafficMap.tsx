import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  Polyline,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { useDashboard } from '../../context/DashboardContext';
import type { IntersectionKey } from '../../lib/metropolisLogic';
import { INTERSECTION_COORDINATES } from '../../lib/bengaluruGrid';
import {
  Siren,
  AlertTriangle,
  Locate,
  Layers,
  ShieldCheck,
  Building2,
  Clock,
} from 'lucide-react';

interface GoogleTrafficMapProps {
  tall?: boolean;
}

interface IncidentReportMarker {
  id: string;
  trackingId: string;
  category: string;
  department: string;
  severity: string;
  status: string;
  latitude: string | null;
  longitude: string | null;
  description: string;
  address: string | null;
}

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

function MapCameraPan({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    map.setZoom(14);
  }, [map, target]);

  return null;
}

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
  } = useDashboard();
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

  const [trafficLayerEnabled, setTrafficLayerEnabled] = useState(true);
  const [selectedIntersection, setSelectedIntersection] = useState<IntersectionKey | null>(null);
  const [selectedReport, setSelectedReport] = useState<IncidentReportMarker | null>(null);
  const [reports, setReports] = useState<IncidentReportMarker[]>([]);
  const [panTarget, setPanTarget] = useState<{ lat: number; lng: number } | null>(null);

  // Fetch verified hazard complaints from Cloud SQL backend
  useEffect(() => {
    const fetchDbReports = async () => {
      try {
        const res = await fetch('/api/reports');
        if (res.ok) {
          const data: IncidentReportMarker[] = await res.json();
          setReports(data.filter((r) => r.latitude && r.longitude));
        }
      } catch (err) {
        console.warn('Could not load reports from Cloud SQL for map markers:', err);
      }
    };
    fetchDbReports();
    const interval = setInterval(fetchDbReports, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLocateUser = useCallback(() => {
    if (geoLocation?.lat && geoLocation?.lng) {
      setPanTarget({ lat: geoLocation.lat, lng: geoLocation.lng });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setPanTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, [geoLocation]);

  const defaultCenter = useMemo(() => ({ lat: 12.955, lng: 77.61 }), []);

  if (!apiKey) {
    return (
      <div className="flex h-[420px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-amber-500/40 bg-slate-900/60 p-6 text-center text-slate-400">
        <AlertTriangle className="mb-2 h-8 w-8 text-amber-400" />
        <h4 className="text-sm font-bold text-slate-200">Google Maps API Key Not Set</h4>
        <p className="mt-1 max-w-sm text-xs text-slate-400">
          Please verify your <code className="text-cyan-300">VITE_GOOGLE_MAPS_API_KEY</code> variable.
        </p>
      </div>
    );
  }

  const selectedIntersectionData = selectedIntersection ? intersections[selectedIntersection] : null;

  return (
    <div className="space-y-2">
      {/* Map Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono font-semibold text-slate-200">GOOGLE MAPS PLATFORM</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-[11px] text-cyan-400">Bengaluru Urban Grid</span>
        </div>

        <div className="flex items-center gap-2">
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
            <span>Live Traffic Layer: {trafficLayerEnabled ? 'ON' : 'OFF'}</span>
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
          tall ? 'h-[560px]' : 'h-[440px]'
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
            <TrafficLayerControl enabled={trafficLayerEnabled} />
            <MapCameraPan target={panTarget} />

            {emergencyTrack && emergencyTrack.coords.length >= 2 ? (
              <Polyline
                path={emergencyTrack.coords.map((c) => ({ lat: c.lat, lng: c.lng }))}
                strokeColor="#f43f5e"
                strokeOpacity={0.95}
                strokeWeight={5}
              />
            ) : null}

            {fieldTrail.length >= 2 ? (
              <Polyline
                path={fieldTrail}
                strokeColor="#22d3ee"
                strokeOpacity={0.75}
                strokeWeight={3}
              />
            ) : null}

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

            {/* Intersection Signal Pins */}
            {(Object.keys(INTERSECTION_COORDINATES) as IntersectionKey[]).map((key) => {
              const coord = INTERSECTION_COORDINATES[key];
              const info = intersections[key];
              const isEmergency = info?.mode === 'EMERGENCY_GREEN';

              return (
                <AdvancedMarker
                  key={key}
                  position={coord}
                  title={`${coord.label} - ${info?.mode || 'NORMAL'}`}
                  onClick={() => setSelectedIntersection(key)}
                >
                  <Pin
                    background={isEmergency ? '#10b981' : '#0ea5e9'}
                    borderColor={isEmergency ? '#047857' : '#0369a1'}
                    glyphColor="#ffffff"
                    scale={isEmergency ? 1.25 : 1.05}
                  />
                </AdvancedMarker>
              );
            })}

            {/* Inbound Emergency Vehicle (Ambulance) on Flagged Corridor */}
            {visionStream.ambulancePresent && (
              <AdvancedMarker
                position={{
                  lat: INTERSECTION_COORDINATES[(visionStream.flaggedThreatIntersection as IntersectionKey) || 'Silk Board']?.lat || 12.9176,
                  lng: (INTERSECTION_COORDINATES[(visionStream.flaggedThreatIntersection as IntersectionKey) || 'Silk Board']?.lng || 77.6238) - 0.003,
                }}
                title="EMR-108 Emergency Ambulance Vehicle"
              >
                <div className="flex items-center gap-1.5 rounded-full border-2 border-rose-400 bg-rose-600 px-2 py-1 text-white shadow-[0_0_20px_rgba(244,63,94,0.8)] animate-pulse">
                  <Siren className="h-4 w-4" />
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

            {/* Citizen Hazard Reports from Cloud SQL */}
            {reports.map((report) => {
              const lat = parseFloat(report.latitude || '0');
              const lng = parseFloat(report.longitude || '0');
              if (isNaN(lat) || isNaN(lng) || lat === 0) return null;

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
              );
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

      {/* Legend & Telemetry Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Emergency Green</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
            <span>Synchronized Signal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>Critical Hazard (Cloud SQL)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Active Complaint</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Real-time GIS Sync</span>
        </div>
      </div>
    </div>
  );
}
