/**
 * Changing existing footage in place (clip versions): Light Sphere Relight (24 built-in presets or a custom sphere
 * extracted from any reference film still). Results land as clip versions keeping the original sound, subjects and
 * timing.
 */
import { formatTime, RELIGHT_CATEGORIES, RELIGHT_PRESETS, type Asset, type Choices, type RelightCategory } from "@beatsheet/schema";
import { useEffect, useState } from "react";
import { runJob } from "../lib";
import { actions, useProject, useStore } from "../store";

const CAT_LABEL: Record<RelightCategory, string> = {
  cinematic: "Cinematic",
  technique: "Techniques",
  neutral: "Neutral",
};

/** Relights a stretch of a clip using a lit calibration sphere and Seedance 2.5. */
export function RelightClip({ a, t }: { a: Asset; t: number }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const duration = a.duration ?? 0;
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<RelightCategory>("cinematic");
  const [preset, setPreset] = useState(p.look?.lightPreset ?? "blue-amber");
  const [sphere, setSphere] = useState(p.look?.lightSphere ?? "");
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<"rough" | "final">("rough");
  const [saveToLook, setSaveToLook] = useState(false);
  const [range, setRange] = useState<[number, number]>([0, Math.min(duration, 8)]);
  const [plan, setPlan] = useState<{ choices: Choices; seconds: number }>();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setRange([0, Math.min(duration, 8)]), [a.id, duration]);

  const spheres = p.assets.filter((x) => x.kind === "image" && (x.tags?.includes("light-sphere") || x.id === p.look?.lightSphere));
  const versions = p.assets.filter((x) => x.version?.of === a.id && x.tags?.includes("relight"));

  useEffect(() => {
    if (!open) return;
    const q = new URLSearchParams({
      asset: a.id,
      from: String(range[0]),
      to: String(range[1]),
      quality,
      ...(sphere ? { sphere } : { preset }),
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
    });
    let live = true;
    void fetch(`/api/projects/${projectId}/relight?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ choices: Choices; seconds: number }>) : undefined))
      .then((x) => live && setPlan(x))
      .catch(() => {});
    return () => void (live = false);
  }, [open, projectId, a.id, range, preset, sphere, prompt, quality]);

  const auto = plan?.choices.auto;

  const go = async () => {
    setError("");
    setSaid("");
    setBusy(true);
    try {
      await actions.flushSave();
      const res = await fetch(`/api/projects/${projectId}/relight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          asset: a.id,
          cut: cutId,
          from: range[0],
          to: range[1],
          quality,
          ...(sphere ? { sphere } : { preset }),
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
          use: true,
          saveToLook,
        }),
      });
      const j = (await res.json()) as { jobs?: { id: string }[]; error?: string; adapted?: boolean };
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      await actions.reload();
      setSaid(`Relighting started (${j.jobs?.map((x) => x.id).join(", ")})${j.adapted ? " · adapted to first frame" : ""}. Watch Make → Queue; it lands as a clip version.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="change-clip">
      <h4>
        Relight <span className="dim small">light sphere · new lighting</span>
      </h4>
      {versions.length > 0 && (
        <ul className="plain small">
          {versions.map((v) => (
            <li key={v.id} className="make-row">
              <button className="link small" onClick={() => actions.select({ kind: "asset", id: v.id })}>
                {v.label ?? v.id}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        <button className="link small" onClick={() => setOpen(true)}>
          {versions.length ? "Try another lighting setup…" : "Relight with a light sphere…"}
        </button>
      ) : (
        <div className="restore-form">
          <div className="make-row small">
            <span>
              From <span className="mono">{formatTime(range[0])}</span> to <span className="mono">{formatTime(range[1])}</span>
            </span>
            <button className="link small" onClick={() => setRange([Math.min(t, Math.max(0, range[1] - 2)), range[1]])}>
              From here
            </button>
            <button className="link small" onClick={() => setRange([range[0], Math.min(duration, Math.max(t, range[0] + 2))])}>
              To here
            </button>
          </div>
          <div className="segmented" role="group" aria-label="Lighting category">
            {RELIGHT_CATEGORIES.map((c) => (
              <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
                {CAT_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="relight-grid">
            {RELIGHT_PRESETS.filter((x) => x.category === cat).map((x) => (
              <button
                key={x.id}
                className={`relight-card ${!sphere && preset === x.id ? "on" : ""}`}
                onClick={() => {
                  setSphere("");
                  setPreset(x.id);
                }}
                title={x.summary}
              >
                <span className="relight-orb" style={{ background: x.swatch }} aria-hidden="true" />
                <span className="small">{x.label}</span>
              </button>
            ))}
          </div>
          {spheres.length > 0 && (
            <label className="small">
              Or use a saved sphere
              <select value={sphere} onChange={(e) => setSphere(e.target.value)}>
                <option value="">Use preset above</option>
                {spheres.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label ?? s.id}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Optional lighting tweak (e.g. softer shadows, rainy window glow)" />
          <div className="make-row small">
            <select value={quality} onChange={(e) => setQuality(e.target.value as "rough" | "final")} aria-label="Quality">
              <option value="rough">Rough (480p)</option>
              <option value="final">Final (1080p)</option>
            </select>
            <label className="check small">
              <input type="checkbox" checked={saveToLook} onChange={(e) => setSaveToLook(e.target.checked)} /> Save to Look
            </label>
          </div>
          <div className="make-row">
            <button className="primary" disabled={busy || !auto} onClick={() => void go()}>
              {busy ? "Starting…" : auto ? `Relight · ${auto.label}${auto.usd !== undefined ? ` · ~$${auto.usd.toFixed(2)}` : ""}` : "Relight (connect Tein, fal, Runway or OpenRouter)"}
            </button>
            <button className="link small" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {said && <p className="small good">{said}</p>}
          {error && <p className="warn small">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** For reference stills/photos: extract a matching lit calibration sphere to reuse for relighting. */
export function ExtractSphere({ a }: { a: Asset }) {
  const projectId = useStore((s) => s.projectId)!;
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const go = async () => {
    setError("");
    setSaid("");
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/light-sphere`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asset: a.id }),
      });
      const j = (await res.json()) as { jobs?: { id: string }[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      await actions.reload();
      setSaid(`Extracting light sphere (${j.jobs?.map((x) => x.id).join(", ")}). It lands in Made as a reusable lighting sphere.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="change-clip">
      <h4>
        Lighting <span className="dim small">extract from this still</span>
      </h4>
      <button className="link small" disabled={busy} onClick={() => void go()}>
        {busy ? "Starting…" : "Extract a light sphere from this picture…"}
      </button>
      {said && <p className="small good">{said}</p>}
      {error && <p className="warn small">{error}</p>}
    </div>
  );
}

/** Stem separation (Demucs htdemucs) and pitch-preserving / formant-preserving voice shift (Rubber Band). */
export function StemsAndPitch({ a }: { a: Asset }) {
  const projectId = useStore((s) => s.projectId)!;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"two-stem" | "four-stem">("two-stem");
  const [semitones, setSemitones] = useState(a.pitch?.semitones ?? 0);
  const [keepMusic, setKeepMusic] = useState(a.pitch?.keepMusic ?? !!a.stems);
  const [stemBusy, setStemBusy] = useState<number | null>(null);
  const [pitchBusy, setPitchBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSemitones(a.pitch?.semitones ?? 0);
  }, [a.id, a.pitch?.semitones]);

  const separate = async (addAssets: boolean) => {
    setError("");
    setSaid("");
    setStemBusy(0);
    try {
      await actions.flushSave();
      const out = await runJob(`/api/projects/${projectId}/stems`, { asset: a.id, mode, addAssets }, setStemBusy);
      const r = out ? (JSON.parse(out) as { tracks?: string[]; added?: string[] }) : undefined;
      await actions.reload();
      setSaid(`Stems ready (${(r?.tracks ?? []).join(", ")})${r?.added?.length ? ` · added ${r.added.length} audio assets` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStemBusy(null);
    }
  };

  const applyPitch = async () => {
    setError("");
    setSaid("");
    setPitchBusy(true);
    try {
      await actions.flushSave();
      const res = await fetch(`/api/projects/${projectId}/shift-audio`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asset: a.id, semitones, keepMusic }),
      });
      const j = (await res.json()) as { engine?: string; keepMusic?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      await actions.reload();
      setSaid(`Shifted ${semitones > 0 ? "+" : ""}${semitones} st (${j.engine}${j.keepMusic ? ", vocals only" : ""}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPitchBusy(false);
    }
  };

  const resetPitch = async () => {
    setError("");
    await fetch(`/api/projects/${projectId}/shift-audio?asset=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    await actions.reload();
    setSemitones(0);
    setSaid("Back to original pitch.");
  };

  return (
    <div className="change-clip">
      <h4>
        Stems &amp; pitch{" "}
        <span className="dim small">
          {a.stems ? `${a.stems.tracks.join(", ")}` : "Demucs"}
          {a.pitch ? ` · ${a.pitch.semitones > 0 ? "+" : ""}${a.pitch.semitones} st` : ""}
        </span>
      </h4>
      {!open ? (
        <button className="link small" onClick={() => setOpen(true)}>
          {a.stems || a.pitch ? "Adjust stems or voice pitch…" : "Separate stems or shift voice pitch…"}
        </button>
      ) : (
        <div className="restore-form">
          <div className="make-row small">
            <select value={mode} onChange={(e) => setMode(e.target.value as "two-stem" | "four-stem")} aria-label="Stem mode">
              <option value="two-stem">2 stems (vocals + music)</option>
              <option value="four-stem">4 stems (vocals, drums, bass, other)</option>
            </select>
            <button disabled={stemBusy !== null} onClick={() => void separate(true)}>
              {stemBusy !== null ? `Separating ${Math.round(stemBusy * 100)}%` : "Separate & add tracks"}
            </button>
          </div>
          <label className="small">
            Voice pitch ({semitones > 0 ? `+${semitones}` : semitones} semitones)
            <input type="range" min={-12} max={12} step={0.5} value={semitones} onChange={(e) => setSemitones(Number(e.target.value))} />
          </label>
          <label className="check small">
            <input type="checkbox" checked={keepMusic} onChange={(e) => setKeepMusic(e.target.checked)} /> Shift vocals only (keep music untouched via Demucs)
          </label>
          <div className="make-row">
            <button className="primary" disabled={pitchBusy || Math.abs(semitones) < 0.01} onClick={() => void applyPitch()}>
              {pitchBusy ? "Shifting…" : "Apply pitch"}
            </button>
            {a.pitch && (
              <button className="link small" onClick={() => void resetPitch()}>
                Reset pitch
              </button>
            )}
            <button className="link small" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {said && <p className="small good">{said}</p>}
          {error && <p className="warn small">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Replaces a person in a stretch of a clip with a @cast character (Fast face-mesh or Advanced depth+silhouette+mesh). */
export function SwapClip({ a, t }: { a: Asset; t: number }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const duration = a.duration ?? 0;
  const characters = (p.cast ?? []).filter((m) => m.kind === "character");
  const [open, setOpen] = useState(false);
  const [castId, setCastId] = useState(characters[0]?.id ?? "");
  const [mode, setMode] = useState<"fast" | "advanced">("fast");
  const [subject, setSubject] = useState(a.subjects?.[0]?.id ?? "");
  const [range, setRange] = useState<[number, number]>([0, Math.min(duration, 8)]);
  const [pitchShift, setPitchShift] = useState(0);
  const [keepMusic, setKeepMusic] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<"rough" | "final">("rough");
  const [plan, setPlan] = useState<{ choices: Choices; visionReady?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setRange([0, Math.min(duration, 8)]);
    setSubject(a.subjects?.[0]?.id ?? "");
  }, [a.id, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!castId && characters[0]) setCastId(characters[0].id);
  }, [castId, characters]);

  const versions = p.assets.filter((x) => x.version?.of === a.id && x.tags?.includes("swap"));

  useEffect(() => {
    if (!open || !castId) return;
    const q = new URLSearchParams({
      asset: a.id,
      cast: castId,
      mode,
      from: String(range[0]),
      to: String(range[1]),
      quality,
      ...(subject ? { subject } : {}),
    });
    let live = true;
    void fetch(`/api/projects/${projectId}/swap?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ choices: Choices; visionReady?: boolean }>) : undefined))
      .then((x) => live && setPlan(x))
      .catch(() => {});
    return () => void (live = false);
  }, [open, projectId, a.id, castId, mode, subject, range, quality]);

  const auto = plan?.choices.auto;

  const go = async () => {
    setError("");
    setSaid("");
    setBusy(true);
    try {
      await actions.flushSave();
      const res = await fetch(`/api/projects/${projectId}/swap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          asset: a.id,
          cut: cutId,
          cast: castId,
          mode,
          from: range[0],
          to: range[1],
          quality,
          ...(subject ? { subject } : {}),
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
          ...(Math.abs(pitchShift) >= 0.1 ? { pitchShift, keepMusic } : {}),
          use: true,
        }),
      });
      const j = (await res.json()) as { jobs?: { id: string }[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      await actions.reload();
      setSaid(`Character swap started (${j.jobs?.map((x) => x.id).join(", ")}). Watch Make → Queue; it lands as a clip version.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="change-clip">
      <h4>
        Character swap <span className="dim small">face mesh &amp; depth · cast</span>
      </h4>
      {versions.length > 0 && (
        <ul className="plain small">
          {versions.map((v) => (
            <li key={v.id} className="make-row">
              <button className="link small" onClick={() => actions.select({ kind: "asset", id: v.id })}>
                {v.label ?? v.id}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!characters.length ? (
        <p className="dim small">Add a character with a photo or sheet to Cast first to swap someone in this clip.</p>
      ) : !open ? (
        <button className="link small" onClick={() => setOpen(true)}>
          {versions.length ? "Swap another character…" : "Replace a person with a cast character…"}
        </button>
      ) : (
        <div className="restore-form">
          <div className="make-row small">
            <span>
              From <span className="mono">{formatTime(range[0])}</span> to <span className="mono">{formatTime(range[1])}</span>
            </span>
            <button className="link small" onClick={() => setRange([Math.min(t, Math.max(0, range[1] - 2)), range[1]])}>
              From here
            </button>
            <button className="link small" onClick={() => setRange([range[0], Math.min(duration, Math.max(t, range[0] + 2))])}>
              To here
            </button>
          </div>
          <div className="make-row small">
            <select value={castId} onChange={(e) => setCastId(e.target.value)} aria-label="Target character">
              {characters.map((m) => (
                <option key={m.id} value={m.id}>
                  @{m.id} · {m.name}
                </option>
              ))}
            </select>
            <div className="segmented" role="group" aria-label="Swap mode">
              <button className={mode === "fast" ? "on" : ""} onClick={() => setMode("fast")} title="Face mesh over original body">
                Fast
              </button>
              <button className={mode === "advanced" ? "on" : ""} onClick={() => setMode("advanced")} title="Depth map + silhouette matte + face mesh">
                Advanced
              </button>
            </div>
          </div>
          {!!a.subjects?.length && (
            <label className="small">
              Person to replace
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                {a.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.id})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="small">
            Voice pitch shift ({pitchShift > 0 ? `+${pitchShift}` : pitchShift} st)
            <input type="range" min={-6} max={6} step={0.5} value={pitchShift} onChange={(e) => setPitchShift(Number(e.target.value))} />
          </label>
          {Math.abs(pitchShift) >= 0.1 && (
            <label className="check small">
              <input type="checkbox" checked={keepMusic} onChange={(e) => setKeepMusic(e.target.checked)} /> Shift vocals only (keep music via Demucs)
            </label>
          )}
          <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Optional direction (wardrobe, lighting match)" />
          <div className="make-row small">
            <select value={quality} onChange={(e) => setQuality(e.target.value as "rough" | "final")} aria-label="Quality">
              <option value="rough">Rough (480p)</option>
              <option value="final">Final (1080p)</option>
            </select>
            {plan && !plan.visionReady && <span className="warn">Install MediaPipe prep in Settings → Restoring</span>}
          </div>
          <div className="make-row">
            <button className="primary" disabled={busy || !auto || (plan && !plan.visionReady)} onClick={() => void go()}>
              {busy ? "Preparing…" : auto ? `Swap · ${auto.label}${auto.usd !== undefined ? ` · ~$${auto.usd.toFixed(2)}` : ""}` : "Swap (connect Tein or fal)"}
            </button>
            <button className="link small" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {said && <p className="small good">{said}</p>}
          {error && <p className="warn small">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** "Act it yourself": strips actor identity into a 3D clay head mask (MediaPipe ARKit -> kit:ClayHead) and transfers expressions onto a cast character or shot board. */
export function PerformClip({ a, t }: { a: Asset; t: number }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const duration = a.duration ?? 0;
  const characters = (p.cast ?? []).filter((m) => m.kind === "character");
  const shotsWithBoard = p.shots.filter((s) => s.content.kind === "generated" && (s.content.take || s.content.takes?.length));
  const [open, setOpen] = useState(false);
  const [castId, setCastId] = useState(characters[0]?.id ?? "");
  const [shotId, setShotId] = useState("");
  const [range, setRange] = useState<[number, number]>([0, Math.min(duration, 6)]);
  const [intensity, setIntensity] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<"rough" | "final">("rough");
  const [plan, setPlan] = useState<{ choices: Choices; visionReady?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setRange([0, Math.min(duration, 6)]), [a.id, duration]);
  useEffect(() => {
    if (!castId && characters[0]) setCastId(characters[0].id);
  }, [castId, characters]);

  useEffect(() => {
    if (!open || (!castId && !shotId)) return;
    const q = new URLSearchParams({
      driver: a.id,
      from: String(range[0]),
      to: String(range[1]),
      quality,
      ...(castId ? { cast: castId } : {}),
      ...(shotId ? { shot: shotId } : {}),
    });
    let live = true;
    void fetch(`/api/projects/${projectId}/perform?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ choices: Choices; visionReady?: boolean }>) : undefined))
      .then((x) => live && setPlan(x))
      .catch(() => {});
    return () => void (live = false);
  }, [open, projectId, a.id, castId, shotId, range, quality]);

  const auto = plan?.choices.auto;

  const go = async () => {
    setError("");
    setSaid("");
    setBusy(true);
    try {
      await actions.flushSave();
      const res = await fetch(`/api/projects/${projectId}/perform`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cut: cutId,
          driver: a.id,
          from: range[0],
          to: range[1],
          intensity,
          quality,
          ...(castId ? { cast: castId } : {}),
          ...(shotId ? { shot: shotId } : {}),
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        }),
      });
      const j = (await res.json()) as { jobs?: { id: string }[]; frames?: number; error?: string };
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      await actions.reload();
      setSaid(`Performance transfer started (${j.frames ?? 0} frames via clay head mask · ${j.jobs?.map((x) => x.id).join(", ")}). Watch Make → Queue.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="change-clip">
      <h4>
        Act it yourself <span className="dim small">ARKit clay head · expression transfer</span>
      </h4>
      {!characters.length && !shotsWithBoard.length ? (
        <p className="dim small">Add a character to Cast or create a shot board to transfer this clip&rsquo;s facial performance onto it.</p>
      ) : !open ? (
        <button className="link small" onClick={() => setOpen(true)}>
          Drive a character&rsquo;s face with this performance…
        </button>
      ) : (
        <div className="restore-form">
          <div className="make-row small">
            <span>
              From <span className="mono">{formatTime(range[0])}</span> to <span className="mono">{formatTime(range[1])}</span>
            </span>
            <button className="link small" onClick={() => setRange([Math.min(t, Math.max(0, range[1] - 2)), range[1]])}>
              From here
            </button>
            <button className="link small" onClick={() => setRange([range[0], Math.min(duration, Math.max(t, range[0] + 2))])}>
              To here
            </button>
          </div>
          <div className="make-row small">
            {!!characters.length && (
              <select value={castId} onChange={(e) => setCastId(e.target.value)} aria-label="Character">
                <option value="">Character…</option>
                {characters.map((m) => (
                  <option key={m.id} value={m.id}>
                    @{m.id} · {m.name}
                  </option>
                ))}
              </select>
            )}
            {!!shotsWithBoard.length && (
              <select value={shotId} onChange={(e) => setShotId(e.target.value)} aria-label="Target shot">
                <option value="">Standalone clip</option>
                {shotsWithBoard.map((s) => (
                  <option key={s.id} value={s.id}>
                    Shot {s.id}
                    {s.label ? ` · ${s.label}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <label className="small">
            Expression intensity ({Math.round(intensity * 100)}%)
            <input type="range" min={0.6} max={1.5} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
          </label>
          <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Optional scene or framing note (e.g. candlelight close-up)" />
          <div className="make-row small">
            <select value={quality} onChange={(e) => setQuality(e.target.value as "rough" | "final")} aria-label="Quality">
              <option value="rough">Rough (480p)</option>
              <option value="final">Final (1080p)</option>
            </select>
            {plan && !plan.visionReady && <span className="warn">Install MediaPipe prep in Settings → Restoring</span>}
          </div>
          <div className="make-row">
            <button className="primary" disabled={busy || !auto || (plan && !plan.visionReady)} onClick={() => void go()}>
              {busy ? "Rendering clay mask…" : auto ? `Transfer · ${auto.label}${auto.usd !== undefined ? ` · ~$${auto.usd.toFixed(2)}` : ""}` : "Transfer (connect Tein or fal)"}
            </button>
            <button className="link small" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {said && <p className="small good">{said}</p>}
          {error && <p className="warn small">{error}</p>}
        </div>
      )}
    </div>
  );
}
