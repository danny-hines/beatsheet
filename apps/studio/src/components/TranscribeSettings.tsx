/**
 * Settings → Transcription: Whisper on this computer (installed for what this machine has: its graphics card, Apple
 * silicon, or the processor with a smaller model) and what each transcriber can do here. Whisper here comes first
 * when this machine is quick at it, and the audio goes to a service when it's slow.
 */
import type { ModelSize, WhisperStatus } from "@beatsheet/engine";
import { TRANSCRIBERS, type TranscriberState } from "@beatsheet/schema";
import { useEffect, useState } from "react";
import { OS } from "../lib";
import { ServiceMark } from "./ui";
import { Icon } from "./Icon";

type Info = { whisper: WhisperStatus; states: Record<string, TranscriberState>; whisperModel?: ModelSize };

const mb = (bytes?: number) => (bytes === undefined ? "" : bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);
const SIZES: { id: ModelSize; label: string; bytes: number; note: string }[] = [
  { id: "fast", label: "Fast", bytes: 60e6, note: "base: quick anywhere, misses more" },
  { id: "good", label: "Good", bytes: 190e6, note: "small: right for a processor" },
  { id: "best", label: "Best", bytes: 574e6, note: "large v3 turbo: for a graphics card or Apple silicon" },
];

/**
 * What can transcribe now, kept in one place: the page and the Settings nav's line both read it, so the line changes as
 * soon as Whisper is installed or removed on the page.
 */
let known: Info | undefined;
const watching = new Set<(info: Info) => void>();
const tell = (info: Info) => {
  known = info;
  for (const set of watching) set(info);
};
async function refresh(): Promise<void> {
  tell((await fetch("/api/settings/transcribe").then((r) => r.json())) as Info);
}
function useInfo(): Info | undefined {
  const [info, setInfo] = useState(known);
  useEffect(() => {
    watching.add(setInfo);
    void refresh();
    return () => void watching.delete(setInfo);
  }, []);
  return info;
}

/** A line for the Settings nav: what Auto would use now. */
export function useTranscribeSummary(): string {
  const info = useInfo();
  if (!info) return "";
  const ready = TRANSCRIBERS.filter((t) => info.states[t.id]?.state === "ready");
  return ready.length ? ready.map((t) => t.label).join(", ") : "None set up";
}

