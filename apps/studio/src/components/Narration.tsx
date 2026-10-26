import { lineState, type Line, type Project } from "@beatsheet/schema";
import { useState } from "react";
import { AGENT_NAMES, runJob } from "../lib";
import { actions, getState, useStore } from "../store";
import { answer } from "./Turn";
import { PlayButton, useVoices, voiceLabel, VoicePicker } from "./Voices";

const KEEP = { leadIn: 0.3, defaultGap: 0.5, tail: 1 };

/** The voice this cut reads in: its own choice, else the default (or the best on hand). */
export function useCutVoice(p: Project): string | undefined {
  const info = useVoices();
  return p.voice?.voice ?? info?.default ?? info?.fallback;
}

/**
 * Has the engine voice lines (all that need it, or the ones named), then shows the result. Edits waiting to be saved go
 * first, so it reads what's on screen.
 */
async function voiceLines(opts: { voice?: string; lines?: string[]; force?: boolean }, onProgress: (f: number) => void) {
  const { projectId, cutId } = getState();
  if (!projectId) return;
  await actions.flushSave();
  await actions.quietly(async () => {
    await runJob(`/api/projects/${projectId}/narrate`, { cut: cutId, ...opts }, onProgress);
    await actions.reload();
  });
}

function useVoicing() {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const run = async (opts: Parameters<typeof voiceLines>[0]) => {
    setBusy(0);
    setError("");
    try {
      await voiceLines(opts, setBusy);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

/** In Inspect with nothing selected: who reads this cut's narration, and whether every line is voiced. */
export function NarrationOverview({ p }: { p: Project }) {
  const info = useVoices();
  const agent = useStore((s) => s.agent);
  const voice = useCutVoice(p);
  const v = info?.voices.find((x) => x.id === voice);
  const { busy, error, run } = useVoicing();
  const lines = p.voice?.lines ?? [];
  const states = lines.map((l) => lineState(voice, l));
  const stale = states.filter((s) => s !== "voiced").length;
  const spoken = lines.reduce((n, l) => n + l.duration, 0);
  const locked = !!p.stages.structure?.locked;
  const setVoice = (id: string | undefined) =>
    actions.edit((d) => {
      if (!d.voice && !id) return;
      d.voice = { ...KEEP, ...(d.voice ?? { lines: [] }), voice: id };
    });
  const ask = () =>
    void answer({
      provided: `Write narration for the cut "${p.cut.name}" (cut ${p.cut.id}): a voiceover that suits its length and footage. Voice it with narrate${p.voice?.voice ? ` in its voice (${voiceLabel(info, p.voice.voice)})` : ""}, start shots on the words they go with, and hand it back for me to watch.`,
    });
  return (
    <section className="narration">
      <h4>Narration</h4>
      <div className="narration-voice">
        <VoicePicker value={p.voice?.voice} onChange={setVoice} />
        {v && <PlayButton id={`v:${v.id}`} src={v.previewUrl ?? `/api/voices/preview?voice=${encodeURIComponent(v.id)}`} />}
      </div>
      {lines.length ? (
        <p className="small">
          {lines.length} line{lines.length === 1 ? "" : "s"} · {spoken < 60 ? `${Math.round(spoken)}s` : `${Math.floor(spoken / 60)}:${String(Math.round(spoken % 60)).padStart(2, "0")}`} of speech
          {stale ? (
            <span className="warn"> · {states.every((x) => x === "silent") ? "not voiced yet" : stale === lines.length ? "to voice again" : `${stale} to voice`}</span>
          ) : (
            <span className="dim"> · voiced</span>
          )}
        </p>
      ) : (
        <p className="dim small">No narration in this cut yet. The agent can write and voice it, timing shots to the words.</p>
      )}
      {busy !== null ? (
        <div className="progress thin">
          <div style={{ width: `${Math.round(busy * 100)}%` }} />
        </div>
      ) : (
        <div className="row narration-actions">
          {lines.length > 0 && stale > 0 && (
            <button className="primary" disabled={locked} onClick={() => void run({ voice })}>
              Voice {stale === lines.length ? "the lines" : `${stale} line${stale === 1 ? "" : "s"}`}
              {v ? ` as ${v.name}` : ""}
            </button>
          )}
          {lines.length > 0 && stale === 0 && (
            <button className="link small" disabled={locked} onClick={() => void run({ voice, force: true })}>
              Read them all again
            </button>
          )}
          {!lines.length && (
            <button onClick={ask} disabled={locked}>
              Ask {AGENT_NAMES[agent.agent ?? getState().setup?.settings.agent?.id ?? "other"]} to write narration
            </button>
          )}
          <span className="spacer" />
          <button className="link small" onClick={() => actions.setSettingsOpen(true, "voices")}>
            Voices…
          </button>
        </div>
      )}
      {lines.length > 0 && (
        <label className="check small">
          <input type="checkbox" checked={!!p.captions} onChange={(e) => actions.edit((d) => void (d.captions = e.target.checked ? (d.captions ?? {}) : undefined))} /> Captions, the spoken word highlighted
        </label>
      )}
      {locked && <p className="dim small">The script is locked, so its narration stays as it is.</p>}
      {error && <p className="warn small">{error}</p>}
    </section>
  );
}

/** For a selected line: its words (editable), how it's said, and its voice, with a button to voice it again. */
export function LineVoice({ p, l }: { p: Project; l: Line }) {
  const voice = useCutVoice(p);
  const info = useVoices();
  const projectId = useStore((s) => s.projectId)!;
  const { busy, error, run } = useVoicing();
  const state = lineState(voice, l);
  const locked = !!p.stages.structure?.locked;
  return (
    <div className="line-voice">
      <div className="row">
        {l.file && <PlayButton id={`l:${l.file}`} src={`/media/${projectId}/file/${encodeURIComponent(l.file)}`} title="Play this line" />}
        <span className={`small ${state === "voiced" ? "dim" : "warn"}`}>
          {state === "voiced" ? `Voiced${voice ? ` · ${voiceLabel(info, voice)}` : ""}` : state === "changed" ? "Changed since it was voiced" : "Not voiced yet"}
        </span>
        <span className="spacer" />
        {busy === null ? (
          <button className={state === "voiced" ? "link small" : "small primary"} disabled={locked} onClick={() => void run({ voice, lines: [l.id], force: state === "voiced" })}>
            {state === "voiced" ? "Read it again" : "Voice it"}
          </button>
        ) : (
          <span className="dim small">Reading…</span>
        )}
      </div>
      {error && <p className="warn small">{error}</p>}
    </div>
  );
}
