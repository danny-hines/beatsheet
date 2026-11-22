/**
 * Settings → Making: the hard limit on what making may spend in all (the person's, the agent's and any script's
 * takes alike), what the agent may spend in a turn before it asks, the one service in use for stills and the one for
 * video, and ComfyUI for the models that run on the person's own graphics card.
 */
import type { ComfyCheck, InstallStatus, ProviderRow } from "@beatsheet/engine";
import type { MakeOp, ServiceState } from "@beatsheet/schema";
import { useEffect, useState } from "react";
import { OS, WINDOWS } from "../lib";
import { ServiceMark } from "./ui";
import { actions } from "../store";
import { Icon } from "./Icon";

type MakeSettings = { limit?: { usd: number; since: string }; turnBudgetUsd: number; spent?: number; plans?: ({ id: string } & ServiceState)[]; providers?: Record<MakeOp, ProviderRow[]> };

/** How to get each plan going. A still on a plan is one short turn of its agent, so it's slower than a key. */
const PLAN_NOTES: Record<string, string> = {
  chatgpt: "Sign in to Codex with ChatGPT (Settings → Agent) to use it.",
  "muse-code": "Sign in to Muse Code on a subscription (Settings → Agent) to use it.",
};

async function save(change: Record<string, unknown>): Promise<MakeSettings> {
  const res = await fetch("/api/settings/make", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(change) });
  return (await res.json()) as MakeSettings;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** A line for the Settings nav: what's been spent under the limit, or that there's none. */
export function useMakeSummary(): string {
  const [s, setS] = useState<MakeSettings>();
  useEffect(() => void fetch("/api/settings/make").then((r) => r.json() as Promise<MakeSettings>).then(setS), []);
  if (!s) return "";
  return s.limit ? `$${(s.spent ?? 0).toFixed(2)} of $${s.limit.usd}` : "No limit";
}

export function MakeSection() {
  const [s, setS] = useState<MakeSettings>();
  useEffect(() => void fetch("/api/settings/make").then((r) => r.json() as Promise<MakeSettings>).then(setS), []);
  if (!s) return <p className="dim small">Loading…</p>;
  const change = (c: Record<string, unknown>) => void save(c).then(setS);
  return (
    <div className="make-settings">
      <section>
        <h4>Spending limit</h4>
        <label className="check-row">
          <input type="checkbox" checked={!!s.limit} onChange={(e) => change({ limit: e.target.checked ? { usd: 20, since: new Date().toISOString() } : null })} />
          Stop making once this much is spent, whoever asks
        </label>
        {s.limit && (
          <div className="make-row">
            <span>$</span>
            <Money value={s.limit.usd} onCommit={(usd) => change({ limit: { usd } })} />
            <span className="dim small">
              ${(s.spent ?? 0).toFixed(2)} spent since {when(s.limit.since)}
            </span>
            <button className="link small" onClick={() => change({ limit: { usd: s.limit!.usd, since: new Date().toISOString() } })}>
              Start counting again
            </button>
          </div>
        )}
        <p className="dim small">Takes are counted at what the service lists them for, from when they're asked for; ones that fail before they're made don't count.</p>
      </section>
      <section>
        <h4>The agent</h4>
        <div className="make-row">
          <span>It may spend $</span>
          <Money value={s.turnBudgetUsd} onCommit={(usd) => change({ turnBudgetUsd: usd })} />
          <span>a turn before it asks you.</span>
        </div>
      </section>
      {s.providers && <ProvidersSection providers={s.providers} onChange={setS} />}
      <ComfySection />
    </div>
  );
}

/**
 * Where stills and video are made: one service for each, chosen from every one they could come from. A plan can be
 * chosen once its agent is signed in; a service with a key asks for the key the first time. Nothing is made on a
 * service that isn't chosen, however many are connected.
 */
