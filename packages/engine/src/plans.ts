/**
 * Stills made on the person's own plan rather than by a key: GPT Image through Codex (a ChatGPT sign-in), Muse
 * Image through Muse Code (a Muse subscription), and Nano Banana through Antigravity (a Google account). None has an
 * images endpoint for a plan, so each is one short, throwaway agent turn in an empty folder that asks for one picture
 * with the agent's own image tool and nothing else: no beatsheet tools, no writes, and anything else it asks to do is
 * refused. The picture comes back inline or as a file. Sign-ins stay in the CLIs; beatsheet only looks at whether there
 * is one.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { ServiceState } from "@beatsheet/schema";
import { antigravityServer } from "./agent/antigravity-server.ts";
import { authType, thinkingOf } from "./agent/antigravity.ts";
import { cliEnv, findCli } from "./agent/cli.ts";
import { StdioRpc, uuid7, type RpcId } from "./agent/rpc.ts";
import { FalError } from "./fal.ts";

export const PLANS = [
  { id: "chatgpt", label: "ChatGPT plan", cli: "codex" as const },
  { id: "muse-code", label: "Muse Code plan", cli: "muse" as const },
  { id: "antigravity", label: "Antigravity plan", cli: "antigravity" as const },
];
/** The routes this module runs. */
export const PLAN_ROUTES = PLANS.map((p) => p.id);

const codexHome = () => process.env.CODEX_HOME ?? join(homedir(), ".codex");
const geminiHome = () => process.env.GEMINI_HOME ?? join(homedir(), ".gemini");
const museConfig = () => join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "muse");
const museData = () => join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "muse");

const readJson = (file: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

/**
 * Whether each plan can make stills now, from the CLIs' own files (no request): Codex signed in with ChatGPT rather
 * than a key, Muse Code signed in on a subscription that Meta has given the image tool to, and Antigravity's ACP
 * server installed and signed in with Google.
 */
export function planStates(): Record<string, ServiceState> {
  const codex = readJson(join(codexHome(), "auth.json"));
  const muse = (readJson(join(museConfig(), "auth.json"))?.providers as { meta?: { subs_active?: boolean } } | undefined)?.meta;
  const agyAuth = authType();
  const agyReady = !!antigravityServer() && (agyAuth === "oauth-personal" || agyAuth === "oauth-business");
  // Meta turns Muse Code's image tool on account by account; Muse keeps the switches it was given in feature-config.
  const gates = (() => {
    const dir = join(museData(), "feature-config");
    if (!existsSync(dir)) return {};
    return Object.assign({}, ...readdirSync(dir).map((f) => (readJson(join(dir, f))?.gates as Record<string, boolean> | undefined) ?? {})) as Record<string, boolean>;
  })();
  const [chatgpt, museCode, antigravity] = PLANS.map((p) => p.label) as [string, string, string];
  return {
    chatgpt: codex?.auth_mode === "chatgpt" ? { label: chatgpt, state: "ready" } : { label: chatgpt, state: "missing" },
    "muse-code": !muse?.subs_active
      ? { label: museCode, state: "missing" }
      : gates.meta_image_generation_plugin
        ? { label: museCode, state: "ready" }
        : { label: museCode, state: "failing", detail: "Meta hasn't turned on Muse Code's image tool for this account yet" },
    antigravity: agyReady ? { label: antigravity, state: "ready" } : { label: antigravity, state: "missing" },
  };
}

type Ask = { prompt: string; aspect?: string; refs?: string[] };
export type PlanImage = { bytes: Buffer; contentType: string };

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const typeOf = (file: string) => TYPES[extname(file).toLowerCase()] ?? "image/png";
/** Long enough for a slow picture; a turn that's still going after this has gone wrong. */
const TURN_MS = 5 * 60_000;

/** What the agent is asked: the picture, its shape, and which attached picture is a reference. */
function askFor(a: Ask): string {
  const shape = a.aspect ? ` Make it ${a.aspect === "1:1" ? "square" : `${a.aspect} (${aspectWord(a.aspect)})`}.` : "";
  const refs = a.refs?.length ? ` The attached picture${a.refs.length === 1 ? " is a reference" : "s are references"}, in the order the prompt names them.` : "";
  return `Make this picture with your image generation tool, once, and do nothing else.${shape}${refs}\n\n${a.prompt}`;
}
const aspectWord = (aspect: string) => {
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  return w > h ? "landscape" : w < h ? "portrait" : "square";
};

const ONLY = "You make exactly one picture with your image generation tool and nothing else: no shell commands, no files, no other tools, no questions. Afterwards reply with one word: done.";

/** One still on a plan. Throws FalError: final when asking again won't help (no sign-in, the allowance is used up, a refusal). */
export async function planImage(route: string, a: Ask): Promise<PlanImage> {
  sweep();
  const work = realpathSync(mkdtempSync(join(tmpdir(), "beatsheet-plan-")));
  try {
    if (route === "chatgpt") return await viaCodex(work, a);
    if (route === "muse-code") return await viaMuse(work, a);
    if (route === "antigravity") return await viaAntigravity(work, a);
    throw new FalError(`No plan "${route}"`, true);
  } finally {
    // The CLI can take a moment to let go of its folder on Windows; a folder left in the temp dir is no reason to lose the picture.
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      // the system cleans its temp folder
    }
  }
}

