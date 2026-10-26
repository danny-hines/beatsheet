import type { DesignPreview, KokoroStatus, VoiceInfo, VoicesInfo } from "@beatsheet/engine";
import { voiceProvider } from "@beatsheet/schema";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { pickPath, pathParts, OS, WINDOWS } from "../lib";
import { allow, captureError, cleanAudio, clock, stopStream, useLevel, useTake } from "../record";
import { actions } from "../store";

// ---- The voices on hand, shared by Settings and the cut's narration

let voices: VoicesInfo | undefined;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** Asks the engine for the voices again (after a key, an install, a new voice). */
export function refreshVoices(): Promise<void> {
  loading = fetch("/api/voices")
    .then((r) => r.json() as Promise<VoicesInfo>)
    .then((v) => {
      voices = v;
      changed();
    })
    .catch(() => {})
    .finally(() => (loading = undefined));
  return loading;
}

/** The voices narration can use, loaded the first time anything asks. */
export function useVoices(): VoicesInfo | undefined {
  const v = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => voices,
  );
  useEffect(() => {
    if (!voices && !loading) void refreshVoices();
  }, []);
  return v;
}

export const PROVIDER_NAMES = { elevenlabs: "ElevenLabs", kokoro: "Kokoro", mac: "Mac", windows: "Windows" } as const;
/** This computer's own voices: the Mac's, or Windows'. */
const SYSTEM = WINDOWS ? "windows" : "mac";
const SYSTEM_VOICES = WINDOWS ? "Windows voices" : "Mac voices";

/** "Rachel (ElevenLabs)": a voice id as a person reads it. */
export function voiceLabel(info: VoicesInfo | undefined, id: string | undefined): string {
  if (!id) return "";
  const v = info?.voices.find((x) => x.id === id);
  const p = voiceProvider(id);
  return v ? `${v.name} (${PROVIDER_NAMES[v.provider]})` : p ? `${id.slice(id.indexOf(":") + 1)} (${PROVIDER_NAMES[p]})` : id;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `${res.status}`);
  return j;
}

export async function setDefaultVoice(id: string | null) {
  await post("/api/voices/settings", { default: id });
  await refreshVoices();
}

// ---- Listening

let playing: { key: string; audio: HTMLAudioElement } | undefined;
const playListeners = new Set<() => void>();
const playChanged = () => playListeners.forEach((l) => l());

/** Plays a sample (stopping any other); a second press stops it. */
export function playSample(key: string, src: string) {
  const same = playing?.key === key;
  playing?.audio.pause();
  playing = undefined;
  if (!same) {
    const audio = new Audio(src);
    playing = { key, audio };
    audio.onended = audio.onerror = () => {
      if (playing?.audio === audio) playing = undefined;
      playChanged();
    };
    void audio.play().catch(() => {
      playing = undefined;
      playChanged();
    });
  }
  playChanged();
}

function usePlaying(): string | undefined {
  return useSyncExternalStore(
    (l) => (playListeners.add(l), () => playListeners.delete(l)),
    () => playing?.key,
  );
}

const sampleUrl = (v: VoiceInfo) => v.previewUrl ?? `/api/voices/preview?voice=${encodeURIComponent(v.id)}`;

export function PlayButton({ id, src, title }: { id: string; src: string; title?: string }) {
  const now = usePlaying();
  return (
    <button className={`icon play ${now === id ? "on" : ""}`} onClick={() => playSample(id, src)} title={now === id ? "Stop" : (title ?? "Listen")} aria-label={now === id ? "Stop" : "Listen"}>
      {now === id ? "■" : "▶"}
    </button>
  );
}

// ---- Settings → Voices

/**
 * The narration voice and where voices come from: ElevenLabs (its library, plus voices you design from a description
 * or clone from your own recordings), Kokoro on this Mac, and the Mac's built-in voices.
 */
