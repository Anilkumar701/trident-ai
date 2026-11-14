import type { ClassCounts } from '../types'

export type VisionClass = keyof ClassCounts | 'ambulance'

export interface VisionBlob {
  x: number
  y: number
  width: number
  height: number
  area: number
  speedPx: number
  meanRed: number
  kind: VisionClass
}

export interface FrameVisionResult {
  counts: ClassCounts
  ambulanceDetected: boolean
  boxes: VisionBlob[]
  processedWidth: number
  processedHeight: number
}

const PROCESS_WIDTH = 320

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * India urban mix priors: two-wheelers dominate, then cars, then peds, then HCV.
 * Classifies motion blobs by footprint, aspect ratio and red-channel (ambulance/bus).
 */
export function classifyIndiaTrafficBlob(blob: {
  width: number
  height: number
  area: number
  speedPx: number
  meanRed: number
}): VisionClass {
  const aspect = blob.height / Math.max(1, blob.width)
  const area = blob.area
  const redHeavy = blob.meanRed > 145

  if (redHeavy && area > 2200 && blob.width > 40) {
    return 'ambulance'
  }

  if (aspect > 1.35 && area >= 70 && area <= 1100 && blob.speedPx < 14) {
    return 'pedestrians'
  }

  if (area >= 7000 || (blob.width > 90 && blob.height > 36)) {
    return 'trucks'
  }

  if (area >= 1600 && area < 7000) {
    return 'cars'
  }

  if (area >= 180 && (aspect < 1.45 || blob.speedPx >= 8)) {
    return 'bikes'
  }

  if (aspect > 1.2) return 'pedestrians'
  return 'bikes'
}

function collectBlobs(
  mask: Uint8Array,
  width: number,
  height: number,
  red: Uint8Array,
  motion: Uint8Array,
): VisionBlob[] {
  const seen = new Uint8Array(mask.length)
  const blobs: VisionBlob[] = []
  const dirs = [1, -1, width, -width]

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue
    const queue = [i]
    seen[i] = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let area = 0
    let redSum = 0
    let speedSum = 0

    while (queue.length) {
      const idx = queue.pop() as number
      const x = idx % width
      const y = (idx / width) | 0
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      area += 1
      redSum += red[idx]
      speedSum += motion[idx]
      for (const d of dirs) {
        const n = idx + d
        if (n < 0 || n >= mask.length || seen[n] || !mask[n]) continue
        if (d === 1 && x === width - 1) continue
        if (d === -1 && x === 0) continue
        seen[n] = 1
        queue.push(n)
      }
    }

    if (area < 70 || area > 18000) continue
    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    if (bw < 4 || bh < 4) continue
    const speedPx = speedSum / area
    const meanRed = redSum / area
    const kind = classifyIndiaTrafficBlob({
      width: bw,
      height: bh,
      area,
      speedPx,
      meanRed,
    })
    blobs.push({
      x: minX,
      y: minY,
      width: bw,
      height: bh,
      area,
      speedPx,
      meanRed,
      kind,
    })
  }

  return blobs.slice(0, 48)
}

export function analyzeFrame(
  current: ImageData,
  previous: ImageData | null,
): FrameVisionResult {
  const srcW = current.width
  const srcH = current.height
  const scale = PROCESS_WIDTH / Math.max(1, srcW)
  const width = PROCESS_WIDTH
  const height = Math.max(1, Math.round(srcH * scale))
  const mask = new Uint8Array(width * height)
  const red = new Uint8Array(width * height)
  const motion = new Uint8Array(width * height)

  const cur = current.data
  const prev = previous?.data
  const prevW = previous?.width ?? srcW
  const prevH = previous?.height ?? srcH

  for (let y = 0; y < height; y++) {
    const srcY = Math.min(srcH - 1, Math.round(y / scale))
    const prevY = Math.min(prevH - 1, Math.round((y / height) * prevH))
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(srcW - 1, Math.round(x / scale))
      const si = (srcY * srcW + srcX) * 4
      const r = cur[si] ?? 0
      const g = cur[si + 1] ?? 0
      const b = cur[si + 2] ?? 0
      const lum = luminance(r, g, b)
      let delta = 32
      if (prev) {
        const px = Math.min(prevW - 1, Math.round((x / width) * prevW))
        const pi = (prevY * prevW + px) * 4
        delta = Math.abs(lum - luminance(prev[pi] ?? 0, prev[pi + 1] ?? 0, prev[pi + 2] ?? 0))
      }
      const idx = y * width + x
      red[idx] = r
      motion[idx] = Math.min(255, delta)
      // Road-scene objects: motion OR strongly saturated vehicle colors (yellow auto, red bus)
      const colorful = Math.max(r, g, b) - Math.min(r, g, b) > 48
      mask[idx] = delta > 22 || (colorful && lum > 40 && lum < 220) ? 1 : 0
    }
  }

  const boxes = collectBlobs(mask, width, height, red, motion)
  const counts: ClassCounts = { cars: 0, bikes: 0, trucks: 0, pedestrians: 0 }
  let ambulanceDetected = false
  for (const box of boxes) {
    if (box.kind === 'ambulance') {
      ambulanceDetected = true
      counts.cars += 1
    } else {
      counts[box.kind] += 1
    }
  }

  return {
    counts,
    ambulanceDetected,
    boxes,
    processedWidth: width,
    processedHeight: height,
  }
}

export function emptyVisionResult(): FrameVisionResult {
  return {
    counts: { cars: 0, bikes: 0, trucks: 0, pedestrians: 0 },
    ambulanceDetected: false,
    boxes: [],
    processedWidth: PROCESS_WIDTH,
    processedHeight: 180,
  }
}
