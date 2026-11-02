/**
 * Settings → Making: the hard limit on what making may spend in all (the person's, the agent's and any script's
 * takes alike), what the agent may spend in a turn before it asks, the order Auto tries models in, the plans that
 * make stills without a key, and ComfyUI for the models that run on the person's own graphics card.
 */
import type { ComfyCheck, InstallStatus } from "@beatsheet/engine";
import { CATALOG, type MakeOp, type ServiceState } from "@beatsheet/schema";
import { useEffect, useState } from "react";
import { OS } from "../lib";

type MakeSettings = { limit?: { usd: number; since: string }; turnBudgetUsd: number; ranking?: Partial<Record<string, string[]>>; spent?: number; plans?: ({ id: string } & ServiceState)[] };

/** What each plan makes, and how to get it going. */
const PLAN_NOTES: Record<string, { makes: string; setUp: string }> = {
  chatgpt: { makes: "GPT Image stills, through Codex", setUp: "Sign in to Codex with ChatGPT (Settings → Agent) to use it." },
  "muse-code": { makes: "Muse Image stills, through Muse Code", setUp: "Sign in to Muse Code on a subscription (Settings → Agent) to use it." },
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
      {!!s.plans?.length && (
        <section>
          <h4>Your plans</h4>
          <ul className="make-plans">
            {s.plans.map((p) => (
              <li key={p.id}>
                <span>
                  {p.label} <span className="dim small">· {PLAN_NOTES[p.id]?.makes}</span>
                </span>
                <span className={`small ${p.state === "ready" ? "" : "dim"}`}>{p.state === "ready" ? "Ready" : p.state === "failing" ? p.detail : PLAN_NOTES[p.id]?.setUp}</span>
              </li>
            ))}
          </ul>
          <p className="dim small">A still made on a plan comes out of its allowance, not your money. Where you also have a key, the model picker offers both, and the plan is used unless you pick the key.</p>
        </section>
      )}
      <ComfySection />
      <section>
        <h4>What Auto tries first</h4>
        <Ranking op="image" label="Stills" order={s.ranking?.image} onChange={(ids) => change({ ranking: { image: ids } })} />
        <Ranking op="video" label="Video" order={s.ranking?.video} onChange={(ids) => change({ ranking: { video: ids } })} />
        <p className="dim small">For video, Auto keeps to the quality asked for (roughs or finals) and goes down this list within it.</p>
      </section>
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
        SCAIL-2 and Wan 2.2 Animate copy the movement in a clip (a fight, a dance, a stunt someone acts out) onto the people in a shot's board, Wan 2.2 makes clips from a board, and FLUX 3 Image Klein makes stills and boards, all in ComfyUI on your own hardware at no charge.
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
              <span className="good">✓</span> {c.check.detail}
            </>
          ) : (
            <span className="warn">{c.check.detail}</span>
          )}
        </p>
      )}
      {error && <p className="warn small">{error}</p>}
      {!!models.length && (
        <ul className="make-plans">
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
                {repo} ↗
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

/** The models that make one kind of thing, in the order Auto tries them; each moves up or down. */
function Ranking({ op, label, order, onChange }: { op: MakeOp; label: string; order?: string[]; onChange: (ids: string[]) => void }) {
  const models = CATALOG.filter((m) => m.ops.includes(op));
  const rank = (id: string) => {
    const i = order?.indexOf(id) ?? -1;
    return i === -1 ? 1000 + models.findIndex((m) => m.id === id) : i;
  };
  const sorted = [...models].sort((a, b) => rank(a.id) - rank(b.id));
  const move = (i: number, by: number) => {
    const ids = sorted.map((m) => m.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    onChange(ids);
  };
  return (
    <div className="make-ranking">
      <span className="dim small">{label}</span>
      <ol>
        {sorted.map((m, i) => (
          <li key={m.id}>
            <span>
              {m.label}
              {m.tier && <span className="dim small"> · {m.tier === "final" ? "finals" : "roughs"}</span>}
            </span>
            <span className="dim small">{m.note}</span>
            <span className="make-ranking-move">
              <button className="link small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Try ${m.label} sooner`}>
                ↑
              </button>
              <button className="link small" disabled={i === sorted.length - 1} onClick={() => move(i, 1)} aria-label={`Try ${m.label} later`}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
