"""
beatsheet's subjects without SAM, for Windows: faces (OpenCV's YuNet) and people (OpenCV's HOG detector) found in a
clip or photo and followed, and anything boxed followed both ways (OpenCV's CSRT tracker). It answers the way the Mac's
Vision helper (vision.swift) does, so the engine reads either the same. SAM 3.1, once it's installed, does all of this
better and cuts things out too; this is what works before that.

Run by the engine with uv, which brings OpenCV:

    uv run --with opencv-contrib-python-headless --with "numpy<2" python -I subjects-lite.py <command> <file> [options]

    subjects <file> --face-model <yunet.onnx> [--every 0.2]
    track <file> --at s --box x,y,w,h [--every 0.1]

Boxes are 0..1 of the picture, origin top-left; times are seconds into the file. Results go to stdout as JSON; progress
to stderr as "progress <0..1>" lines, and a failure as "error <message>".
"""

import json
import os
import sys

IMAGES = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff")
# Frames are looked at this wide: plenty for faces and people, and quick.
WORK_WIDTH = 960


def fail(message):
    sys.stderr.write(f"error {message}\n")
    sys.stderr.flush()
    sys.exit(1)


def progress(f):
    sys.stderr.write(f"progress {min(1.0, max(0.0, f)):.3f}\n")
    sys.stderr.flush()


def flag(args, name, default=None):
    if f"--{name}" in args:
        i = args.index(f"--{name}")
        if i + 1 < len(args):
            return args[i + 1]
    return default


def r4(v):
    return round(float(v), 4)


def r3(v):
    return round(float(v), 3)


def iou(a, b):
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    u = a[2] * a[3] + b[2] * b[3] - inter
    return inter / u if u > 0 else 0.0


class Track:
    def __init__(self, kind, t, box, conf):
        self.kind = kind
        self.samples = []
        self.confidence = []
        self.add(t, box, conf)

    def add(self, t, box, conf):
        self.samples.append([r3(t), *(r4(v) for v in box)])
        self.confidence.append(conf)
        self.last, self.last_t = box, t


def continues(track, box, t):
    """How likely a detection continues a track (as vision.swift judges it); None when it can't be the same thing."""
    a = track.last
    ratio = max(a[2] / max(box[2], 1e-6), box[2] / max(a[2], 1e-6))
    if ratio > 1.6:
        return None
    size = max(a[2], a[3], box[2], box[3])
    dx = (a[0] + a[2] / 2) - (box[0] + box[2] / 2)
    dy = (a[1] + a[3] / 2) - (box[1] + box[3] / 2)
    dist = (dx * dx + dy * dy) ** 0.5 / size
    reach = 0.9 + min(1.0, (t - track.last_t) * 0.8)
    if dist > reach:
        return None
    return iou(a, box) + (1 - dist / reach) * 0.5


def link(tracks, dets, t, gap):
    open_ = [tr for tr in tracks if t - tr.last_t <= gap]
    pairs = []
    for i, (kind, box, _) in enumerate(dets):
        for tr in open_:
            if tr.kind == kind:
                score = continues(tr, box, t)
                if score is not None:
                    pairs.append((score, tr, i))
    pairs.sort(key=lambda p: -p[0])
    used, taken = set(), set()
    for _, tr, i in pairs:
        if i in used or id(tr) in taken:
            continue
        tr.add(t, dets[i][1], dets[i][2])
        used.add(i)
        taken.add(id(tr))
    for i, (kind, box, conf) in enumerate(dets):
        if i not in used:
            tracks.append(Track(kind, t, box, conf))


