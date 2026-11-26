#!/usr/bin/env python3
"""
Extracts 52 standard ARKit blendshapes + 3D Euler head pose (pitch, yaw, roll + translation) from any face video
using Google's Apache-2.0 MediaPipe Face Landmarker on CPU (no GPU needed, 100% commercial-safe).

Outputs a `FacePerformanceTrack` JSON file consumed by `kit:ClayHead` and `perform.ts`.
"""
import argparse
import json
import math
import sys

import cv2
import numpy as np


def matrix_to_pose(mat):
    """Decomposes a 4x4 MediaPipe facial transformation matrix into clean (pitch, yaw, roll, tx, ty, tz)."""
    r = np.array(mat, dtype=np.float64).reshape((4, 4))
    # Extract Euler angles (YXZ order: yaw around Y, pitch around X, roll around Z)
    sy = math.sqrt(r[0, 0] * r[0, 0] + r[1, 0] * r[1, 0])
    if sy > 1e-6:
        pitch = math.atan2(-r[2, 1], r[2, 2])
        yaw = math.atan2(r[2, 0], sy)
        roll = math.atan2(-r[1, 0], r[0, 0])
    else:
        pitch = math.atan2(r[1, 2], r[1, 1])
        yaw = math.atan2(r[2, 0], sy)
        roll = 0.0
    # Normalize translation relative to typical camera distance (~50 cm).
    tx = float(r[0, 3]) / 35.0
    ty = float(r[1, 3]) / 35.0
    tz = (float(r[2, 3]) + 50.0) / 50.0
    return {
        "pitch": round(-pitch, 4),
        "yaw": round(yaw, 4),
        "roll": round(-roll, 4),
        "tx": round(max(-1.0, min(1.0, tx)), 4),
        "ty": round(max(-1.0, min(1.0, ty)), 4),
        "tz": round(max(-1.0, min(1.0, tz)), 4),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--face-model", required=True)
    parser.add_argument("--from", dest="start", type=float, default=0.0)
    parser.add_argument("--to", dest="end", type=float, default=None)
    args = parser.parse_args()

    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision

    base_opts = mp_python.BaseOptions(model_asset_path=args.face_model)
    landmarker_opts = mp_vision.FaceLandmarkerOptions(
        base_options=base_opts,
        running_mode=mp_vision.RunningMode.VIDEO,
        num_faces=1,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
        min_face_detection_confidence=0.35,
        min_face_presence_confidence=0.35,
        min_tracking_confidence=0.35,
    )

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {args.input}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    start_s = max(0.0, args.start)
    end_s = args.end

    if start_s > 0.0:
        cap.set(cv2.CAP_PROP_POS_MSEC, start_s * 1000.0)

    frames = []
    last_pose = {"pitch": 0.0, "yaw": 0.0, "roll": 0.0, "tx": 0.0, "ty": 0.0, "tz": 0.0}
    last_shapes = {}
    idx = 0
    try:
        with mp_vision.FaceLandmarker.create_from_options(landmarker_opts) as landmarker:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                t = idx / fps
                if end_s is not None and start_s + t > end_s + (0.5 / fps):
                    break
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                res = landmarker.detect_for_video(mp_img, int(round((start_s + t) * 1000)))

                pose = last_pose
                shapes = last_shapes
                if res.facial_transformation_matrixes:
                    pose = matrix_to_pose(res.facial_transformation_matrixes[0])
                    last_pose = pose
                if res.face_blendshapes:
                    shapes = {
                        c.category_name: round(float(c.score), 3)
                        for c in res.face_blendshapes[0]
                        if c.category_name != "_neutral" and c.score >= 0.004
                    }
                    last_shapes = shapes

                frames.append({"t": round(t, 4), "pose": pose, "shapes": shapes})
                idx += 1
                if total_frames > 0 and idx % 15 == 0:
                    print(f"progress {min(0.95, idx / total_frames):.3f}", file=sys.stderr, flush=True)
    finally:
        cap.release()

    duration = round(len(frames) / fps, 3) if frames else 0.0
    payload = {"version": 1, "fps": round(fps, 3), "duration": duration, "frames": frames}
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    print(json.dumps({"ok": True, "frames": len(frames), "fps": round(fps, 3), "duration": duration}))


if __name__ == "__main__":
    main()
