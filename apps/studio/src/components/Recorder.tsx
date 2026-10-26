import { useEffect, useRef, useState } from "react";
import { desktop, type EngineJob, WINDOWS } from "../lib";
import { allow, captureError, cleanAudio, clock, RECORD_WORDS, stopStream, useDevices, useLevel, useTake, type RecordKind } from "../record";
import { actions, getState } from "../store";

const KINDS: RecordKind[] = ["screen", "camera", "voice"];
const ICONS: Record<RecordKind, string> = { screen: "▭", camera: "◉", voice: "🎙" };

/** Record ▾ beside Add footage: the screen, a camera or the microphone. */
export function RecordMenu({ onPick, big }: { onPick: (kind: RecordKind) => void; big?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="record-menu" ref={ref}>
      <button className={`record-button ${big ? "big" : ""}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title="Record your screen, a camera or your voice">
        <span className="rec-dot" /> Record <span className="caret">▾</span>
      </button>
      {open && (
        <div className="record-panel" role="menu">
          {KINDS.map((k) => (
            <button
              key={k}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(k);
              }}
            >
              <span className="record-icon">{ICONS[k]}</span>
              <span className="record-text">
                <strong>{RECORD_WORDS[k].short}</strong>
                <span className="dim small">{RECORD_WORDS[k].about}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** What's on screen in the dialog. */
type Phase = "setup" | "countdown" | "recording" | "review" | "saving";

/**
 * Records the screen, a camera or the microphone into the project's media. Pick what to record (a window or display,
 * a camera, a microphone), count in, record (pause if you need to), then watch it back and keep it or go again. What
 * you keep is saved as an MP4 (or M4A) in the project's recordings folder, like any other footage.
 */
export function RecorderDialog({ kind, onClose }: { kind: RecordKind; onClose: () => void }) {
  const [mic, setMic] = useState<string>("default");
  const [cam, setCam] = useState<string>("");
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [input, setInput] = useState<MediaStream | null>(null);
  const [round, setRound] = useState(0);
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const startedAt = useRef(0);
  const take = useTake();
  const level = useLevel(input);
  const mics = useDevices("audioinput", input);
  const cams = useDevices("videoinput", input);
  const phase: Phase = saving !== null ? "saving" : blob ? "review" : take.state !== "idle" ? "recording" : count > 0 ? "countdown" : "setup";
  const live = phase === "setup" || phase === "countdown" || phase === "recording";

  // The camera and microphone, opened (again) whenever the choice changes; never while a take is running.
  const wantsInput = kind !== "screen" || mic !== "none";
  useEffect(() => {
    if (!wantsInput || blob || take.state !== "idle") return;
    let gone = false, got: MediaStream | null = null;
    void (async () => {
      setError("");
      const refused = (kind === "camera" ? await allow("camera") : undefined) ?? (mic !== "none" ? await allow("microphone") : undefined);
      if (refused) return !gone && setError(refused);
      try {
        got = await navigator.mediaDevices.getUserMedia({
          video: kind === "camera" ? { deviceId: cam ? { exact: cam } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } : false,
          audio: mic === "none" ? false : cleanAudio(mic === "default" ? undefined : mic),
        });
        if (gone) return stopStream(got);
        setInput(got);
      } catch (err) {
        if (!gone) setError(captureError(err, kind === "camera" ? "camera" : "microphone") ?? "");
      }
    })();
    return () => {
      gone = true;
      stopStream(got);
      setInput(null);
    };
  }, [kind, mic, cam, round, wantsInput, blob]); // eslint-disable-line react-hooks/exhaustive-deps

  // Everything stops when the dialog goes.
  const screenRef = useRef(screen);
  screenRef.current = screen;
  useEffect(() => () => stopStream(screenRef.current), []);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const chooseScreen = async () => {
    setError("");
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
      stopStream(screen);
      setScreen(s);
      // Sharing stopped from macOS's menu bar ends the recording too.
      s.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreen((cur) => (cur === s ? null : cur));
        window.dispatchEvent(new CustomEvent("beatsheet:screen-ended"));
      });
    } catch (err) {
      setError(captureError(err, "screen") ?? "");
    }
  };

  const stop = async () => {
    const b = await take.stop();
    setBlob(b);
    setUrl(URL.createObjectURL(b));
  };
  useEffect(() => {
    const ended = () => take.state !== "idle" && void stop();
    window.addEventListener("beatsheet:screen-ended", ended);
    return () => window.removeEventListener("beatsheet:screen-ended", ended);
  });

  const start = () => {
    const tracks = kind === "screen" ? [...(screen?.getVideoTracks() ?? []), ...(input?.getAudioTracks() ?? [])] : (input?.getTracks() ?? []);
    if (!tracks.length) return;
    const go = () => {
      startedAt.current = Date.now();
      take.start(new MediaStream(tracks), { video: kind === "screen" ? 12_000_000 : 10_000_000 });
    };
    if (kind === "voice") return go();
    // A count of three, to get to what you're showing.
    setCount(3);
    let n = 3;
    const t = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        clearInterval(t);
        go();
      }
    }, 1000);
  };

  const again = () => {
    setBlob(null);
    setUrl("");
    setRound((r) => r + 1);
  };

  const save = async () => {
    const projectId = getState().projectId;
    if (!blob || !projectId) return;
    setSaving(0);
    setError("");
    try {
      const q = new URLSearchParams({ kind, at: String(startedAt.current || Date.now()), ...(name.trim() ? { label: name.trim() } : {}) });
      const res = await actions.quietly(async () => {
        const r = await fetch(`/api/projects/${projectId}/recordings?${q}`, { method: "POST", headers: { "content-type": blob.type || "video/webm" }, body: blob });
        let job = (await r.json()) as EngineJob & { error?: string };
        if (!r.ok) throw new Error(job.error ?? `${r.status}`);
        while (job.status === "running") {
          await new Promise((ok) => setTimeout(ok, 400));
          job = (await (await fetch(`/api/jobs/${job.id}`)).json()) as EngineJob;
          setSaving(job.progress);
        }
        if (job.status === "error") throw new Error(job.error ?? "It couldn't be saved");
        await actions.reload();
        return job.output;
      });
      stopStream(screen);
      if (res) actions.select({ kind: "asset", id: res });
      onClose();
    } catch (err) {
      setSaving(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const close = () => {
    if (phase === "recording" || phase === "saving") return;
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const preview = kind === "screen" ? screen : kind === "camera" ? input : null;
  const ready = kind === "screen" ? !!screen : kind === "camera" ? !!input?.getVideoTracks().length : !!input?.getAudioTracks().length;
  const words = RECORD_WORDS[kind];
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal recorder recorder-${kind}`} role="dialog" aria-label={words.title}>
        <div className="modal-head">
          <h3>{words.title}</h3>
          <span className="spacer" />
          {phase === "recording" && (
            <span className={`rec-live ${take.state === "paused" ? "paused" : ""}`}>
              <span className="rec-dot" /> {take.state === "paused" ? "Paused" : "Recording"} <span className="mono">{clock(take.seconds)}</span>
            </span>
          )}
          <button className="icon" onClick={close} disabled={phase === "recording" || phase === "saving"} title="Close (Esc)" aria-label="Close">
            ✕
          </button>
        </div>

        {live && (
          <div className={`rec-stage ${kind === "voice" ? "voice" : ""}`}>
            {kind !== "voice" && (preview ? <LiveVideo stream={preview} mirror={kind === "camera"} /> : <ScreenPlaceholder kind={kind} onChoose={() => void chooseScreen()} />)}
            {kind === "voice" && <Meter level={level} big seconds={phase === "recording" ? take.seconds : undefined} />}
            {phase === "countdown" && <div className="rec-count">{count}</div>}
          </div>
        )}
        {phase === "review" && url && (
          <div className="rec-stage review">
            {kind === "voice" ? <audio src={url} controls autoPlay={false} /> : <video src={url} controls playsInline />}
          </div>
        )}

        {phase === "setup" && (
          <div className="rec-options">
            {kind === "screen" && screen && (
              <button className="link small" onClick={() => void chooseScreen()}>
                Choose something else…
              </button>
            )}
            {kind === "camera" && (
              <label>
                Camera
                <select value={cam} onChange={(e) => setCam(e.target.value)}>
                  <option value="">{cams[0]?.label ? `Default (${cams[0].label})` : "Default"}</option>
                  {cams.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Camera"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Microphone
              <span className="rec-mic">
                <select value={mic} onChange={(e) => setMic(e.target.value)}>
                  <option value="default">{mics.find((d) => d.deviceId === "default")?.label || "Default microphone"}</option>
                  {mics
                    .filter((d) => d.deviceId !== "default")
                    .map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || "Microphone"}
                      </option>
                    ))}
                  {kind !== "voice" && <option value="none">No sound</option>}
                </select>
                {kind !== "voice" && mic !== "none" && <Meter level={level} />}
              </span>
            </label>
          </div>
        )}

        {phase === "recording" && kind === "screen" && (
          <p className="dim small">Go to what you're showing. Come back here to stop, or stop sharing from the menu bar.</p>
        )}
        {phase === "review" && (
          <label className="rec-name">
            <span>
              Name <span className="dim">(optional)</span>
            </span>
            <input value={name} autoFocus placeholder={`${words.short === "Voice" ? "Voice recording" : words.short === "Camera" ? "Camera" : "Screen recording"} · ${new Date(startedAt.current).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
          </label>
        )}
        {phase === "saving" && (
          <div className="progress">
            <div style={{ width: `${Math.round((saving ?? 0) * 100)}%` }} />
            <span>Saving it to the project…</span>
          </div>
        )}
        {error && (
          <p className="warn small">
            {error}{" "}
            {desktop?.openPrivacy && /System Settings|Windows Settings/.test(error) && (
              <button className="link small" onClick={() => desktop!.openPrivacy!(/camera/i.test(error) ? "camera" : "microphone")}>
                Open Privacy settings
              </button>
            )}
          </p>
        )}

        <div className="modal-actions">
          {phase === "setup" && (
            <>
              <span className="dim small">{kind === "voice" ? "Recording starts straight away." : "It counts three, then records."}</span>
              <span className="spacer" />
              <button onClick={onClose}>Cancel</button>
              <button className="primary rec-start" onClick={start} disabled={!ready}>
                <span className="rec-dot" /> Start recording
              </button>
            </>
          )}
          {phase === "countdown" && <span className="dim small">Starting…</span>}
          {phase === "recording" && (
            <>
              <span className="spacer" />
              {take.state === "paused" ? <button onClick={take.resume}>Resume</button> : <button onClick={take.pause}>Pause</button>}
              <button className="primary" onClick={() => void stop()}>
                ■ Stop
              </button>
            </>
          )}
          {phase === "review" && (
            <>
              <span className="dim small">{clock(take.seconds)} recorded</span>
              <span className="spacer" />
              <button onClick={onClose}>Discard</button>
              <button onClick={again}>Record again</button>
              <button className="primary" onClick={() => void save()}>
                Add to media
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveVideo({ stream, mirror }: { stream: MediaStream; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} className={mirror ? "mirror" : ""} autoPlay muted playsInline />;
}

function ScreenPlaceholder({ kind, onChoose }: { kind: RecordKind; onChoose: () => void }) {
  if (kind === "camera") return <div className="rec-empty dim small">Waiting for the camera…</div>;
  return (
    <div className="rec-empty">
      <button className="primary" onClick={onChoose}>
        Choose a window or screen…
      </button>
      <span className="dim small">{desktop ? (WINDOWS ? "With more than one screen, beatsheet asks which to record." : "macOS asks what to share: a window, an app or a whole display.") : "Your browser asks what to share."}</span>
    </div>
  );
}

/** A microphone's level: a thin bar beside the choice, or a big one with the time when recording sound alone. */
function Meter({ level, big, seconds }: { level: number; big?: boolean; seconds?: number }) {
  const db = level > 0 ? 20 * Math.log10(level) : -60;
  const width = Math.max(0, Math.min(1, (db + 60) / 60));
  return (
    <div className={`meter ${big ? "big" : ""}`}>
      {big && <div className="meter-time mono">{seconds !== undefined ? clock(seconds) : "0:00"}</div>}
      <div className="meter-bar">
        <div className={level > 0.9 ? "hot" : ""} style={{ width: `${width * 100}%` }} />
      </div>
      {big && <div className="dim small">{level > 0.9 ? "Too loud: move back a little" : level < 0.02 ? "Say something to check the level" : "Sounds good"}</div>}
    </div>
  );
}
