/**
 * The cut as what's said in it: the words of the footage its picture plays, in order. Click a word to go there;
 * select words and delete them to take that stretch out of the cut (the rest comes up to meet it); the ums and the
 * long pauses come out with a button. A word heard wrong is put right with a double-click, for captions and
 * subtitles. Captions of what's said on camera, and subtitle files, are set here too.
 */
import { cutWords, fillerSpans, formatTime, isFiller, pauseSpans, removeSpans, spanOf, type CutWord, type Shot } from "@beatsheet/schema";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { pictureTrack } from "../lib";
import { actions, getState, setState, useProject, useStore, useTimeline } from "../store";
import { Empty } from "./ui";

export function Script() {
  const p = useProject();
  const tl = useTimeline();
  const said = useStore((s) => s.said);
  const playhead = useStore((s) => s.playhead);
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const format = useStore((s) => s.format);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [fixing, setFixing] = useState<number | null>(null);
  const [longest, setLongest] = useState(0.7);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => void actions.loadSaid(), [p]);
  const words = useMemo(() => cutWords(p, tl, (id) => said[id]?.words), [p, tl, said]);
  // A change to the cut makes the old selection mean other words.
  useEffect(() => setSel(null), [p]);

  const pic = pictureTrack(p);
  const clips = p.shots.filter((s) => s.track === pic && s.content.kind === "clip");
  const untranscribed = [...new Set(clips.map((s) => (s.content as Extract<Shot["content"], { kind: "clip" }>).asset))]
    .map((id) => p.assets.find((a) => a.id === id))
    .filter((a) => a && a.kind === "video" && !a.transcript);
  const fillers = useMemo(() => fillerSpans(words), [words]);
  const pauses = useMemo(() => pauseSpans(words, { longest, keep: Math.min(0.3, longest) }), [words, longest]);
  const [lo, hi] = sel ? [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)] : [-1, -1];

  const cut = (spans: [number, number][]) => {
    if (!spans.length) return;
    actions.edit((d) => void removeSpans(d, tl, spans));
    setSel(null);
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if ((e.key === "Backspace" || e.key === "Delete") && sel) {
      // The words' own delete, not the timeline's: the global keys never see it.
      e.preventDefault();
      e.stopPropagation();
      cut([spanOf(words, lo, hi)]);
    } else if (e.key === "Escape" && sel) {
      e.stopPropagation();
      setSel(null);
    }
  };
  const fix = async (k: number, text: string) => {
    setFixing(null);
    const w = words[k]!;
    if (!text.trim() || text.trim() === w.w) return;
    const res = await fetch(`/api/projects/${projectId}/transcripts/${w.asset}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ i: w.i, w: text.trim(), touch: false }) });
    const out = (await res.json().catch(() => ({}))) as { at?: string; error?: string };
    if (!res.ok || !out.at) return void setState({ hint: out.error ?? "That didn't go through" });
    // The clip's words changed: a new version of them, which the script and the captions fetch again.
    actions.edit((d) => {
      const a = d.assets.find((x) => x.id === w.asset);
      if (a?.transcript) a.transcript.at = out.at!;
    });
  };

  const captions = p.captions;
  const source = captions?.source ?? (tl.lines.length ? "narration" : "footage");
  const now = words.findIndex((w, k) => playhead >= w.s && playhead < (words[k + 1]?.s ?? w.e + 0.3));

  // Paragraphs: a new one at each new speaker and at each long pause.
  const paras: number[][] = [];
  words.forEach((w, k) => {
    const prev = words[k - 1];
    if (!prev || w.speaker !== prev.speaker || w.s - prev.e > 1.2) paras.push([]);
    paras.at(-1)!.push(k);
  });
  const speakerName = (w: CutWord) => {
    if (!w.speaker) return undefined;
    const member = p.cast?.find((m) => m.heard?.some((h) => h.asset === w.asset && h.speaker === w.speaker));
    return member?.name ?? (w.speaker.startsWith("speaker_") ? `Speaker ${Number(w.speaker.slice(8)) + 1}` : w.speaker);
  };

  return (
    <div className="inspector script">
      <div className="script-tools">
        <button disabled={!fillers.length} onClick={() => cut(fillers)} title={`Takes out ${fillers.length} um${fillers.length === 1 ? "" : "s"} and uh${fillers.length === 1 ? "" : "s"}, closing the gaps`}>
          Remove ums{fillers.length ? ` (${fillers.length})` : ""}
        </button>
        <button disabled={!pauses.length} onClick={() => cut(pauses)} title="Shortens every pause longer than this to a natural beat, closing the gaps">
          Shorten pauses{pauses.length ? ` (${pauses.length})` : ""}
        </button>
        <label className="small dim" title="Pauses longer than this are shortened">
          over{" "}
          <select value={longest} onChange={(e) => setLongest(Number(e.target.value))}>
            {[0.4, 0.5, 0.7, 1, 1.5, 2].map((v) => (
              <option key={v} value={v}>
                {v}s
              </option>
            ))}
          </select>
        </label>
      </div>
      {sel && (
        <p className="small script-sel">
          {hi - lo + 1} word{hi === lo ? "" : "s"} selected, {formatTime(spanOf(words, lo, hi)[1] - spanOf(words, lo, hi)[0])}.{" "}
          <button className="link small" onClick={() => cut([spanOf(words, lo, hi)])}>
            Delete them
          </button>{" "}
          <span className="dim">(⌫) and the rest comes up</span>
        </p>
      )}
      {!words.length ? (
        <Empty>
          {clips.length ? "None of the footage the cut plays has been transcribed yet." : "The cut doesn't play any footage yet."} Transcribe a clip from its page in the Library (What's said), and its words show here to edit the cut by.
        </Empty>
      ) : (
        <div className="script-text" ref={box} tabIndex={0} onKeyDown={onKey}>
          {paras.map((ks) => (
            <p key={ks[0]}>
              {words[ks[0]!]!.speaker && words[ks[0]! - 1]?.speaker !== words[ks[0]!]!.speaker && <span className="script-who">{speakerName(words[ks[0]!]!)}</span>}
              {ks.map((k) => {
                const w = words[k]!;
                if (fixing === k)
                  return (
                    <input
                      key={k}
                      className="script-fix"
                      autoFocus
                      defaultValue={w.w}
                      size={Math.max(3, w.w.length + 1)}
                      onBlur={(e) => void fix(k, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") void fix(k, e.currentTarget.value);
                        if (e.key === "Escape") setFixing(null);
                      }}
                    />
                  );
                return (
                  <span
                    key={k}
                    className={`script-word ${k >= lo && k <= hi ? "sel" : ""} ${k === now ? "now" : ""} ${isFiller(w.w) ? "filler" : ""}`}
                    title={`${formatTime(w.s)} · double-click to put it right`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      box.current?.focus();
                      if (e.shiftKey && sel) setSel({ a: sel.a, b: k });
                      else setSel({ a: k, b: k });
                      actions.seek(w.s);
                    }}
                    onMouseEnter={(e) => e.buttons === 1 && sel && setSel({ a: sel.a, b: k })}
                    onDoubleClick={() => setFixing(k)}
                  >
                    {w.w}{" "}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      )}
      {untranscribed.length > 0 && (
        <p className="small dim">
          Not transcribed yet:{" "}
          {untranscribed.map((a, k) => (
            <span key={a!.id}>
              {k > 0 && ", "}
              <button className="link small" onClick={() => actions.select({ kind: "asset", id: a!.id })}>
                {a!.label ?? a!.id}
              </button>
            </span>
          ))}
          .
        </p>
      )}

      <h4>Captions</h4>
      <div className="look-row">
        <label className="check">
          <input type="checkbox" checked={!!captions} onChange={(e) => actions.edit((d) => void (d.captions = e.target.checked ? (d.captions ?? {}) : undefined))} /> On screen
        </label>
        <label>
          Words
          <select value={source} onChange={(e) => actions.edit((d) => void (d.captions = { ...(d.captions ?? {}), source: e.target.value as "narration" | "footage" | "both" }))}>
            <option value="narration">The narration</option>
            <option value="footage">What's said on camera</option>
            <option value="both">Both</option>
          </select>
        </label>
      </div>
      <p className="small">
        Subtitles:{" "}
        <a className="link small" href={`/api/projects/${projectId}/subtitles?cut=${cutId}&format=${format}&kind=srt`} download>
          .srt
        </a>{" "}
        ·{" "}
        <a className="link small" href={`/api/projects/${projectId}/subtitles?cut=${cutId}&format=${format}&kind=vtt`} download>
          .vtt
        </a>{" "}
        <span className="dim">for YouTube and the like, timed to this cut</span>
      </p>
    </div>
  );
}

/** Whether the Script tab should be offered: the cut plays footage, or there's narration to caption. */
export const hasScript = () => {
  const p = getState().project;
  return !!p && p.shots.some((s) => s.content.kind === "clip");
};
