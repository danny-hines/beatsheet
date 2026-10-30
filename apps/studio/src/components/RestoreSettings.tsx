/**
 * Settings → Restoring: the programs that clean sound and restore picture on this computer (DeepFilterNet for voices,
 * Real-ESRGAN for upscaling, RIFE for frames in between), each installed, checked and timed here, and the order Auto
 * tries cleaners and upscalers in. With no order set, Auto keeps the one here first when this machine is quick at it.
 */
import type { ToolId, ToolStatus } from "@beatsheet/engine";
import { FIXERS, type FixerJob, type FixerState } from "@beatsheet/schema";
import { useEffect, useState } from "react";
import { OS } from "../lib";

type Info = { tools: Record<ToolId, ToolStatus>; states: Record<string, FixerState>; ranking: Partial<Record<FixerJob, string[]>> };

const mb = (bytes?: number) => (bytes === undefined ? "" : bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

const ABOUT_TOOL: Record<ToolId, string> = {
  deepfilter: "Cleans hiss, wind and hum out of voices, on the processor of any computer.",
  realesrgan: "Upscales old video a frame at a time, sharper than enlarging it, on the graphics card (any make).",
  rife: "Makes the frames in between, for smoother motion, on the graphics card. Downloads about 430 MB and keeps about 20.",
};

async function load(): Promise<Info> {
  return (await fetch("/api/settings/restore").then((r) => r.json())) as Info;
}

/** A line for the Settings nav: what's installed here. */
export function useRestoreSummary(): string {
  const [info, setInfo] = useState<Info>();
  useEffect(() => void load().then(setInfo), []);
  if (!info) return "";
  const ready = Object.values(info.tools).filter((t) => t.state === "ready");
  return ready.length ? ready.map((t) => t.label).join(", ") : "Nothing installed";
}

export function RestoreSection() {
  const [info, setInfo] = useState<Info>();
  useEffect(() => void load().then(setInfo), []);
  if (!info) return <p className="dim small">Loading…</p>;
  const refresh = () => void load().then(setInfo);
  const save = async (ranking: Partial<Record<FixerJob, string[]>>) => {
    const res = await fetch("/api/settings/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ranking }) });
    setInfo((await res.json()) as Info);
  };
  return (
    <div className="make-settings">
      {(["deepfilter", "realesrgan", "rife"] as const).map((id) => (
        <ToolCard key={id} s={info.tools[id]} onChange={refresh} />
      ))}
      <section>
        <h4>Cleaning voices: what Auto tries first</h4>
        <Order does="clean" info={info} onChange={(ids) => void save({ clean: ids })} />
      </section>
      <section>
        <h4>Upscaling: what Auto tries first</h4>
        <Order does="upscale" info={info} onChange={(ids) => void save({ upscale: ids })} />
        <p className="dim small">
          Without an order of your own, Auto uses what's on {OS.here} when it's quick enough, and a service with your key when {OS.here} would take far longer than the footage plays.
        </p>
      </section>
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
          <span className="good">✓</span> {s.detail} <span className="dim">· {mb(s.ready?.bytes)} on disk</span>
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

/** The fixers for one job in the order Auto tries them, each saying whether it can be used here; each moves up or down. */
function Order({ does, info, onChange }: { does: FixerJob; info: Info; onChange: (ids: string[]) => void }) {
  const fixers = FIXERS.filter((f) => f.does === does);
  const ranking = info.ranking[does] ?? [];
  const rank = (id: string) => {
    const i = ranking.indexOf(id);
    return i === -1 ? 1000 + fixers.findIndex((t) => t.id === id) : i;
  };
  const sorted = [...fixers].sort((a, b) => rank(a.id) - rank(b.id));
  const move = (i: number, by: number) => {
    const ids = sorted.map((t) => t.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    onChange(ids);
  };
  const state = (id: string) => {
    const s = info.states[id];
    if (!s) return "";
    if (s.state === "ready") return s.where ? `Ready ${s.where}` : "Ready";
    return s.detail;
  };
  const price = (f: (typeof FIXERS)[number]) => (f.perMinute ? ` · ${Math.round(f.perMinute * 100)}¢ a minute` : f.perMegapixel ? " · about $2 a minute of 240p at 4×" : " · free");
  return (
    <div className="make-ranking">
      <ol>
        {sorted.map((t, i) => (
          <li key={t.id}>
            <span>
              {t.label}
              <span className="dim small">
                {" "}
                · {t.by}
                {price(t)}
              </span>
            </span>
            <span className={`small ${info.states[t.id]?.state === "ready" ? "" : "dim"}`}>{state(t.id)}</span>
            <span className="make-ranking-move">
              <button className="link small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Try ${t.label} sooner`}>
                ↑
              </button>
              <button className="link small" disabled={i === sorted.length - 1} onClick={() => move(i, 1)} aria-label={`Try ${t.label} later`}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      {ranking.length > 0 && (
        <button className="link small" onClick={() => onChange([])}>
          Let Auto decide by how quick {OS.here} is
        </button>
      )}
    </div>
  );
}