export function VoicesSection({ onAddKey, kokoro: kokoroInitial }: { onAddKey: () => void; kokoro?: KokoroStatus }) {
  const info = useVoices();
  if (!info) return <p className="dim small">Looking for voices…</p>;
  const current = info.default ?? info.fallback;
  const v = info.voices.find((x) => x.id === current);
  const eleven = info.voices.filter((x) => x.provider === "elevenlabs");
  const kokoro = info.voices.filter((x) => x.provider === "kokoro");
  return (
    <div className="voices">
      <div className="voice-current">
        <div className="voice-current-text">
          <span className="dim small">Narration voice</span>
          <strong>{current ? voiceLabel(info, current) : "None available"}</strong>
          <span className="dim small">
            {info.default
              ? "New narration reads in this voice. Each cut can choose its own under Inspect."
              : current
                ? "Not chosen yet, so narration uses the best voice on hand. Choose one below."
                : "Add ElevenLabs or install Kokoro below."}
          </span>
        </div>
        {v && <PlayButton id={`v:${v.id}`} src={sampleUrl(v)} />}
        {info.default && (
          <button className="link small" onClick={() => void setDefaultVoice(null)} title="Narration uses the best voice on hand">
            Let it choose
          </button>
        )}
      </div>

      <ElevenLabsCard info={info} voices={eleven} onAddKey={onAddKey} />
      <KokoroCard status={info.kokoro ?? kokoroInitial} voices={kokoro} current={current} />
      <MacCard info={info} current={current} />
    </div>
  );
}

function VoiceRow({ v, current, extra }: { v: VoiceInfo; current?: string; extra?: React.ReactNode }) {
  const chosen = v.id === current;
  return (
    <div className={`voice-row ${chosen ? "chosen" : ""}`}>
      <PlayButton id={`v:${v.id}`} src={sampleUrl(v)} title={v.previewUrl || v.provider !== "elevenlabs" ? "Listen" : "Listen (made once; uses a few ElevenLabs credits)"} />
      <span className="voice-row-text">
        <span className="voice-row-name">
          {v.name}
          {v.own && <span className="pill">{v.own === "cloned" ? "Your clone" : "Designed"}</span>}
          {v.quality === "best" && <span className="pill">Premium</span>}
          {v.quality === "good" && <span className="pill">Enhanced</span>}
        </span>
        {v.detail && <span className="dim small">{v.detail}</span>}
      </span>
      {extra}
      {chosen ? (
        <span className="small good voice-row-tag">✓ Narration</span>
      ) : (
        <button className="voice-row-use small" onClick={() => void setDefaultVoice(v.id)}>
          Use for narration
        </button>
      )}
    </div>
  );
}

