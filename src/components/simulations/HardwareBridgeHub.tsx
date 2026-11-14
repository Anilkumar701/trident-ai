import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  Camera,
  Check,
  Copy,
  Cpu,
  Flame,
  Hand,
  Mic,
  MicOff,
  RotateCcw,
  Siren,
  Usb,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDashboard } from '../../context/DashboardContext'
import { ARDUINO_UNO_SKETCH } from '../../lib/arduinoSerial'
import { FieldVisionEngine } from '../vision/FieldVisionEngine'

interface GasPoint {
  t: string
  gasPct: number
  gasRaw: number
}

const PIN_WIRING = [
  { part: 'MQ-2 / MQ-135 Gas Sensor', pin: 'AO → A0 · VCC → 5V · GND → GND', role: 'Waste toxic fume / gas leak trigger' },
  { part: 'TTP223 Touch Sensor', pin: 'SIG → D2 · VCC → 5V · GND → GND', role: 'Pedestrian +15s / Emergency SOS' },
  { part: 'Piezo Buzzer', pin: '(+) → D8 · (–) → GND', role: 'Audio siren & gas hazard alarm' },
  { part: 'Red LED (+220Ω)', pin: 'Anode → D9 · Cathode → GND', role: 'Halt / Gas / Crosswalk Red Phase' },
  { part: 'Yellow LED (+220Ω)', pin: 'Anode → D10 · Cathode → GND', role: 'Phase transition caution light' },
  { part: 'Green LED (+220Ω)', pin: 'Anode → D11 · Cathode → GND', role: 'Clear corridor / Emergency Green Wave' },
]

