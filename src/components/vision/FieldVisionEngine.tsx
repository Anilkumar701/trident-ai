import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  Camera,
  Crosshair,
  FlipHorizontal2,
  Image as ImageIcon,
  MapPin,
  Radio,
  Siren,
  Square,
  Upload,
  Video,
} from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import { analyzeFrame, emptyVisionResult, type VisionBlob } from '../../lib/indiaVision'
import { detectYoloFile, detectYoloFrame, pingYolo, toVisionBoxes } from '../../lib/yoloClient'
import { watchNativeLocation } from '../../lib/geolocation'
import type { IntersectionKey } from '../../lib/metropolisLogic'
import type { CitizenHazardCategory } from '../../lib/metropolisLogic'

const DESTINATIONS: IntersectionKey[] = ['MG Road', 'Silk Board', 'Majestic', 'Electronic City']

export function FieldVisionEngine() {
  const {
    geoLocation,
    ingestLiveVision,
    setLiveVisionLocked,
    submitHazardReport,
    planEmergencyTrack,
    emergencyTrack,
    visionStream,
    simulateSirenEvent,
    clearSirenEvent,
  } = useDashboard()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const processRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const prevFrameRef = useRef<ImageData | null>(null)
  const rafRef = useRef(0)
  const lastInferRef = useRef(0)
  const fpsWindowRef = useRef<number[]>([])
  const boxesRef = useRef<VisionBlob[]>([])
  const processedSizeRef = useRef({ w: 320, h: 180 })
  const ingestRef = useRef(ingestLiveVision)
  ingestRef.current = ingestLiveVision

  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [sourceLabel, setSourceLabel] = useState('Idle')
  const [dest, setDest] = useState<IntersectionKey>('Majestic')
  const [hazardKind, setHazardKind] = useState<CitizenHazardCategory>('Pothole')
  const [lastTag, setLastTag] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const imageRef = useRef<HTMLInputElement | null>(null)
  const yoloReadyRef = useRef(false)
  const yoloBusyRef = useRef(false)
  const [yoloReady, setYoloReady] = useState(false)
  const [stillImage, setStillImage] = useState<string | null>(null)
  const [videoSummary, setVideoSummary] = useState<string | null>(null)
  const [correctMirror, setCorrectMirror] = useState(true)
  const correctMirrorRef = useRef(true)
  const stillImageRef = useRef<string | null>(null)
  correctMirrorRef.current = correctMirror
  stillImageRef.current = stillImage

  const stopStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    prevFrameRef.current = null
    setCameraOn(false)
    setLiveVisionLocked(false)
    setSourceLabel('Idle')
    setStillImage(null)
    setVideoSummary(null)
  }, [setLiveVisionLocked])

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    const host = canvas?.parentElement
    if (!canvas || !host) return
    const w = host.clientWidth || canvas.clientWidth
    const h = host.clientHeight || canvas.clientHeight
    if (w < 8 || h < 8) return
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    const video = videoRef.current
    const vw = video && video.videoWidth > 8 ? video.videoWidth : processedSizeRef.current.w
    const vh = video && video.videoHeight > 8 ? video.videoHeight : processedSizeRef.current.h
    const contain = Math.min(w / vw, h / vh)
    const dw = vw * contain
    const dh = vh * contain
    const ox = (w - dw) / 2
    const oy = (h - dh) / 2
    const sx = dw / processedSizeRef.current.w
    const sy = dh / processedSizeRef.current.h
    const colors: Record<string, string> = {
      cars: '#22d3ee',
      bikes: '#fbbf24',
      trucks: '#a78bfa',
      pedestrians: '#fb7185',
      ambulance: '#f43f5e',
    }
    for (const box of boxesRef.current) {
      ctx.strokeStyle = colors[box.kind] || '#34d399'
      ctx.lineWidth = 2
      const bw = box.width * sx
      const bh = box.height * sy
      let left = ox + box.x * sx
      const top = oy + box.y * sy
      if (correctMirrorRef.current && !stillImageRef.current) {
        left = w - left - bw
      }
      ctx.strokeRect(left, top, bw, bh)
      ctx.fillStyle = colors[box.kind] || '#34d399'
      ctx.font = '11px IBM Plex Mono, monospace'
      ctx.fillText(box.kind.toUpperCase(), left, Math.max(oy + 12, top - 4))
    }
  }, [])

  const runLocalFrame = useCallback((video: HTMLVideoElement, proc: HTMLCanvasElement, ts: number) => {
    const t0 = performance.now()
    const ctx = proc.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const pw = 320
    const ph = Math.max(1, Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * pw))
    if (proc.width !== pw) proc.width = pw
    if (proc.height !== ph) proc.height = ph
    ctx.drawImage(video, 0, 0, pw, ph)
    const frame = ctx.getImageData(0, 0, pw, ph)
    const result = analyzeFrame(frame, prevFrameRef.current)
    prevFrameRef.current = frame
    boxesRef.current = result.boxes
    processedSizeRef.current = { w: result.processedWidth, h: result.processedHeight }
    const dt = performance.now() - t0
    fpsWindowRef.current.push(1000 / Math.max(8, ts - lastInferRef.current))
    if (fpsWindowRef.current.length > 12) fpsWindowRef.current.shift()
    const fps = fpsWindowRef.current.reduce((a, b) => a + b, 0) / Math.max(1, fpsWindowRef.current.length)
    ingestRef.current({
      fps: Number(Math.min(50, Math.max(8, fps)).toFixed(1)),
      inferenceLatencyMs: Number(dt.toFixed(1)),
      counts: result.counts,
      ambulanceDetected: result.ambulanceDetected,
    })
  }, [])

  const runYoloFrame = useCallback(async (video: HTMLVideoElement, proc: HTMLCanvasElement) => {
    if (yoloBusyRef.current) return
    yoloBusyRef.current = true
    try {
      const ctx = proc.getContext('2d')
      if (!ctx || video.videoWidth < 8) return
      const pw = Math.min(640, video.videoWidth)
      const ph = Math.max(1, Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * pw))
      proc.width = pw
      proc.height = ph
      ctx.drawImage(video, 0, 0, pw, ph)
      const blob = await new Promise<Blob | null>((resolve) => proc.toBlob(resolve, 'image/jpeg', 0.72))
      if (!blob) return
      const data = await detectYoloFrame(blob)
      if (!data) {
        yoloReadyRef.current = false
        setYoloReady(false)
        return
      }
      boxesRef.current = toVisionBoxes(data.boxes)
      processedSizeRef.current = { w: data.width || pw, h: data.height || ph }
      ingestRef.current({
        fps: data.fps || 12,
        inferenceLatencyMs: data.inferenceLatencyMs || 0,
        counts: data.counts,
        ambulanceDetected: data.ambulanceDetected,
      })
    } finally {
      yoloBusyRef.current = false
    }
  }, [])

  const tick = useCallback(
    (ts: number) => {
      const video = videoRef.current
      const proc = processRef.current
      if (!video || !proc || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      if (ts - lastInferRef.current >= (yoloReadyRef.current ? 160 : 80)) {
        if (yoloReadyRef.current) {
          void runYoloFrame(video, proc)
        } else {
          runLocalFrame(video, proc, ts)
        }
        lastInferRef.current = ts
      }

      drawOverlay()
      rafRef.current = requestAnimationFrame(tick)
    },
    [drawOverlay, runLocalFrame, runYoloFrame],
  )

  const startCamera = useCallback(async () => {
    setCameraError(null)
    stopStream()
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API is not available in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCorrectMirror(true)
      setCameraOn(true)
      setLiveVisionLocked(true)
      setSourceLabel(yoloReadyRef.current ? 'Live camera · YOLOv11n' : 'Live camera · GPS tagged')
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      try {
        const fallback = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        streamRef.current = fallback
        if (videoRef.current) {
          videoRef.current.srcObject = fallback
          await videoRef.current.play()
        }
        setCorrectMirror(true)
        setCameraOn(true)
        setLiveVisionLocked(true)
        setSourceLabel(yoloReadyRef.current ? 'Live camera · YOLOv11n' : 'Live camera · GPS tagged')
        rafRef.current = requestAnimationFrame(tick)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Permission denied'
        setCameraError(`Camera error: ${msg}. You can still load a traffic video file.`)
        ingestLiveVision({
          fps: 0,
          inferenceLatencyMs: 0,
          counts: emptyVisionResult().counts,
          ambulanceDetected: false,
        })
      }
    }
  }, [ingestLiveVision, setLiveVisionLocked, stopStream, tick])

  const applyYoloResult = useCallback(
    (data: NonNullable<Awaited<ReturnType<typeof detectYoloFile>>>, label: string) => {
      boxesRef.current = toVisionBoxes(data.boxes)
      processedSizeRef.current = { w: data.width || 640, h: data.height || 360 }
      ingestRef.current({
        fps: data.fps || 8,
        inferenceLatencyMs: data.inferenceLatencyMs || 0,
        counts: data.counts,
        ambulanceDetected: data.ambulanceDetected,
      })
      const total =
        data.counts.cars + data.counts.bikes + data.counts.trucks + data.counts.pedestrians
      setVideoSummary(
        `YOLOv11n · ${total} objects · cars ${data.counts.cars} · bikes ${data.counts.bikes} · trucks ${data.counts.trucks} · peds ${data.counts.pedestrians}`,
      )
      setSourceLabel(label)
      if (label.startsWith('YOLO image') && data.annotatedJpeg) {
        setStillImage(`data:image/jpeg;base64,${data.annotatedJpeg}`)
      }
    },
    [],
  )

  const onVideoFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      stopStream()
      const url = URL.createObjectURL(file)
      if (videoRef.current) {
        videoRef.current.srcObject = null
        videoRef.current.src = url
        videoRef.current.loop = true
        void videoRef.current.play()
      }
      setCameraOn(true)
      setLiveVisionLocked(true)
      setCorrectMirror(false)
      setSourceLabel(`Video file · ${file.name}`)
      rafRef.current = requestAnimationFrame(tick)
      if (yoloReadyRef.current) {
        setVideoSummary('YOLOv11n scanning video…')
        void detectYoloFile(file, 'video').then((data) => {
          if (data) applyYoloResult(data, `YOLO video · ${file.name}`)
        })
      }
      e.target.value = ''
    },
    [applyYoloResult, setLiveVisionLocked, stopStream, tick],
  )

  const onImageFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      stopStream()
      setLiveVisionLocked(true)
      setSourceLabel(`Image · ${file.name}`)
      const localUrl = URL.createObjectURL(file)
      setStillImage(localUrl)
      if (yoloReadyRef.current) {
        setVideoSummary('YOLOv11n scanning image…')
        const data = await detectYoloFile(file, 'image')
        if (data) applyYoloResult(data, `YOLO image · ${file.name}`)
        else setCameraError('YOLO image detect failed. Is the YOLO service running?')
      } else {
        setCameraError('YOLO service is offline. Start the site with npm run dev so yolo_service.py boots.')
      }
      e.target.value = ''
    },
    [applyYoloResult, setLiveVisionLocked, stopStream],
  )

  useEffect(() => {
    let cancelled = false
    const ping = async () => {
      const ok = await pingYolo()
      if (cancelled) return
      yoloReadyRef.current = ok
      setYoloReady(ok)
    }
    void ping()
    const id = window.setInterval(() => void ping(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (!cameraOn) return
    return watchNativeLocation(() => {
      /* Dashboard already watches; this keeps permission warm while tagging. */
    })
  }, [cameraOn])

  useEffect(() => () => stopStream(), [stopStream])

  const tagHazard = useCallback(() => {
    const video = videoRef.current
    const proc = processRef.current
    let thumbnail = '/hazards/pothole.svg'
    if (video && proc) {
      const ctx = proc.getContext('2d')
      if (ctx && video.readyState >= 2) {
        proc.width = Math.min(480, video.videoWidth || 320)
        proc.height = Math.round(proc.width * (video.videoHeight / Math.max(1, video.videoWidth)))
        ctx.drawImage(video, 0, 0, proc.width, proc.height)
        try {
          thumbnail = proc.toDataURL('image/jpeg', 0.7)
        } catch {
          thumbnail = '/hazards/pothole.svg'
        }
      }
    }
    const lat = geoLocation.lat
    const lng = geoLocation.lng
    submitHazardReport({
      issue: hazardKind,
      severity: hazardKind === 'Open Manhole' || hazardKind === 'Pothole' ? 'Critical' : 'Medium',
      location: `${geoLocation.area} · ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E ±${geoLocation.accuracy}m`,
      notes: `GPS-tagged field capture (${sourceLabel}). Native geolocation lock: ${geoLocation.status}.`,
      imageThumbnail: thumbnail.startsWith('data:') ? thumbnail : thumbnail,
      gpsCoords: { lat, lng },
    })
    setLastTag(`${hazardKind} pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
  }, [geoLocation, hazardKind, sourceLabel, submitHazardReport])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Radio className="h-4 w-4 text-cyan-400" />
            YOLOV11N CAMERA · IMAGE/VIDEO COUNT · GPS TAG
          </h3>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            {sourceLabel} · {geoLocation.area} · {geoLocation.lat.toFixed(5)}°N {geoLocation.lng.toFixed(5)}°E
            · ±{geoLocation.accuracy}m · {visionStream.fps} FPS · {visionStream.inferenceLatencyMs} ms
            · {yoloReady ? 'YOLOv11n ONLINE' : 'YOLO OFFLINE (local CV fallback)'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!cameraOn ? (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/50"
            >
              <Camera className="h-3.5 w-3.5" />
              Enable camera
            </button>
          ) : (
            <button
              type="button"
              onClick={stopStream}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-900/50"
            >
              <Square className="h-3.5 w-3.5" />
              Stop feed
            </button>
          )}
          <button
            type="button"
            onClick={() => setCorrectMirror((on) => !on)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              correctMirror
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
                : 'border-slate-700 bg-slate-800 text-slate-300'
            }`}
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" />
            Mirror fix: {correctMirror ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => imageRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Detect image
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <Upload className="h-3.5 w-3.5" />
            Detect video
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={onVideoFile}
          />
          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(ev) => void onImageFile(ev)}
          />
        </div>
      </div>

      {cameraError ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          {cameraError}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-black">
          <div
            className="relative h-[280px] w-full"
            style={correctMirror && !stillImage ? { transform: 'scaleX(-1)' } : undefined}
          >
          <video
            ref={videoRef}
            className={`h-[280px] w-full bg-black object-contain ${stillImage ? 'hidden' : ''}`}
            playsInline
            muted
            autoPlay
          />
          {stillImage ? (
            <img src={stillImage} alt="YOLO annotated capture" className="h-[280px] w-full object-contain" />
          ) : null}
          </div>
          <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          <canvas ref={processRef} className="hidden" />
          <div className="absolute left-2 top-2 rounded border border-emerald-500/40 bg-slate-950/80 px-2 py-1 font-mono text-[10px] text-emerald-300">
            <Video className="mr-1 inline h-3 w-3" />
            {yoloReady ? 'YOLOv11n' : 'LOCAL CV'} · {cameraOn || stillImage ? 'LIVE' : 'STANDBY'}
          </div>
          <div className="absolute right-2 top-2 rounded border border-cyan-500/40 bg-slate-950/80 px-2 py-1 font-mono text-[10px] text-cyan-300">
            <MapPin className="mr-1 inline h-3 w-3" />
            GPS {geoLocation.status.toUpperCase()}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <CountCard label="Cars / autos" value={visionStream.activeCars} tone="cyan" />
            <CountCard label="Two-wheelers" value={visionStream.activeBikes} tone="amber" />
            <CountCard label="Trucks / buses" value={visionStream.activeTrucks} tone="violet" />
            <CountCard label="Pedestrians" value={visionStream.pedestrianCount} tone="rose" />
          </div>
          {videoSummary ? (
            <p className="rounded border border-cyan-500/20 bg-cyan-950/30 px-2 py-1.5 font-mono text-[10px] text-cyan-200">
              {videoSummary}
            </p>
          ) : null}

          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
            <p className="font-mono text-[10px] tracking-wider text-slate-400">GPS TAG HAZARD</p>
            <div className="flex flex-wrap gap-2">
              {(['Pothole', 'Open Manhole', 'Broken Streetlight', 'Blocked Drainage'] as CitizenHazardCategory[]).map(
                (kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setHazardKind(kind)}
                    className={`rounded border px-2 py-1 font-mono text-[10px] ${
                      hazardKind === kind
                        ? 'border-amber-400/50 bg-amber-950/50 text-amber-200'
                        : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    {kind}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              onClick={tagHazard}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-900/50"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Tag current GPS + frame
            </button>
            {lastTag ? <p className="font-mono text-[10px] text-emerald-400">{lastTag}</p> : null}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
            <p className="font-mono text-[10px] tracking-wider text-slate-400">108 EMERGENCY SHORTEST TRACK</p>
            <select
              value={dest}
              onChange={(e) => setDest(e.target.value as IntersectionKey)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
            >
              {DESTINATIONS.map((d) => (
                <option key={d} value={d}>
                  Hospital corridor → {d}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => planEmergencyTrack(dest)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-900/50"
            >
              <Siren className="h-3.5 w-3.5" />
              Open green-wave shortest path
            </button>
            {emergencyTrack ? (
              <p className="font-mono text-[10px] text-rose-200">
                {emergencyTrack.nodes.join(' → ')} · {emergencyTrack.distanceKm} km · ETA {emergencyTrack.etaMin} min
              </p>
            ) : null}
            {visionStream.ambulancePresent ? (
              <button
                type="button"
                onClick={clearSirenEvent}
                className="w-full rounded border border-slate-700 px-2 py-1 font-mono text-[10px] text-slate-300"
              >
                Clear corridor
              </button>
            ) : (
              <button
                type="button"
                onClick={() => simulateSirenEvent(dest)}
                className="w-full rounded border border-slate-700 px-2 py-1 font-mono text-[10px] text-slate-400"
              >
                Manual 108 inbound at {dest}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CountCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'cyan' | 'amber' | 'violet' | 'rose'
}) {
  const tones = {
    cyan: 'text-cyan-300 border-cyan-500/20',
    amber: 'text-amber-300 border-amber-500/20',
    violet: 'text-violet-300 border-violet-500/20',
    rose: 'text-rose-300 border-rose-500/20',
  }
  return (
    <div className={`rounded-lg border bg-slate-950/80 px-3 py-2 ${tones[tone]}`}>
      <p className="font-mono text-[10px] text-slate-500">{label}</p>
      <p className="font-mono text-xl font-bold">{value}</p>
    </div>
  )
}
