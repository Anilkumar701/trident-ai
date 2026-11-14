/**
 * Metropolis-AI Geolocation Service
 * Native browser navigator.geolocation wrapper with high accuracy and Bengaluru operational fallback
 */

export interface GeoLocationState {
  lat: number
  lng: number
  accuracy: number
  city: string
  area: string
  status: 'prompt' | 'granted' | 'denied' | 'fallback'
  timestamp: number
  errorMessage?: string
}

// Bangalore default coordinate reference (Central Operations)
export const BENGALURU_DEFAULT_COORDS: GeoLocationState = {
  lat: 12.9716,
  lng: 77.5946,
  accuracy: 12.5,
  city: 'Bengaluru',
  area: 'Central Command Corridor (MG Road)',
  status: 'fallback',
  timestamp: Date.now(),
}

/**
 * Resolves local Bengaluru sector or general area from coordinates
 */
export function resolveUrbanSector(lat: number, lng: number): { city: string; area: string } {
  // Rough bounding checks for key Bangalore zones
  if (lat >= 12.91 && lat <= 12.93 && lng >= 77.61 && lng <= 77.64) {
    return { city: 'Bengaluru', area: 'Silk Board Junction / BTM Sector' }
  }
  if (lat >= 12.96 && lat <= 12.985 && lng >= 77.59 && lng <= 77.62) {
    return { city: 'Bengaluru', area: 'MG Road / Brigade Commercial Corridor' }
  }
  if (lat >= 12.97 && lat <= 12.99 && lng >= 77.56 && lng <= 77.585) {
    return { city: 'Bengaluru', area: 'Majestic Inter-City Transit Hub' }
  }
  if (lat >= 12.83 && lat <= 12.87 && lng >= 77.65 && lng <= 77.69) {
    return { city: 'Bengaluru', area: 'Electronic City Tech Cluster Phase 1' }
  }
  if (lat >= 12.92 && lat <= 12.95 && lng >= 77.61 && lng <= 77.65) {
    return { city: 'Bengaluru', area: 'Koramangala Urban Sector' }
  }
  if (lat >= 12.96 && lat <= 12.99 && lng >= 77.63 && lng <= 77.66) {
    return { city: 'Bengaluru', area: 'Indiranagar 100ft Metro Corridor' }
  }

  // Outside specific clusters, return generic city coordinate match
  return {
    city: 'Bengaluru Urban',
    area: `Sector Grid [${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E]`,
  }
}

/**
 * Requests browser native geolocation with fallback
 */
export function requestNativeLocation(
  onSuccess: (state: GeoLocationState) => void,
  onError?: (err: GeoLocationState) => void,
): void {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    const fallback = {
      ...BENGALURU_DEFAULT_COORDS,
      status: 'fallback' as const,
      timestamp: Date.now(),
      errorMessage: 'Geolocation API not supported in browser environment',
    }
    onSuccess(fallback)
    onError?.(fallback)
    return
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords
      const { city, area } = resolveUrbanSector(latitude, longitude)
      const state: GeoLocationState = {
        lat: Number(latitude.toFixed(6)),
        lng: Number(longitude.toFixed(6)),
        accuracy: Number(accuracy.toFixed(1)),
        city,
        area,
        status: 'granted',
        timestamp: position.timestamp || Date.now(),
      }
      onSuccess(state)
    },
    (err) => {
      const fallback: GeoLocationState = {
        ...BENGALURU_DEFAULT_COORDS,
        status: 'denied',
        timestamp: Date.now(),
        errorMessage: err.message || 'Permission denied or timeout',
      }
      onSuccess(fallback)
      onError?.(fallback)
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 15000,
    },
  )
}

/**
 * Continuous high-accuracy GPS trail for camera-tagged hazard capture.
 */
export function watchNativeLocation(
  onUpdate: (state: GeoLocationState) => void,
): () => void {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    onUpdate({
      ...BENGALURU_DEFAULT_COORDS,
      timestamp: Date.now(),
      errorMessage: 'Geolocation API not supported in browser environment',
    })
    return () => undefined
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords
      const { city, area } = resolveUrbanSector(latitude, longitude)
      onUpdate({
        lat: Number(latitude.toFixed(6)),
        lng: Number(longitude.toFixed(6)),
        accuracy: Number(accuracy.toFixed(1)),
        city,
        area,
        status: 'granted',
        timestamp: position.timestamp || Date.now(),
      })
    },
    (err) => {
      onUpdate({
        ...BENGALURU_DEFAULT_COORDS,
        status: 'denied',
        timestamp: Date.now(),
        errorMessage: err.message || 'Permission denied or timeout',
      })
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 4000,
    },
  )

  return () => navigator.geolocation.clearWatch(watchId)
}
