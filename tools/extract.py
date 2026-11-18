"""Extract pose + football tracks from a video. Usage: extract.py VIDEO OUT.json [MAX_SECONDS]"""
import json, sys, os
import cv2, mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

HERE = os.path.dirname(os.path.abspath(__file__))
video, out = sys.argv[1], sys.argv[2]
max_s = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9

pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=f"{HERE}/models/pose_landmarker_full.task"),
    running_mode=vision.RunningMode.VIDEO, num_poses=1,
    min_pose_detection_confidence=0.4, min_tracking_confidence=0.4))
det = vision.ObjectDetector.create_from_options(vision.ObjectDetectorOptions(
    base_options=BaseOptions(model_asset_path=f"{HERE}/models/efficientdet_lite0.tflite"),
    running_mode=vision.RunningMode.VIDEO, score_threshold=0.12,
    category_allowlist=["sports ball"], max_results=3))

cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30
w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
frames, i = [], 0
while True:
    ok, bgr = cap.read()
    if not ok or i / fps > max_s: break
    ms = int(i * 1000 / fps)
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    p = pose.detect_for_video(img, ms)
    d = det.detect_for_video(img, ms)
    lm = None
    if p.pose_landmarks:
        lm = [[round(l.x, 4), round(l.y, 4), round(l.z, 4), round(l.visibility or 0, 3)] for l in p.pose_landmarks[0]]
    balls = [[round((b.bounding_box.origin_x + b.bounding_box.width / 2) / w, 4),
              round((b.bounding_box.origin_y + b.bounding_box.height / 2) / h, 4),
              round(b.bounding_box.width / w, 4), round(b.bounding_box.height / h, 4),
              round(b.categories[0].score, 3)] for b in d.detections]
    frames.append({"t": round(ms / 1000, 3), "p": lm, "b": balls})
    i += 1
    if i % 500 == 0: print(os.path.basename(video), i, flush=True)
cap.release()
json.dump({"source": os.path.basename(video), "fps": fps, "w": w, "h": h, "frames": frames}, open(out, "w"), separators=(",", ":"))
pf = sum(1 for f in frames if f["p"]) / max(1, len(frames))
bf = sum(1 for f in frames if f["b"]) / max(1, len(frames))
print(f"{os.path.basename(video)} frames={len(frames)} pose={pf:.0%} ball={bf:.0%}", flush=True)
