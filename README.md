# Trident-AI / Metropolis-AI — Local Showcase Guide

Full-stack urban traffic command, Google Maps simulation, computer-vision analytics, and Arduino/Microphone hardware bridge prototype.

## Prerequisites
- **Node.js** `v20+` (and `npm`)
- **Google Chrome** or **Microsoft Edge** (required for **Web Serial API** USB Arduino Uno connection, plus webcam & microphone permissions on `http://localhost:3000`)
- **Google Maps API Key** (with **Maps JavaScript API** and **Routes API** enabled)
- *(Optional)* **Python 3.10+** if you want live `yolo11n.pt` inference (`pip install -r requirements.txt`)

---

## 1. Quick Start (Local Computer)

1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the project root (copy `.env.example`) and add your Google Maps key:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
   ```
   > **Note:** Cloud SQL / PostgreSQL env vars (`SQL_*`) are **optional** for local demos. When omitted, `server.ts` automatically runs with an **in-memory fallback store** so citizen reports and emergency incident logs still work immediately.

3. Start the full-stack server (`Express` + `Vite`):
   ```bash
   npm run dev
   ```

4. Open **Chrome** or **Edge** at:
   ```
   http://localhost:3000
   ```

*(Optional)* For a production preview build locally:
```bash
npm run build
NODE_ENV=production npx tsx server.ts
```

---

## 2. Live Showcase Hardware & Sensors (`HW-01 · Arduino & Mic Bridge`)

- **Browser:** Open `http://localhost:3000` in **Chrome** or **Edge** (`localhost` is treated as a secure context for Webcam, Microphone, and Web Serial).
- **Arduino Uno Setup:**
  1. Open the **Arduino & Mic Bridge (`HW-01`)** tab in the sidebar to copy the ready-to-flash `.ino` sketch.
  2. Flash the sketch to your Arduino Uno using the Arduino IDE (`9600 baud`).
  3. Wire your **MQ gas sensor (`A0`)**, **touch sensor (`D2`)**, **Red/Yellow/Green LEDs (`D8/D9/D10`)**, and **buzzer (`D11`)** as shown in the pinout card.
  4. Close the Arduino IDE Serial Monitor (so the COM/tty port isn't locked), then click **Connect Arduino Uno (USB)** in the app.
- **Laptop Webcam & Microphone:**
  - Click **Enable Mic Sound Monitor** in `HW-01` to detect siren/horn dB spikes in real time.
  - Open **Flood & Video Analytics (`SEC-05`)** to enable your built-in laptop webcam for live vehicle/emergency frame analysis.

---

## 3. Optional Real YOLOv11 Python Backend

If Python dependencies aren't installed, the app automatically runs with its built-in client CV fallback. To enable live `yolo11n.pt` inference locally:
```bash
pip install -r requirements.txt
npm run dev
```
`server.ts` auto-detects `flask`, `ultralytics`, and `cv2` and launches `yolo_service.py` on port `8001` automatically.

