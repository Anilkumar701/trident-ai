/**
 * Metropolis-AI Audio Service
 * HTML5 Web Audio API implementation of repeating 800Hz Emergency Buzzer
 */

class EmergencyBuzzerAudio {
  private ctx: AudioContext | null = null
  private osc: OscillatorNode | null = null
  private lfo: OscillatorNode | null = null
  private lfoGain: GainNode | null = null
  private masterGain: GainNode | null = null
  private isPlaying = false

  private initContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // Resume requires user interaction in modern browsers
      })
    }
  }

  public startBuzzer(frequency = 800) {
    if (this.isPlaying) return

    try {
      this.initContext()
      if (!this.ctx) return

      // Create primary carrier oscillator at 800Hz
      this.osc = this.ctx.createOscillator()
      this.osc.type = 'sawtooth' // Piercing emergency siren acoustic
      this.osc.frequency.setValueAtTime(frequency, this.ctx.currentTime)

      // Create master gain control
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(0.18, this.ctx.currentTime)

      // Low-Frequency Oscillator (LFO) for 4Hz pulsating emergency beep cycle
      this.lfo = this.ctx.createOscillator()
      this.lfo.type = 'square'
      this.lfo.frequency.setValueAtTime(4, this.ctx.currentTime) // 4 beeps per second

      this.lfoGain = this.ctx.createGain()
      this.lfoGain.gain.setValueAtTime(0.18, this.ctx.currentTime)

      // Modulate master gain with LFO
      this.lfo.connect(this.masterGain.gain)

      // Connect carrier oscillator through master gain to audio destination
      this.osc.connect(this.masterGain)
      this.masterGain.connect(this.ctx.destination)

      this.osc.start()
      this.lfo.start()
      this.isPlaying = true
    } catch {
      // Audio playback fails gracefully if browser audio is locked
      this.isPlaying = false
    }
  }

  public stopBuzzer() {
    if (!this.isPlaying) return

    try {
      if (this.osc) {
        this.osc.stop()
        this.osc.disconnect()
        this.osc = null
      }
      if (this.lfo) {
        this.lfo.stop()
        this.lfo.disconnect()
        this.lfo = null
      }
      if (this.masterGain) {
        this.masterGain.disconnect()
        this.masterGain = null
      }
    } catch {
      // No-op
    } finally {
      this.isPlaying = false
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying
  }
}

export const emergencyBuzzer = new EmergencyBuzzerAudio()