def subjects(cv2, np, path, args):
    model = flag(args, "face-model")
    if not model or not os.path.exists(model):
        fail("no face model")
    every = float(flag(args, "every", "0.2"))
    faces = None
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def detect(img):
        nonlocal faces
        h, w = img.shape[:2]
        k = WORK_WIDTH / w if w > WORK_WIDTH else 1.0
        small = cv2.resize(img, (round(w * k), round(h * k))) if k < 1 else img
        sh, sw = small.shape[:2]
        if faces is None:
            faces = cv2.FaceDetectorYN.create(model, "", (sw, sh), 0.7, 0.3, 5000)
        faces.setInputSize((sw, sh))
        found = []
        _, fs = faces.detect(small)
        for f in fs if fs is not None else []:
            box = [f[0] / sw, f[1] / sh, f[2] / sw, f[3] / sh]
            if box[2] >= 0.02:
                found.append(("face", clip(box), float(f[-1])))
        rects, weights = hog.detectMultiScale(small, winStride=(8, 8), padding=(8, 8), scale=1.05)
        for (x, y, rw, rh), wt in zip(rects, np.ravel(weights) if len(rects) else []):
            if float(wt) > 0.5:
                found.append(("person", clip([x / sw, y / sh, rw / sw, rh / sh]), min(1.0, float(wt) / 2)))
        return found

    tracks, info = [], {}
    if path.lower().endswith(IMAGES):
        img = cv2.imread(path)
        if img is None:
            fail(f"can't read {path}")
        for kind, box, conf in detect(img):
            tracks.append(Track(kind, 0, box, conf))
        info = {"width": img.shape[1], "height": img.shape[0]}
    else:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            fail(f"can't open {path}")
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        duration = count / fps
        step = max(1, round(every * fps))
        for n in range(0, count, step):
            cap.set(cv2.CAP_PROP_POS_FRAMES, n)
            ok, frame = cap.read()
            if not ok:
                break
            t = n / fps
            link(tracks, detect(frame), t, max(1.0, every * 4))
            progress(t / max(0.001, duration))
        cap.release()
        info = {"duration": duration, "fps": fps}
        # A face seen once in a clip is usually a false alarm or a passer-by too brief to matter.
        tracks = [tr for tr in tracks if len(tr.samples) >= 3]
    tracks.sort(key=lambda tr: (tr.kind, -len(tr.samples)))
    info["tracks"] = [{"kind": tr.kind, "samples": tr.samples, "confidence": r3(sum(tr.confidence) / len(tr.confidence))} for tr in tracks[:16]]
    progress(1)
    print(json.dumps(info))


def clip(box):
    x = min(max(box[0], 0.0), 1.0)
    y = min(max(box[1], 0.0), 1.0)
    return [x, y, min(box[2], 1.0 - x), min(box[3], 1.0 - y)]


def track(cv2, path, args):
    at = flag(args, "at")
    box = flag(args, "box")
    if at is None or box is None:
        fail("track needs --at and --box")
    at = float(at)
    bx, by, bw, bh = (float(v) for v in box.split(","))
    every = float(flag(args, "every", "0.1"))
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        fail(f"can't open {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    start = min(count - 1, max(0, round(at * fps)))
    samples = [[r3(at), r4(bx), r4(by), r4(bw), r4(bh)]]
    lost = {"forward": False, "backward": False}
    step = max(1, round(every * fps))

    def follow(frames, direction):
        tracker = None
        for i, (n, frame) in enumerate(frames):
            if tracker is None:
                tracker = cv2.TrackerCSRT_create()
                tracker.init(frame, (round(bx * width), round(by * height), max(1, round(bw * width)), max(1, round(bh * height))))
                continue
            ok, (x, y, w, h) = tracker.update(frame)
            if not ok or w <= 0 or h <= 0:
                lost[direction] = True
                return
            if i % step == 0:
                samples.append([r3(n / fps), *(r4(v) for v in clip([x / width, y / height, w / width, h / height]))])
            progress(len(samples) * step / max(1, count))

    def forward():
        cap.set(cv2.CAP_PROP_POS_FRAMES, start)
        n = start
        while True:
            ok, frame = cap.read()
            if not ok:
                return
            yield n, frame
            n += 1

    def backward():
        # A second at a time: read it forward, then walk it in reverse.
        end = start
        while end >= 0:
            begin = max(0, end - round(fps))
            cap.set(cv2.CAP_PROP_POS_FRAMES, begin)
            window = []
            for n in range(begin, end + 1):
                ok, frame = cap.read()
                if not ok:
                    break
                window.append((n, frame))
            yield from reversed(window)
            if begin == 0:
                return
            end = begin - 1

    follow(forward(), "forward")
    if start > 0:
        follow(backward(), "backward")
    cap.release()
    samples = sorted({s[0]: s for s in samples}.values(), key=lambda s: s[0])
    progress(1)
    print(json.dumps({"samples": samples, "lostForward": lost["forward"], "lostBackward": lost["backward"], "duration": count / fps}))


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        fail("usage: subjects-lite.py <subjects|track> <file> [options]")
    if not os.path.exists(args[1]):
        fail(f"no file at {args[1]}")
    import cv2
    import numpy as np

    if args[0] == "subjects":
        subjects(cv2, np, args[1], args)
    elif args[0] == "track":
        track(cv2, args[1], args)
    else:
        fail(f"unknown command {args[0]}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 - the engine shows whatever stopped it
        fail(f"{type(e).__name__}: {e}")
