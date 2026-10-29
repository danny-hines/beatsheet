import type { AgentCheck, AgentId, AgentInfo, SamStatus, ServiceInfo } from "@beatsheet/engine";
import { useEffect, useState, type ReactNode } from "react";
import { AGENT_NAMES, CAPABILITY_LABELS, timeAgo, OS, WINDOWS } from "../lib";
import { actions, useStore, type State } from "../store";
import { Mark } from "./ui";
import { refreshVoices, useVoices, voiceLabel, VoicesSection } from "./Voices";

type SetupInfo = NonNullable<State["setup"]>;

/** What every agent can do with beatsheet's own tools, before any service is added. */
const BUILT_IN = ["Watch and log your footage", "Cut to the beat of a song", "Edit titles, crops and timing", "Check its work frame by frame", "Render the video"];
/** Apple's Vision framework, through a helper built on this Mac the first time it's used (on Windows, SAM 3.1 or OpenCV). */
const ON_THIS_MAC = ["Find and follow people", "Blur faces, name tags", "Keep someone in a vertical crop", "Cut people out of the picture"];
/** Cutting people out needs SAM on Windows; OpenCV only finds them. */
const localAbility = (setup: SetupInfo, x: string) => !!setup.vision?.ok && (!WINDOWS || x !== ON_THIS_MAC[3] || setup.sam?.state === "ready");
const samName = (sam?: SamStatus) => (sam?.model === "sam3.1" ? "SAM 3.1" : "SAM 3");

const ABOUT = {
  agent: "The agent edits your videos with you, on your own account. Make one the default; you can switch any time from the top bar.",
  mac: `Free and private: these run on your ${OS.computer}, and nothing leaves it.`,
  services: WINDOWS ? "Each key you add gives the agent more to work with. Keys are checked, then kept in Windows Credential Manager." : "Each key you add gives the agent more to work with. Keys are checked, then kept in your Keychain.",
  voices: "Who reads narration when a cut has a voiceover. Listen to any voice, and choose the one new narration uses.",
  abilities: "Everything the agent can do with what's set up now.",
};

/** The agent list, asked for once; each CLI takes a moment to answer. */
function useAgentList() {
  const list = useStore((s) => s.agentList);
  useEffect(() => {
    if (!list) void actions.loadAgentList();
  }, [list]);
  return list;
}

const agentReady = (setup: SetupInfo) => !!setup.settings.agent && !!setup.settings.checks[setup.settings.agent.id]?.ok;

/**
 * First launch: a screen of its own, one step at a time. An agent is required (installed, signed in, picked as the
 * default); the rest is optional and can wait for Settings.
 */
export function SetupScreen({ setup }: { setup: SetupInfo }) {
  const list = useAgentList();
  const ready = agentReady(setup);
  const chosen = setup.settings.agent;
  const model = chosen && list?.find((a) => a.id === chosen.id)?.models?.find((m) => m.id === chosen.model)?.label;
  const start = async () => {
    await fetch("/api/settings/done", { method: "POST" });
    actions.setSettingsOpen(false);
    await actions.loadSettings();
  };
  return (
    <div className="setup-screen">
      <div className="setup-screen-bar" />
      <div className="setup-screen-body">
        <div className="setup-page">
          <header className="setup-hero">
            <Mark />
            <h1>Welcome to beatsheet</h1>
            <p className="dim">beatsheet makes videos with an AI agent that runs on your own account: it watches your footage, cuts it to the music and takes your notes. Connect an agent to begin; everything else is optional and can wait for Settings.</p>
          </header>
          <Step n={1} done={ready} title="Connect an agent" note="required" about={ABOUT.agent}>
            <AgentSection list={list} setup={setup} />
          </Step>
          <Step n={2} title={`On ${OS.here}`} note="optional" about={ABOUT.mac}>
            <LocalSection setup={setup} />
          </Step>
          <Step n={3} title="Media services" note="optional" about={ABOUT.services}>
            <ServicesSection services={setup.services} />
          </Step>
          <section className="setup-summary">
            <h3>What your agent can do</h3>
            <Abilities setup={setup} />
          </section>
        </div>
      </div>
      <footer className="setup-screen-foot">
        <div className="setup-page">
          {ready && chosen ? (
            <span className="small">
              <span className="good">✓</span> {AGENT_NAMES[chosen.id]}
              {model ? ` (${model})` : ""} is your agent. <span className="dim">You can change this and add the rest in Settings.</span>
            </span>
          ) : (
            <span className="dim small">Check an agent and make it your default to continue.</span>
          )}
          <span className="spacer" />
          <button className="primary big" disabled={!ready} onClick={() => void start()}>
            Start using beatsheet
          </button>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, done, title, note, about, children }: { n: number; done?: boolean; title: string; note: string; about: string; children: ReactNode }) {
  return (
    <section className="setup-step">
      <div className="setup-step-head">
        <span className={`step-n ${done ? "done" : note === "required" ? "req" : ""}`}>{done ? "✓" : n}</span>
        <h3>{title}</h3>
        <span className="dim small">{note}</span>
      </div>
      <p className="dim small">{about}</p>
      {children}
    </section>
  );
}