export function TranscribeSection() {
  const info = useInfo();
  if (!info) return <p className="dim small">Loading…</p>;
  const save = async (change: Record<string, unknown>) => {
    const res = await fetch("/api/settings/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(change) });
    tell((await res.json()) as Info);
  };
  return (
    <div className="make-settings">
      <WhisperCard info={info} onChange={() => void refresh()} setModel={(m) => void save({ whisperModel: m })} />
      <section>
        <h4>Or a service with your key</h4>
        <Services info={info} />
        <p className="dim small">
          beatsheet uses Whisper here when {OS.here} is quick at it, a service with your key when it's slow, and Whisper here anyway when there's no key. Asking for who's speaking leaves only the
          ones that can tell. You can pick another for a clip when you transcribe it.
        </p>
      </section>
    </div>
  );
}

/** Whisper on this computer: what an install would be here, then installing it, then how quick it turned out. */
function WhisperCard({ info, onChange, setModel }: { info: Info; onChange: () => void; setModel: (m: ModelSize) => void }) {
  const s = info.whisper;
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const installing = s.state === "installing";
  useEffect(() => {
    if (!installing) return;
    const t = setInterval(onChange, 1000);
    return () => clearInterval(t);
  }, [installing]); // eslint-disable-line react-hooks/exhaustive-deps
  const call = async (method: string, path: string, body?: unknown) => {
    setError("");
    const res = await fetch(`/api/settings/whisper${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work");
    onChange();
  };
  if (s.state === "unsupported") {
    return (
      <div className="setup-service">
        <div className="setup-service-head">
          <strong>Whisper</strong>
          <span className="dim small">on {OS.here}</span>
        </div>
        <div className="dim small">{s.detail}. A service with your key can transcribe instead.</div>
      </div>
    );
  }
  const ready = s.state === "ready";
  const size = s.plan?.model ?? info.whisperModel ?? "good";
  return (
    <div className={`setup-service ${ready ? "ok" : ""}`}>
      <div className="setup-service-head">
        <strong>Whisper</strong>
        <span className="dim small">on {OS.here}</span>
        <span className="pill">Free, and the audio stays here</span>
        <span className="spacer" />
        {(s.state === "missing" || s.state === "error") && (
          <button className="primary" onClick={() => void call("POST", "/install", { model: size })}>
            {s.state === "error" ? "Try again" : `Install · ${mb(s.plan?.bytes)}`}
          </button>
        )}
        {installing && <button onClick={() => void call("POST", "/cancel")}>Stop</button>}
        {ready &&
          (confirming ? (
            <>
              <span className="small">Remove {mb(s.ready?.bytes)}?</span>
              <button className="danger" onClick={() => void call("DELETE", "").then(() => setConfirming(false))}>
                Remove
              </button>
              <button onClick={() => setConfirming(false)}>Keep</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)}>Remove</button>
          ))}
      </div>
      {s.state === "missing" && (
        <div className="dim small">
          Transcribes on {s.plan?.where === "the processor" ? `${OS.here}'s processor` : (s.plan?.where ?? OS.here)}, through whisper.cpp
          {s.plan?.brew ? " (Homebrew installs it)" : ""}
          {s.speakers.state === "missing" ? ", and tells speakers apart (sherpa-onnx)" : ""}. After installing, it times itself on a few seconds of speech, so Auto knows whether {OS.here} is quick at it.
        </div>
      )}
      {!installing && (
        <label className="small make-row">
          Model
          <select value={ready ? s.ready!.model : size} onChange={(e) => setModel(e.target.value as ModelSize)} disabled={ready} aria-label="Whisper's model">
            {SIZES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label} · {mb(x.bytes)} · {x.note}
              </option>
            ))}
          </select>
          {ready && <span className="dim">Remove it to change the model</span>}
        </label>
      )}
      {ready && (
        <div className="small">
          <span className="good"><Icon name="check" size={12} /></span> {s.detail} <span className="dim">· {mb(s.ready?.bytes)} on disk</span>
        </div>
      )}
      {ready && s.speakers.state === "ready" && (
        <div className="small">
          <span className="good"><Icon name="check" size={12} /></span> Tells speakers apart too, on {OS.here}
        </div>
      )}
      {ready && s.speakers.state === "missing" && (
        <div className="small make-row">
          <span className="dim">Who's speaking isn't installed: without it, only Scribe can tell people apart, and the audio goes to ElevenLabs.</span>
          <button onClick={() => void call("POST", "/speakers")}>Add who's speaking · {mb(s.speakers.bytes)}</button>
        </div>
      )}
      {installing && (
        <div className="sam-install">
          <div className="small">{s.stage}…</div>
          <div className="progress thin">
            <div style={{ width: `${Math.round((s.progress ?? 0) * 100)}%` }} />
          </div>
          {!!s.log?.length && <pre className="setup-log">{s.log.slice(-3).join("\n")}</pre>}
        </div>
      )}
      {error && <div className="warn small">{error}</div>}
      {s.state === "error" && (
        <>
          <div className="warn small">{s.detail}</div>
          {!!s.log?.length && <pre className="setup-log">{s.log.slice(-4).join("\n")}</pre>}
        </>
      )}
    </div>
  );
}

/** The services that transcribe, each saying what it costs, whether it tells speakers apart and whether it's ready (Whisper here has its card above). */
function Services({ info }: { info: Info }) {
  const state = (id: string) => {
    const s = info.states[id];
    if (!s) return "";
    if (s.state === "ready") return s.where ? `Ready ${s.where}` : "Ready";
    return s.detail;
  };
  return (
    <div className="make-ranking">
      <ul>
        {TRANSCRIBERS.filter((t) => t.runs === "service").map((t) => (
          <li key={t.id}>
            <span>
              <ServiceMark id={t.id} label={t.label} />
              {t.label}
              <span className="dim small">
                {" "}
                · {t.by}
                {t.perHour ? ` · about ${Math.round(t.perHour * 100)}¢ an hour` : " · free"}
                {t.gives.speakers ? " · tells speakers apart" : ""}
              </span>
            </span>
            <span className={`small ${info.states[t.id]?.state === "ready" ? "" : "dim"}`}>{state(t.id)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
