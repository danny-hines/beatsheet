import type { KokoroStatus, VoiceInfo, VoicesInfo } from "@beatsheet/engine";
import { voiceProvider } from "@beatsheet/schema";
import { useEffect, useState, useSyncExternalStore } from "react";
import { OS, WINDOWS } from "../lib";
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
 * The narration voice and where voices come from: ElevenLabs (its library, plus the voices you've designed or cloned
 * there), Kokoro on this Mac, and the Mac's built-in voices.
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

function VoiceRow({ v, current }: { v: VoiceInfo; current?: string }) {
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

function VoiceList({ list, current, limit = 6 }: { list: VoiceInfo[]; current?: string; limit?: number }) {
  const [all, setAll] = useState(false);
  // The chosen one stays in view even when the list is folded.
  const shown = all ? list : [...list.slice(0, limit), ...list.slice(limit).filter((v) => v.id === current)];
  return (
    <div className="voice-list">
      {shown.map((v) => (
        <VoiceRow key={v.id} v={v} current={current} />
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
  const current = info.default ?? info.fallback;
  const own = voices.filter((v) => v.own);
  const library = voices.filter((v) => !v.own);
  if (!info.elevenlabs.configured) {
    return (
      <div className="setup-service">
        <div className="setup-service-head">
          <strong>ElevenLabs</strong>
          <span className="pill">Lifelike voices</span>
          <span className="pill">Your own voices</span>
          <span className="spacer" />
          <button onClick={onAddKey}>Add a key</button>
        </div>
        <div className="dim small">The most natural narration: hundreds of voices, and any you've designed or cloned on elevenlabs.io. Add your ElevenLabs key under Media services.</div>
      </div>
    );
  }
  return (
    <div className="setup-service ok">
      <div className="setup-service-head">
        <strong>ElevenLabs</strong>
        <span className="spacer" />
        <a href="https://elevenlabs.io/app/voice-lab" target="_blank" rel="noreferrer" className="small" title="Design a voice from a description or clone your own there; it shows up here">
          Make a voice on ElevenLabs ↗
        </a>
      </div>
      {info.elevenlabs.error && <div className="warn small">{info.elevenlabs.error}</div>}
      {own.length > 0 && (
        <>
          <h5>Your voices</h5>
          <VoiceList list={own} current={current} limit={20} />
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

/**
 * A cut's voice (its own choice, or the default), or a character's (`unset` says what it falls back to). Grouped by
 * where each voice comes from.
 */
export function VoicePicker({ value, onChange, unset }: { value: string | undefined; onChange: (id: string | undefined) => void; unset?: string }) {
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
      <option value="">{unset ?? (fallback ? `Default: ${voiceLabel(info, fallback)}` : "Default")}</option>
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
