"""Beat grid and sections for a music file, printed as JSON.

Same approach as the Sparkade beat-grid scripts: estimate the tempo, refine tempo and phase by a grid search over
onset strength, pick the downbeat as the beat position with the strongest low-end hits, then measure loudness per
bar. Sections come from that loudness: 4-bar phrases grouped into low, mid and high energy, then labelled.

Usage: uv run --with librosa --with numpy python analyze_music.py <file>
"""
import json
import sys

import librosa
import numpy as np

HOP = 128
SR = 22050


def fold_score(onset, period_frames, phases=128):
    """Best mean onset strength over a grid of this period, and the phase (in frames) it occurs at."""
    n = int(len(onset) // period_frames)
    if n < 8:
        return 0.0, 0.0
    best, best_off = -1.0, 0.0
    for off in np.linspace(0, period_frames, phases, endpoint=False):
        idx = (off + np.arange(n) * period_frames).astype(int)
        score = onset[idx].mean()
        if score > best:
            best, best_off = score, off
    return float(best), float(best_off)


def grid(y, sr):
    """Tempo, first beat and downbeats. Searches the whole 70-180 BPM range, then refines around the winner."""
    dur = len(y) / sr
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    fps = sr / HOP
    # Coarse: every tempo in range, best phase each. A mild prior toward ~115 BPM breaks near-ties between
    # related tempos (half, double, 4/3) in favour of the one a montage would cut to.
    coarse = []
    for bpm in np.arange(70, 180, 0.25):
        score, _ = fold_score(onset, fps * 60 / bpm, phases=48)
        coarse.append((score * (1 - 0.12 * abs(np.log2(bpm / 115))), bpm))
    _, bpm0 = max(coarse)
    best = None
    for bpm in np.arange(bpm0 - 0.4, bpm0 + 0.4, 0.005):
        score, off = fold_score(onset, fps * 60 / bpm, phases=96)
        if best is None or score > best[0]:
            best = (score, bpm, off)
    _, bpm, off = best
    per = 60 / bpm
    first = (off / fps) % per
    beats = np.arange(first, dur, per)
    # Downbeat: the beat position (of 4) with the strongest low-frequency hits.
    spec = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    low = librosa.onset.onset_strength(S=librosa.amplitude_to_db(spec[:30]), sr=sr, hop_length=HOP)
    frames = (beats * fps).astype(int)
    frames = frames[frames < len(low)]
    phase = int(np.argmax([low[frames[k::4]].mean() for k in range(4)]))
    return float(bpm), float(first), beats[phase::4], dur


def sections(y, sr, downbeats, dur, per_bar):
    """Sections from loudness per bar: boundaries where the next 4 bars are clearly louder or quieter than the last 4."""
    rms = librosa.feature.rms(y=y, hop_length=512)[0]
    energy = []
    for d in downbeats:
        a, b = int(d * sr / 512), int((d + per_bar) * sr / 512)
        seg = rms[a:max(b, a + 1)]
        energy.append(float(20 * np.log10(seg.mean() + 1e-9)) if len(seg) else -90.0)
    e = np.array(energy)
    n = len(e)
    novelty = np.zeros(n)
    for b in range(2, n - 1):
        novelty[b] = e[b:b + 4].mean() - e[max(0, b - 4):b].mean()
    cands = sorted((b for b in range(2, n - 1) if abs(novelty[b]) >= 3), key=lambda b: -abs(novelty[b]))
    bounds = []
    for b in cands:
        if all(abs(b - x) >= 4 for x in bounds):
            bounds.append(b)
    edges = [0] + sorted(bounds) + [n]
    segs = [(edges[i], edges[i + 1], float(e[edges[i]:edges[i + 1]].mean())) for i in range(len(edges) - 1)]
    top, bottom = max(m for *_, m in segs), min(m for *_, m in segs)
    span = top - bottom

    def level(m):
        if span < 4:
            return "mid"
        if m >= top - min(3, span * 0.3):
            return "high"
        if m <= bottom + min(3, span * 0.3):
            return "low"
        return "mid"

    runs = []
    for a, b, m in segs:
        lv = level(m)
        if runs and runs[-1]["level"] == lv:
            runs[-1]["end_bar"] = b
        else:
            runs.append({"level": lv, "start_bar": a, "end_bar": b})
    counts = {}
    out = []
    for k, run in enumerate(runs):
        nxt = runs[k + 1]["level"] if k + 1 < len(runs) else None
        if run["level"] == "high":
            label = "Drop"
        elif k == 0:
            label = "Intro"
        elif k == len(runs) - 1:
            label = "Outro"
        elif nxt == "high":
            label = "Build"
        elif run["level"] == "low":
            label = "Break"
        else:
            label = "Verse"
        counts[label] = counts.get(label, 0) + 1
        c = counts[label]
        start = 0.0 if k == 0 else float(downbeats[run["start_bar"]])
        out.append({
            "id": label.lower() if c == 1 else f"{label.lower()}{c}",
            "label": label if c == 1 else f"{label} {c}",
            "start": round(start, 4),
            "level": run["level"],
            "bars": run["end_bar"] - run["start_bar"],
        })
    for k, s in enumerate(out):
        s["end"] = out[k + 1]["start"] if k + 1 < len(out) else round(dur, 3)
    return out, energy


def main():
    path = sys.argv[1]
    y, sr = librosa.load(path, sr=SR, mono=True)
    bpm, first, downbeats, dur = grid(y, sr)
    per_bar = 4 * 60 / bpm
    secs, energy = sections(y, sr, downbeats, dur, per_bar)
    print(json.dumps({
        "bpm": round(bpm, 3),
        "downbeat": round(float(downbeats[0]), 4),
        "beatsPerBar": 4,
        "duration": round(dur, 3),
        "sections": secs,
        "barEnergy": [round(e, 1) for e in energy],
    }))


if __name__ == "__main__":
    main()
