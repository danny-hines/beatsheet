/**
 * Settings → Making: the hard limit on what making may spend in all (the person's, the agent's and any script's
 * takes alike), what the agent may spend in a turn before it asks, the order Auto tries models in, and the plans that
 * make stills without a key.
 */
import { CATALOG, type MakeOp, type ServiceState } from "@beatsheet/schema";
import { useEffect, useState } from "react";

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
      <section>
        <h4>What Auto tries first</h4>
        <Ranking op="image" label="Stills" order={s.ranking?.image} onChange={(ids) => change({ ranking: { image: ids } })} />
        <Ranking op="video" label="Video" order={s.ranking?.video} onChange={(ids) => change({ ranking: { video: ids } })} />
        <p className="dim small">For video, Auto keeps to the quality asked for (roughs or finals) and goes down this list within it.</p>
      </section>
    </div>
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
