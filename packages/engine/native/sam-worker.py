"""
beatsheet's SAM 3 worker: Meta's Segment Anything 3 on this Mac, through the MLX port (github.com/Deekshith-Dade/mlx_sam3).
It cuts things out of a picture by description ("the dog", "the kids") and writes each as a transparent PNG the size of
the picture, so a cut-out lines up over where it came from.

Run with the Python environment beatsheet installs (Settings → On this Mac):

    python -I -B sam-worker.py <code folder> <weights file>

It loads the model once, says {"ready": true} on stdout, then answers one JSON request per line on stdin:

    {"id": 1, "op": "segment", "image": "/a.jpg", "prompt": "the dog", "out": "/made/a-dog", "each": false}
    → {"id": 1, "ok": true, "cutouts": [{"file": "/made/a-dog.png", "box": {"x":…, "y":…, "w":…, "h":…}, "score": 0.93}]}

Boxes are 0..1 of the picture, top-left origin. Anything else the libraries print goes to stderr.
"""

import json
import os
import sys
import time

# stdout carries only our answers; library chatter (and anything printed from C) goes to stderr.
_answers = os.fdopen(os.dup(1), "w", buffering=1)
os.dup2(2, 1)
sys.stdout = sys.stderr

# Big photos are fitted to this, like the Vision helper does: plenty for a cut-out, and the masks stay manageable.
MAX_SIDE = 2400
# Below the usual 0.5, how sure SAM must be before its best guess is used when nothing scores higher.
NEAR_MISS = 0.3


def send(msg):
    _answers.write(json.dumps(msg) + "\n")
    _answers.flush()


def main():
    code, weights = sys.argv[1], sys.argv[2]
    started = time.time()
    import numpy as np
    from PIL import Image, ImageOps
    from sam3 import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor

    model = build_sam3_image_model(bpe_path=os.path.join(code, "assets", "bpe_simple_vocab_16e6.txt.gz"), checkpoint_path=weights)
    processor = Sam3Processor(model, confidence_threshold=0.5)
    send({"ready": True, "seconds": round(time.time() - started, 2)})

    def load(path):
        img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        if max(img.size) > MAX_SIDE:
            img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        return img

    def find(img, prompt, threshold):
        processor.confidence_threshold = threshold
        state = processor.set_image(img)
        state = processor.set_text_prompt(prompt, state)
        scores = np.array(state["scores"]).reshape(-1)
        if not len(scores) and threshold > NEAR_MISS:
            # Nothing sure enough: the best near miss beats nothing ("the parade float" may only score 0.46).
            processor.confidence_threshold = NEAR_MISS
            state = processor.set_text_prompt(prompt, state)
            scores = np.array(state["scores"]).reshape(-1)
            if len(scores):
                best = int(scores.argmax())
                probs = np.array(state["mask_logits"]).reshape(-1, img.size[1], img.size[0])
                return probs[best : best + 1], scores[best : best + 1]
        probs = np.array(state["mask_logits"]).reshape(-1, img.size[1], img.size[0])
        return probs, scores

    def bounds(p, w, h):
        ys, xs = np.nonzero(p > 0.5)
        if not len(xs):
            return None
        box = {"x": xs.min() / w, "y": ys.min() / h, "w": (xs.max() + 1 - xs.min()) / w, "h": (ys.max() + 1 - ys.min()) / h}
        return {k: round(float(v), 5) for k, v in box.items()}

    def segment(req):
        img = load(req["image"])
        w, h = img.size
        probs, scores = find(img, req["prompt"], req.get("threshold", 0.5))
        if not len(scores):
            return {"cutouts": []}
        if req.get("each"):
            # Largest first: the order pieces pop in, back to front.
            order = sorted(range(len(scores)), key=lambda i: -(probs[i] > 0.5).sum())[: req.get("max", 8)]
            pieces = [(probs[i], float(scores[i])) for i in order]
        else:
            pieces = [(probs.max(axis=0), float(scores.max()))]
        rgb = np.asarray(img)
        out = []
        for n, (p, score) in enumerate(pieces):
            box = bounds(p, w, h)
            if box is None:
                continue
            # A soft edge a couple of pixels wide, and nothing stray far from the subject.
            alpha = (np.clip((p - 0.3) / 0.4, 0, 1) * 255).astype(np.uint8)
            file = f"{req['out']}{f'-{n + 1}' if len(pieces) > 1 else ''}.png"
            Image.fromarray(np.dstack([rgb, alpha]), "RGBA").save(file)
            out.append({"file": file, "box": box, "score": round(score, 3)})
        return {"cutouts": out, "size": [w, h]}

    def locate(req):
        img = load(req["image"])
        w, h = img.size
        probs, scores = find(img, req["prompt"], req.get("threshold", 0.5))
        found = [{"box": bounds(probs[i], w, h), "score": round(float(scores[i]), 3)} for i in range(len(scores))]
        return {"found": sorted([f for f in found if f["box"]], key=lambda f: -f["score"])}

    for line in sys.stdin:
        if not line.strip():
            continue
        req = {}
        try:
            req = json.loads(line)
            t = time.time()
            if req.get("op") == "segment":
                res = segment(req)
            elif req.get("op") == "find":
                res = locate(req)
            else:
                raise ValueError(f"unknown op {req.get('op')!r}")
            send({"id": req.get("id"), "ok": True, "seconds": round(time.time() - t, 2), **res})
        except Exception as e:  # one bad request shouldn't take the worker down
            send({"id": req.get("id"), "ok": False, "error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        send({"ready": False, "error": f"{type(e).__name__}: {e}"})
        sys.exit(1)