const PANES = [
  { id: "agent", label: "Agent" },
  { id: "mac", label: `On ${OS.here}` },
  { id: "voices", label: "Voices" },
  { id: "services", label: "Media services" },
  { id: "abilities", label: "What it can do" },
] as const;
type Pane = (typeof PANES)[number]["id"];

/** Settings, after first launch: a dialog over the editor, one pane at a time. Every change saves as it's made. */
export function SettingsDialog() {
  const setup = useStore((s) => s.setup);
  const list = useAgentList();
  const asked = useStore((s) => s.settingsPane);
  const [pane, setPane] = useState<Pane>(() => (PANES.some((p) => p.id === asked) ? (asked as Pane) : "agent"));
  const voices = useVoices();
  const close = () => actions.setSettingsOpen(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!setup) return null;

  const chosen = setup.settings.agent;
  const added = setup.services.filter((s) => s.configured).length;
  const status: Record<Pane, string> = {
    agent: (chosen && AGENT_NAMES[chosen.id]) ?? "None yet",
    mac: setup.sam?.state === "ready" ? `${samName(setup.sam)} installed` : setup.sam?.state === "installing" ? `Installing ${samName(setup.sam)}…` : setup.vision?.ok ? (WINDOWS ? "Faces and people" : "Apple Vision") : "",
    voices: voiceLabel(voices, voices?.default ?? voices?.fallback),
    services: added ? `${added} added` : "None added",
    abilities: `${BUILT_IN.length + ON_THIS_MAC.filter((x) => localAbility(setup, x)).length + setup.capabilities.length} things`,
  };
  const title = PANES.find((p) => p.id === pane)!.label;
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="settings" role="dialog" aria-label="Settings">
        <nav className="settings-nav">
          <h2>Settings</h2>
          {PANES.map((p) => (
            <button key={p.id} className={pane === p.id ? "on" : ""} onClick={() => setPane(p.id)}>
              {p.label}
              <span className="dim small">{status[p.id]}</span>
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          <div className="settings-pane-head">
            <div>
              <h3>{title}</h3>
              <p className="dim small">{ABOUT[pane]}</p>
            </div>
            <button className="icon" onClick={close} title="Close (Esc)" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="settings-pane-body">
            {pane === "agent" ? (
              <AgentSection list={list} setup={setup} autonomy />
            ) : pane === "mac" ? (
              <LocalSection setup={setup} />
            ) : pane === "voices" ? (
              <VoicesSection onAddKey={() => setPane("services")} />
            ) : pane === "services" ? (
              <ServicesSection services={setup.services} />
            ) : (
              <Abilities setup={setup} />
            )}
          </div>
          {!agentReady(setup) && pane !== "agent" && (
            <div className="settings-pane-foot small warn">
              No agent is ready yet.{" "}
              <button className="link" onClick={() => setPane("agent")}>
                Set one up
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentSection({ list, setup, autonomy }: { list?: AgentInfo[]; setup: SetupInfo; autonomy?: boolean }) {
  const chosen = setup.settings.agent;
  if (!list) return <p className="dim small">Looking for Muse Code, Codex, Claude Code and Antigravity on {OS.here}…</p>;
  return (
    <>
      <div className="setup-agents">
        {list.map((a) => (
          <AgentCard key={a.id} info={a} isDefault={chosen?.id === a.id} defaultModel={chosen?.id === a.id ? chosen.model : undefined} />
        ))}
      </div>
      {autonomy && <Autonomy level={setup.settings.autonomy ?? "ask"} />}
      {autonomy && <UseChrome on={!!setup.settings.chrome} />}
    </>
  );
}

/**
 * How much the agent does without asking. beatsheet's own tools never ask, and neither does looking around; this is
 * about everything else it might run. Its keys are off limits either way.
 */
function Autonomy({ level }: { level: "ask" | "free" }) {
  const set = async (next: "ask" | "free") => {
    await fetch("/api/settings/autonomy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ level: next }) });
    await actions.loadSettings();
  };
  const options: { id: "ask" | "free"; title: string; about: string }[] = [
    {
      id: "ask",
      title: "Ask me first",
      about: "Editing the project, looking at footage and listing folders never ask. Anything else (a shell command that changes something, a file outside the project, the web) waits for your OK.",
    },
    {
      id: "free",
      title: "Let it work without asking",
      about: "It runs commands and edits files on its own, so a turn goes start to finish while you're away. Changes to the project can be undone a turn at a time; anything else it does can't.",
    },
  ];
  return (
    <div className="autonomy">
      <h4>While it works</h4>
      <div className="np-routes autonomy-choices">
        {options.map((o) => (
          <button key={o.id} type="button" className={`np-route ${level === o.id ? "on" : ""}`} onClick={() => level !== o.id && void set(o.id)}>
            <strong>
              {level === o.id ? "● " : "○ "}
              {o.title}
            </strong>
            <span className="dim small">{o.about}</span>
          </button>
        ))}
      </div>
      <p className="dim small">The media services are used only through beatsheet. Muse Code's own reviewer still looks first.</p>
    </div>
  );
}

/**
 * Claude Code in the person's own Chrome, for pages they're signed in to (its own browsers aren't). The Claude in
 * Chrome extension does the work there and asks before acting on each site.
 */
function UseChrome({ on }: { on: boolean }) {
  const set = async (next: boolean) => {
    await fetch("/api/settings/chrome", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: next }) });
    await actions.loadSettings();
  };
  return (
    <div className="autonomy">
      <h4>Pages you're signed in to</h4>
      <label className="check-row">
        <input type="checkbox" checked={on} onChange={(e) => void set(e.target.checked)} /> Use my Chrome
      </label>
      <p className="dim small">
        The agent works in your own Chrome, so it can open a Google Photos album or a dashboard you're signed in to, download what the project is missing and bring it in.
        You're asked before it acts on each site.
      </p>
      <ul className="dim small use-chrome-ways">
        <li>
          <strong>Claude Code</strong> goes through the Claude in Chrome extension, installed in Chrome and signed in.
        </li>
        <li>
          <strong>Codex</strong> uses OpenAI's own Chrome plugin when it has it (it comes with the ChatGPT app), whether this is on or not.
        </li>
        <li>
          <strong>Muse Code</strong> and <strong>Antigravity</strong>, and Codex without that plugin, connect through Chrome's DevTools: turn on remote debugging once at chrome://inspect/#remote-debugging, and
          Chrome asks you to allow each connection.
        </li>
      </ul>
    </div>
  );
}

function LocalSection({ setup }: { setup: SetupInfo }) {
  return (
    <div className="setup-services">
      <div className={`setup-service ${setup.vision?.ok ? "ok" : ""}`}>
        <div className="setup-service-head">
          <strong>{WINDOWS ? "Faces and people" : "Apple Vision"}</strong>
          <span className="pill">Find and follow people</span>
          {(!WINDOWS || setup.sam?.state === "ready") && <span className="pill">Cut people out</span>}
          <span className="spacer" />
          <span className="small">{setup.vision?.ok ? <span className="good">✓ Built in</span> : <span className="warn">{setup.vision?.detail}</span>}</span>
        </div>
        {WINDOWS && setup.vision?.ok && <div className="dim small">{setup.vision.detail}</div>}
      </div>
      <SamCard status={setup.sam} />
    </div>
  );
}

function ServicesSection({ services }: { services: ServiceInfo[] }) {
  if (!services.length) return <p className="dim small">No services are available yet.</p>;
  return (
    <div className="setup-services">
      {services.map((s) => (
        <ServiceRow key={s.id} service={s} />
      ))}
    </div>
  );
}

function Abilities({ setup }: { setup: SetupInfo }) {
  return (
    <div className="setup-abilities">
      {BUILT_IN.map((x) => (
        <span key={x} className="ability on">
          {x}
        </span>
      ))}
      {ON_THIS_MAC.map((x) => (
        <span key={x} className={`ability ${localAbility(setup, x) ? "on" : ""}`} title={setup.vision?.detail}>
          {x}
        </span>
      ))}
      {(Object.keys(CAPABILITY_LABELS) as (keyof typeof CAPABILITY_LABELS)[]).map((c) => {
        const on = setup.capabilities.includes(c);
        const by = setup.services.filter((s) => s.unlocks.includes(c)).map((s) => s.label);
        return (
          <span key={c} className={`ability ${on ? "on" : ""}`} title={on ? undefined : c === "segment" ? `Install ${samName(setup.sam)} on ${OS.here}, or add ${by.join(" or ")}` : by.length ? `Add ${by.join(" or ")}` : "Coming later"}>
            {CAPABILITY_LABELS[c]}
          </span>
        );
      })}
    </div>
  );
}

type InstallJob = { id: string; status: "running" | "done" | "error"; log: string[]; error?: string };

/**
 * One agent CLI. It either works or says what's missing: not installed (Install runs the official installer), not
 * signed in (Sign in opens the CLI's own sign-in in Terminal), or something else (Check again).
 */
function AgentCard({ info, isDefault, defaultModel }: { info: AgentInfo; isDefault: boolean; defaultModel?: string }) {
  const stored = useStore((s) => s.setup?.settings.checks[info.id]);
  const [checking, setChecking] = useState(false);
  const [install, setInstall] = useState<InstallJob | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [model, setModel] = useState(defaultModel ?? info.models?.find((m) => m.default)?.id ?? info.models?.[0]?.id);
  const post = (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const check = async () => {
    setChecking(true);
    try {
      await post("/api/agent/check", { agent: info.id }).then((r) => r.json() as Promise<AgentCheck>);
      await Promise.all([actions.loadSettings(), actions.loadAgentList()]);
      // Whatever the check found replaces "finish signing in"; still signed out, the card offers Sign in again.
      setSigningIn(false);
    } finally {
      setChecking(false);
    }
  };
  // Check each installed agent once, the first time the screen sees it.
  useEffect(() => {
    if (info.installed && !stored) void check();
  }, [info.installed]); // eslint-disable-line react-hooks/exhaustive-deps

  const runInstall = async () => {
    let job = (await post("/api/agent/install", { agent: info.id }).then((r) => r.json())) as InstallJob;
    setInstall(job);
    while (job.status === "running") {
      await new Promise((r) => setTimeout(r, 1000));
      job = (await fetch(`/api/jobs/${job.id}`).then((r) => r.json())) as InstallJob;
      setInstall(job);
    }
    // The job checks the agent when it finishes; pick up the result and its models.
    await Promise.all([actions.loadSettings(), actions.loadAgentList()]);
    if (job.status === "done") setInstall(null);
  };

  const signIn = async () => {
    await post("/api/agent/signin", { agent: info.id });
    setSigningIn(true);
  };

  const makeDefault = async (id: AgentId, m?: string) => {
    await post("/api/settings/agent", { id, model: m === "default" ? undefined : m });
    await actions.loadSettings();
  };

  const ok = info.installed && stored?.ok;
  const signedOut = info.installed && stored && !stored.ok && stored.detail === "Not signed in";
  return (
    <div className={`setup-agent ${info.id} ${ok ? "ok" : ""} ${isDefault ? "chosen" : ""}`}>
      <div className="setup-agent-head">
        <strong>{AGENT_NAMES[info.id]}</strong>
        {isDefault && <span className="model-tag">Default</span>}
      </div>
      <div className="small setup-status">
        {install ? (
          <>
            <span className={install.status === "error" ? "warn" : "dim"}>{install.status === "error" ? install.error : "Installing…"}</span>
            <pre className="setup-log">{install.log.slice(-4).join("\n")}</pre>
          </>
        ) : !info.installed ? (
          <span className="dim">{info.installCommand ? `Not installed on ${OS.here}.` : `Not installed. Install ${info.label}, then check again.`}</span>
        ) : checking ? (
          <span className="dim">Checking…</span>
        ) : signingIn && !ok ? (
          <span className="dim">
            {!info.signInCommand
              ? "Finish signing in in your browser, then check again."
              : WINDOWS
                ? "Finish signing in in the window that opened, then check again."
                : "Finish signing in in the Terminal window, then check again."}
          </span>
        ) : stored ? (
          <>
            <span className={stored.ok ? "good" : "warn"}>{stored.ok ? "✓" : "✕"}</span> {stored.detail} <span className="dim">· {timeAgo(stored.at)}</span>
          </>
        ) : (
          <span className="dim">Not checked yet</span>
        )}
      </div>
      <div className="setup-agent-actions">
        {ok && info.models && (
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              if (isDefault) void makeDefault(info.id, e.target.value);
            }}
            title="Model new sessions start on"
          >
            {info.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        )}
        <span className="spacer" />
        {!info.installed && info.installCommand ? (
          <button className="primary" onClick={() => void runInstall()} disabled={install?.status === "running"} title={info.installCommand}>
            {install?.status === "running" ? "Installing…" : install?.status === "error" ? "Try again" : "Install"}
          </button>
        ) : signedOut && !signingIn ? (
          <button className="primary" onClick={() => void signIn()} title={info.signInCommand ? `Opens ${OS.terminal} running ${info.signInCommand}` : "Opens Google's sign-in in your browser"}>
            Sign in
          </button>
        ) : (
          <button onClick={() => void check()} disabled={checking || install?.status === "running"}>
            Check again
          </button>
        )}
        {ok && !isDefault && (
          <button className="primary" onClick={() => void makeDefault(info.id, model)}>
            Use as default
          </button>
        )}
      </div>
    </div>
  );
}

function ServiceRow({ service }: { service: ServiceInfo }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = (await fetch(`/api/settings/service/${service.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }).then((x) => x.json())) as {
        ok: boolean;
        detail: string;
      };
      setResult(r);
      if (r.ok) {
        setKey("");
        await actions.loadSettings();
        void refreshVoices();
      }
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    await fetch(`/api/settings/service/${service.id}`, { method: "DELETE" });
    setResult(null);
    await actions.loadSettings();
    void refreshVoices();
  };
  return (
    <div className={`setup-service ${service.configured ? "ok" : ""}`}>
      <div className="setup-service-head">
        <strong>{service.label}</strong>
        <span className="spacer" />
        <a href={service.keyUrl} target="_blank" rel="noreferrer" className="small">
          Get a key ↗
        </a>
      </div>
      <div className="dim small">{service.does}</div>
      {service.configured ? (
        <div className="setup-service-key small">
          <span className="good">✓</span> {service.detail ?? "Key saved"} <span className="dim">· {WINDOWS ? "in Credential Manager" : "in your Keychain"}</span>
          <span className="spacer" />
          <button onClick={() => void remove()}>Remove</button>
        </div>
      ) : (
        <div className="setup-service-key">
          <input type="password" placeholder="Paste an API key" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && key && void save()} />
          <button onClick={() => void save()} disabled={!key.trim() || busy}>
            {busy ? "Checking…" : "Verify & save"}
          </button>
        </div>
      )}
      {result && !result.ok && <div className="warn small">{result.detail}</div>}
      <div className="setup-service-pills">
        {service.unlocks.map((c) => (
          <span key={c} className="pill">
            {CAPABILITY_LABELS[c]}
          </span>
        ))}
      </div>
    </div>
  );
}

const gb = (bytes?: number) => (bytes ? `${(bytes / 1e9).toFixed(1)} GB` : "");

/**
 * SAM 3, Meta's Segment Anything, running on this Mac: one button installs everything it needs into beatsheet's own
 * folder (about 4.5 GB, mostly the model), checks it works, and Remove takes it all away again. On Windows it's SAM 3.1
 * on the PC's NVIDIA card, which first needs a Hugging Face token with access to Meta's model.
 */
function SamCard({ status: initial }: { status?: SamStatus }) {
  const [status, setStatus] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setStatus(initial), [initial]);
  const call = async (method: string, path: string, send?: unknown) => {
    setError("");
    const res = await fetch(`/api/settings/sam${path}`, send === undefined ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(send) });
    const body = (await res.json()) as SamStatus & { error?: string };
    if (res.ok) setStatus(body);
    else setError(body.error ?? "That didn't work");
    if (method === "DELETE") void actions.loadSettings();
  };
  const addToken = async () => {
    setBusy(true);
    await call("POST", "/token", { key: token.trim() });
    setBusy(false);
    setToken("");
  };
  // While it installs, follow along; when it's done, the agent's abilities change.
  const installing = status?.state === "installing";
  useEffect(() => {
    if (!installing) return;
    const t = setInterval(async () => {
      const next = (await fetch("/api/settings/sam").then((r) => r.json())) as SamStatus;
      setStatus(next);
      if (next.state !== "installing") void actions.loadSettings();
    }, 1000);
    return () => clearInterval(t);
  }, [installing]);

  if (!status) return null;
  const ready = status.state === "ready";
  return (
    <div className={`setup-service ${ready ? "ok" : ""}`}>
      <div className="setup-service-head">
        <strong>{samName(status)}</strong>
        <span className="dim small">by Meta</span>
        <span className="pill">Cut out anything you describe</span>
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
      {WINDOWS ? (
        <div className="dim small">
          Finds, follows and lifts out whatever you name (“the dog”, “the kids”, “the red kite”) in photos and in clips, for pop-ins, moving cut-outs and
          titles tucked behind things. Meta’s own code on {status.gpu ? `your ${status.gpu}` : "your NVIDIA card"}: free, private, about 12 GB with PyTorch.
        </div>
      ) : (
        <div className="dim small">
          Lifts out whatever you name (“the dog”, “the kids”, “the red kite”) from photos and stills from your clips, for pop-ins and titles tucked behind
          things. Runs on your Mac’s GPU: free, private, about 4.5 GB.
        </div>
      )}
      {status.state === "unsupported" && <div className="dim small">{status.detail}</div>}
      {status.state === "token" && (
        <>
          <div className="small">
            Meta shares SAM 3.1 with people who ask. <a href={status.links?.access} target="_blank" rel="noreferrer">Ask for access ↗</a> (signed in to Hugging Face; it&apos;s
            usually a few minutes), then <a href={status.links?.token} target="_blank" rel="noreferrer">make a token ↗</a> (Read is enough) and paste it here. It&apos;s kept in
            Credential Manager.
          </div>
          <div className="setup-service-key">
            <input type="password" placeholder="Paste a Hugging Face token (hf_…)" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === "Enter" && token.trim() && void addToken()} />
            <button onClick={() => void addToken()} disabled={!token.trim() || busy}>
              {busy ? "Checking…" : "Verify & save"}
            </button>
          </div>
        </>
      )}
      {ready && (
        <div className="small">
          <span className="good">✓</span> {status.detail} <span className="dim">· {gb(status.bytes)} on disk</span>
        </div>
      )}
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
    </div>
  );
}
