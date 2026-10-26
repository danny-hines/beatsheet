"""Synthesizes beatsheet's built-in sound effects into packages/engine/sfx/*.wav (44.1 kHz mono, 16-bit).

All made from oscillators and noise here, so they're original and free to use anywhere. Run it again to remake them:

    uv run --with numpy python packages/engine/py/make_sfx.py
"""

import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
rng = np.random.default_rng(7)
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "sfx"


def t(seconds):
    return np.arange(int(SR * seconds)) / SR


def noise(seconds):
    return rng.uniform(-1, 1, int(SR * seconds))


def lowpass(x, cutoff):
    """One-pole low-pass; `cutoff` may be an array (Hz per sample) for a sweep."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def lowpass3(x, cutoff):
    """Three poles: a steep slope, so noise above the cutoff really goes (airy, not hissy)."""
    return lowpass(lowpass(lowpass(x, cutoff), cutoff), cutoff)


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def env(n, attack, release, curve=3.0):
    """Rises over `attack` seconds, then falls away over `release`."""
    a = int(SR * attack)
    e = np.ones(n)
    if a > 0:
        e[:a] = np.linspace(0, 1, a) ** 2
    r = np.linspace(1, 0, max(1, n - a)) ** curve
    e[a:] = r[: n - a]
    return e


def sweep_sine(seconds, f0, f1, shape=1.0):
    tt = t(seconds)
    k = (tt / seconds) ** shape
    freq = f0 + (f1 - f0) * k
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


def save(name, x, peak_db=-3.0):
    x = np.asarray(x, dtype=float)
    fade = min(len(x), int(SR * 0.004))
    x[-fade:] *= np.linspace(1, 0, fade)
    x = x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    print(f"{name}: {len(x) / SR:.2f}s")


def whoosh(seconds, lo, hi, peak=0.55):
    n = noise(seconds)
    k = t(seconds) / seconds
    # The filter opens as it passes, then closes: air rushing by.
    cutoff = lo + (hi - lo) * np.sin(np.pi * np.clip(k / (2 * peak), 0, 0.5) + np.pi * np.clip((k - peak) / (2 * (1 - peak)), 0, 0.5))
    body = lowpass3(n, cutoff) - 0.5 * lowpass3(n, cutoff * 0.2)
    shape = np.where(k < peak, (k / peak) ** 2, ((1 - k) / (1 - peak)) ** 1.6)
    return body * shape


def pop(f0, f1, seconds=0.12):
    tone = sweep_sine(seconds, f0, f1, 0.4)
    click = lowpass(highpass(noise(seconds), 1500), 5000) * env(int(SR * seconds), 0, 0.006, 2) * 0.08
    return (tone * env(len(tone), 0.002, seconds, 4) + click)


def tick():
    s = 0.035
    return np.sin(2 * np.pi * 3200 * t(s)) * env(int(SR * s), 0.0005, s, 6) + highpass(noise(s), 4000) * env(int(SR * s), 0, s, 9) * 0.5


def click():
    a = highpass(noise(0.012), 1500) * env(int(SR * 0.012), 0, 0.012, 3)
    gap = np.zeros(int(SR * 0.018))
    b = highpass(noise(0.01), 2500) * env(int(SR * 0.01), 0, 0.01, 3) * 0.7
    return np.concatenate([a, gap, b, np.zeros(int(SR * 0.02))])


def typing(seconds=1.1):
    out = np.zeros(int(SR * seconds))
    at = 0.02
    while at < seconds - 0.06:
        k = tick() * rng.uniform(0.5, 1.0)
        k = lowpass(k, rng.uniform(2500, 7000))
        i = int(SR * at)
        out[i : i + len(k)] += k[: len(out) - i]
        at += rng.uniform(0.05, 0.12)
    return out


def impact(seconds=0.7, f0=90, f1=42, grit=0.35):
    thump = sweep_sine(seconds, f0, f1, 0.3) * env(int(SR * seconds), 0.002, seconds, 3.5)
    crack = lowpass3(noise(seconds), 1400) * env(int(SR * seconds), 0, 0.08, 4) * grit
    x = thump + crack
    return np.tanh(x * 2.2)


def boom():
    sub = sweep_sine(1.4, 70, 34, 0.35) * env(int(SR * 1.4), 0.004, 1.4, 2.6)
    tail = lowpass(noise(1.4), np.linspace(1200, 200, int(SR * 1.4))) * env(int(SR * 1.4), 0.01, 1.4, 2.2) * 0.45
    return np.tanh((sub + tail) * 2.0)


def riser(seconds=1.6):
    k = t(seconds) / seconds
    air = lowpass3(noise(seconds), 300 + 6000 * k**2) * k**2
    tone = sweep_sine(seconds, 180, 1400, 2.0) * k**3 * 0.35
    return air + tone


def shimmer(seconds=1.3):
    out = np.zeros(int(SR * seconds))
    tt = t(seconds)
    for f in [2093, 2637, 3136, 3951, 4699, 5274]:
        out += np.sin(2 * np.pi * f * tt + rng.uniform(0, 6.28)) * (0.6 + 0.4 * np.sin(2 * np.pi * rng.uniform(5, 9) * tt))
    return out * env(len(out), 0.01, seconds, 2.4)


def glitch(seconds=0.35):
    out = np.zeros(int(SR * seconds))
    i = 0
    while i < len(out):
        n = int(SR * rng.uniform(0.012, 0.04))
        kind = rng.integers(0, 3)
        tt = np.arange(n) / SR
        if kind == 0:
            seg = np.sign(np.sin(2 * np.pi * rng.uniform(200, 2500) * tt))
        elif kind == 1:
            seg = noise(n / SR)
        else:
            seg = np.round(np.sin(2 * np.pi * rng.uniform(60, 400) * tt) * 4) / 4
        out[i : i + n] = seg[: len(out) - i] * rng.uniform(0.4, 1.0)
        i += n
    return out * env(len(out), 0.002, seconds, 1.2)


def shutter():
    first = lowpass(highpass(noise(0.025), 2500), 9000) * env(int(SR * 0.025), 0, 0.025, 2)
    whir = lowpass(noise(0.05), 1200) * env(int(SR * 0.05), 0.005, 0.05, 1.5) * 0.35
    second = lowpass(highpass(noise(0.03), 1800), 7000) * env(int(SR * 0.03), 0, 0.03, 2) * 0.9
    return np.concatenate([first, whir, second, np.zeros(int(SR * 0.08))])


def bell(freq, seconds):
    tt = t(seconds)
    x = np.sin(2 * np.pi * freq * tt) + 0.35 * np.sin(2 * np.pi * freq * 2.76 * tt) + 0.15 * np.sin(2 * np.pi * freq * 5.4 * tt)
    return x * env(len(x), 0.003, seconds, 3)


def success():
    a = bell(1318.5, 0.5)
    b = bell(1975.5, 0.8)
    out = np.zeros(int(SR * 0.95))
    out[: len(a)] += a
    j = int(SR * 0.12)
    out[j : j + len(b)] += b[: len(out) - j]
    return out


save("whoosh", whoosh(0.7, 300, 5200))
save("whoosh-short", whoosh(0.32, 500, 6500, 0.5))
save("swish", highpass(whoosh(0.22, 2500, 9000, 0.4), 1500))
save("pop", pop(950, 320))
save("pop-high", pop(1500, 700, 0.09))
save("pop-low", pop(520, 170, 0.16))
save("tick", tick(), -6)
save("click", click(), -4)
save("typing", typing(), -6)
save("impact", impact())
save("boom", boom())
save("riser", riser())
save("shimmer", shimmer(), -6)
save("glitch", glitch(), -5)
save("shutter", shutter())
save("success", success(), -4)
save("ding", bell(1760, 1.1), -5)