function VoiceList({ list, current, limit = 6, extra }: { list: VoiceInfo[]; current?: string; limit?: number; extra?: (v: VoiceInfo) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  // The chosen one stays in view even when the list is folded.
  const shown = all ? list : [...list.slice(0, limit), ...list.slice(limit).filter((v) => v.id === current)];
  return (
    <div className="voice-list">
      {shown.map((v) => (
        <VoiceRow key={v.id} v={v} current={current} extra={extra?.(v)} />
      ))}
      {list.length > shown.length && (
        <button className="link small voice-more" onClick={() => setAll(true)}>
          Show all {list.length}
        </button>
      )}
    </div>
  );
}

function ElevenLabsCard({ info, voices, onAddKey }: { info: VoicesInfo; voices: VoiceInfo[]; onAddKey: () => void }) {
  const [panel, setPanel] = useState<"design" | "clone" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const current = info.default ?? info.fallback;
  const own = voices.filter((v) => v.own);
  const library = voices.filter((v) => !v.own);
  const remove = async (id: string) => {
    await fetch(`/api/voices/${encodeURIComponent(id)}`, { method: "DELETE" });
    setRemoving(null);
    await refreshVoices();
  };
  if (!info.elevenlabs.configured) {
    return (
      <div className="setup-service">
        <div className="setup-service-head">
          <strong>ElevenLabs</strong>
          <span className="pill">Lifelike voices</span>
          <span className="pill">Design a voice</span>
          <span className="pill">Clone your voice</span>
          <span className="spacer" />
          <button onClick={onAddKey}>Add a key</button>
        </div>
        <div className="dim small">The most natural narration: hundreds of voices, new ones made from a description, and your own voice cloned from a minute or two of recording. Add your ElevenLabs key under Media services.</div>
      </div>
    );
  }
  return (
    <div className="setup-service ok">
      <div className="setup-service-head">
        <strong>ElevenLabs</strong>
        <span className="spacer" />
        <select
          value={info.model}
          onChange={(e) => void post("/api/voices/settings", { model: e.target.value }).then(refreshVoices)}
          title="The model that reads narration"
          className="small"
        >
          {info.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {info.elevenlabs.error && <div className="warn small">{info.elevenlabs.error}</div>}
      <div className="voice-make">
        <button className={panel === "design" ? "on" : ""} onClick={() => setPanel(panel === "design" ? null : "design")}>
          ✦ Design a voice…
        </button>
        <button className={panel === "clone" ? "on" : ""} onClick={() => setPanel(panel === "clone" ? null : "clone")}>
          🎙 Clone your voice…
        </button>
      </div>
      {panel === "design" && <DesignPanel onDone={() => setPanel(null)} />}
      {panel === "clone" && <ClonePanel onDone={() => setPanel(null)} />}
      {own.length > 0 && (
        <>
          <h5>Your voices</h5>
          <VoiceList
            list={own}
            current={current}
            limit={20}
            extra={(v) =>
              removing === v.id ? (
                <span className="voice-remove">
                  <button className="danger small" onClick={() => void remove(v.id)}>
                    Delete
                  </button>
                  <button className="small" onClick={() => setRemoving(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button className="icon voice-row-x" title="Delete this voice from ElevenLabs" onClick={() => setRemoving(v.id)}>
                  ✕
                </button>
              )
            }
          />
        </>
      )}
      {library.length > 0 && (
        <>
          <h5>Library</h5>
          <VoiceList list={library} current={current} />
        </>
      )}
    </div>
  );
}

/** A voice described in words: ElevenLabs makes three takes on it; keep the one that sounds right. */
function DesignPanel({ onDone }: { onDone: () => void }) {
  const [description, setDescription] = useState("");
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [takes, setTakes] = useState<DesignPreview[]>([]);
  const [chosen, setChosen] = useState<string>();
  const [name, setName] = useState("");
  const [use, setUse] = useState(true);
  const make = async () => {
    setBusy(true);
    setError("");
    setTakes([]);
    setChosen(undefined);
    try {
      const r = await post<{ previews: DesignPreview[] }>("/api/voices/design", { description, text: sample });
      setTakes(r.previews);
      setChosen(r.previews[0]?.generatedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      const v = await post<VoiceInfo>("/api/voices/design/save", { generatedId: chosen, name: name.trim() || description.split(/[,.]/)[0]!.slice(0, 40), description });
      if (use) await setDefaultVoice(v.id);
      else await refreshVoices();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <div className="voice-panel">
      <label>
        Describe the voice
        <textarea
          rows={2}
          value={description}
          autoFocus
          placeholder="e.g. A warm, unhurried British woman in her sixties, like a nature documentary"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        <span>
          What it reads in the samples <span className="dim">(optional, at least 100 characters)</span>
        </span>
        <textarea rows={2} value={sample} placeholder="Left empty, ElevenLabs writes something that suits the voice." onChange={(e) => setSample(e.target.value)} />
      </label>
      <div className="row">
        <button className={takes.length ? "" : "primary"} onClick={() => void make()} disabled={busy || description.trim().length < 12}>
          {busy && !takes.length ? "Making three takes…" : takes.length ? "Make three more" : "Make three takes"}
        </button>
        {busy && !takes.length && <span className="dim small">About half a minute</span>}
        <span className="spacer" />
        <button className="link small" onClick={onDone}>
          Cancel
        </button>
      </div>
      {takes.length > 0 && (
        <>
          <div className="voice-takes">
            {takes.map((t, i) => (
              <label key={t.generatedId} className={`voice-take ${chosen === t.generatedId ? "on" : ""}`}>
                <input type="radio" name="take" checked={chosen === t.generatedId} onChange={() => setChosen(t.generatedId)} />
                <PlayButton id={`t:${t.generatedId}`} src={t.audio} />
                <span>Take {i + 1}</span>
                <span className="dim small">{t.duration ? `${t.duration.toFixed(0)}s` : ""}</span>
              </label>
            ))}
          </div>
          <div className="row">
            <input className="grow" value={name} placeholder="Name it, e.g. Documentary Nan" onChange={(e) => setName(e.target.value)} />
            <label className="check small">
              <input type="checkbox" checked={use} onChange={(e) => setUse(e.target.checked)} /> Use for narration
            </label>
            <button className="primary" onClick={() => void save()} disabled={busy || !chosen}>
              Keep this voice
            </button>
          </div>
        </>
      )}
      {error && <div className="warn small">{error}</div>}
    </div>
  );
}

const PASSAGE =
  "The light was just starting to go when we reached the top. Below us the whole valley opened up: the river, the old stone bridge, the road we'd walked that morning. Someone laughed, someone took a picture, and for a minute nobody said anything at all. Moments like that are why we go. Not for the view exactly, but for the quiet after the climb, the people you share it with, and the story you get to tell when you're home. So here it is, one day at a time, the way it really happened.";

type Sample = { key: string; url: string; seconds: number; blob?: Blob; file?: string };

/**
 * Your own voice, cloned from recordings (ElevenLabs Instant Voice Cloning). Read the passage aloud for a minute or
 * two, or choose recordings you already have. Recordings go to ElevenLabs to make the voice and aren't kept here.
 */
function ClonePanel({ onDone }: { onDone: () => void }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [name, setName] = useState("My voice");
  const [noise, setNoise] = useState(false);
  const [consent, setConsent] = useState(false);
  const [use, setUse] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const take = useTake();
  const level = useLevel(mic);
  const micRef = useRef(mic);
  micRef.current = mic;
  useEffect(() => () => stopStream(micRef.current), []);
  useEffect(() => () => samples.forEach((s) => s.blob && URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const total = samples.reduce((n, s) => n + s.seconds, 0);
  const record = async () => {
    setError("");
    const refused = await allow("microphone");
    if (refused) return setError(refused);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: cleanAudio() });
      setMic(s);
      take.start(s);
    } catch (err) {
      setError(captureError(err, "microphone") ?? "");
    }
  };
  const stop = async () => {
    const seconds = take.seconds;
    const blob = await take.stop();
    stopStream(mic);
    setMic(null);
    setSamples((list) => [...list, { key: `r${Date.now()}`, url: URL.createObjectURL(blob), seconds, blob }]);
  };
  const choose = async () => {
    const file = await pickPath("audio");
    if (file) setSamples((list) => [...list, { key: `f${Date.now()}`, url: "", seconds: 0, file }]);
  };
  const clone = async () => {
    setBusy(true);
    setError("");
    try {
      const ids: string[] = [];
      for (const s of samples.filter((x) => x.blob)) {
        const res = await fetch("/api/voices/samples", { method: "POST", headers: { "content-type": s.blob!.type || "audio/webm" }, body: s.blob });
        const j = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !j.id) throw new Error(j.error ?? "Couldn't send the recording");
        ids.push(j.id);
      }
      const v = await post<VoiceInfo>("/api/voices/clone", { name, samples: ids, files: samples.filter((x) => x.file).map((x) => x.file), removeNoise: noise, consent });
      if (use && !/verifying/.test(v.detail ?? "")) await setDefaultVoice(v.id);
      else await refreshVoices();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  const recording = take.state !== "idle";
  return (
    <div className="voice-panel">
      <p className="small">
        Read this aloud for a minute or two, somewhere quiet, the way you'd narrate. Several takes add up; about two minutes in all is plenty.
      </p>
      <blockquote className="voice-passage">{PASSAGE}</blockquote>
      <div className="row">
        {recording ? (
          <button className="primary" onClick={() => void stop()}>
            ■ Stop · {clock(take.seconds)}
          </button>
        ) : (
          <button className={samples.length ? "" : "primary"} onClick={() => void record()} disabled={busy}>
            <span className="rec-dot" /> {samples.some((s) => s.blob) ? "Record another take" : "Record"}
          </button>
        )}
        {recording && (
          <div className="meter-bar voice-meter">
            <div style={{ width: `${Math.max(0, Math.min(1, (20 * Math.log10(level || 1e-3) + 60) / 60)) * 100}%` }} />
          </div>
        )}
        {!recording && (
          <button className="link small" onClick={() => void choose()} disabled={busy}>
            or choose a recording…
          </button>
        )}
      </div>
      {samples.length > 0 && (
        <div className="voice-samples">
          {samples.map((s, i) => (
            <div key={s.key} className="voice-sample">
              {s.blob ? <PlayButton id={`s:${s.key}`} src={s.url} /> : <span className="dim">♪</span>}
              <span className="small">{s.file ? pathParts(s.file).pop() : `Take ${i + 1} · ${clock(s.seconds)}`}</span>
              <span className="spacer" />
              <button className="icon voice-row-x" title="Leave this one out" onClick={() => setSamples(samples.filter((x) => x !== s))}>
                ✕
              </button>
            </div>
          ))}
          {total > 0 && total < 45 && !samples.some((s) => s.file) && <div className="dim small">{clock(total)} so far. A minute or more sounds much more like you.</div>}
        </div>
      )}
      <div className="row">
        <input className="grow" value={name} placeholder="Name it" onChange={(e) => setName(e.target.value)} />
        <label className="check small" title="Cleans up hum and room noise; leave it off for clean recordings">
          <input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} /> Remove background noise
        </label>
      </div>
      <label className="check small">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> This is my voice, or I have permission to clone it
      </label>
      <div className="row">
        <label className="check small">
          <input type="checkbox" checked={use} onChange={(e) => setUse(e.target.checked)} /> Use it for narration
        </label>
        <span className="spacer" />
        <button className="link small" onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <button className="primary" onClick={() => void clone()} disabled={busy || recording || !samples.length || !consent || !name.trim()}>
          {busy ? "Cloning…" : "Clone my voice"}
        </button>
      </div>
      {error && <div className="warn small">{error}</div>}
    </div>
  );
}

const gb = (bytes?: number) => (bytes ? `${(bytes / 1e9).toFixed(1)} GB` : "");

/** Kokoro on this Mac: one button installs it (about 1.5 GB), and its voices join the list. */
function KokoroCard({ status: initial, voices, current }: { status?: KokoroStatus; voices: VoiceInfo[]; current?: string }) {
  const [status, setStatus] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setStatus(initial), [initial]);
  const call = async (method: string, path: string) => {
    setError("");
    const res = await fetch(`/api/settings/kokoro${path}`, { method });
    const body = (await res.json()) as KokoroStatus & { error?: string };
    if (res.ok) setStatus(body);
    else setError(body.error ?? "That didn't work");
    if (method === "DELETE") void refreshVoices();
  };
  const installing = status?.state === "installing";
  useEffect(() => {
    if (!installing) return;
    const t = setInterval(async () => {
      const next = (await fetch("/api/settings/kokoro").then((r) => r.json())) as KokoroStatus;
      setStatus(next);
      if (next.state !== "installing") {
        void refreshVoices();
        void actions.loadSettings();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [installing]);
  if (!status || status.state === "unsupported") return null;
  const ready = status.state === "ready";
  return (
    <div className={`setup-service ${ready ? "ok" : ""}`}>
      <div className="setup-service-head">
        <strong>Kokoro</strong>
        <span className="dim small">on {OS.here}</span>
        <span className="pill">Natural voices, free and offline</span>
        <span className="spacer" />
        {status.state === "missing" && (
          <button className="primary" onClick={() => void call("POST", "/install")}>
            Install
          </button>
        )}
        {status.state === "error" && (
          <button className="primary" onClick={() => void call("POST", "/install")}>
            Try again
          </button>
        )}
        {installing && <button onClick={() => void call("POST", "/cancel")}>Stop</button>}
        {ready &&
          (confirming ? (
            <>
              <span className="small">Remove {gb(status.bytes)}?</span>
              <button className="danger" onClick={() => void call("DELETE", "").then(() => setConfirming(false))}>
                Remove
              </button>
              <button onClick={() => setConfirming(false)}>Keep</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)}>Remove</button>
          ))}
      </div>
      {!ready && (
        <div className="dim small">
          {WINDOWS
            ? "An open voice model that reads far more naturally than Windows' own voices, with a dozen English voices. It runs on your PC: no key, no cost, nothing leaves it. Installs into beatsheet's own folder, about 1.5 GB."
            : "An open voice model that reads far more naturally than the Mac's own voices, with a dozen English voices. It runs on your Mac: no key, no cost, nothing leaves it. Installs into beatsheet's own folder, about 1.5 GB."}
        </div>
      )}
      {ready && <div className="small"><span className="good">✓</span> {status.detail} <span className="dim">· {gb(status.bytes)} on disk</span></div>}
      {installing && (
        <div className="sam-install">
          <div className="small">{status.stage}…</div>
          <div className="progress thin">
            <div style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }} />
          </div>
          {!!status.log?.length && <pre className="setup-log">{status.log.slice(-3).join("\n")}</pre>}
        </div>
      )}
      {error && <div className="warn small">{error}</div>}
      {status.state === "error" && (
        <>
          <div className="warn small">{status.detail}</div>
          {!!status.log?.length && <pre className="setup-log">{status.log.slice(-4).join("\n")}</pre>}
        </>
      )}
      {ready && voices.length > 0 && <VoiceList list={voices} current={current} limit={5} />}
    </div>
  );
}

function MacCard({ info, current }: { info: VoicesInfo; current?: string }) {
  const [everyLanguage, setEveryLanguage] = useState(false);
  if (!info.mac.ok) {
    return (
      <div className="setup-service">
        <div className="setup-service-head">
          <strong>{SYSTEM_VOICES}</strong>
        </div>
        <div className="warn small">{info.mac.detail}</div>
      </div>
    );
  }
  const lang = (info.mac.language ?? "en-US").split("-")[0]!;
  // This Mac's own language and region first (American English before British), then the rest, best first within each.
  const mac = info.voices
    .filter((v) => v.provider === SYSTEM && (everyLanguage || (v.language ?? "").startsWith(lang)))
    .sort((a, b) => Number(a.language !== info.mac.language) - Number(b.language !== info.mac.language));
  const good = mac.some((v) => v.quality === "best" || v.quality === "good");
  return (
    <div className="setup-service ok">
      <div className="setup-service-head">
        <strong>{SYSTEM_VOICES}</strong>
        <span className="dim small">built in</span>
        <span className="spacer" />
        <label className="check small">
          <input type="checkbox" checked={everyLanguage} onChange={(e) => setEveryLanguage(e.target.checked)} /> Every language
        </label>
      </div>
      {!good && WINDOWS && (
        <div className="dim small">
          The voices that come with Windows sound robotic: for narration worth keeping, install Kokoro above (free, on this PC) or add an ElevenLabs key.
        </div>
      )}
      {!good && !WINDOWS && (
        <div className="dim small">
          The voices that come with macOS sound robotic. Better ones are a free download: System Settings → Accessibility → Spoken Content → System voice → Manage Voices, then pick a Premium or Enhanced voice. They show up here.
        </div>
      )}
      <VoiceList list={mac} current={current} limit={good ? 6 : 4} />
    </div>
  );
}

// ---- Choosing a cut's voice

/** A cut's voice: its own choice, or the default. Grouped by where each voice comes from. */
export function VoicePicker({ value, onChange }: { value: string | undefined; onChange: (id: string | undefined) => void }) {
  const info = useVoices();
  if (!info) return <select disabled><option>Loading voices…</option></select>;
  const lang = (info.mac.language ?? "en-US").split("-")[0]!;
  const groups: [string, VoiceInfo[]][] = [
    ["Your ElevenLabs voices", info.voices.filter((v) => v.provider === "elevenlabs" && v.own)],
    ["ElevenLabs", info.voices.filter((v) => v.provider === "elevenlabs" && !v.own)],
    [`Kokoro (on ${OS.here})`, info.voices.filter((v) => v.provider === "kokoro")],
    [SYSTEM_VOICES, info.voices.filter((v) => v.provider === SYSTEM && ((v.language ?? "").startsWith(lang) || v.id === value))],
  ];
  const known = !value || info.voices.some((v) => v.id === value);
  const fallback = info.default ?? info.fallback;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{fallback ? `Default: ${voiceLabel(info, fallback)}` : "Default"}</option>
      {!known && <option value={value}>{voiceLabel(info, value)}</option>}
      {groups
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <optgroup key={label} label={label}>
            {list.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.detail ? ` · ${v.detail}` : ""}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}