/** Folders earlier pictures were made in that the CLI hadn't let go of in time to remove. */
function sweep() {
  try {
    for (const d of readdirSync(tmpdir()).filter((x) => x.startsWith("beatsheet-plan-"))) {
      const dir = join(tmpdir(), d);
      if (Date.now() - statSync(dir).mtimeMs > TURN_MS * 2) rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // still in use, or gone already
  }
}

/** Waits for `done` or the time limit, and stops the CLI either way. */
async function turn<T>(rpc: StdioRpc, label: string, done: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new FalError(`${label} didn't finish the picture in ${TURN_MS / 60_000} minutes`, false)), TURN_MS)));
  const closed = new Promise<never>((_, reject) => rpc.once("closed", (err: Error) => reject(new FalError(`${label} stopped: ${err.message}`, false))));
  try {
    return await Promise.race([done, late, closed]);
  } finally {
    clearTimeout(timer);
    rpc.close();
  }
}

type CodexImage = { status: string; savedPath?: string; result?: string; failure?: { type: string; resetsAt?: number | null } | null };

async function viaCodex(work: string, a: Ask): Promise<PlanImage> {
  const codex = await findCli("codex");
  if (!codex) throw new FalError("Codex isn't installed, so the ChatGPT plan can't make pictures. Settings → Agent installs it.", true);
  const rpc = new StdioRpc("Codex");
  let said = "";
  let thread = "";
  /** A turn that ended with no picture and no error is asked once more: the model can say it's done without having made it. */
  let nudged = false;
  const done = new Promise<PlanImage>((resolve, reject) => {
    let image: PlanImage | undefined;
    rpc.on("notification", (m: string, p: { item?: { type: string; text?: string } & CodexImage; turn?: { status: string; error?: { message: string } | null } }) => {
      if (m === "item/completed" && p.item?.type === "agentMessage") said = p.item.text ?? said;
      if (m === "item/completed" && p.item?.type === "imageGeneration") {
        const it = p.item;
        if (it.failure?.type === "usageLimitExceeded")
          return reject(new FalError(`The ChatGPT plan's pictures are used up${it.failure.resetsAt ? ` until ${new Date(it.failure.resetsAt * 1000).toLocaleString("en-US")}` : " for now"}`, true));
        if (it.savedPath && existsSync(it.savedPath)) image = { bytes: readFileSync(it.savedPath), contentType: typeOf(it.savedPath) };
        else if (it.result) image = { bytes: Buffer.from(it.result, "base64"), contentType: "image/png" };
      }
      if (m === "turn/completed") {
        if (image) return resolve(image);
        const err = p.turn?.error?.message;
        if (!err && !nudged) {
          nudged = true;
          const again = [{ type: "text", text: "You haven't made the picture yet. Make it now with your image generation tool.", text_elements: [] }];
          return void rpc.request("turn/start", { threadId: thread, input: again }).catch((e: Error) => reject(new FalError(`Codex: ${e.message}`, false)));
        }
        reject(new FalError(err ? `Codex: ${err}` : `Codex didn't make a picture${said ? `: "${said.slice(0, 200)}"` : ""}`, !err));
      }
    });
    // Nothing but the picture is wanted, and it never asks with approvals off; anything it does ask is refused.
    rpc.on("request", (id: string | number) => rpc.refuse(id));
  });
  rpc.spawn(codex, ["app-server"], { cwd: work, env: await cliEnv() });
  await rpc.request("initialize", { clientInfo: { name: "beatsheet_studio", title: "beatsheet studio", version: "0.1.0" }, capabilities: null });
  rpc.notify("initialized");
  const t = await rpc.request<{ thread: { id: string } }>("thread/start", { cwd: work, ephemeral: true, approvalPolicy: "never", sandbox: "read-only", developerInstructions: ONLY });
  thread = t.thread.id;
  const input = [{ type: "text", text: askFor(a), text_elements: [] }, ...(a.refs ?? []).map((path) => ({ type: "localImage", path }))];
  await rpc.request("turn/start", { threadId: t.thread.id, input });
  return turn(rpc, "Codex", done);
}

