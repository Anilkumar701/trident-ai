export type LedColorCode = 'R' | 'Y' | 'G'

export interface ArduinoSensorPacket {
  gas?: number // 0 - 1023 analog reading from MQ-2 / MQ-135 on A0
  touch?: number // 0 or 1 from touch sensor on D2
  rawLine?: string
}

interface SerialPortLike {
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  getInfo?: () => { usbVendorId?: number; usbProductId?: number }
}

interface NavigatorWithSerial extends Navigator {
  serial?: {
    requestPort: () => Promise<SerialPortLike>
  }
}

export function isWebSerialSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  return Boolean((navigator as NavigatorWithSerial).serial)
}

export const ARDUINO_UNO_SKETCH = `// Trident-AI Smart City Node — Arduino Uno USB Serial Sketch (9600 baud)
// Pin Mapping:
//   Gas Sensor (MQ-2 / MQ-135 AO) -> A0
//   Touch Sensor (TTP223 OUT)     -> D2
//   Buzzer (+)                    -> D8
//   Red LED (+220 ohm)            -> D9
//   Yellow LED (+220 ohm)         -> D10
//   Green LED (+220 ohm)          -> D11

const int PIN_GAS = A0;
const int PIN_TOUCH = 2;
const int PIN_BUZZER = 8;
const int PIN_RED = 9;
const int PIN_YELLOW = 10;
const int PIN_GREEN = 11;

unsigned long lastSendMs = 0;
String rxBuffer = "";

void setSignalColor(char c) {
  digitalWrite(PIN_RED, c == 'R' ? HIGH : LOW);
  digitalWrite(PIN_YELLOW, c == 'Y' ? HIGH : LOW);
  digitalWrite(PIN_GREEN, c == 'G' ? HIGH : LOW);
}

void setup() {
  Serial.begin(9600);
  pinMode(PIN_TOUCH, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_YELLOW, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  setSignalColor('G');
  digitalWrite(PIN_BUZZER, LOW);
}

void handleCommand(String cmd) {
  cmd.trim();
  if (cmd == "SIG:R") setSignalColor('R');
  else if (cmd == "SIG:Y") setSignalColor('Y');
  else if (cmd == "SIG:G") setSignalColor('G');
  else if (cmd == "BUZ:1") digitalWrite(PIN_BUZZER, HIGH);
  else if (cmd == "BUZ:0") digitalWrite(PIN_BUZZER, LOW);
}

void loop() {
  while (Serial.available() > 0) {
    char ch = (char)Serial.read();
    if (ch == '\\n') {
      handleCommand(rxBuffer);
      rxBuffer = "";
    } else {
      rxBuffer += ch;
    }
  }

  unsigned long now = millis();
  if (now - lastSendMs >= 200) {
    lastSendMs = now;
    int gasVal = analogRead(PIN_GAS);
    int touchVal = digitalRead(PIN_TOUCH);
    Serial.print("{\\"gas\\":");
    Serial.print(gasVal);
    Serial.print(",\\"touch\\":");
    Serial.print(touchVal);
    Serial.println("}");
  }
}`

export class ArduinoSerialClient {
  private port: SerialPortLike | null = null
  private reader: ReadableStreamDefaultReader<string> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private readAbort = false
  private encoder = new TextEncoder()

  async connect(
    onPacket: (packet: ArduinoSensorPacket) => void,
    onDisconnect: (reason?: string) => void,
  ): Promise<string> {
    const nav = navigator as NavigatorWithSerial
    if (!nav.serial) {
      throw new Error('Web Serial API requires Chrome or Edge over HTTPS/localhost.')
    }

    const port = await nav.serial.requestPort()
    await port.open({ baudRate: 9600 })
    this.port = port
    this.readAbort = false

    if (port.writable) {
      this.writer = port.writable.getWriter()
    }

    const info = port.getInfo?.()
    const portLabel = info?.usbVendorId
      ? `USB VID:${info.usbVendorId.toString(16).toUpperCase()}`
      : 'Arduino Uno USB Serial (9600 baud)'

    if (port.readable) {
      const decoder = new TextDecoderStream()
      const pipePromise = port.readable.pipeTo(decoder.writable as unknown as WritableStream<Uint8Array>).catch(() => {})
      void pipePromise
      const reader = decoder.readable.getReader()
      this.reader = reader
      this.readLoop(reader, onPacket, onDisconnect)
    }

    return portLabel
  }

  private async readLoop(
    reader: ReadableStreamDefaultReader<string>,
    onPacket: (packet: ArduinoSensorPacket) => void,
    onDisconnect: (reason?: string) => void,
  ) {
    let buffer = ''
    try {
      while (!this.readAbort) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        buffer += value
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed) as ArduinoSensorPacket
            onPacket({ ...parsed, rawLine: trimmed })
          } catch {
            // Support simple CSV fallback like "450,1"
            const parts = trimmed.split(',').map((s) => Number(s.trim()))
            if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
              onPacket({ gas: parts[0], touch: parts[1], rawLine: trimmed })
            }
          }
        }
      }
    } catch (err) {
      if (!this.readAbort) {
        onDisconnect(err instanceof Error ? err.message : 'USB serial read interrupted')
      }
    }
  }

  async sendCommand(cmd: string): Promise<void> {
    if (!this.writer) return
    try {
      await this.writer.write(this.encoder.encode(`${cmd.trim()}\n`))
    } catch {
      // Ignore write failures if disconnecting
    }
  }

  async sendSignalLed(color: LedColorCode): Promise<void> {
    await this.sendCommand(`SIG:${color}`)
  }

  async sendBuzzer(on: boolean): Promise<void> {
    await this.sendCommand(on ? 'BUZ:1' : 'BUZ:0')
  }

  async disconnect(): Promise<void> {
    this.readAbort = true
    try {
      await this.reader?.cancel()
      this.reader?.releaseLock()
    } catch {
      // ignore
    }
    try {
      this.writer?.releaseLock()
    } catch {
      // ignore
    }
    try {
      await this.port?.close()
    } catch {
      // ignore
    }
    this.reader = null
    this.writer = null
    this.port = null
  }
}
