"""beatsheet's Kokoro worker: loads Kokoro-82M once and speaks lines to WAV files with the time of every word.

Started by the engine (packages/engine/src/kokoro.ts) with the environment Settings installed. It prints {"ready": true}
once the model is loaded (or {"ready": false, "error": ...}), then answers one JSON request per line on stdin:

  {"id": 1, "op": "speak", "text": "...", "voice": "af_heart", "out": "/path/line.wav", "speed": 1.0}
    -> {"id": 1, "ok": true, "duration": 3.2, "words": [{"w": "Hello,", "s": 0.05, "e": 0.41}, ...], "seconds": 0.8}
"""

import json
import sys
import time

RATE = 24000


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def words_of(tokens, offset):
    """Misaki's tokens as written words: whatever follows a token with no space between joins it ("quarters.", "doesn't"),
    as captions show it."""
    words = []
    current = None
    for t in tokens or []:
        text = t.text or ""
        start, end = t.start_ts, t.end_ts
        if current is not None and not current["space"]:
            current["w"] += text
            # A full stop's time is the pause after it, not the word.
            if end is not None and any(c.isalnum() for c in text):
                current["e"] = offset + end
            current["space"] = bool(t.whitespace)
            continue
        if current is not None:
            words.append(current)
        current = None
        if not text.strip():
            continue
        current = {"w": text, "s": offset + (start or 0), "e": offset + (end if end is not None else (start or 0)), "space": bool(t.whitespace)}
    if current is not None:
        words.append(current)
    return [{"w": w["w"], "s": round(w["s"], 3), "e": round(max(w["e"], w["s"]), 3)} for w in words if w["w"].strip()]


def main():
    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline

        pipelines = {}

        def pipeline(lang):
            if lang not in pipelines:
                pipelines[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
            return pipelines[lang]

        pipeline("a")
    except Exception as e:  # noqa: BLE001 - whatever stops it loading is what the person needs to see
        send({"ready": False, "error": f"{type(e).__name__}: {e}"})
        return
    send({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        rid = req.get("id")
        try:
            started = time.time()
            voice = req["voice"]
            # Voice names start with their language: af_heart is American English, bf_emma British.
            lang = voice[0] if voice[:1] in ("a", "b") else "a"
            chunks, words, offset = [], [], 0.0
            for r in pipeline(lang)(req["text"], voice=voice, speed=float(req.get("speed") or 1)):
                if r.audio is None:
                    continue
                audio = r.audio.detach().cpu().numpy() if hasattr(r.audio, "detach") else np.asarray(r.audio)
                words += words_of(r.tokens, offset)
                chunks.append(audio)
                offset += len(audio) / RATE
            if not chunks:
                raise RuntimeError("the voice made no sound")
            audio = np.concatenate(chunks)
            sf.write(req["out"], audio, RATE, subtype="PCM_16")
            send({"id": rid, "ok": True, "duration": round(len(audio) / RATE, 3), "words": words, "seconds": round(time.time() - started, 2)})
        except Exception as e:  # noqa: BLE001
            send({"id": rid, "ok": False, "error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    main()
