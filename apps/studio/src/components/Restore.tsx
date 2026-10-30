/**
 * Inspect's tools for old footage: its voices cleaned of hiss and hum (and heard either way while it plays), and a
 * stretch of it restored as a version that clip shots show in its place. Both say first what they'd use here, how
 * long it'd take and what it'd cost, as transcribing does.
 */
import { formatTime, restoreWords, type Asset, type FixerChoice, type RestoreSteps } from "@beatsheet/schema";
import { useEffect, useRef, useState, type RefObject } from "react";
import { runJob } from "../lib";
import { actions, useStore } from "../store";

type Choices = { auto?: FixerChoice; ready: FixerChoice[]; setup: FixerChoice[] };

/** "free · about 2 min" or "about $0.84". */
function about(c: FixerChoice, extra = 0): string {
  const secs = (c.seconds ?? 0) + extra;
  const time = secs ? (secs < 90 ? `about ${Math.max(5, Math.round(secs / 5) * 5)}s` : `about ${Math.round(secs / 60)} min`) : "";
  const cost = c.usd ? `about $${c.usd.toFixed(2)}` : "free";
  return [cost, time].filter(Boolean).join(" · ");
}

/**
 * While `on`, the clip in the player is heard through its cleaned sound: the video is muted and the cleaned sound
 * plays beside it, kept to the same time.
 */
export function useCleanSound(video: RefObject<HTMLVideoElement | null>, src: string | undefined, on: boolean) {
  useEffect(() => {
    const v = video.current;
    if (!v || !src || !on) return;
    const au = new Audio(src);
    au.preload = "auto";
    v.muted = true;
    const sync = () => Math.abs(au.currentTime - v.currentTime) > 0.12 && (au.currentTime = v.currentTime);
    const play = () => {
      au.currentTime = v.currentTime;
      void au.play().catch(() => undefined);
    };
    const pause = () => au.pause();
    v.addEventListener("play", play);
    v.addEventListener("pause", pause);
    v.addEventListener("seeked", sync);
    v.addEventListener("timeupdate", sync);
    if (!v.paused) play();
    return () => {
      au.pause();
      au.src = "";
      v.muted = false;
      v.removeEventListener("play", play);
      v.removeEventListener("pause", pause);
      v.removeEventListener("seeked", sync);
      v.removeEventListener("timeupdate", sync);
    };
  }, [video, src, on]);
}

const CLEANERS: Record<string, string> = { deepfilter: "DeepFilterNet", isolator: "Voice Isolator" };

