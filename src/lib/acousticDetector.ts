export interface AcousticTelemetryFrame {
  levelPercent: number // 0 - 100 overall loudness
  peakHz: number // dominant frequency in Hz
  sirenScore: number // 0 - 100 energy concentration in 650 - 1450 Hz siren band
  spectrum: number[] // 16 normalized spectrum bars (0 - 100)
  classification: 'quiet' | 'ambient' | 'horn_spike' | 'siren_band'
}

export class AcousticDetector {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private timer: number | null = null
  private freqBins: Uint8Array<ArrayBuffer> | null = null
  private timeBins: Uint8Array<ArrayBuffer> | null = null

  async start(onFrame: (frame: AcousticTelemetryFrame) => void): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is not supported in this browser.')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.65
    source.connect(analyser)

    this.stream = stream
    this.ctx = ctx
    this.analyser = analyser
    this.freqBins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    this.timeBins = new Uint8Array(new ArrayBuffer(analyser.fftSize))

    this.timer = window.setInterval(() => {
      if (!this.analyser || !this.ctx || !this.freqBins || !this.timeBins) return
      this.analyser.getByteFrequencyData(this.freqBins)
      this.analyser.getByteTimeDomainData(this.timeBins)

      // Compute RMS loudness 0..100
      let sumSq = 0
      for (let i = 0; i < this.timeBins.length; i++) {
        const centered = (this.timeBins[i] - 128) / 128
        sumSq += centered * centered
      }
      const rms = Math.sqrt(sumSq / this.timeBins.length)
      const levelPercent = Math.min(100, Math.round(rms * 280))

      // Dominant frequency & siren band energy (650 Hz - 1450 Hz)
      const nyquist = this.ctx.sampleRate / 2
      const binHz = nyquist / this.freqBins.length
      let maxVal = 0
      let maxIdx = 0
      let sirenEnergy = 0
      let sirenBins = 0

      for (let i = 1; i < this.freqBins.length; i++) {
        const val = this.freqBins[i]
        const hz = i * binHz
        if (val > maxVal) {
          maxVal = val
          maxIdx = i
        }
        if (hz >= 650 && hz <= 1450) {
          sirenEnergy += val
          sirenBins += 1
        }
      }

      const peakHz = Math.round(maxIdx * binHz)
      const avgSiren = sirenBins > 0 ? sirenEnergy / sirenBins : 0
      const sirenScore = Math.min(100, Math.round((avgSiren / 180) * 100))

      // 16 spectrum bands spanning ~0 Hz to 3500 Hz
      const spectrum: number[] = []
      const maxBandBin = Math.min(this.freqBins.length, Math.round(3500 / binHz))
      const step = Math.max(1, Math.floor(maxBandBin / 16))
      for (let b = 0; b < 16; b++) {
        let peak = 0
        for (let k = b * step; k < (b + 1) * step && k < this.freqBins.length; k++) {
          if (this.freqBins[k] > peak) peak = this.freqBins[k]
        }
        spectrum.push(Math.round((peak / 255) * 100))
      }

      let classification: AcousticTelemetryFrame['classification'] = 'quiet'
      if (sirenScore >= 52 && peakHz >= 620 && peakHz <= 1550) {
        classification = 'siren_band'
      } else if (levelPercent >= 62) {
        classification = 'horn_spike'
      } else if (levelPercent >= 18) {
        classification = 'ambient'
      }

      onFrame({
        levelPercent,
        peakHz,
        sirenScore,
        spectrum,
        classification,
      })
    }, 120)
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.ctx) {
      void this.ctx.close().catch(() => {})
      this.ctx = null
    }
    this.analyser = null
    this.freqBins = null
    this.timeBins = null
  }
}