export function ProvidersSection({ providers, onChange }: { providers: Record<MakeOp, ProviderRow[]>; onChange?: (s: MakeSettings) => void }) {
  const choose = (op: MakeOp, id: string) => void save({ provider: { [op]: id } }).then(onChange);
  return (
    <section>
      <h4>Where things are made</h4>
      <p className="dim small">One service makes your stills and one your video: the ones you choose here. Nothing is made on another, or spent there, until you switch. Your own hardware runs alongside whichever you choose.</p>
      <Providers label="Stills" op="image" rows={providers.image} choose={choose} />
      <Providers label="Video" op="video" rows={providers.video} choose={choose} />
    </section>
  );
}

/** Loads the providers by itself, for the first-launch screen. */
export function ProvidersSetup() {
  const [s, setS] = useState<MakeSettings>();
  useEffect(() => void fetch("/api/settings/make").then((r) => r.json() as Promise<MakeSettings>).then(setS), []);
  return s?.providers ? <ProvidersSection providers={s.providers} onChange={setS} /> : <p className="dim small">Loading…</p>;
}

function Providers({ label, op, rows, choose }: { label: string; op: MakeOp; rows: ProviderRow[]; choose: (op: MakeOp, id: string) => void }) {
  /** A service whose key is being added. */
  const [adding, setAdding] = useState<string>();
  return (
    <div className="make-providers">
      <h5>{label}</h5>
      <ul>
        {rows.map((r) => {
          const connected = r.state !== "missing";
          const status = r.state === "failing" ? r.detail : connected ? (r.kind === "plan" ? "Signed in · from its allowance, a picture at a time" : (r.detail ?? "Key saved")) : r.kind === "plan" ? PLAN_NOTES[r.id] : "";
          return (
            <li key={r.id} className={r.inUse ? "on" : ""}>
              <label className="check-row">
                {/* On click, not change: clicking the one beatsheet guessed keeps it as the person's choice. */}
                <input type="radio" name={`provider-${op}`} checked={r.inUse} disabled={!connected && r.kind === "plan"} readOnly onClick={() => (connected ? choose(op, r.id) : setAdding(r.id))} />
                <ServiceMark id={r.id} label={r.label} />
                <span>{r.label}</span>
                <span className="pill">{r.kind === "plan" ? "Subscription" : "API key"}</span>
                <span className="dim small make-provider-models" title={r.models.join(", ")}>
                  {r.models.join(", ")}
                </span>
              </label>
              {status && <div className={`small make-provider-status ${r.state === "failing" ? "warn" : "dim"}`}>{status}</div>}
              {adding === r.id && !connected && <ProviderKey row={r} done={() => (setAdding(undefined), choose(op, r.id))} />}
            </li>
          );
        })}
      </ul>
      {!rows.length && <p className="dim small">Nothing makes this yet.</p>}
    </div>
  );
}