type MuseApproval = { approvalId: string; currentRequirementId: unknown; toolName: string; subject?: { toolName?: string }; availableChoices: { choiceId: string; decision: string }[] };

async function viaMuse(work: string, a: Ask): Promise<PlanImage> {
  const muse = await findCli("muse");
  if (!muse) throw new FalError("Muse Code isn't installed, so the Muse plan can't make pictures. Settings → Agent installs it.", true);
  const rpc = new StdioRpc("Muse Code");
  let sessionId = "";
  let said = "";
  // Muse's image tool saves what it makes under generated_images/ in the session's folder.
  const made = () => {
    const dir = join(work, "generated_images");
    if (!existsSync(dir)) return undefined;
    return readdirSync(dir)
      .filter((f) => TYPES[extname(f).toLowerCase()])
      .map((f) => join(dir, f))
      .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)[0];
  };
  const answer = async () => {
    const r = await rpc.request<{ approvals?: MuseApproval[] }>("approval/listPending", { sessionId }).catch(() => undefined);
    for (const x of r?.approvals ?? []) {
      const yes = (x.subject?.toolName ?? x.toolName) === "image_generation";
      const choice = x.availableChoices.find((c) => (yes ? c.decision === "approved" : !c.decision.startsWith("approved")));
      if (choice) await rpc.request("approval/decide", { commandId: uuid7(), sessionId, approvalId: x.approvalId, choiceId: choice.choiceId, requirementId: x.currentRequirementId }).catch(() => undefined);
    }
  };
  const done = new Promise<PlanImage>((resolve, reject) => {
    rpc.on("notification", (m: string, p: { sessionId?: string; item?: { kind: string; text?: string }; terminal?: string; error?: { message?: string } }) => {
      if (p.sessionId && p.sessionId !== sessionId) return;
      if (m === "item/completed" && p.item?.kind === "agentMessage") said = p.item.text ?? said;
      if (m.startsWith("approval/")) void answer();
      if (m === "turn/completed") {
        const file = made();
        if (file) return resolve({ bytes: readFileSync(file), contentType: typeOf(file) });
        const err = p.terminal === "failed" ? p.error?.message : undefined;
        reject(new FalError(err ? `Muse Code: ${err}` : `Muse Code didn't make a picture${said ? `: "${said.slice(0, 200)}"` : ""}`, !err));
      }
    });
    rpc.on("request", (id: string | number) => rpc.refuse(id));
  });
  rpc.spawn(muse, ["serve", "--no-session-log", "--disable-request-user-input"], { cwd: work });
  await rpc.request("initialize", { clientInfo: { name: "beatsheet_studio", title: "beatsheet studio", version: "0.1.0" }, capabilities: { requestedCapabilities: [] } });
  rpc.notify("initialized", {});
  const s = await rpc.request<{ session: { sessionId: string } }>("session/start", { commandId: uuid7(), workspaceRoot: work });
  sessionId = s.session.sessionId;
  const input = [
    { type: "text", text: `${ONLY}\n\n${askFor(a)}` },
    ...(a.refs ?? []).map((f) => ({ type: "image", base64Data: readFileSync(f).toString("base64"), mediaType: typeOf(f) })),
  ];
  await rpc.request("turn/start", { commandId: uuid7(), sessionId, input });
  return turn(rpc, "Muse Code", done);
}

