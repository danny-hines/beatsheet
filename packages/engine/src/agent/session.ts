/**
 * What every hosted agent looks like to the studio, whichever CLI runs it: a transcript of items, approvals waiting on
 * the person, and a status. Each adapter translates its own protocol into this and announces every change.
 */
import { EventEmitter } from "node:events";
import { OPENING } from "../agents.ts";

export type AgentId = "muse" | "codex" | "claude";
export const AGENT_LABELS: Record<AgentId, string> = { muse: "Muse Code", codex: "Codex", claude: "Claude Code" };

export type AgentItem = {
  id: string;
  kind: "user" | "assistant" | "reasoning" | "tool" | "notice";
  status: "running" | "done" | "failed" | "stopped";
  /** Message text; for reasoning, the raw thinking when there's no summary. */
  text?: string;
  /** For a message the studio sent for you (the opening brief, a pick): what it did, in a few words. */
  display?: string;
  /** Notes that went with a message. */
  notes?: number;
  /** Reasoning summary parts, streamed separately. */
  summary?: string[];
  /** Tool name without any server prefix, and the MCP server it belongs to when it has one. */
  tool?: string;
  server?: string;
  args?: unknown;
  /** One line about a tool call that isn't in its arguments: a shell command, the files it changed. */
  detail?: string;
  error?: string;
  /** Orders updates to the same item when a protocol versions them. */
  rev?: number;
};

export type AgentApproval = { id: string; title: string; detail?: string; choices: { id: string; label: string; primary?: boolean }[] };

export type AgentView = {
  agent?: AgentId;
  status: "off" | "starting" | "idle" | "running" | "error";
  error?: string;
  sessionId?: string;
  name?: string;
  model?: string;
  project?: string;
  /** The cut this conversation is about. */
  cut?: string;
  items: AgentItem[];
  approvals: AgentApproval[];
  /** When the CLI last said anything (a streamed word, a tool result), so the studio can tell working from stuck. */
  heardAt?: string;
};

/** Changes the studio applies: the view without its transcript (or with it, when replaced), one item, or a streamed append. */
export type AgentChange =
  | { type: "view"; view: Omit<AgentView, "items"> & { items?: AgentItem[] } }
  | { type: "item"; item: AgentItem }
  | { type: "delta"; itemId: string; field: string; delta: string };

/** An earlier session the studio started, for "resume". */
export type AgentSessionSummary = { id: string; updatedAt: string; name?: string; model?: string; title?: string; project?: string; cut?: string; cutName?: string };
export type AgentModel = { id: string; label: string; hint?: string; default?: boolean };
/** Whether the CLI can actually work: installed and signed in. `detail` says who it's signed in as, or what to do. */
export type AgentCheck = { ok: boolean; detail: string };

export const offView = (): AgentView => ({ status: "off", items: [], approvals: [] });
export const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * A message as the person should see it in the transcript: what they typed (`text`, empty when they typed nothing),
 * a few words for the studio's own messages (`display`: the opening, a pick, "looks good"), and how many notes went
 * with it.
 */
export function readStudioMessage(raw: string): { text: string; display?: string; notes?: number } {
  let text = raw.trim();
  let notes: number | undefined;
  const attached = text.match(/\n*\(Attached: (\d+) beatsheet notes? on [\s\S]*\)\s*$/);
  if (attached) {
    notes = Number(attached[1]);
    text = text.slice(0, attached.index).trim();
  }
  const labels: string[] = [];
  // The studio's own paragraphs come first; peel them off and keep what's left as the person's words.
  for (;;) {
    const [first = "", ...rest] = text.split("\n\n");
    const opening = first.match(OPENING);
    const picked = first.match(/^On project [\w-]+(?:, cut [\w-]+)?, I picked (.+?)(?: for "[\s\S]*"\.|\.)(?: Make each one its own cut\.)?$/);
    const provided = first.match(/^On project [\w-]+(?:, cut [\w-]+)?: ([\s\S]+)$/);
    if (opening) labels.push(opening[2] ? `New session on ${opening[3] ?? opening[2]}` : "New session");
    else if (picked) labels.push(`Picked ${picked[1]!.replace(/ \([\w-]+\)/g, "")}`);
    else if (/^On project [\w-]+(?:, cut [\w-]+)?: this looks good\.$/.test(first)) labels.push("Looks good");
    else if (/^Go ahead on project /.test(first)) labels.push("Go ahead");
    else if (provided) {
      rest.unshift(provided[1]!);
    } else break;
    text = rest.join("\n\n").trim();
    if (!text) break;
  }
  return { text, display: labels.length ? labels.join(" · ") : notes && !text ? `Sent ${notes} note${notes === 1 ? "" : "s"}` : undefined, notes };
}