/** A key for a service picked as a provider: checked, kept in the Keychain, and then the service is the one in use. */
function ProviderKey({ row, done }: { row: ProviderRow; done: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const add = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const r = (await fetch(`/api/settings/service/${row.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }).then((x) => x.json())) as { ok: boolean; detail: string };
      if (!r.ok) return setError(r.detail);
      await actions.loadSettings();
      done();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="make-provider-key">
      <div className="setup-service-key">
        <input type="password" autoFocus placeholder={`Paste your ${row.label} API key`} value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && key.trim() && void add()} />
        <button onClick={() => void add()} disabled={!key.trim() || busy}>
          {busy ? "Checking…" : "Verify & use"}
        </button>
        {row.keyUrl && (
          <a href={row.keyUrl} target="_blank" rel="noreferrer" className="small">
            Get a key <Icon name="external" size={12} />
          </a>
        )}
      </div>
      <div className="dim small">Checked with a request that spends nothing, then kept {WINDOWS ? "in Credential Manager" : "in your Keychain"}.</div>
      {error && <div className="warn small">{error}</div>}
    </div>
  );
}

type Comfy = { connected?: { url: string; addedAt: string; detail?: string; ok?: boolean }; check: ComfyCheck; suggested: string; folder: string; install: InstallStatus };

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(bytes < 1e10 ? 1 : 0)} GB`;

/** What this computer has for making video itself, in words: its card or chip and memory, or that it has neither. */
const machineWords = (d: ComfyCheck["here"]) =>
  d.type === "cuda" ? `${d.name}${d.memoryGb ? `, ${d.memoryGb} GB` : ""}` : d.type === "mps" ? `${d.name}${d.memoryGb ? `, ${d.memoryGb} GB of memory` : ""}` : `${d.name ? `${d.name}: ` : ""}no graphics card ComfyUI can use`;

/**
 * ComfyUI, for the models that run on the person's own hardware: its address, checked before it's kept; what this
 * computer has, and so whether ComfyUI here could run them or another computer's should; each model's workflows with
 * what stops them running there; and fetching the model files a ComfyUI on this computer is missing.
 */
function ComfySection() {
  const [c, setC] = useState<Comfy>();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () =>
      void fetch("/api/settings/comfy")
        .then((r) => r.json() as Promise<Comfy>)
        .then((x) => {
          setC(x);
          setUrl(x.connected?.url ?? x.suggested);
        }),
    [],
  );
  const installing = c?.install.state === "installing";
  // While files come in, follow along; when they're in, check the server again.
  useEffect(() => {
    if (!installing) return;
    const t = setInterval(
      () =>
        void fetch("/api/settings/comfy/install")
          .then((r) => r.json() as Promise<InstallStatus>)
          .then((install) => {
            if (install.state === "installing") setC((x) => x && { ...x, install });
            else void fetch("/api/settings/comfy").then((r) => r.json() as Promise<Comfy>).then((x) => setC({ ...x, install }));
          }),
      1000,
    );
    return () => clearInterval(t);
  }, [installing]);
  if (!c) return null;
  const call = async (method: string, body?: Record<string, unknown>, path = "") => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/settings/comfy${path}`, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (path) {
        const install = (await res.json()) as InstallStatus;
        setC({ ...c, install });
        if (install.state === "error") setError(install.detail);
        return;
      }
      const next = (await res.json()) as Comfy;
      setC(next);
      if (body && !next.check.ok) setError(next.check.detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const on = !!c.connected;
  // Each model once, with its workflows (fast and full): ready when one has all it needs.
  const models = [...new Set(c.check.workflows.map((w) => w.name))].map((name) => {
    const ws = c.check.workflows.filter((w) => w.name === name);
    const best = [...ws].sort((a, b) => a.problems.length - b.problems.length)[0]!;
    return { name, label: best.label, own: ws.some((w) => w.own), machine: best.machine, problems: best.problems, ready: ws.some((w) => !w.machine && !w.problems.length) };
  });
  // The model files this ComfyUI is missing that beatsheet can fetch, each once, and how much that is.
  const toFetch = new Map(c.check.workflows.filter((w) => !w.machine).flatMap((w) => (w.fetch ?? []).map((f) => [f.name, f.bytes] as const)));
  const fetchBytes = [...toFetch.values()].reduce((a, b) => a + b, 0);
  // The Hugging Face repos among them that share their files only once their license is accepted.
  const licensed = [...new Set(c.check.workflows.filter((w) => !w.machine).flatMap((w) => (w.fetch ?? []).flatMap((f) => f.gated ?? [])))];
  const nothingHere = !on && c.check.here.type === "cpu";
  return (
    <section>
      <h4>Your own hardware</h4>
      <p className="dim small">
        SCAIL-2 and Wan 2.2 Animate copy the movement in a clip (a fight, a dance, a stunt someone acts out) onto the people in a shot's board, Wan 2.2 makes clips from a board, InfiniteTalk makes a board say the cut's line, and FLUX 3 Image Klein makes stills and boards, all in ComfyUI on your own hardware at no charge.
      </p>
      <p className="small">
        This computer: {machineWords(c.check.here)}.{" "}
        {nothingHere ? (
          <span className="dim">ComfyUI here couldn't run these. Connect the ComfyUI on a computer that has a graphics card, by its address.</span>
        ) : c.check.here.type === "mps" ? (
          <span className="dim">ComfyUI here could run the small Wan 2.2; the rest need an NVIDIA card, so connect the ComfyUI on a PC that has one for those.</span>
        ) : null}
      </p>
      <div className="make-row">
        <ServiceMark id="comfy" label="ComfyUI" />
        <span>ComfyUI at</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={on || busy} placeholder={c.suggested} aria-label="ComfyUI's address" />
        {on ? (
          <>
            <button onClick={() => void call("POST")} disabled={busy}>
              Check again
            </button>
            <button onClick={() => void call("DELETE")} disabled={busy}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="primary" onClick={() => void call("POST", { url })} disabled={busy || !url.trim()}>
            {busy ? "Checking…" : "Connect"}
          </button>
        )}
      </div>
      {on && (
        <p className="small">
          {c.check.ok ? (
            <>
              <span className="good"><Icon name="check" size={12} /></span> {c.check.detail}
            </>
          ) : (
            <span className="warn">{c.check.detail}</span>
          )}
        </p>
      )}
      {error && <p className="warn small">{error}</p>}
      {!!models.length && (
        <ul className="make-workflows">
          {models.map((m) => (
            <li key={m.name}>
              <span>
                {m.label}
                {m.own && <span className="dim small"> · your own workflow</span>}
              </span>
              <span className={`small ${m.ready ? "" : m.machine || !on ? "dim" : "warn"}`}>{m.ready ? (on && c.check.ok ? "Ready" : "") : (m.machine ?? (on ? m.problems.join("; ") : "Connect to check"))}</span>
            </li>
          ))}
        </ul>
      )}
      {on && c.install.state === "installing" ? (
        <div className="sam-install">
          <div className="small">
            Fetching {c.install.file} ({c.install.files.indexOf(c.install.file) + 1} of {c.install.files.length})…
          </div>
          <div className="progress thin">
            <div style={{ width: `${Math.round(c.install.progress * 100)}%` }} />
          </div>
          <button onClick={() => void call("POST", undefined, "/cancel")}>Stop</button>
        </div>
      ) : (
        on &&
        toFetch.size > 0 && (
          <div className="make-row">
            {c.check.local ? (
              <button className="primary" disabled={busy} onClick={() => void call("POST", {}, "/install")} title={[...toFetch.keys()].join("\n")}>
                Get the {toFetch.size} missing model file{toFetch.size === 1 ? "" : "s"} · {gb(fetchBytes)}
              </button>
            ) : (
              <span className="dim small">That ComfyUI is on another computer: fetch its missing model files there ({gb(fetchBytes)}).</span>
            )}
          </div>
        )
      )}
      {on && c.install.state !== "installing" && c.check.local && licensed.length > 0 && (
        <p className="dim small">
          Some of these are shared only with people who accept their license: accept it on{" "}
          {licensed.map((repo, i) => (
            <span key={repo}>
              {i > 0 && " and "}
              <a href={`https://huggingface.co/${repo}`} target="_blank" rel="noreferrer">
                {repo} <Icon name="external" size={12} />
              </a>
            </span>
          ))}{" "}
          while signed in to Hugging Face. beatsheet fetches them with the Hugging Face token SAM 3.1 uses (Settings → On {OS.here}).
        </p>
      )}
      <p className="dim small">
        ComfyUI on another computer works too: start it with --listen and put its address here (http://192.168.1.50:8188). It has no sign-in of its own, so keep it to your home network. Your own exports from ComfyUI (File → Export (API)) go in {c.folder}, named like scail2-animation.full.api.json, and take the place of the ones beatsheet comes with.
      </p>
    </section>
  );
}

/** A dollar amount, saved when it's left. */
function Money({ value, onCommit }: { value: number; onCommit: (usd: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const usd = Number(text);
    if (Number.isFinite(usd) && usd >= 0 && usd !== value) onCommit(Math.round(usd * 100) / 100);
    else setText(String(value));
  };
  return <input className="money" type="number" min={0} step={1} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} aria-label="Dollars" />;
}
