"""YOLOv11n detection service for Metropolis-AI (images, video, live frames)."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, jsonify, request
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "yolo11n.pt"
PORT = int(os.environ.get("YOLO_PORT", "8001"))

CLASS_TO_KIND = {
    "person": "pedestrians",
    "bicycle": "bikes",
    "motorcycle": "bikes",
    "car": "cars",
    "bus": "trucks",
    "truck": "trucks",
    "train": "trucks",
}

model = YOLO(str(MODEL_PATH))
app = Flask(__name__)


@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return resp


def empty_counts() -> dict[str, int]:
    return {"cars": 0, "bikes": 0, "trucks": 0, "pedestrians": 0}


def summarize(result) -> dict:
    names = result.names
    counts = empty_counts()
    boxes = []
    ambulance = False
    shape = getattr(result, "orig_shape", (0, 0))
    height, width = int(shape[0]), int(shape[1])

    if result.boxes is None:
        return {
            "counts": counts,
            "boxes": boxes,
            "width": width,
            "height": height,
            "ambulanceDetected": False,
            "detections": 0,
        }

    for box in result.boxes:
        cls_id = int(box.cls[0])
        label = str(names.get(cls_id, cls_id))
        xyxy = box.xyxy[0].tolist()
        conf = float(box.conf[0])
        x1, y1, x2, y2 = xyxy
        kind = CLASS_TO_KIND.get(label)
        if kind:
            counts[kind] += 1
        if "ambulance" in label.lower():
            ambulance = True
        boxes.append(
            {
                "x": round(x1, 1),
                "y": round(y1, 1),
                "width": round(x2 - x1, 1),
                "height": round(y2 - y1, 1),
                "area": round(max(1.0, (x2 - x1) * (y2 - y1)), 1),
                "speedPx": 0,
                "meanRed": 0,
                "kind": kind or label,
                "label": label,
                "confidence": round(conf, 3),
            }
        )

    return {
        "counts": counts,
        "boxes": boxes,
        "width": width,
        "height": height,
        "ambulanceDetected": ambulance,
        "detections": len(boxes),
    }


def decode_image(payload: bytes):
    arr = np.frombuffer(payload, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def encode_jpeg(img, quality: int = 78) -> str:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        return ""
    import base64

    return base64.b64encode(buf.tobytes()).decode("ascii")


@app.get("/health")
def health():
    return jsonify({"ok": True, "model": "yolo11n.pt", "service": "yolo"})


@app.post("/detect/frame")
def detect_frame():
    payload = request.get_data()
    if not payload:
        return jsonify({"error": "empty frame"}), 400
    img = decode_image(payload)
    if img is None:
        return jsonify({"error": "could not decode jpeg"}), 400
    t0 = cv2.getTickCount()
    result = model.predict(img, verbose=False, imgsz=640, conf=0.35)[0]
    ms = (cv2.getTickCount() - t0) / cv2.getTickFrequency() * 1000
    data = summarize(result)
    data["inferenceLatencyMs"] = round(ms, 1)
    data["fps"] = round(1000 / max(ms, 8), 1)
    data["engine"] = "yolo11n"
    return jsonify(data)


@app.post("/detect/image")
def detect_image():
    file = request.files.get("file")
    if file is None:
        payload = request.get_data()
        img = decode_image(payload) if payload else None
    else:
        img = decode_image(file.read())
    if img is None:
        return jsonify({"error": "no image"}), 400
    t0 = cv2.getTickCount()
    result = model.predict(img, verbose=False, imgsz=640, conf=0.35)[0]
    ms = (cv2.getTickCount() - t0) / cv2.getTickFrequency() * 1000
    plotted = result.plot()
    data = summarize(result)
    data["inferenceLatencyMs"] = round(ms, 1)
    data["fps"] = round(1000 / max(ms, 8), 1)
    data["engine"] = "yolo11n"
    data["annotatedJpeg"] = encode_jpeg(plotted)
    return jsonify(data)


@app.post("/detect/video")
def detect_video():
    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "no video"}), 400

    suffix = Path(file.filename or "clip.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        path = tmp.name

    try:
        max_counts = empty_counts()
        last = None
        frame_index = 0
        sampled = 0
        t0 = cv2.getTickCount()
        for result in model.predict(path, stream=True, verbose=False, imgsz=640, conf=0.35, vid_stride=5):
            frame_index += 1
            sampled += 1
            summary = summarize(result)
            for key, value in summary["counts"].items():
                max_counts[key] = max(max_counts[key], value)
            last = summary
            last["annotatedJpeg"] = encode_jpeg(result.plot())
            if sampled >= 120:
                break
        ms = (cv2.getTickCount() - t0) / cv2.getTickFrequency() * 1000
        if last is None:
            return jsonify({"error": "no frames decoded"}), 400
        last["counts"] = max_counts
        last["inferenceLatencyMs"] = round(ms, 1)
        last["fps"] = round((sampled * 1000) / max(ms, 8), 1)
        last["engine"] = "yolo11n"
        last["sampledFrames"] = sampled
        last["sourceFrames"] = frame_index * 5
        return jsonify(last)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


if __name__ == "__main__":
    print(f"YOLO11n service listening on http://127.0.0.1:{PORT}")
    app.run(host="127.0.0.1", port=PORT, threaded=True)
