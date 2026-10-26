/**
 * The person's setup: which agent they use by default and which optional services they've added. Preferences live in a
 * small file in Application Support; API keys live in the macOS Keychain and never touch disk in the clear.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentId } from "./agent/session.ts";

export const SETTINGS_DIR = process.env.BEATSHEET_HOME ?? join(homedir(), "Library", "Application Support", "beatsheet");
const FILE = join(SETTINGS_DIR, "settings.json");
/** The Keychain service every beatsheet key is filed under; the account is the service id ("fal", "elevenlabs"). */
const KEYCHAIN = "beatsheet";

export type Settings = {
  /** The agent new sessions use unless the person picks another, and its model. */
  agent?: { id: AgentId; model?: string };
  /** What checking each agent CLI said last time (installed, signed in as whom). */
  checks: Partial<Record<AgentId, { ok: boolean; detail: string; at: string }>>;
  /** Services with a key in the Keychain, and what checking the key said. */
  services: Record<string, { addedAt: string; detail?: string }>;
  /**
   * How much the agent does without asking. "ask" (the default): beatsheet's tools and looking around are free, and
   * anything else (a command that changes things, an edit outside the workspace, the web) asks first. "free": it runs
   * commands and edits files on its own. Either way it's kept away from the Keychain.
   */
  autonomy?: "ask" | "free";
  /**
   * Claude Code works in the person's own Chrome (through the Claude in Chrome extension), so it can reach pages they're
   * signed in to: a Google Photos album, a dashboard. The extension asks before acting on each site.
   */
  chrome?: boolean;
  /** Narration: the voice cuts read with unless they pick their own, and the ElevenLabs model. */
  voice?: { default?: string; model?: string };
  /** Set once the first-launch setup is finished. */
  setupDone?: boolean;
};

export function readSettings(): Settings {
  try {
    return { services: {}, checks: {}, ...(JSON.parse(readFileSync(FILE, "utf8")) as Partial<Settings>) };
  } catch {
    return { services: {}, checks: {} };
  }
}

export function updateSettings(fn: (s: Settings) => void): Settings {
  const s = readSettings();
  fn(s);
  mkdirSync(SETTINGS_DIR, { recursive: true });
  writeFileSync(`${FILE}.tmp`, JSON.stringify(s, null, 2));
  renameSync(`${FILE}.tmp`, FILE);
  return s;
}

export const settingsExist = () => existsSync(FILE);

// ---- Keys, in the login Keychain through the `security` tool.
/** Runs `security`, feeding `input` on stdin so a key never appears in a command line. */
function security(args: string[], input?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/security", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
    child.stdin.end(input ?? "");
  });
}

/** Keys are opaque tokens; refuse anything that could break out of the quoted command below. */
const SAFE_KEY = /^[\w\-.:+/=~]+$/;
const SAFE_NAME = /^[a-z0-9-]+$/;

export async function setSecret(name: string, value: string) {
  if (!SAFE_NAME.test(name)) throw new Error(`Bad key name "${name}"`);
  if (!SAFE_KEY.test(value)) throw new Error("That doesn't look like an API key (unexpected characters)");
  // Interactive mode reads the command from stdin, keeping the key out of the process list.
  const r = await security(["-i"], `add-generic-password -U -s ${KEYCHAIN} -a ${name} -l "beatsheet: ${name}" -w "${value}"\n`);
  if (r.code !== 0 || /error/i.test(r.out)) throw new Error(`Couldn't save the key in the Keychain: ${r.out.trim()}`);
}

export async function getSecret(name: string): Promise<string | undefined> {
  if (!SAFE_NAME.test(name)) return undefined;
  const r = await security(["find-generic-password", "-s", KEYCHAIN, "-a", name, "-w"]);
  return r.code === 0 ? r.out.trim() || undefined : undefined;
}

export async function deleteSecret(name: string) {
  if (!SAFE_NAME.test(name)) return;
  await security(["delete-generic-password", "-s", KEYCHAIN, "-a", name]);
}
