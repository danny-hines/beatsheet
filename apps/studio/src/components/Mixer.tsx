/**
 * The mix: a fader for each part of the sound (the narration, the music, the sound effects, and each track whose
 * clips have sound), how loud in dB, and a mute; and evening out how loud people are from shot to shot.
 */
import { useState } from "react";
import { actions, setState, useProject, useStore, useTimeline } from "../store";
import { PopMenu } from "./ui";

const db = (gain: number) => (gain <= 0 ? "−∞" : `${gain >= 1 ? "+" : ""}${(20 * Math.log10(gain)).toFixed(1)} dB`);

export function Mixer() {
  const p = useProject();
  const tl = useTimeline();
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const parts: { id: string; label: string; gain: number; muted: boolean }[] = [];
  if (tl.lines.length) parts.push({ id: "voice", label: "Narration", gain: p.mix?.voice?.gain ?? 1, muted: !!p.mix?.voice?.muted });
  if (tl.cues.length) parts.push({ id: "music", label: "Music", gain: p.mix?.music?.gain ?? 1, muted: !!p.mix?.music?.muted });
  if (tl.sfx.length) parts.push({ id: "sfx", label: "Sound effects", gain: p.mix?.sfx?.gain ?? 1, muted: !!p.mix?.sfx?.muted });
  for (const t of p.tracks) if (t.kind !== "text" && p.shots.some((s) => s.track === t.id && s.content.kind === "clip")) parts.push({ id: t.id, label: t.label, gain: t.gain ?? 1, muted: !!t.muted });

  const set = (id: string, change: { gain?: number; muted?: boolean }) =>
    actions.edit((d) => {
      const t = d.tracks.find((x) => x.id === id);
      const target = t ?? ((d.mix ??= {})[id as "voice" | "music" | "sfx"] ??= {});
      if (change.gain !== undefined) {
        if (Math.abs(change.gain - 1) < 0.01) delete target.gain;
        else target.gain = Math.round(change.gain * 100) / 100;
      }
      if (change.muted !== undefined) {
        if (change.muted) target.muted = true;
        else delete target.muted;
      }
    });

  const evenOut = async () => {
    setBusy(true);
    try {
      await actions.flushSave();
      const levels = (await (await fetch(`/api/projects/${projectId}/even-out?cut=${cutId}`)).json()) as { shot: string; volume: number }[];
      if (!levels.length) return setState({ hint: "Nothing in the cut has sound to even out." });
      actions.edit((d) => {
        for (const l of levels) {
          const s = d.shots.find((x) => x.id === l.shot);
          if (s?.content.kind === "clip") s.content.volume = l.volume;
        }
      });
      setState({ hint: `Evened out ${levels.length} shot${levels.length === 1 ? "" : "s"}: each now plays at the others' level.` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={(e) => setAt({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().top - 8 })} title="Levels for each part of the sound">
        Mix
      </button>
      {at && (
        <PopMenu x={at.x} y={at.y} onClose={() => setAt(null)}>
          <div className="mixer" onClick={(e) => e.stopPropagation()}>
            {!parts.length && <p className="dim small">Nothing in the cut makes a sound yet.</p>}
            {parts.map((x) => (
              <div key={x.id} className="mixer-row">
                <span className="mixer-name">{x.label}</span>
                <input type="range" min={0} max={2} step={0.01} defaultValue={x.gain} onPointerUp={(e) => set(x.id, { gain: Number(e.currentTarget.value) })} onKeyUp={(e) => set(x.id, { gain: Number(e.currentTarget.value) })} onDoubleClick={() => set(x.id, { gain: 1 })} title="Double-click for as it is" />
                <span className="mono small mixer-db">{db(x.gain)}</span>
                <button className={`tk-btn ${x.muted ? "on" : ""}`} style={{ opacity: 1 }} onClick={() => set(x.id, { muted: !x.muted })}>
                  M
                </button>
              </div>
            ))}
            <hr />
            <button className="small" disabled={busy || !p.shots.some((s) => s.content.kind === "clip")} onClick={() => void evenOut()} title="Measures how loud each clip shot is and sets each one's volume so they match">
              {busy ? "Listening…" : "Even out the voices"}
            </button>
            <p className="dim small">Exports are mastered to −14 LUFS for social, whatever the faders say.</p>
          </div>
        </PopMenu>
      )}
    </>
  );
}

