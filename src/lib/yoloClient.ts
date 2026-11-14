import type { ClassCounts } from '../types'
import type { VisionBlob } from './indiaVision'

export interface YoloBoxPayload {
  x: number
  y: number
  width: number
  height: number
  area?: number
  speedPx?: number
  meanRed?: number
  kind: string
  label?: string
  confidence?: number
}

export interface YoloDetectResponse {
  counts: ClassCounts
  boxes: YoloBoxPayload[]
  width: number
  height: number
  ambulanceDetected: boolean
  detections: number
  inferenceLatencyMs: number
  fps: number
  engine?: string
  annotatedJpeg?: string
  sampledFrames?: number
  error?: string
}

function kindFrom(box: YoloBoxPayload): VisionBlob['kind'] {
  const raw = (box.kind || box.label || '').toLowerCase()
  if (raw === 'pedestrians' || raw === 'person') return 'pedestrians'
  if (raw === 'bikes' || raw === 'bicycle' || raw === 'motorcycle') return 'bikes'
  if (raw === 'trucks' || raw === 'bus' || raw === 'truck' || raw === 'train') return 'trucks'
  if (raw === 'ambulance') return 'ambulance'
  return 'cars'
}

export function toVisionBoxes(boxes: YoloBoxPayload[]): VisionBlob[] {
  return boxes.map((box) => ({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    area: box.area ?? box.width * box.height,
    speedPx: box.speedPx ?? 0,
    meanRed: box.meanRed ?? 0,
    kind: kindFrom(box),
  }))
}

export async function pingYolo(): Promise<boolean> {
  try {
    const res = await fetch('/api/yolo/health', { method: 'GET' })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: boolean }
    return Boolean(data.ok)
  } catch {
    return false
  }
}

export async function detectYoloFrame(blob: Blob): Promise<YoloDetectResponse | null> {
  try {
    const res = await fetch('/api/yolo/detect/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    })
    if (!res.ok) return null
    return (await res.json()) as YoloDetectResponse
  } catch {
    return null
  }
}

export async function detectYoloFile(
  file: File,
  kind: 'image' | 'video',
): Promise<YoloDetectResponse | null> {
  const body = new FormData()
  body.append('file', file)
  try {
    const res = await fetch(`/api/yolo/detect/${kind}`, { method: 'POST', body })
    if (!res.ok) return null
    return (await res.json()) as YoloDetectResponse
  } catch {
    return null
  }
}
