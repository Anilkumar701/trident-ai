/* oxlint-disable react/only-export-components */
import { useEffect, useState } from 'react'
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { AlertTriangle } from 'lucide-react'
import type { LatLngLiteral } from '../../lib/geoCorridors'

export function useGmpApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || ''
}

export function GmpMissingKeyBanner({ label = 'Google Maps Platform' }: { label?: string }) {
  return (
    <div className="flex h-[360px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-amber-500/40 bg-slate-900/60 p-6 text-center text-slate-400">
      <AlertTriangle className="mb-2 h-8 w-8 text-amber-400" />
      <h4 className="text-sm font-bold text-slate-200">{label} API Key Not Configured</h4>
      <p className="mt-1 max-w-sm text-xs text-slate-400">
        Set <code className="text-cyan-300">VITE_GOOGLE_MAPS_API_KEY</code> to render live interactive maps.
      </p>
    </div>
  )
}

export function GmpTrafficLayer({ enabled }: { enabled: boolean }) {
  const map = useMap()
  const mapsLib = useMapsLibrary('maps')

  useEffect(() => {
    if (!map || !mapsLib) return
    const trafficLayer = new mapsLib.TrafficLayer()
    trafficLayer.setMap(enabled ? map : null)
    return () => {
      trafficLayer.setMap(null)
    }
  }, [map, mapsLib, enabled])

  return null
}

export function GmpPolyline({
  path,
  color,
  strokeWeight = 4,
  strokeOpacity = 0.85,
  dashed = false,
  onClick,
}: {
  path: LatLngLiteral[]
  color: string
  strokeWeight?: number
  strokeOpacity?: number
  dashed?: boolean
  onClick?: () => void
}) {
  const map = useMap()
  const mapsLib = useMapsLibrary('maps')

  useEffect(() => {
    if (!map || !mapsLib || path.length < 2) return
    const polyline = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: dashed ? 0 : strokeOpacity,
      strokeWeight,
      clickable: Boolean(onClick),
      icons: dashed
        ? [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: strokeOpacity,
                strokeColor: color,
                scale: Math.max(2, strokeWeight * 0.8),
              },
              offset: '0',
              repeat: '14px',
            },
          ]
        : undefined,
      map,
    })

    const listener = onClick ? polyline.addListener('click', onClick) : null
    return () => {
      listener?.remove()
      polyline.setMap(null)
    }
  }, [map, mapsLib, path, color, strokeWeight, strokeOpacity, dashed, onClick])

  return null
}

export function GmpCircle({
  center,
  radiusMeters,
  color,
  fillOpacity = 0.16,
  strokeWeight = 1.5,
  strokeOpacity = 0.65,
}: {
  center: LatLngLiteral
  radiusMeters: number
  color: string
  fillOpacity?: number
  strokeWeight?: number
  strokeOpacity?: number
}) {
  const map = useMap()
  const mapsLib = useMapsLibrary('maps')
  const { lat, lng } = center

  useEffect(() => {
    if (!map || !mapsLib) return
    const circle = new mapsLib.Circle({
      center: { lat, lng },
      radius: radiusMeters,
      strokeColor: color,
      strokeOpacity,
      strokeWeight,
      fillColor: color,
      fillOpacity,
      clickable: false,
      map,
    })
    return () => {
      circle.setMap(null)
    }
  }, [map, mapsLib, lat, lng, radiusMeters, color, fillOpacity, strokeWeight, strokeOpacity])

  return null
}

export function GmpPolygon({
  paths,
  color,
  fillOpacity = 0.24,
  strokeWeight = 1.5,
}: {
  paths: LatLngLiteral[]
  color: string
  fillOpacity?: number
  strokeWeight?: number
}) {
  const map = useMap()
  const mapsLib = useMapsLibrary('maps')

  useEffect(() => {
    if (!map || !mapsLib || paths.length < 3) return
    const polygon = new mapsLib.Polygon({
      paths,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight,
      fillColor: color,
      fillOpacity,
      clickable: false,
      map,
    })
    return () => {
      polygon.setMap(null)
    }
  }, [map, mapsLib, paths, color, fillOpacity, strokeWeight])

  return null
}

export function GmpPanTo({ target, zoom }: { target: LatLngLiteral | null; zoom?: number }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !target) return
    map.panTo(target)
    if (typeof zoom === 'number') {
      map.setZoom(zoom)
    }
  }, [map, target, zoom])

  return null
}

/**
 * Computes a road route via the modern Google Maps Routes API (`Route.computeRoutes`)
 * with automatic fallback to supplied street waypoints if Routes API is unavailable or rate-limited.
 */
interface GmpComputedRoutePoint {
  lat: number | (() => number)
  lng: number | (() => number)
}

interface GmpComputedRouteResponse {
  routes?: Array<{
    path?: GmpComputedRoutePoint[]
    distanceMeters?: number | null
    durationMillis?: number | null
  }>
}

export function useGmpComputedRoute({
  enabled,
  stops,
  fallbackPath,
}: {
  enabled: boolean
  stops: LatLngLiteral[]
  fallbackPath: LatLngLiteral[]
}) {
  const routesLib = useMapsLibrary('routes')
  const [computed, setComputed] = useState<{
    key: string
    path: LatLngLiteral[]
    distanceKm: number | null
    durationMin: number | null
  } | null>(null)

  const stopsKey = stops.map((s) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`).join('|')

  useEffect(() => {
    if (!enabled || !routesLib || stops.length < 2) return

    let cancelled = false
    const origin = stops[0]
    const destination = stops[stops.length - 1]
    const intermediates = stops.slice(1, -1).map((pt) => ({ location: pt }))

    routesLib.Route.computeRoutes({
      origin,
      destination,
      intermediates: intermediates.length > 0 ? intermediates : undefined,
      travelMode: routesLib.TravelMode.DRIVING,
      routingPreference: routesLib.RoutingPreference.TRAFFIC_AWARE,
      fields: ['path', 'distanceMeters', 'durationMillis'],
    })
      .then((res: GmpComputedRouteResponse) => {
        if (cancelled) return
        const primary = res.routes?.[0]
        if (primary?.path && primary.path.length >= 2) {
          const coords: LatLngLiteral[] = primary.path.map((p: GmpComputedRoutePoint) => ({
            lat: typeof p.lat === 'function' ? p.lat() : typeof p.lat === 'number' ? p.lat : 0,
            lng: typeof p.lng === 'function' ? p.lng() : typeof p.lng === 'number' ? p.lng : 0,
          }))
          setComputed({
            key: stopsKey,
            path: coords,
            distanceKm:
              typeof primary.distanceMeters === 'number'
                ? Number((primary.distanceMeters / 1000).toFixed(1))
                : null,
            durationMin:
              typeof primary.durationMillis === 'number'
                ? Math.max(1, Math.round(primary.durationMillis / 60000))
                : null,
          })
        }
      })
      .catch(() => {
        // Fallback smoothly to local corridor waypoints
      })

    return () => {
      cancelled = true
    }
  }, [enabled, routesLib, stopsKey, stops])

  const isLiveApi = Boolean(enabled && computed && computed.key === stopsKey && computed.path.length >= 2)

  return {
    path: isLiveApi && computed ? computed.path : fallbackPath,
    distanceKm: isLiveApi && computed ? computed.distanceKm : null,
    durationMin: isLiveApi && computed ? computed.durationMin : null,
    source: isLiveApi ? ('routes_api' as const) : ('corridor_model' as const),
  }
}