const AGY_ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"] as const;

/** Maps any requested aspect ratio ("4:5", "21:9"…) to the closest one Antigravity's `generate_image` accepts. */
export function antigravityAspect(aspect = "1:1"): string {
  if ((AGY_ASPECTS as readonly string[]).includes(aspect)) return aspect;
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h) return "1:1";
  const want = w / h;
  return [...AGY_ASPECTS].sort((a, b) => {
    const [aw, ah] = a.split(":").map(Number) as [number, number];
    const [bw, bh] = b.split(":").map(Number) as [number, number];
    return Math.abs(Math.log(aw / ah / want)) - Math.abs(Math.log(bw / bh / want));
  })[0]!;
}

type AgyContent = { content?: { type?: string; data?: string; mimeType?: string; text?: string } }[];

/** Pulls the inline base64 image out of an Antigravity `tool_call_update` payload, if present. */
export function extractAntigravityImage(content?: AgyContent): PlanImage | undefined {
  for (const item of content ?? []) {
    const c = item.content;
    if (c?.data) return { bytes: Buffer.from(c.data, "base64"), contentType: c.mimeType ?? "image/jpeg" };
  }
  return undefined;
}

const AGY_ONLY =
  "You make exactly one picture with the generate_image tool and nothing else: no shell commands, no other files, no other tools, no questions. Afterwards reply with one word: done.";