/** Its voices cleaned: what would do it, then doing it; once done, how, and hearing it either way. */
export function CleanSound({ a, hear, setHear }: { a: Asset; hear: "own" | "clean"; setHear: (h: "own" | "clean") => void }) {
  const projectId = useStore((s) => s.projectId)!;
  const [choices, setChoices] = useState<Choices>();
  const [pick, setPick] = useState("");
  const [strength, setStrength] = useState<"light" | "full">(a.cleaned?.strength ?? "light");
  const [everywhere, setEverywhere] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [again, setAgain] = useState(false);
  const c = a.cleaned;
  const asking = !c || again;
  useEffect(() => {
    if (!asking) return;
    void fetch(`/api/projects/${projectId}/clean?asset=${encodeURIComponent(a.id)}`)
      .then((r) => r.json() as Promise<Choices>)
      .then(setChoices);
  }, [projectId, a.id, asking]);
  const chosen = pick ? choices?.ready.find((x) => x.id === pick) : choices?.auto;
  const go = async () => {
    setError("");
    setBusy(0);
    try {
      await actions.flushSave();
      await runJob(`/api/projects/${projectId}/clean`, { asset: a.id, ...(pick ? { with: pick } : {}), strength, everywhere }, setBusy);
      await actions.reload();
      setAgain(false);
      setHear("clean");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  const undo = async () => {
    setHear("own");
    await actions.flushSave();
    await fetch(`/api/projects/${projectId}/clean?asset=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    await actions.reload();
  };
  return (
    <>
      <h4>
        Sound{" "}
        {c && (
          <span className="dim small">
            voices cleaned ({c.strength}) · {CLEANERS[c.by] ?? c.by}
            {c.only ? " · where people talk" : ""}
          </span>
        )}
      </h4>
      {c && !again && (
        <>
          <div className="make-row small">
            Hear
            <div className="segmented">
              <button className={hear === "own" ? "on" : ""} onClick={() => setHear("own")}>
                As recorded
              </button>
              <button className={hear === "clean" ? "on" : ""} onClick={() => setHear("clean")}>
                Cleaned
              </button>
            </div>
          </div>
          <p className="dim small">Its clips play the cleaned sound. The file itself is as it was.</p>
          <div className="make-row">
            <button className="link small" onClick={() => setAgain(true)}>
              Clean it differently…
            </button>
            <button className="link small" onClick={() => void undo()}>
              Use its own sound
            </button>
          </div>
        </>
      )}
      {asking && (
        <>
          {!c && <p className="dim small">Takes tape hiss, wind and hum out of the voices.{a.transcript ? "" : " Transcribe it first to clean only where people talk, so its music and sounds stay."}</p>}
          <div className="make-row">
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Cleaner" title="What cleans it">
              <option value="">{choices?.auto ? `Auto (${choices.auto.label} · ${about(choices.auto)})` : "Auto"}</option>
              {choices?.ready.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label} · {about(x)}
                </option>
              ))}
              {!!choices?.setup.length && (
                <optgroup label="Can't use now">
                  {choices.setup.map((x) => (
                    <option key={x.id} disabled>
                      {x.label}: {x.why}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <select value={strength} onChange={(e) => setStrength(e.target.value as "light" | "full")} aria-label="How much" title="How much to take out">
              <option value="light">Light: keeps a little of the room</option>
              <option value="full">Full: only the voices</option>
            </select>
          </div>
          {a.transcript && (
            <label className="check small" title="Clean all of it, music and all, not just where people talk">
              <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} /> All of it, not just where people talk
            </label>
          )}
          {busy !== null ? (
            <div className="progress thin">
              <div style={{ width: `${Math.round(busy * 100)}%` }} />
            </div>
          ) : (
            <div className="make-row">
              <button className="primary" disabled={!chosen} onClick={() => void go()}>
                Clean the voices{chosen ? ` · ${about(chosen)}` : ""}
              </button>
              {again && (
                <button className="link small" onClick={() => setAgain(false)}>
                  Keep it as it is
                </button>
              )}
            </div>
          )}
          {!!choices && !choices.ready.length && <p className="dim small">Nothing can clean it here yet: install DeepFilterNet in Settings → Restoring, or add an ElevenLabs key.</p>}
          {error && <p className="warn small">{error}</p>}
        </>
      )}
    </>
  );
}

/** A stretch of the clip restored as a version shots can show, and the versions it has. */
export function RestoreClip({ a, t }: { a: Asset; t: number }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const project = useStore((s) => s.project)!;
  const duration = a.duration ?? 0;
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<[number, number]>([0, duration]);
  const small = (a.height ?? 1080) <= 576;
  const [steps, setSteps] = useState<RestoreSteps>({ denoise: "light", steady: true, upscale: small ? 4 : 2 });
  const [choices, setChoices] = useState<{ upscale: Choices; frames: Choices }>();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const asked = useRef(0);
  const versions = project.assets.filter((x) => x.version?.of === a.id);
  useEffect(() => setRange([0, duration]), [a.id, duration]);
  useEffect(() => {
    if (!open) return;
    const n = ++asked.current;
    const q = new URLSearchParams({ asset: a.id, from: String(range[0]), to: String(range[1]), upscale: String(steps.upscale ?? 2), ...(steps.fps ? { fps: String(steps.fps) } : {}) });
    void fetch(`/api/projects/${projectId}/restore?${q}`)
      .then((r) => r.json() as Promise<{ upscale: Choices; frames: Choices }>)
      .then((c) => n === asked.current && setChoices(c));
  }, [open, projectId, a.id, range, steps.upscale, steps.fps]);
  const upscaler = steps.upscale ? (pick ? choices?.upscale.ready.find((x) => x.id === pick) : choices?.upscale.auto) : undefined;
  const frames = steps.fps ? choices?.frames.auto : undefined;
  const nothing = !steps.denoise && !steps.steady && !steps.upscale && !steps.fps;
  const blocked = (steps.upscale && !upscaler) || (steps.fps && !frames);
  const cost = upscaler ? about(upscaler, frames?.seconds ?? 0) : frames ? about(frames) : "free";
  const go = async () => {
    setError("");
    setSaid("");
    setBusy(0);
    try {
      await actions.flushSave();
      const out = await runJob(
        `/api/projects/${projectId}/restore`,
        { asset: a.id, from: range[0], to: range[1], steps, ...(pick ? { upscaleWith: pick } : {}), use: true, cut: cutId },
        setBusy,
      );
      const r = out ? (JSON.parse(out) as { asset: string; shots: string[] }) : undefined;
      await actions.reload();
      setSaid(r?.shots.length ? `Done. ${r.shots.length} shot${r.shots.length === 1 ? " shows" : "s show"} it now.` : "Done. No shot in this cut uses that stretch yet; a shot of this clip can show it (Shows, in the shot's look).");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  const shown = (v: Asset) => project.shots.filter((s) => s.content.kind === "clip" && s.content.version === v.id).length;
  const toggle = async (v: Asset, off: boolean) => {
    await actions.flushSave();
    await fetch(`/api/projects/${projectId}/version`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: v.id, cut: cutId, off }) });
    await actions.reload();
  };
  const set = (patch: Partial<RestoreSteps>) => setSteps((s) => Object.fromEntries(Object.entries({ ...s, ...patch }).filter(([, x]) => x)) as RestoreSteps);
  return (
    <>
      <h4>
        Restore <span className="dim small">cleaner, steadier, sharper</span>
      </h4>
      {versions.length > 0 && (
        <ul className="plain small">
          {versions.map((v) => {
            const n = shown(v);
            return (
              <li key={v.id} className="make-row">
                <button className="link small" onClick={() => actions.select({ kind: "asset", id: v.id })}>
                  {v.label ?? v.id}
                </button>
                <span className="dim">{restoreWords((v.provenance?.params ?? {}) as RestoreSteps)}</span>
                <span className="spacer" />
                {n ? (
                  <button className="link small" onClick={() => void toggle(v, true)} title="Those shots show the footage again">
                    In {n} shot{n === 1 ? "" : "s"} · back to the footage
                  </button>
                ) : (
                  <button className="link small" onClick={() => void toggle(v, false)} title="Every shot of this clip it covers shows it">
                    Show it in its shots
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!open ? (
        <button className="link small" onClick={() => setOpen(true)}>
          {versions.length ? "Restore another stretch…" : "Restore it…"}
        </button>
      ) : (
        <div className="restore-form">
          <div className="make-row small">
            <span>
              From <span className="mono">{formatTime(range[0])}</span> to <span className="mono">{formatTime(range[1])}</span>
            </span>
            <button className="link small" onClick={() => setRange([Math.min(t, range[1] - 1), range[1]])}>
              From here
            </button>
            <button className="link small" onClick={() => setRange([range[0], Math.max(t, range[0] + 1)])}>
              To here
            </button>
            {(range[0] > 0 || range[1] < duration) && (
              <button className="link small" onClick={() => setRange([0, duration])}>
                All of it
              </button>
            )}
          </div>
          <div className="make-row small">
            <label>
              Noise{" "}
              <select value={steps.denoise ?? ""} onChange={(e) => set({ denoise: (e.target.value || undefined) as RestoreSteps["denoise"] })}>
                <option value="">Leave it</option>
                <option value="light">Less</option>
                <option value="strong">Much less</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={!!steps.steady} onChange={(e) => set({ steady: e.target.checked })} /> Steady the camera
            </label>
          </div>
          <div className="make-row small">
            <label>
              Bigger{" "}
              <select value={steps.upscale ?? ""} onChange={(e) => set({ upscale: (Number(e.target.value) || undefined) as RestoreSteps["upscale"] })}>
                <option value="">No</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
              </select>
            </label>
            {steps.upscale && (
              <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Upscaler">
                <option value="">{choices?.upscale.auto ? `Auto (${choices.upscale.auto.label} · ${about(choices.upscale.auto)})` : "Auto"}</option>
                {choices?.upscale.ready.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label} · {about(x)}
                  </option>
                ))}
                {!!choices?.upscale.setup.length && (
                  <optgroup label="Can't use now">
                    {choices.upscale.setup.map((x) => (
                      <option key={x.id} disabled>
                        {x.label}: {x.why}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
            <label>
              Smoother{" "}
              <select value={steps.fps ?? ""} onChange={(e) => set({ fps: Number(e.target.value) || undefined })}>
                <option value="">No</option>
                {[24, 30, 48, 60]
                  .filter((f) => a.fps && f > a.fps + 1 && f <= a.fps * 2 + 1)
                  .map((f) => (
                    <option key={f} value={f}>
                      {f} fps
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {steps.fps && choices && !frames && <p className="dim small">{choices.frames.setup[0]?.why}</p>}
          {busy !== null ? (
            <div className="progress thin">
              <div style={{ width: `${Math.round(busy * 100)}%` }} />
            </div>
          ) : (
            <div className="make-row">
              <button className="primary" disabled={nothing || !!blocked || !choices} onClick={() => void go()}>
                Restore {formatTime(range[1] - range[0])} · {cost}
              </button>
              <button className="link small" onClick={() => setOpen(false)}>
                Not now
              </button>
            </div>
          )}
          <p className="dim small">It makes a version of this clip, in step with it, and the shots of it in this cut show it. The footage itself stays as it was.</p>
        </div>
      )}
      {said && <p className="small">{said}</p>}
      {error && <p className="warn small">{error}</p>}
    </>
  );
}
