/**
 * Metropolis-AI Web Speech API Recognition Service
 * Native browser voice transcription wrapper for Citizen Complaint Engine
 */

export interface SpeechSessionHandlers {
  onTranscript: (text: string, isFinal: boolean) => void
  onStateChange: (isListening: boolean) => void
  onError: (errorMsg: string) => void
}

interface IWindowSpeech extends Window {
  webkitSpeechRecognition?: new () => ISpeechRecognition
  SpeechRecognition?: new () => ISpeechRecognition
}

interface ISpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult:
    | ((event: {
        resultIndex: number
        results: Array<{
          isFinal: boolean
          [index: number]: { transcript: string }
        }>
      }) => void)
    | null
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  const win = window as IWindowSpeech
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition)
}

export class SpeechRecognitionController {
  private recognition: ISpeechRecognition | null = null
  private isListening = false
  private handlers: SpeechSessionHandlers

  constructor(handlers: SpeechSessionHandlers) {
    this.handlers = handlers
    this.init()
  }

  private init() {
    if (typeof window === 'undefined') return
    const win = window as IWindowSpeech
    const RecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition

    if (!RecognitionClass) {
      return
    }

    try {
      this.recognition = new RecognitionClass()
      this.recognition.continuous = true
      this.recognition.interimResults = true
      this.recognition.lang = 'en-IN'

      this.recognition.onstart = () => {
        this.isListening = true
        this.handlers.onStateChange(true)
      }

      this.recognition.onend = () => {
        this.isListening = false
        this.handlers.onStateChange(false)
      }

      this.recognition.onerror = (event) => {
        this.isListening = false
        this.handlers.onStateChange(false)
        this.handlers.onError(`Audio engine notice: ${event.error}`)
      }

      this.recognition.onresult = (event) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i]
          if (item.isFinal) {
            finalTranscript += item[0].transcript
          } else {
            interimTranscript += item[0].transcript
          }
        }

        const combined = finalTranscript || interimTranscript
        if (combined.trim()) {
          this.handlers.onTranscript(combined, Boolean(finalTranscript))
        }
      }
    } catch (e) {
      this.recognition = null
      this.handlers.onError(e instanceof Error ? e.message : 'Speech initialization error')
    }
  }

  public start(): boolean {
    if (!this.recognition) {
      this.handlers.onError(
        'Speech recognition not supported in this browser environment. Use text input or microphone emulator.',
      )
      return false
    }

    if (this.isListening) return true

    try {
      this.recognition.start()
      return true
    } catch {
      this.handlers.onError('Microphone capture error. Retrying audio session...')
      return false
    }
  }

  public stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop()
      } catch {
        // Safe no-op
      }
    }
    this.isListening = false
    this.handlers.onStateChange(false)
  }

  public getStatus(): boolean {
    return this.isListening
  }
}
