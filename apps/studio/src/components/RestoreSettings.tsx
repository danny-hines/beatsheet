/**
 * Settings → Restoring, a job at a time (cleaning voices, upscaling, smoother motion): the program that does it on
 * this computer (DeepFilterNet, Real-ESRGAN, RIFE), installed, checked and timed here, then the services that do it
 * with a key. The one here comes first when this machine is quick at it.
 */
import type { DemucsStatus, RubberbandStatus, ToolId, ToolStatus, VisionPrepStatus } from "@beatsheet/engine";
import { FIXERS, type FixerJob, type FixerState } from "@beatsheet/schema";
import { useEffect, useState } from "react";
import { OS } from "../lib";
import { ServiceMark } from "./ui";
import { Icon } from "./Icon";

type Info = {
  tools: Record<ToolId, ToolStatus>;
  states: Record<string, FixerState>;
  demucs?: DemucsStatus;
  rubberband?: RubberbandStatus;
  visionPrep?: VisionPrepStatus;
};

const mb = (bytes?: number) => (bytes === undefined ? "" : bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

const ABOUT_TOOL: Record<ToolId, string> = {
  deepfilter: "Cleans hiss, wind and hum out of voices, on the processor of any computer.",
  realesrgan: "Upscales old video a frame at a time, sharper than enlarging it, on the graphics card (any make).",
  rife: "Makes the frames in between, for smoother motion, on the graphics card. Downloads about 430 MB and keeps about 20.",
};

/**
 * What's installed and ready, kept in one place: the page and the Settings nav's line both read it, so the line changes
 * as soon as something is installed or removed on the page.
 */
let known: Info | undefined;
const watching = new Set<(info: Info) => void>();
async function refresh(): Promise<void> {
  known = (await fetch("/api/settings/restore").then((r) => r.json())) as Info;
  for (const tell of watching) tell(known);
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

/** A line for the Settings nav: what's installed here. */
export function useRestoreSummary(): string {
  const info = useInfo();
  if (!info) return "";
  const tools = Object.values(info.tools);
  const ready = tools.filter((t) => t.state === "ready");
  if (tools.some((t) => t.state === "installing")) return "Installing…";
  return ready.length ? ready.map((t) => t.label).join(", ") : "Nothing installed";
}

const JOBS: { does: FixerJob; title: string; tool: ToolId }[] = [
  { does: "clean", title: "Cleaning voices", tool: "deepfilter" },
  { does: "upscale", title: "Upscaling", tool: "realesrgan" },
  { does: "frames", title: "Smoother motion", tool: "rife" },
];

export function RestoreSection() {
  const info = useInfo();
  if (!info) return <p className="dim small">Loading…</p>;
  return (
    <div className="make-settings">
      {JOBS.map((job) => (
        <section key={job.does}>
          <h4>{job.title}</h4>
          <ToolCard s={info.tools[job.tool]} onChange={() => void refresh()} />
          <Services does={job.does} info={info} />
        </section>
      ))}
      {info.demucs && (
        <section>
          <h4>Stem separation (voices vs. music)</h4>
          <DemucsCard s={info.demucs} onChange={() => void refresh()} />
        </section>
      )}
      {info.rubberband && (
        <section>
          <h4>Pitch &amp; speed</h4>
          <div className={`setup-service ${info.rubberband.state === "ready" ? "ok" : ""}`}>
            <div className="setup-service-head">
              <strong>Rubber Band</strong>
              <span className="dim small">on {OS.here}</span>
              <span className="pill">{info.rubberband.state === "ready" ? "Installed" : "Fallback"}</span>
            </div>
            <div className="dim small">{info.rubberband.detail}</div>
          </div>
        </section>
      )}
      {info.visionPrep && (
        <section>
          <h4>Character swap &amp; face tracking</h4>
          <VisionPrepCard s={info.visionPrep} onChange={() => void refresh()} />
        </section>
      )}
      <p className="dim small">
        beatsheet uses what's on {OS.here} when it's quick enough, and a service with your key when {OS.here} would take far longer than the footage plays. You can pick another when you restore a clip.
      </p>
    </div>
  );
}

/** One program: what an install would be here, then installing it, then how quick it turned out. */
function ToolCard({ s, onChange }: { s: ToolStatus; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const installing = s.state === "installing";
  useEffect(() => {
    if (!installing) return;
    const t = setInterval(onChange, 1000);
    return () => clearInterval(t);
  }, [installing]); // eslint-disable-line react-hooks/exhaustive-deps
  const call = async (method: string, path: string) => {
    setError("");
    const res = await fetch(`/api/settings/fix/${s.id}${path}`, { method });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work");
    onChange();
  };
  const ready = s.state === "ready";
  return (
    <div className={`setup-service ${ready ? "ok" : ""}`}>
      <div className="setup-service-head">
        <strong>{s.label}</strong>
        <span className="dim small">on {OS.here}</span>
        <span className="pill">Free</span>
        <span className="spacer" />
        {(s.state === "missing" || s.state === "error") && (
          <button className="primary" onClick={() => void call("POST", "/install")}>
            {s.state === "error" ? "Try again" : `Install · ${mb(s.bytes)}`}
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
      <div className="dim small">{ABOUT_TOOL[s.id]}</div>
      {s.state === "unsupported" && <div className="dim small">{s.detail}. A service with your key can do it instead.</div>}
      {s.state === "missing" && <div className="dim small">After installing, it times itself on a few seconds of test footage, so Auto knows how quick {OS.here} is at it.</div>}
      {ready && (
        <div className="small">
          <span className="good"><Icon name="check" size={12} /></span> {s.detail} <span className="dim">· {mb(s.ready?.bytes)} on disk</span>
          {s.ready?.cpu && <span className="dim"> · no graphics card it could use, so it's slow here</span>}
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

/** Demucs (htdemucs) local stem separation installer card. */
function DemucsCard({ s, onChange }: { s: DemucsStatus; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const installing = s.state === "installing";
  useEffect(() => {
    if (!installing) return;
    const t = setInterval(onChange, 1000);
    return () => clearInterval(t);
  }, [installing]); // eslint-disable-line react-hooks/exhaustive-deps
  const call = async (method: string, path: string) => {
    setError("");
    const res = await fetch(`/api/settings/demucs${path}`, { method });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work");
    onChange();
  };
  const ready = s.state === "ready";
  return (
    <div className={`setup-service ${ready ? "ok" : ""}`}>
      <div className="setup-service-head">
        <strong>Demucs (htdemucs)</strong>
        <span className="dim small">on {OS.here} · MIT</span>
        <span className="pill">Free</span>
        <span className="spacer" />
        {(s.state === "missing" || s.state === "error") && (
          <button className="primary" onClick={() => void call("POST", "/install")}>
            {s.state === "error" ? "Try again" : "Install · ~2.5 GB"}
          </button>
        )}
        {installing && <button onClick={() => void call("POST", "/cancel")}>Stop</button>}
        {ready &&
          (confirming ? (
            <>
              <span className="small">Remove {mb(s.bytes)}?</span>
              <button className="danger" onClick={() => void call("DELETE", "").then(() => setConfirming(false))}>
                Remove
              </button>
              <button onClick={() => setConfirming(false)}>Keep</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)}>Remove</button>
          ))}
      </div>
      <div className="dim small">Separates voices from music &amp; ambience (2 stems) or vocals, drums, bass and other (4 stems) so voice cleaning and pitch shifts never touch background music.</div>
      {ready && (
        <div className="small">
          <span className="good"><Icon name="check" size={12} /></span> {s.detail} <span className="dim">· {mb(s.bytes)} on disk</span>
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
      {s.state === "error" && <div className="warn small">{s.detail}</div>}
    </div>
  );
}

/** Shared commercial-safe MediaPipe + OpenCV + ONNX Runtime prep installer card (for Swap & Face Performance Transfer). */
function VisionPrepCard({ s, onChange }: { s: VisionPrepStatus; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const installing = s.state === "installing";
  useEffect(() => {
    if (!installing) return;
    const t = setInterval(onChange, 1000);
    return () => clearInterval(t);
  }, [installing]); // eslint-disable-line react-hooks/exhaustive-deps
  const call = async (method: string, path: string) => {
    setError("");
    const res = await fetch(`/api/settings/vision-prep${path}`, { method });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work");
    onChange();
  };
  const ready = s.state === "ready";
  return (
    <div className={`setup-service ${ready ? "ok" : ""}`}>
      <div className="setup-service-head">
        <strong>MediaPipe Face + OpenCV</strong>
        <span className="dim small">on {OS.here} · Apache 2.0</span>
        <span className="pill">Free</span>
        <span className="spacer" />
        {(s.state === "missing" || s.state === "error") && (
          <button className="primary" onClick={() => void call("POST", "/install")}>
            {s.state === "error" ? "Try again" : "Install · ~400 MB"}
          </button>
        )}
        {installing && <button onClick={() => void call("POST", "/cancel")}>Stop</button>}
        {ready &&
          (confirming ? (
            <>
              <span className="small">Remove {mb(s.bytes)}?</span>
              <button className="danger" onClick={() => void call("DELETE", "").then(() => setConfirming(false))}>
                Remove
              </button>
              <button onClick={() => setConfirming(false)}>Keep</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)}>Remove</button>
          ))}
      </div>
      <div className="dim small">Runs locally on CPU (no GPU needed). Extracts 478 facial landmarks, 52 ARKit blendshapes and head pose for Character Swap and &ldquo;Act it yourself&rdquo; facial performance transfer.</div>
      {ready && (
        <div className="small">
          <span className="good"><Icon name="check" size={12} /></span> {s.detail} <span className="dim">· {mb(s.bytes)} on disk</span>
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
      {s.state === "error" && <div className="warn small">{s.detail}</div>}
    </div>
  );
}

/**
 * The services that do one job, each saying what it costs and whether it's ready (what's on this computer has its card
 * above). Nothing, for a job no service here does.
 */
function Services({ does, info }: { does: FixerJob; info: Info }) {
  const services = FIXERS.filter((f) => f.does === does && f.runs === "service");
  if (!services.length) return null;
  const state = (id: string) => {
    const s = info.states[id];
    if (!s) return "";
    if (s.state === "ready") return s.where ? `Ready ${s.where}` : "Ready";
    return s.detail;
  };
  const price = (f: (typeof FIXERS)[number]) => (f.perMinute ? ` · ${Math.round(f.perMinute * 100)}¢ a minute` : f.perMegapixel ? " · about $2 a minute of 240p at 4×" : " · free");
  return (
    <div className="make-ranking">
      <ul>
        {services.map((t) => (
          <li key={t.id}>
            <span>
              <ServiceMark id={t.id} label={t.label} />
              {t.label}
              <span className="dim small">
                {" "}
                · {t.by}
                {price(t)}
              </span>
            </span>
            <span className={`small ${info.states[t.id]?.state === "ready" ? "" : "dim"}`}>{state(t.id)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