export function HardwareBridgeHub() {
  const {
    hardwareBridge,
    connectArduino,
    disconnectArduino,
    setHardwareLed,
    setAutoSyncLed,
    setHardwareBuzzer,
    setBuzzerMuted,
    setGasThreshold,
    setTouchMode,
    startSoundDetector,
    stopSoundDetector,
    setSoundThreshold,
    injectSimulatedHardwareEvent,
  } = useDashboard()

  const [showSketch, setShowSketch] = useState(false)
  const [showWebcam, setShowWebcam] = useState(true)
  const [copiedSketch, setCopiedSketch] = useState(false)

  const [gasSeries, setGasSeries] = useState<GasPoint[]>(() => [
    { t: '00:00', gasPct: hardwareBridge.gasPercent, gasRaw: hardwareBridge.gasRaw },
  ])
  const latestGasRef = useRef({ pct: hardwareBridge.gasPercent, raw: hardwareBridge.gasRaw })
  useEffect(() => {
    latestGasRef.current = { pct: hardwareBridge.gasPercent, raw: hardwareBridge.gasRaw }
  }, [hardwareBridge.gasPercent, hardwareBridge.gasRaw])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const snap = latestGasRef.current
      const label = new Date().toLocaleTimeString('en-IN', {
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      setGasSeries((prev) => [
        ...prev.slice(-23),
        { t: label, gasPct: snap.pct, gasRaw: snap.raw },
      ])
    }, 650)
    return () => window.clearInterval(timer)
  }, [])

  const handleCopySketch = async () => {
    try {
      await navigator.clipboard.writeText(ARDUINO_UNO_SKETCH)
      setCopiedSketch(true)
      window.setTimeout(() => setCopiedSketch(false), 2000)
    } catch {
      setShowSketch(true)
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Hardware Control & Connection Header */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/85 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/60 text-cyan-400 shrink-0">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  PHYSICAL HARDWARE BRIDGE · ARDUINO UNO + LAPTOP CAM &amp; SOUND
                </span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                    hardwareBridge.arduinoConnected
                      ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  {hardwareBridge.arduinoConnected ? 'USB CONNECTED' : 'USB STANDBY'}
                </span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                    hardwareBridge.micActive
                      ? 'border-cyan-500/50 bg-cyan-950/60 text-cyan-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  {hardwareBridge.micActive ? 'MIC LISTENING' : 'MIC IDLE'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Direct USB Web Serial (9600 baud) for MQ Gas + Touch Sensor + 3-Color LEDs + Buzzer, paired with Laptop Camera &amp; Mic Sound Detection.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!hardwareBridge.arduinoConnected ? (
              <button
                type="button"
                onClick={() => void connectArduino()}
                disabled={!hardwareBridge.serialSupported || hardwareBridge.arduinoConnecting}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-2 font-mono text-xs font-semibold text-white transition whitespace-nowrap"
              >
                <Usb className="h-3.5 w-3.5" />
                {hardwareBridge.arduinoConnecting
                  ? 'Opening USB...'
                  : hardwareBridge.serialSupported
                    ? 'Connect Arduino Uno (USB)'
                    : 'Use Chrome/Edge for USB'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void disconnectArduino()}
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-950/50 hover:bg-rose-900/60 px-3.5 py-2 font-mono text-xs font-semibold text-rose-200 transition whitespace-nowrap"
              >
                <Usb className="h-3.5 w-3.5" />
                Disconnect USB
              </button>
            )}

            {!hardwareBridge.micActive ? (
              <button
                type="button"
                onClick={() => void startSoundDetector()}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/50 bg-cyan-950/50 hover:bg-cyan-900/60 px-3.5 py-2 font-mono text-xs font-semibold text-cyan-200 transition whitespace-nowrap"
              >
                <Mic className="h-3.5 w-3.5" />
                Start Mic Sound Detector
              </button>
            ) : (
              <button
                type="button"
                onClick={stopSoundDetector}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-950/50 hover:bg-amber-900/60 px-3.5 py-2 font-mono text-xs font-semibold text-amber-200 transition whitespace-nowrap"
              >
                <MicOff className="h-3.5 w-3.5" />
                Stop Mic
              </button>
            )}

            <button
              type="button"
              onClick={() => setBuzzerMuted(!hardwareBridge.buzzerMuted)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-xs font-semibold transition whitespace-nowrap ${
                hardwareBridge.buzzerMuted
                  ? 'border-amber-500/50 bg-amber-950/50 text-amber-200'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {hardwareBridge.buzzerMuted ? (
                <>
                  <VolumeX className="h-3.5 w-3.5" /> Buzzer Muted
                </>
              ) : (
                <>
                  <Volume2 className="h-3.5 w-3.5" /> Buzzer Armed
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error notice if USB / Mic permission rejected */}
        {hardwareBridge.errorMessage && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 font-mono text-xs text-amber-200">
            {hardwareBridge.errorMessage}
          </div>
        )}

        {/* Quick Hardware Test Triggers (work both with & without Arduino plugged in) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-slate-500 uppercase">
              Dry-Run Showcase Triggers:
            </span>
            <button
              type="button"
              onClick={() => injectSimulatedHardwareEvent('gas_spike')}
              className="rounded-lg border border-rose-500/40 bg-rose-950/35 px-2.5 py-1 font-mono text-xs text-rose-200 hover:bg-rose-900/45 transition"
            >
              Test Gas Spike (80%)
            </button>
            <button
              type="button"
              onClick={() => injectSimulatedHardwareEvent('touch_press')}
              className="rounded-lg border border-amber-500/40 bg-amber-950/35 px-2.5 py-1 font-mono text-xs text-amber-200 hover:bg-amber-900/45 transition"
            >
              Test Touch Sensor
            </button>
            <button
              type="button"
              onClick={() => injectSimulatedHardwareEvent('sound_siren')}
              className="rounded-lg border border-cyan-500/40 bg-cyan-950/35 px-2.5 py-1 font-mono text-xs text-cyan-200 hover:bg-cyan-900/45 transition"
            >
              Test Siren Sound (880 Hz)
            </button>
            <button
              type="button"
              onClick={() => injectSimulatedHardwareEvent('reset')}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-xs text-slate-300 hover:bg-slate-700 transition"
            >
              <RotateCcw className="h-3 w-3" /> Reset All
            </button>
          </div>
          <code className="font-mono text-[11px] text-emerald-300 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            RX: {hardwareBridge.lastPacketRaw}
          </code>
        </div>
      </div>

      {/* Live Arduino Uno + Laptop Hardware Digital Twin SVG */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
            LIVE PHYSICAL-DIGITAL TWIN SCHEMATIC
          </h3>
          <span className="font-mono text-[11px] text-slate-400">
            Active Port: <strong className="text-cyan-300">{hardwareBridge.portLabel}</strong>
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
          <svg
            viewBox="0 0 760 205"
            className="w-full h-52 block"
            role="img"
            aria-label="Arduino Uno sensors and LEDs schematic twin"
          >
            {/* Connecting Signal Traces */}
            <line x1="150" y1="62" x2="290" y2="90" stroke={hardwareBridge.gasAlertActive ? '#f43f5e' : '#38bdf8'} strokeWidth="2" />
            <line x1="150" y1="145" x2="290" y2="122" stroke={hardwareBridge.touchActive ? '#f59e0b' : '#475569'} strokeWidth="2" />
            <line x1="470" y1="90" x2="600" y2="62" stroke="#10b981" strokeWidth="2" />
            <line x1="470" y1="125" x2="600" y2="145" stroke={hardwareBridge.buzzerOn ? '#f43f5e' : '#475569'} strokeWidth="2" />

            {/* Input 1: MQ Gas Sensor (A0) */}
            <g transform="translate(22, 32)">
              <rect
                width="132"
                height="58"
                rx="8"
                fill="#0f172a"
                stroke={hardwareBridge.gasAlertActive ? '#f43f5e' : '#38bdf8'}
                strokeWidth="2"
              />
              <text x="12" y="21" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                MQ GAS SENSOR (A0)
              </text>
              <text
                x="12"
                y="43"
                fill={hardwareBridge.gasAlertActive ? '#fb7185' : '#34d399'}
                fontSize="16"
                fontFamily="monospace"
                fontWeight="700"
              >
                {hardwareBridge.gasPercent}% ({hardwareBridge.gasRaw})
              </text>
            </g>

            {/* Input 2: Touch Sensor (D2) */}
            <g transform="translate(22, 115)">
              <rect
                width="132"
                height="58"
                rx="8"
                fill="#0f172a"
                stroke={hardwareBridge.touchActive ? '#f59e0b' : '#475569'}
                strokeWidth="2"
              />
              <text x="12" y="21" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                TOUCH SENSOR (D2)
              </text>
              <text
                x="12"
                y="43"
                fill={hardwareBridge.touchActive ? '#fbbf24' : '#e2e8f0'}
                fontSize="14"
                fontFamily="monospace"
                fontWeight="700"
              >
                {hardwareBridge.touchActive ? 'PRESSED' : `IDLE (${hardwareBridge.touchCount})`}
              </text>
            </g>

            {/* Centerpiece: Arduino Uno USB Board */}
            <g transform="translate(290, 44)">
              <rect
                width="180"
                height="118"
                rx="10"
                fill="#0c4a6e"
                fillOpacity="0.45"
                stroke={hardwareBridge.arduinoConnected ? '#10b981' : '#38bdf8'}
                strokeWidth="2.5"
              />
              <rect x="-12" y="42" width="16" height="32" rx="3" fill="#64748b" />
              <text x="90" y="28" textAnchor="middle" fill="#e2e8f0" fontSize="13" fontFamily="monospace" fontWeight="700">
                ARDUINO UNO
              </text>
              <text x="90" y="48" textAnchor="middle" fill="#7dd3fc" fontSize="10" fontFamily="monospace">
                USB WEB SERIAL · 9600
              </text>
              <rect x="34" y="64" width="112" height="24" rx="4" fill="#020617" stroke="#334155" />
              <text
                x="90"
                y="80"
                textAnchor="middle"
                fill={hardwareBridge.arduinoConnected ? '#34d399' : '#94a3b8'}
                fontSize="10.5"
                fontFamily="monospace"
                fontWeight="700"
              >
                {hardwareBridge.arduinoConnected ? 'STREAMING LIVE' : 'USB STANDBY'}
              </text>
              <text x="90" y="106" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
                Pins: A0 · D2 · D8 · D9-D11
              </text>
            </g>

            {/* Output 1: 3-Color Traffic LEDs (D9, D10, D11) */}
            <g transform="translate(600, 26)">
              <rect width="138" height="72" rx="8" fill="#0f172a" stroke="#334155" strokeWidth="2" />
              <text x="69" y="18" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                3-COLOR LEDS (D9-D11)
              </text>
              {/* Red */}
              <circle
                cx="34"
                cy="45"
                r="13"
                fill={hardwareBridge.ledColor === 'R' ? '#ef4444' : '#3f1215'}
                stroke="#f87171"
                strokeWidth="1.5"
              />
              {/* Yellow */}
              <circle
                cx="69"
                cy="45"
                r="13"
                fill={hardwareBridge.ledColor === 'Y' ? '#eab308' : '#3a2e08'}
                stroke="#facc15"
                strokeWidth="1.5"
              />
              {/* Green */}
              <circle
                cx="104"
                cy="45"
                r="13"
                fill={hardwareBridge.ledColor === 'G' ? '#10b981' : '#082f22'}
                stroke="#34d399"
                strokeWidth="1.5"
              />
            </g>

            {/* Output 2: Piezo Buzzer (D8) */}
            <g transform="translate(600, 114)">
              <rect
                width="138"
                height="62"
                rx="8"
                fill="#0f172a"
                stroke={hardwareBridge.buzzerOn ? '#f43f5e' : '#334155'}
                strokeWidth="2"
              />
              <text x="69" y="21" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                PIEZO BUZZER (D8)
              </text>
              <text
                x="69"
                y="45"
                textAnchor="middle"
                fill={hardwareBridge.buzzerOn ? '#fb7185' : '#64748b'}
                fontSize="14"
                fontFamily="monospace"
                fontWeight="700"
              >
                {hardwareBridge.buzzerOn ? 'BUZZING' : hardwareBridge.buzzerMuted ? 'MUTED' : 'SILENT'}
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* 4 Sensor & Actuator Control Cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Card 1: Gas Sensor A0 + Live Trend Chart */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-rose-400" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                GAS SENSOR TELEMETRY (PIN A0 → SMART WASTE &amp; AIR ALERT)
              </h3>
            </div>
            <span
              className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                hardwareBridge.gasAlertActive
                  ? 'bg-rose-600 text-white'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {hardwareBridge.gasAlertActive ? 'HAZARD OVERFLOW' : 'AIR NOMINAL'}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs tabular-nums">
            <span>
              Reading: <strong className="text-slate-100">{hardwareBridge.gasPercent}%</strong> ({hardwareBridge.gasRaw}/1023)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Trip Limit:</span>
              <input
                type="range"
                min={25}
                max={90}
                step={5}
                value={hardwareBridge.gasThreshold}
                onChange={(e) => setGasThreshold(Number(e.target.value))}
                className="w-24 accent-rose-500"
              />
              <span className="text-rose-300 font-bold">{hardwareBridge.gasThreshold}%</span>
            </div>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={gasSeries} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="t" stroke="#64748b" fontSize={10} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <ReferenceLine y={hardwareBridge.gasThreshold} stroke="#f43f5e" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="gasPct"
                  name="Gas Level %"
                  stroke="#fb7185"
                  fill="#f43f5e"
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2: Laptop Sound Detection (Mic) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-cyan-400" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                LAPTOP MIC ACOUSTIC &amp; SIREN DETECTOR (650–1450 HZ)
              </h3>
            </div>
            <span
              className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                hardwareBridge.soundAlertActive
                  ? 'bg-rose-600 text-white'
                  : hardwareBridge.micActive
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-800 text-slate-400'
              }`}
            >
              {hardwareBridge.soundAlertActive
                ? 'SIREN / HORN DETECTED'
                : hardwareBridge.micActive
                  ? 'MONITORING'
                  : 'OFFLINE'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <span className="text-[10px] text-slate-500 block">MIC LEVEL</span>
              <span className="text-base font-bold text-slate-100">{hardwareBridge.micLevel}%</span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <span className="text-[10px] text-slate-500 block">PEAK PITCH</span>
              <span className="text-base font-bold text-cyan-300">{hardwareBridge.micPeakHz} Hz</span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <span className="text-[10px] text-slate-500 block">SIREN BAND</span>
              <span className="text-base font-bold text-amber-300">{hardwareBridge.sirenScore}%</span>
            </div>
          </div>

          {/* 16-Band Live Frequency Spectrum Bars */}
          <div className="h-24 rounded-lg border border-slate-800 bg-slate-950 p-2 flex items-end gap-1.5">
            {hardwareBridge.micSpectrum.map((bar, idx) => (
              <div
                key={idx}
                className={`flex-1 rounded-t transition-all duration-75 ${
                  bar >= hardwareBridge.soundThreshold
                    ? 'bg-rose-500'
                    : idx >= 3 && idx <= 7
                      ? 'bg-cyan-400'
                      : 'bg-emerald-500/80'
                }`}
                style={{ height: `${Math.max(6, bar)}%` }}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums">
            <span className="text-slate-400">Trigger Sensitivity:</span>
            <input
              type="range"
              min={30}
              max={90}
              step={2}
              value={hardwareBridge.soundThreshold}
              onChange={(e) => setSoundThreshold(Number(e.target.value))}
              className="flex-1 max-w-[180px] accent-cyan-500"
            />
            <span className="text-cyan-300 font-bold">{hardwareBridge.soundThreshold}%</span>
          </div>
        </div>

        {/* Card 3: Touch Sensor D2 Role & Counter */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Hand className="h-4 w-4 text-amber-400" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                TOUCH SENSOR BEHAVIOR (PIN D2)
              </h3>
            </div>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              Triggers: <strong className="text-amber-300">{hardwareBridge.touchCount}</strong>
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Choose what touching your physical sensor demonstrates during your presentation:
          </p>

          <div className="grid sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setTouchMode('pedestrian_crosswalk')}
              className={`rounded-lg border p-3 text-left transition ${
                hardwareBridge.touchMode === 'pedestrian_crosswalk'
                  ? 'border-amber-500 bg-amber-950/40 text-amber-100'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span className="font-mono text-xs font-bold block">Pedestrian Crosswalk (+15s)</span>
              <span className="text-[11px] opacity-80">
                Locks +15s crossing buffer, puts AV into YIELD, and turns Red LED ON.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTouchMode('emergency_sos')}
              className={`rounded-lg border p-3 text-left transition ${
                hardwareBridge.touchMode === 'emergency_sos'
                  ? 'border-rose-500 bg-rose-950/40 text-rose-100'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span className="font-mono text-xs font-bold block">Emergency SOS Preemption</span>
              <span className="text-[11px] opacity-80">
                Triggers Emergency Green Wave, turns Green LED ON, and sounds buzzer.
              </span>
            </button>
          </div>
        </div>

        {/* Card 4: 3-Color LED & Buzzer Output Controls */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Siren className="h-4 w-4 text-emerald-400" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                3-COLOR LED SIGNAL &amp; BUZZER OUTPUTS (D8–D11)
              </h3>
            </div>
            <label className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hardwareBridge.autoSyncLed}
                onChange={(e) => setAutoSyncLed(e.target.checked)}
                className="accent-emerald-500"
              />
              Auto-Sync Sensors
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={() => setHardwareLed('R')}
              className={`rounded-lg border py-2.5 font-bold transition ${
                hardwareBridge.ledColor === 'R'
                  ? 'border-rose-400 bg-rose-600 text-white'
                  : 'border-slate-800 bg-slate-950 text-rose-300 hover:border-rose-500/40'
              }`}
            >
              RED (D9)
            </button>
            <button
              type="button"
              onClick={() => setHardwareLed('Y')}
              className={`rounded-lg border py-2.5 font-bold transition ${
                hardwareBridge.ledColor === 'Y'
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-slate-800 bg-slate-950 text-amber-300 hover:border-amber-500/40'
              }`}
            >
              YELLOW (D10)
            </button>
            <button
              type="button"
              onClick={() => setHardwareLed('G')}
              className={`rounded-lg border py-2.5 font-bold transition ${
                hardwareBridge.ledColor === 'G'
                  ? 'border-emerald-400 bg-emerald-600 text-white'
                  : 'border-slate-800 bg-slate-950 text-emerald-300 hover:border-emerald-500/40'
              }`}
            >
              GREEN (D11)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHardwareBuzzer(!hardwareBridge.buzzerOn)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 font-mono text-xs font-semibold transition ${
                hardwareBridge.buzzerOn
                  ? 'border-rose-400 bg-rose-600 text-white'
                  : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Bell className="h-3.5 w-3.5" />
              {hardwareBridge.buzzerOn ? 'Stop Physical Buzzer (D8)' : 'Test Physical Buzzer (D8)'}
            </button>
            <button
              type="button"
              onClick={() => setShowWebcam((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-2 font-mono text-xs font-semibold text-cyan-200 hover:bg-cyan-900/50 transition"
            >
              <Camera className="h-3.5 w-3.5" />
              {showWebcam ? 'Hide Cam' : 'Show Cam'}
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Built-in Laptop Camera Computer Vision Engine */}
      {showWebcam && <FieldVisionEngine />}

      {/* Pin Wiring Table + Copyable Arduino Sketch + Live Event Log */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
              ARDUINO UNO WIRING GUIDE &amp; UPLOAD SKETCH
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopySketch()}
                className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-300 hover:bg-emerald-900/60 transition"
              >
                {copiedSketch ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedSketch ? 'Copied .ino' : 'Copy .ino Sketch'}
              </button>
              <button
                type="button"
                onClick={() => setShowSketch((v) => !v)}
                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:bg-slate-700 transition"
              >
                {showSketch ? 'Hide Code' : 'View .ino Code'}
              </button>
            </div>
          </div>

          <div className="space-y-1.5 font-mono text-xs">
            {PIN_WIRING.map((row) => (
              <div
                key={row.part}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <div>
                  <span className="font-bold text-slate-200 block">{row.part}</span>
                  <span className="text-[11px] text-slate-400">{row.role}</span>
                </div>
                <code className="text-[11px] text-cyan-300">{row.pin}</code>
              </div>
            ))}
          </div>

          {showSketch && (
            <pre className="max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">
              {ARDUINO_UNO_SKETCH}
            </pre>
          )}
        </div>

        {/* Hardware Bridge Event Stream */}
        <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
              LIVE SENSOR &amp; ACTUATOR DISPATCH LOG
            </h3>
            <span className="font-mono text-[11px] text-slate-400">
              Cross-module actions
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1 font-mono text-xs">
            {hardwareBridge.logs.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2.5 rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2"
              >
                <span className="text-slate-500 shrink-0 tabular-nums">{item.timestamp}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0 ${
                    item.source === 'ARDUINO'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : item.source === 'SOUND'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {item.source}
                </span>
                <span className="text-slate-300 leading-snug">{item.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
