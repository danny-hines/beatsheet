"""
beatsheet's SAM 3.1 worker: Meta's own Segment Anything 3.1 (github.com/facebookresearch/sam3) on an NVIDIA card, for
Windows. One model does photos, stills and video: it finds and follows whatever you name ("the dog", "person"), or the
thing under a point or in a box, and lifts it out as a transparent PNG the size of the picture (or, for a clip, a
transparent frame for every frame), so a cut-out lines up over where it came from.

Run with the Python environment beatsheet installs (Settings → On this PC):

    python -I -B -X utf8 sam-cuda-worker.py <sam3.1_multiplex.pt>

It loads the model once, says {"ready": true, ...} on stdout, then answers one JSON request per line on stdin. Long
requests report {"id": n, "progress": 0..1} along the way.

    {"id": 1, "op": "segment", "image": "C:/a.jpg", "prompt": "the dog", "out": "C:/made/a-dog", "each": false}
      (or "point": {"x", "y"}, or "box": {"x", "y", "w", "h"}, instead of "prompt": the one thing there)
    → {"id": 1, "ok": true, "cutouts": [{"file": "C:/made/a-dog.png", "box": {...}, "score": 0.93}]}
    {"op": "find", "image": ..., "prompt": ...}                         → {"found": [{"box", "score"}]}
    {"op": "subjects", "video": ..., "fps": 5, "from": 0}               → {"tracks": [{"kind": "face" | "person", "samples": [[t, x, y, w, h], …]}]}
    {"op": "track", "video": ..., "fps": 10, "from": 0, "at": 2.5, "box": {...}} → {"samples": [...], "lostForward": false, "lostBackward": true}
    {"op": "cutout-video", "video": ..., "fps": 30, "from": 0, "prompt" | "box" + "at" | "follow": [[t, x, y, w, h]], "encoder": [argv]}
      → {"frames": 240, "box": {...}, "width": 1280, "height": 720}; every frame goes, as raw RGBA, to the encoder's stdin

`video` is a folder of frames (0.jpg, 1.jpg, …) the engine has already cut from the stretch wanted, at `fps` frames a
second and a size this card can handle; frame n is `from + n / fps` seconds into the original. (A folder, not an .mp4:
Meta's .mp4 reader leaves the pixels unscaled and keeps every frame at full float32.) Boxes are 0..1 of the picture,
top-left origin. Anything else the libraries print goes to stderr.

Three things in Meta's code are worked around here: start_session passing an argument SAM 3.1's model doesn't take
(facebookresearch/sam3#544), a decoder that insists on Flash Attention, which PyTorch for Windows doesn't have (#523,
#532), and Triton, which the tracker needs on the GPU: with triton-windows broken or missing, those few steps run on
the processor instead.
"""

import inspect
import json
import os
import subprocess
import sys
import time

# stdout carries only our answers; library chatter (and anything printed from C) goes to stderr.
_answers = os.fdopen(os.dup(1), "w", buffering=1, encoding="utf-8")
os.dup2(2, 1)
sys.stdout = sys.stderr

# Below the usual 0.5, how sure SAM must be before its best guess is used when nothing scores higher.
NEAR_MISS = 0.3
# Big photos are fitted to this before they're read: plenty for a cut-out, and the masks stay manageable.
MAX_SIDE = 2400


def send(msg):
    _answers.write(json.dumps(msg) + "\n")
    _answers.flush()


def r4(v):
    return round(float(v), 4)


def r3(v):
    return round(float(v), 3)