/** Sessions whose opening message is the studio's, as a resume entry. */
export function studioSession(s: { id: string; updatedAt: string; name?: string; model?: string; prompt?: string }): AgentSessionSummary | undefined {
  const opening = s.prompt?.match(OPENING);
  if (!opening) return undefined;
  return { id: s.id, updatedAt: s.updatedAt, name: s.name, model: s.model, title: opening[1], project: opening[2], cutName: opening[3], cut: opening[4] };
}

/**
 * Whether something an agent wants to run reads secrets: the Keychain, or an agent CLI's own sign-in file. These are
 * never approved on the person's behalf, whatever the autonomy setting.
 */
export function touchesKeys(input: unknown, windows = process.platform === "win32"): boolean {
  const text = typeof input === "string" ? input : JSON.stringify(input ?? "");
  if (windows && WINDOWS_KEYS.test(text)) return true;
  return /\bsecurity\b[^\n]*(find-(generic|internet)-password|dump-keychain|export)|find-generic-password|find-internet-password|dump-keychain|Library\/Keychains|\.config\/muse\/auth\.json|\.codex\/auth\.json|\.claude\/\.credentials/i.test(text);
}

/**
 * The same on Windows: Credential Manager (beatsheet's helper, PowerShell's ways in, its vault folders) and the CLIs'
 * sign-in files with either slash (JSON doubles a backslash).
 */
const WINDOWS_KEYS = /beatsheet-credentials|\bCred(Read|Enumerate)|PasswordVault|Get-StoredCredential|\bvaultcmd\b|\bcmdkey\b[^\n]*\/list|Microsoft[\\/]+(Credentials|Vault)|\.config[\\/]+muse[\\/]+auth\.json|\.codex[\\/]+auth\.json|\.claude[\\/]+\.credentials/i;

/** One hosted agent CLI. The manager keeps at most one running. */
export abstract class AgentAdapter extends EventEmitter {
  abstract readonly id: AgentId;
  view: AgentView = offView();

  /** The models this CLI offers right now. */
  abstract models(): Promise<AgentModel[]>;
  /** Proves the CLI is signed in, as cheaply as it allows. */
  abstract check(): Promise<AgentCheck>;
  /** Earlier sessions the studio started here, newest first. */
  abstract sessions(): Promise<AgentSessionSummary[]>;
  abstract start(opts: { model?: string; project?: string; cut?: string }): Promise<void>;
  abstract resume(sessionId: string, project?: string, cut?: string): Promise<void>;
  /** A message from the person. Waits for the current turn if the agent is busy. */
  abstract send(text: string): Promise<void>;
  abstract interrupt(): Promise<void>;
  abstract decide(approvalId: string, choiceId: string): Promise<void>;
  /** Lets the session go (it stays on disk to resume) and stops the CLI. */
  abstract stop(): void;

  /** When the CLI last said anything, and when the studio was last told. */
  protected lastHeard = 0;
  private told = 0;

  /** Notes that the CLI said something; the studio hears of it every couple of seconds at most. */
  protected heard() {
    this.lastHeard = Date.now();
    if (this.lastHeard - this.told > 2000) {
      this.told = this.lastHeard;
      this.set({ heardAt: new Date(this.lastHeard).toISOString() });
    }
  }

  protected set(patch: Partial<AgentView>) {
    this.view = { ...this.view, ...patch, agent: this.id };
    const { items: _items, ...rest } = this.view;
    this.emit("change", { type: "view", view: rest } satisfies AgentChange);
  }

  /** Swaps in a whole new view, transcript included. */
  protected replace(view: Partial<AgentView>) {
    this.view = { ...offView(), ...view, agent: this.id };
    this.emit("change", { type: "view", view: this.view } satisfies AgentChange);
  }

  protected upsert(item: AgentItem) {
    const items = [...this.view.items];
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0 && (item.rev ?? 0) < (items[i]!.rev ?? 0)) return;
    // Streamed text may be ahead of an item's snapshot; keep the longer copy.
    const next = i < 0 ? item : { ...items[i]!, ...item, text: longer(item.text, items[i]!.text), summary: item.summary ?? items[i]!.summary };
    if (i < 0) items.push(next);
    else items[i] = next;
    this.view = { ...this.view, items };
    this.emit("change", { type: "item", item: next } satisfies AgentChange);
  }

  protected append(itemId: string, field: string, delta: string) {
    const item = this.view.items.find((x) => x.id === itemId);
    if (!item) return;
    if (field === "text") item.text = (item.text ?? "") + delta;
    else if (field.startsWith("summary.")) {
      const n = Number(field.slice(8));
      item.summary = [...(item.summary ?? [])];
      item.summary[n] = (item.summary[n] ?? "") + delta;
    } else return;
    this.emit("change", { type: "delta", itemId, field, delta } satisfies AgentChange);
  }

  /** Marks the session broken, with why. */
  fail(err: unknown) {
    this.set({ status: "error", error: message(err) });
  }
}

const longer = (a?: string, b?: string) => ((a?.length ?? 0) >= (b?.length ?? 0) ? a : b);
