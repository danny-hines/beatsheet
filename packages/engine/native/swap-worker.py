#!/usr/bin/env python3
"""
Builds character-swap conditioning videos for beatsheet (`swap.ts`), inspired by Tein's Genjustsu pipeline:
- `fast` mode: draws a high-contrast MediaPipe 478-landmark face mesh over the target person's face so the video
  model replaces identity while preserving exact expression, eye gaze, lip sync, body and real background.
- `advanced` mode: replaces the target person's entire body/silhouette mask (from a SAM 3 / Apple Vision cut-out
  matte if provided, else derived from tracked subject boxes) with a temporally smoothed depth map + MediaPipe face
  mesh, leaving 100% of the real background untouched.

All dependencies (MediaPipe, OpenCV, NumPy, ONNX Runtime, optional Depth Anything V2 Small ONNX) are Apache 2.0 / MIT.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np


def interpolate_box(samples, t):
    if not samples:
        return None
    if t <= samples[0][0]:
        return samples[0][1:5]
    if t >= samples[-1][0]:
        return samples[-1][1:5]
    for i in range(len(samples) - 1):
        a, b = samples[i], samples[i + 1]
        if a[0] <= t <= b[0]:
            dt = max(1e-6, b[0] - a[0])
            f = (t - a[0]) / dt
            return [a[k] + (b[k] - a[k]) * f for k in range(1, 5)]
    return samples[-1][1:5]


def draw_face_mesh(frame, landmarks, w, h, color=(255, 225, 40), accent=(255, 255, 255)):
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]
    # MediaPipe Face Oval + Lips + Eyes + Eyebrows + Nose bridge landmark rings
    rings = [
        [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10],
        [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61],
        [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78],
        [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33],
        [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362],
        [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
        [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
        [168, 6, 197, 195, 5, 4, 1, 19, 94, 2],
    ]
    # Soft matte mask inside the face oval so original facial identity features don't bleed through.
    oval = np.array([pts[i] for i in rings[0][:-1]], dtype=np.int32)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [oval], 255)
    mask = cv2.GaussianBlur(mask, (15, 15), 0)
    neutral = np.full_like(frame, (88, 92, 98))
    alpha = (mask.astype(np.float32) / 255.0)[..., None] * 0.88
    frame[:] = (frame.astype(np.float32) * (1.0 - alpha) + neutral.astype(np.float32) * alpha).astype(np.uint8)

    # Structural cross-mesh lattice across the face.
    struts = [
        (10, 152), (234, 454), (127, 356), (93, 323), (58, 288),
        (168, 33), (168, 362), (1, 61), (1, 291), (1, 133), (1, 362),
        (152, 61), (152, 291), (10, 105), (10, 334), (234, 61), (454, 291),
    ]
    thickness = max(1, int(round(min(w, h) / 420)))
    for a, b in struts:
        if a < len(pts) and b < len(pts):
            cv2.line(frame, pts[a], pts[b], (180, 190, 90), thickness, cv2.LINE_AA)

    for idx, ring in enumerate(rings):
        col = accent if idx in (1, 2, 3, 4) else color
        for i in range(len(ring) - 1):
            a, b = ring[i], ring[i + 1]
            if a < len(pts) and b < len(pts):
                cv2.line(frame, pts[a], pts[b], col, thickness + (1 if idx == 0 else 0), cv2.LINE_AA)
    return oval


def estimate_depth(frame, ort_session=None):
    h, w = frame.shape[:2]
    if ort_session is not None:
        inp_name = ort_session.get_inputs()[0].name
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (518, 518), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        tensor = np.transpose((resized - mean) / std, (2, 0, 1))[None, ...]
        pred = ort_session.run(None, {inp_name: tensor})[0]
        pred = np.squeeze(pred)
        d_min, d_max = float(pred.min()), float(pred.max())
        norm = ((pred - d_min) / max(1e-6, d_max - d_min) * 255.0).astype(np.uint8)
        return cv2.resize(norm, (w, h), interpolation=cv2.INTER_CUBIC)
    # Fast structural depth proxy when ONNX depth weights aren't installed: combines smooth edge-preserving shading
    # and foreground radial elevation so silhouette depth reads smoothly without flicker.
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    smooth = cv2.bilateralFilter(gray, 11, 55, 55)
    gx = cv2.Sobel(smooth, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(smooth, cv2.CV_32F, 0, 1, ksize=3)
    grad = cv2.magnitude(gx, gy)
    grad = cv2.GaussianBlur(grad, (21, 21), 0)
    combined = cv2.normalize(smooth.astype(np.float32) * 0.72 + grad * 0.28, None, 30, 245, cv2.NORM_MINMAX)
    return combined.astype(np.uint8)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=["fast", "advanced"], default="fast")
    parser.add_argument("--face-model", required=True)
    parser.add_argument("--depth-model", default=None)
    parser.add_argument("--subject-json", default=None)
    parser.add_argument("--matte", default=None)
    args = parser.parse_args()

    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision

    samples = None
    if args.subject_json and os.path.exists(args.subject_json):
        with open(args.subject_json, "r", encoding="utf-8") as f:
            data = json.load(f)
            samples = data.get("samples")

    ort_session = None
    if args.mode == "advanced" and args.depth_model and os.path.exists(args.depth_model):
        import onnxruntime as ort
        ort_session = ort.InferenceSession(args.depth_model, providers=["CPUExecutionProvider"])

    base_opts = mp_python.BaseOptions(model_asset_path=args.face_model)
    landmarker_opts = mp_vision.FaceLandmarkerOptions(
        base_options=base_opts,
        running_mode=mp_vision.RunningMode.VIDEO,
        num_faces=4,
        min_face_detection_confidence=0.35,
        min_face_presence_confidence=0.35,
        min_tracking_confidence=0.35,
    )

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open input video: {args.input}")
    matte_cap = cv2.VideoCapture(args.matte) if (args.matte and os.path.exists(args.matte)) else None

    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    tmp_dir = tempfile.mkdtemp(prefix="bs-swap-")
    raw_out = os.path.join(tmp_dir, "raw.mp4")
    writer = cv2.VideoWriter(raw_out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

    prev_depth = None
    idx = 0
    try:
        with mp_vision.FaceLandmarker.create_from_options(landmarker_opts) as landmarker:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                t = idx / fps
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                res = landmarker.detect_for_video(mp_img, int(round(t * 1000)))

                target_box = interpolate_box(samples, t) if samples else None
                picked = None
                if res.face_landmarks:
                    if target_box:
                        cx = target_box[0] + target_box[2] * 0.5
                        cy = target_box[1] + target_box[3] * 0.5
                        picked = min(
                            res.face_landmarks,
                            key=lambda lms: (sum(l.x for l in lms) / len(lms) - cx) ** 2 + (sum(l.y for l in lms) / len(lms) - cy) ** 2,
                        )
                    else:
                        # Largest detected face.
                        picked = max(
                            res.face_landmarks,
                            key=lambda lms: (max(l.x for l in lms) - min(l.x for l in lms)) * (max(l.y for l in lms) - min(l.y for l in lms)),
                        )

                out = frame.copy()

                if args.mode == "advanced":
                    depth = estimate_depth(frame, ort_session)
                    if prev_depth is not None:
                        depth = cv2.addWeighted(depth, 0.72, prev_depth, 0.28, 0)
                    prev_depth = depth
                    colored_depth = cv2.applyColorMap(depth, cv2.COLORMAP_TURBO)

                    sil = np.zeros((h, w), dtype=np.uint8)
                    if matte_cap is not None:
                        mok, mframe = matte_cap.read()
                        if mok and mframe is not None:
                            if mframe.shape[0] != h or mframe.shape[1] != w:
                                mframe = cv2.resize(mframe, (w, h), interpolation=cv2.INTER_LINEAR)
                            sil = cv2.cvtColor(mframe, cv2.COLOR_BGR2GRAY)
                    elif target_box is not None:
                        x1 = max(0, int(target_box[0] * w))
                        y1 = max(0, int(target_box[1] * h))
                        x2 = min(w, int((target_box[0] + target_box[2]) * w))
                        y2 = min(h, int((target_box[1] + target_box[3]) * h))
                        cv2.ellipse(sil, ((x1 + x2) // 2, (y1 + y2) // 2), (max(8, (x2 - x1) // 2), max(8, (y2 - y1) // 2)), 0, 0, 360, 255, -1)
                    elif picked is not None:
                        xs = [int(l.x * w) for l in picked]
                        ys = [int(l.y * h) for l in picked]
                        fw, fh = max(20, max(xs) - min(xs)), max(20, max(ys) - min(ys))
                        fcx, fcy = (min(xs) + max(xs)) // 2, (min(ys) + max(ys)) // 2
                        # Head + upper torso oval envelope when no SAM matte was passed.
                        cv2.ellipse(sil, (fcx, fcy), (int(fw * 0.78), int(fh * 0.85)), 0, 0, 360, 255, -1)
                        cv2.ellipse(sil, (fcx, min(h, fcy + int(fh * 1.9))), (int(fw * 1.55), int(fh * 1.65)), 0, 0, 360, 255, -1)

                    if sil.max() > 0:
                        sil_blur = cv2.GaussianBlur(sil, (15, 15), 0).astype(np.float32) / 255.0
                        a3 = sil_blur[..., None]
                        out = (out.astype(np.float32) * (1.0 - a3) + colored_depth.astype(np.float32) * a3).astype(np.uint8)

                if picked is not None:
                    draw_face_mesh(out, picked, w, h)

                writer.write(out)
                idx += 1
                if total > 0 and idx % 15 == 0:
                    print(f"progress {min(0.95, idx / total):.3f}", file=sys.stderr, flush=True)
    finally:
        cap.release()
        if matte_cap is not None:
            matte_cap.release()
        writer.release()

    # Re-encode to clean H.264 yuv420p for browser + model compatibility.
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", raw_out, "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", args.output],
        check=True,
    )
    shutil.rmtree(tmp_dir, ignore_errors=True)
    print(json.dumps({"ok": True, "frames": idx, "fps": fps, "mode": args.mode}))


if __name__ == "__main__":
    main()