def main():
    weights = sys.argv[1]
    started = time.time()
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    import numpy as np
    import torch
    from PIL import Image, ImageFilter, ImageOps

    if not torch.cuda.is_available():
        raise RuntimeError("PyTorch can't see an NVIDIA card (CUDA). Update the NVIDIA driver, then try again.")
    props = torch.cuda.get_device_properties(0)
    vram_gb = props.total_memory / 1e9
    # A 12 GB card (an RTX 5070) keeps frames in the computer's memory and follows fewer things at once.
    low = vram_gb < 16 or os.environ.get("BEATSHEET_SAM_LOW") == "1"

    triton = fix_triton()
    import sam3.model.decoder as decoder
    from sam3.model_builder import build_sam3_multiplex_video_predictor

    allow_any_attention(decoder)
    bpe = os.path.join(os.path.dirname(inspect.getfile(decoder)), "..", "assets", "bpe_simple_vocab_16e6.txt.gz")
    predictor = build_sam3_multiplex_video_predictor(
        checkpoint_path=weights,
        bpe_path=os.path.abspath(bpe),
        max_num_objects=8 if low else 16,
        # Flash Attention 3 is for data-centre cards (H100); everything else uses PyTorch's own attention.
        use_fa3=False,
        compile=False,
        warm_up=False,
    )
    fix_start_session(predictor.model)
    if triton == "ok":
        triton = check_triton()
    send({"ready": True, "seconds": round(time.time() - started, 2), "gpu": props.name, "vramGb": round(vram_gb, 1), "low": low, "triton": triton})

    def ask(**fields):
        return predictor.handle_request(fields)

    def numpy(x):
        return x.detach().cpu().numpy() if hasattr(x, "detach") else np.asarray(x)

    def outputs(out):
        """A frame's results as plain arrays: ids, scores, boxes (0..1 xywh) and masks (bool, the frame's size)."""
        if out is None:
            return np.zeros(0, int), np.zeros(0), np.zeros((0, 4)), None
        ids = numpy(out.get("out_obj_ids", np.zeros(0))).reshape(-1).astype(int)
        probs = out.get("out_probs")
        probs = numpy(probs).reshape(-1) if probs is not None else np.ones(len(ids))
        boxes = numpy(out.get("out_boxes_xywh", np.zeros((0, 4)))).reshape(-1, 4)
        masks = out.get("out_binary_masks")
        return ids, probs, boxes, (numpy(masks).astype(bool) if masks is not None else None)

    def start(resource, frames=1):
        # Frames take about 6 MB each on the card at the model's 1008 px; long clips (or small cards) keep them in RAM.
        offload = low or frames * 6.1e6 > props.total_memory * 0.25
        return ask(type="start_session", resource_path=resource, offload_video_to_cpu=offload)["session_id"]

    def close(session):
        try:
            ask(type="close_session", session_id=session)
        except Exception:  # noqa: BLE001 - closing is tidying up
            pass

    def frames_of(folder):
        """The frames in a folder the engine made, in order."""
        names = [f for f in os.listdir(folder) if f.lower().endswith(".jpg")]
        return [os.path.join(folder, f) for f in sorted(names, key=lambda f: int(os.path.splitext(f)[0]))]

    def frame_count(video):
        return max(1, len(frames_of(video))) if os.path.isdir(video) else 1

    def direction(at, total):
        # From the last frame there's nothing ahead, and from the first nothing behind (Meta's "both" fails at the ends).
        return "forward" if at <= 0 else "backward" if at >= total - 1 else "both"

    class detecting:
        """SAM 3.1 ignores output_prob_thresh when it detects; these are the cut-offs it really uses."""

        def __init__(self, threshold):
            self.threshold = threshold

        def __enter__(self):
            m = predictor.model
            self.saved = (m.score_threshold_detection, m.new_det_thresh)
            if self.threshold is not None:
                m.score_threshold_detection = min(self.saved[0], self.threshold)
                m.new_det_thresh = min(self.saved[1], max(self.threshold, NEAR_MISS))

        def __exit__(self, *_):
            predictor.model.score_threshold_detection, predictor.model.new_det_thresh = self.saved

    def clamp_box(b):
        x = min(max(float(b["x"]), 0.0), 1.0)
        y = min(max(float(b["y"]), 0.0), 1.0)
        w = min(max(float(b["w"]), 1e-4), 1.0 - x)
        h = min(max(float(b["h"]), 1e-4), 1.0 - y)
        return [x, y, w, h]

    def iou(a, b):
        x0, y0 = max(a[0], b[0]), max(a[1], b[1])
        x1, y1 = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
        inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
        union = a[2] * a[3] + b[2] * b[3] - inter
        return inter / union if union > 0 else 0.0

    def prompt_frame(session, frame, prompt=None, box=None, point=None, threshold=0.5):
        """Prompts one frame: by description (every match), or the one thing in a box or under a point. Returns that
        frame's results and the ids to keep."""
        if prompt is not None:
            with detecting(threshold if threshold != 0.5 else None):
                out = ask(type="add_prompt", session_id=session, frame_index=frame, text=prompt, output_prob_thresh=threshold)["outputs"]
            ids, probs, boxes, masks = outputs(out)
            if not len(ids) and threshold > NEAR_MISS:
                # Nothing sure enough: the best near miss beats nothing ("the parade float" may only score 0.46).
                with detecting(NEAR_MISS):
                    out = ask(type="add_prompt", session_id=session, frame_index=frame, text=prompt, output_prob_thresh=NEAR_MISS)["outputs"]
                ids, probs, boxes, masks = outputs(out)
                if len(ids):
                    best = int(np.argmax(probs))
                    return out, [int(ids[best])]
            return out, [int(i) for i in ids]
        if box is not None:
            # The box as an example: SAM finds it (and things like it); the one that fills the box is kept.
            want = clamp_box(box)
            with detecting(NEAR_MISS):
                out = ask(type="add_prompt", session_id=session, frame_index=frame, bounding_boxes=[want], bounding_box_labels=[1], output_prob_thresh=NEAR_MISS)["outputs"]
            ids, probs, boxes, masks = outputs(out)
            if len(ids):
                scores = [iou(list(b), want) for b in boxes]
                best = int(np.argmax(scores))
                if scores[best] > 0.1:
                    return out, [int(ids[best])]
            # Not found that way: the thing at the box's middle instead.
            point = {"x": want[0] + want[2] / 2, "y": want[1] + want[3] / 2}
        if point is not None:
            ask(type="reset_session", session_id=session)
            # After a reset no frame has cached results, and a new object's mask is only kept for frames that do.
            state = predictor._all_inference_states[session]["state"]
            state["cached_frame_outputs"] = {f: {} for f in range(state["num_frames"])}
            out = ask(type="add_prompt", session_id=session, frame_index=frame, points=[[float(point["x"]), float(point["y"])]], point_labels=[1], obj_id=1)["outputs"]
            ids, *_ = outputs(out)
            return out, [int(i) for i in ids][:1]
        raise ValueError("say what to cut out: a prompt, a point or a box")

    def keep_only(session, frame, out, keep):
        ids, *_ = outputs(out)
        for i in ids:
            if int(i) not in keep:
                # Not a person's removal: pruning before propagation (see sam3_base_predictor.remove_object).
                ask(type="remove_object", session_id=session, frame_index=frame, obj_id=int(i), is_user_action=False)

    def propagate(session, rid, start_frame, total, direction="forward", keep=None, base=0.0, span=1.0):
        """Every frame's results, in the order SAM gives them (forward, then backward), with progress from `base`."""
        seen = 0
        for r in predictor.handle_stream_request(dict(type="propagate_in_video", session_id=session, propagation_direction=direction, start_frame_index=start_frame, evict_cached_frame_outputs=True)):
            seen += 1
            if seen % 5 == 0:
                send({"id": rid, "progress": round(min(0.99, base + span * seen / max(1, total)), 3)})
            ids, probs, boxes, masks = outputs(r["outputs"])
            if keep is not None:
                pick = [k for k, i in enumerate(ids) if int(i) in keep]
                ids, probs, boxes = ids[pick], probs[pick], boxes[pick]
                masks = masks[pick] if masks is not None else None
            yield int(r["frame_index"]), ids, probs, boxes, masks

    def bounds(mask):
        ys, xs = np.nonzero(mask)
        if not len(xs):
            return None
        h, w = mask.shape
        return {"x": r4(xs.min() / w), "y": r4(ys.min() / h), "w": r4((xs.max() + 1 - xs.min()) / w), "h": r4((ys.max() + 1 - ys.min()) / h)}

    def alpha_of(mask):
        # A soft edge a pixel or two wide, as a cut-out wants.
        return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)))

    def load(path):
        img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        if max(img.size) > MAX_SIDE:
            img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        return img

    def picture(req):
        """The picture as SAM reads it: a PNG of the upright, fitted image (SAM opens files itself)."""
        img = load(req["image"])
        tmp = os.path.join(os.environ.get("TEMP", "."), f"beatsheet-sam-{os.getpid()}-{req.get('id')}.png")
        img.save(tmp)
        return img, tmp

    def segment(req):
        img, tmp = picture(req)
        session = start(tmp)
        try:
            out, keep = prompt_frame(session, 0, req.get("prompt"), req.get("box"), req.get("point"), req.get("threshold", 0.5))
            ids, probs, boxes, masks = outputs(out)
            pick = [k for k, i in enumerate(ids) if int(i) in keep]
            if not pick or masks is None:
                return {"cutouts": []}
            rgb = np.asarray(img)
            if req.get("each"):
                # Largest first: the order pieces pop in, back to front.
                pick = sorted(pick, key=lambda k: -int(masks[k].sum()))[: req.get("max", 8)]
                pieces = [(masks[k], float(probs[k])) for k in pick]
            else:
                pieces = [(np.any(masks[pick], axis=0), float(max(probs[k] for k in pick)))]
            cut = []
            for n, (m, score) in enumerate(pieces):
                if m.shape != rgb.shape[:2]:
                    m = np.asarray(Image.fromarray(m.astype(np.uint8) * 255).resize((rgb.shape[1], rgb.shape[0]))) > 127
                box = bounds(m)
                if box is None:
                    continue
                file = f"{req['out']}{f'-{n + 1}' if len(pieces) > 1 else ''}.png"
                Image.fromarray(np.dstack([rgb, alpha_of(m)]), "RGBA").save(file)
                cut.append({"file": file, "box": box, "score": round(score, 3)})
            return {"cutouts": cut, "size": [img.size[0], img.size[1]]}
        finally:
            close(session)
            os.remove(tmp)

    def locate(req):
        _, tmp = picture(req)
        session = start(tmp)
        try:
            out, keep = prompt_frame(session, 0, req["prompt"], threshold=req.get("threshold", 0.5))
            ids, probs, boxes, masks = outputs(out)
            found = [{"box": dict(zip("xywh", (r4(v) for v in boxes[k]))), "score": r3(probs[k])} for k, i in enumerate(ids) if int(i) in keep]
            return {"found": sorted(found, key=lambda f: -f["score"])}
        finally:
            close(session)
            os.remove(tmp)

    def subjects(req):
        """Faces and people, each followed through the clip: one pass for each."""
        video, fps, t0 = req["video"], float(req["fps"]), float(req.get("from", 0))
        total = frame_count(video)
        is_image = not os.path.isdir(video)
        session = start(video, total)
        tracks = []
        try:
            for n, kind in enumerate(("person", "face")):
                out, _ = prompt_frame(session, 0, kind, threshold=0.5)
                by = {}
                if is_image:
                    ids, _, boxes, _ = outputs(out)
                    for i, b in zip(ids, boxes):
                        by.setdefault(int(i), []).append([0.0, *(r4(v) for v in b)])
                else:
                    for f, ids, _, boxes, _ in propagate(session, req["id"], 0, total, base=n * 0.5, span=0.5):
                        for i, b in zip(ids, boxes):
                            by.setdefault(int(i), []).append([r3(t0 + f / fps), *(r4(v) for v in b)])
                for samples in by.values():
                    samples.sort(key=lambda s: s[0])
                    # A face seen once in a clip is usually a false alarm or a passer-by too brief to matter.
                    if is_image or len(samples) >= 3:
                        tracks.append({"kind": kind, "samples": samples})
                ask(type="reset_session", session_id=session)
        finally:
            close(session)
        tracks.sort(key=lambda t: (t["kind"], -len(t["samples"])))
        return {"tracks": tracks[:16]}

    def track(req):
        """Follows the thing boxed at `at` seconds both ways from there."""
        video, fps, t0 = req["video"], float(req["fps"]), float(req.get("from", 0))
        total = frame_count(video)
        at = min(total - 1, max(0, round((float(req["at"]) - t0) * fps)))
        session = start(video, total)
        try:
            out, keep = prompt_frame(session, at, box=req["box"])
            if not keep:
                raise ValueError("nothing to follow in that box")
            keep_only(session, at, out, keep)
            samples, seen = [], set()
            for f, ids, _, boxes, _ in propagate(session, req["id"], at, total, direction(at, total), set(keep)):
                if len(ids) and f not in seen:
                    seen.add(f)
                    samples.append([r3(t0 + f / fps), *(r4(v) for v in boxes[0])])
            samples.sort(key=lambda s: s[0])
            frames = sorted(seen)
            return {
                "samples": samples,
                "lostForward": not frames or frames[-1] < total - 1,
                "lostBackward": not frames or frames[0] > 0,
            }
        finally:
            close(session)

    def cutout_video(req):
        """Every frame of the clip, with only what was asked for left in it, straight into the encoder."""
        import cv2

        video, fps, t0 = req["video"], float(req["fps"]), float(req.get("from", 0))
        total = frame_count(video)
        session = start(video, total)
        try:
            follow = req.get("follow")
            if follow:
                # Someone found or boxed before: their box where they're first seen in this stretch picks them out.
                first = min(follow, key=lambda s: abs(s[0] - max(t0, follow[0][0])))
                at = min(total - 1, max(0, round((first[0] - t0) * fps)))
                out, keep = prompt_frame(session, at, box=dict(zip("xywh", first[1:5])))
            elif req.get("box"):
                at = min(total - 1, max(0, round((float(req.get("at", t0)) - t0) * fps)))
                out, keep = prompt_frame(session, at, box=req["box"])
            else:
                at = 0
                out, keep = prompt_frame(session, 0, req.get("prompt") or "person", threshold=req.get("threshold", 0.5))
            if not keep:
                raise ValueError("nothing to cut out in that stretch")
            keep_only(session, at, out, keep)
            # SAM gives frames forward from the prompt, then backward; they're kept (packed) until written in order.
            masks = {}
            for f, ids, _, _, m in propagate(session, req["id"], at, total, direction(at, total), set(keep)):
                if m is not None and len(ids):
                    masks[f] = (np.packbits(np.any(m, axis=0)), m.shape[1:])
        finally:
            close(session)

        files = frames_of(video)
        height, width = cv2.imread(files[0]).shape[:2]
        argv = [a.replace("{size}", f"{width}x{height}").replace("{fps}", f"{fps:g}") for a in req["encoder"]]
        enc = subprocess.Popen(argv, stdin=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        extent, n = None, 0
        try:
            for file in files:
                frame = cv2.imread(file)
                if frame is None:
                    break
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                packed = masks.get(n)
                alpha = np.zeros((height, width), np.uint8)
                if packed is not None:
                    bits, shape = packed
                    m = np.unpackbits(bits)[: shape[0] * shape[1]].reshape(shape).astype(bool)
                    if m.shape != (height, width):
                        m = cv2.resize(m.astype(np.uint8), (width, height), interpolation=cv2.INTER_NEAREST).astype(bool)
                    b = bounds(m)
                    if b:
                        extent = b if extent is None else union(extent, b)
                    alpha = alpha_of(m)
                # Straight (not premultiplied) alpha, which is what ffmpeg's rgba means; nothing shows where it's clear.
                rgba = np.dstack([rgb * (alpha[..., None] > 0), alpha]).astype(np.uint8)
                enc.stdin.write(rgba.tobytes())
                n += 1
        finally:
            enc.stdin.close()
            err = enc.stderr.read().decode("utf-8", "replace")
            code = enc.wait()
        if code != 0:
            raise RuntimeError(f"encoding the cut-out failed: {err.strip().splitlines()[-1] if err.strip() else code}")
        return {"frames": n, "fps": fps, "width": width, "height": height, "box": extent or {}}

    def union(a, b):
        x0, y0 = min(a["x"], b["x"]), min(a["y"], b["y"])
        x1, y1 = max(a["x"] + a["w"], b["x"] + b["w"]), max(a["y"] + a["h"], b["y"] + b["h"])
        return {"x": r4(x0), "y": r4(y0), "w": r4(x1 - x0), "h": r4(y1 - y0)}

    ops = {"segment": segment, "find": locate, "subjects": subjects, "track": track, "cutout-video": cutout_video}
    for line in sys.stdin:
        if not line.strip():
            continue
        req = {}
        try:
            req = json.loads(line)
            t = time.time()
            op = ops.get(req.get("op"))
            if op is None:
                raise ValueError(f"unknown op {req.get('op')!r}")
            res = op(req)
            send({"id": req.get("id"), "ok": True, "seconds": round(time.time() - t, 2), **res})
        except Exception as e:  # one bad request shouldn't take the worker down
            send({"id": req.get("id"), "ok": False, "error": f"{type(e).__name__}: {e}"})
        finally:
            torch.cuda.empty_cache()


# ---- Meta's code, worked around


def fix_start_session(model):
    """SAM 3.1's init_state doesn't take offload_state_to_cpu, which start_session always passes (#544)."""
    original = model.init_state
    takes = set(inspect.signature(original).parameters)

    def init_state(**kwargs):
        return original(**{k: v for k, v in kwargs.items() if k in takes})

    model.init_state = init_state


def allow_any_attention(decoder):
    """The decoder asks for Flash Attention only, which PyTorch for Windows doesn't have; let it fall back (#523)."""
    from torch.nn.attention import SDPBackend, sdpa_kernel

    def any_kernel(*_args, **_kwargs):
        return sdpa_kernel([SDPBackend.FLASH_ATTENTION, SDPBackend.EFFICIENT_ATTENTION, SDPBackend.MATH])

    decoder.sdpa_kernel = any_kernel


def fix_triton():
    """Triton for Windows, or stand-ins for the three kernels the tracker uses when it isn't there."""
    if os.environ.get("BEATSHEET_SAM_TRITON") == "0":
        stub_triton()
        use_cpu_kernels()
        return "off: the processor does the tracker's few Triton steps"
    try:
        import triton  # noqa: F401
        import triton.language  # noqa: F401

        return "ok"
    except Exception as e:  # noqa: BLE001 - whatever stops it, the stand-ins work
        stub_triton()
        use_cpu_kernels()
        return f"missing ({type(e).__name__}: {e}); the processor does the tracker's few Triton steps"


def check_triton():
    """Triton imports, but can it build a kernel on this card? If not, the processor does those steps."""
    import torch

    try:
        from sam3.perflib.connected_components import connected_components

        connected_components(torch.zeros(1, 1, 16, 16, dtype=torch.uint8, device="cuda"))
        torch.cuda.synchronize()
        return "ok"
    except Exception as e:  # noqa: BLE001
        use_cpu_kernels()
        return f"broken ({type(e).__name__}: {str(e)[:200]}); the processor does the tracker's few Triton steps"


def stub_triton():
    """Just enough of a `triton` module for Meta's files to import; nothing calls into it once use_cpu_kernels runs."""
    import types

    triton = types.ModuleType("triton")
    language = types.ModuleType("triton.language")
    triton.jit = lambda fn=None, **_kw: fn if fn is not None else (lambda f: f)
    triton.autotune = lambda *a, **k: (lambda f: f)
    triton.heuristics = lambda *a, **k: (lambda f: f)
    triton.Config = lambda *a, **k: None
    triton.cdiv = lambda a, b: -(-a // b)
    triton.next_power_of_2 = lambda n: 1 << (int(n) - 1).bit_length()
    language.constexpr = int
    triton.language = language
    sys.modules["triton"] = triton
    sys.modules["triton.language"] = language


def use_cpu_kernels():
    """Connected components, mask NMS and the distance transform on the processor, wherever Meta's code looks them up."""
    import numpy as np
    import torch

    import sam3.perflib.connected_components as cc
    import sam3.perflib.nms as nms

    def connected_components(t):
        labels, counts = cc.connected_components_cpu(t.cpu())
        return labels.to(t.device), counts.to(t.device)

    cc.connected_components = connected_components
    nms.generic_nms = lambda ious, scores, iou_threshold=0.5: nms.generic_nms_cpu(ious, scores, iou_threshold).to(ious.device)

    def edt(data):
        import cv2

        # What the kernel mimics: OpenCV's precise L2 distance to the nearest zero.
        out = [cv2.distanceTransform((m != 0).astype(np.uint8), cv2.DIST_L2, 0) for m in data.detach().cpu().numpy()]
        return torch.from_numpy(np.stack(out)).to(data.device)

    import sam3.model.sam3_tracker_utils as tracker_utils

    tracker_utils.edt_triton = edt


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        send({"ready": False, "error": f"{type(e).__name__}: {e}"})
        sys.exit(1)