async function viaAntigravity(work: string, a: Ask): Promise<PlanImage> {
  const server = antigravityServer();
  if (!server) throw new FalError("Antigravity isn't installed, so the Antigravity plan can't make pictures. Settings → Agent installs it.", true);
  // Copy up to 3 reference images inside the throwaway workspace so generate_image can read them without sandbox issues.
  const stagedRefs: string[] = [];
  if (a.refs?.length) {
    const refDir = join(work, "refs");
    mkdirSync(refDir, { recursive: true });
    for (const [i, src] of a.refs.slice(0, 3).entries()) {
      const ext = extname(src).toLowerCase() || ".jpg";
      const dest = join(refDir, `ref_${i + 1}${ext}`);
      copyFileSync(src, dest);
      stagedRefs.push(dest);
    }
  }
  const rpc = new StdioRpc("Antigravity");
  let sessionId = "";
  let said = "";
  let image: PlanImage | undefined;
  let toolError = "";
  const genCallIds = new Set<string>();
  const isGenImage = (call?: { title?: string; rawInput?: unknown }) => {
    if (!call) return false;
    if (/generate_image/i.test(call.title ?? "")) return true;
    const raw = call.rawInput && typeof call.rawInput === "object" ? (call.rawInput as Record<string, unknown>) : undefined;
    return !!(raw && "Prompt" in raw && "ImageName" in raw);
  };
  const brainImage = (): PlanImage | undefined => {
    if (!sessionId) return undefined;
    const dir = join(geminiHome(), "antigravity-acp", "brain", sessionId);
    if (!existsSync(dir)) return undefined;
    const file = readdirSync(dir)
      .filter((f) => TYPES[extname(f).toLowerCase()])
      .map((f) => join(dir, f))
      .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)[0];
    return file ? { bytes: readFileSync(file), contentType: typeOf(file) } : undefined;
  };
  rpc.on("notification", (m: string, p: { sessionId?: string; update?: { sessionUpdate: string; toolCallId?: string; title?: string; status?: string; rawInput?: unknown; content?: { text?: string } | AgyContent } }) => {
    if (m !== "session/update" || (p.sessionId && p.sessionId !== sessionId)) return;
    const u = p.update;
    if (!u) return;
    if (u.sessionUpdate === "agent_message_chunk") {
      const text = (u.content as { text?: string } | undefined)?.text;
      if (text) said += text;
    } else if (u.sessionUpdate === "tool_call" && u.toolCallId && isGenImage(u)) {
      genCallIds.add(u.toolCallId);
    } else if (u.sessionUpdate === "tool_call_update" && u.toolCallId && (genCallIds.has(u.toolCallId) || isGenImage(u))) {
      genCallIds.add(u.toolCallId);
      const list = Array.isArray(u.content) ? u.content : undefined;
      if (u.status === "completed") image ??= extractAntigravityImage(list);
      else if (u.status === "failed") {
        const msg = (list ?? []).map((x) => x.content?.text ?? "").filter(Boolean).join(" ").trim();
        if (msg) toolError = msg;
      }
    }
  });
  rpc.on("request", (id: RpcId, m: string, p: { toolCall?: { toolCallId?: string; title?: string; rawInput?: unknown }; options?: { optionId: string; kind: string }[] }) => {
    if (m !== "session/request_permission") return rpc.refuse(id);
    const allow = isGenImage(p.toolCall);
    if (allow && p.toolCall?.toolCallId) genCallIds.add(p.toolCall.toolCallId);
    const opt = (p.options ?? []).find((o) => o.kind === (allow ? "allow_once" : "reject_once"));
    rpc.respond(id, opt ? { outcome: { outcome: "selected", optionId: opt.optionId } } : { outcome: { outcome: "cancelled" } });
  });

  const runTurn = (async (): Promise<PlanImage> => {
    rpc.spawn(server.command, server.args, { cwd: work, env: await cliEnv() });
    await rpc.request(
      "initialize",
      { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "beatsheet_studio", title: "beatsheet studio", version: "0.1.0" } },
      60_000,
    );
    const s = await rpc.request<{ sessionId?: string; configOptions?: { id: string; currentValue: string; options: { value: string; name: string; description?: string }[] }[] }>(
      "session/new",
      { cwd: work, mcpServers: [], _meta: { antigravity: { systemPrompt: { append: AGY_ONLY } } } },
      60_000,
    );
    sessionId = s.sessionId ?? "";
    if (!sessionId) throw new FalError("Antigravity didn't start a session", false);
    const low = thinkingOf(s).find((t) => t.id === "low");
    if (low && !low.default) await rpc.request("session/set_config_option", { sessionId, configId: "thinking_level", value: "low" }).catch(() => {});

    const ratio = antigravityAspect(a.aspect);
    const refs = stagedRefs.length ? ` Pass these exact reference image paths in ImagePaths in order: ${JSON.stringify(stagedRefs)}.` : "";
    const ask = `Call generate_image once with AspectRatio "${ratio}", ImageName "beatsheet_still",${refs} and this Prompt (keep every detail):\n\n${a.prompt}`;
    await rpc.request("session/prompt", { sessionId, prompt: [{ type: "text", text: ask }] }, TURN_MS);
    image ??= brainImage();
    if (image) return image;
    if (!toolError) {
      await rpc.request("session/prompt", { sessionId, prompt: [{ type: "text", text: "You haven't made the picture yet. Call generate_image now." }] }, TURN_MS);
      image ??= brainImage();
      if (image) return image;
    }
    const reason = toolError || said.trim().slice(0, 200);
    const transient = /timeout|temporar|unavailable|503|502|500|network|econn/i.test(reason);
    throw new FalError(reason ? `Antigravity: ${reason}` : "Antigravity didn't make a picture", !transient);
  })();
  return turn(rpc, "Antigravity", runTurn);
}
