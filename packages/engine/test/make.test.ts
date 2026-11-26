import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renameCast, SCHEMA_VERSION, STAGE_IDS, type Asset, type ProjectFile } from "@beatsheet/schema";
import { keepLoopTurning } from "./standin.ts";

// The engine reads where projects live (and settings) when its modules load, so they're imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-make-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");
process.env.BEATSHEET_MAKE_POLL_MS = "5";

// Keys come from the Keychain, and a key there means the service is connected: fal, and the two that make stills in
// one request, OpenAI and Meta. A test can connect more (Gemini), and set a spending limit.
const settings = vi.hoisted(() => ({ make: undefined as undefined | { limit?: { usd: number; since: string }; provider?: { image?: string; video?: string } }, services: {} as Record<string, { addedAt: string }> }));
vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return {
    ...real,
    getSecret: async (id: string) => (["fal", "openai", "meta", "gemini", "tein", "runway", "higgsfield", "openrouter"].includes(id) ? "test-key" : undefined),
    readSettings: () => ({ services: { fal: { addedAt: "2026-10-28" }, openai: { addedAt: "2026-10-29" }, meta: { addedAt: "2026-10-29" }, ...settings.services }, checks: {}, make: settings.make }),
  };
});
/** Chooses the service in use for stills or for video, as the person does in Settings → Making. */
const provider = (p: { image?: string; video?: string }) => void (settings.make = { ...settings.make, provider: { ...settings.make?.provider, ...p } });
// Plans (ChatGPT through Codex, Muse Code) aren't signed in unless a test says so, and make their picture without the CLI.
const plans = vi.hoisted(() => ({ ready: [] as string[], asks: [] as { route: string; prompt: string; aspect?: string; refs?: string[] }[] }));
vi.mock("../src/plans.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/plans.ts")>();
  return {
    ...real,
    planStates: () => Object.fromEntries(real.PLANS.map((p) => [p.id, { label: p.label, state: plans.ready.includes(p.id) ? "ready" : "missing" }])),
    planImage: async (route: string, a: { prompt: string; aspect?: string; refs?: string[] }) => {
      plans.asks.push({ route, ...a });
      return { bytes: Buffer.from("a picture on a plan"), contentType: "image/png" };
    },
  };
});
// Adding an asset probes it with ffprobe and makes previews; here it only records it, as a 6-second video or a still.
// Like the real one, it picks the id first and saves a moment later (the previews take time), and a test can make it
// fail, as a file in use would.
const ingest = vi.hoisted(() => ({ failures: 0, chosen: [] as string[] }));
vi.mock("../src/ingest.ts", async () => {
  const { loadFile, updateFile } = await import("../src/store.ts");
  return {
    addAsset: async (id: string, file: string, meta: { id?: string; label?: string; tags?: string[]; provenance?: Asset["provenance"] }) => {
      const used = new Set(loadFile(id).doc.assets.map((a) => a.id));
      let aid = meta.id ?? "take";
      for (let n = 2; used.has(aid); n++) aid = `${meta.id}-${n}`;
      ingest.chosen.push(aid);
      await new Promise((r) => setTimeout(r, 10));
      if (ingest.failures > 0 && ingest.failures--) throw new Error("EPERM: operation not permitted, rename");
      const video = file.endsWith(".mp4");
      const asset: Asset = { id: aid, kind: video ? "video" : "image", path: file, label: meta.label, tags: meta.tags, provenance: meta.provenance, width: 1080, height: 1920, ...(video ? { duration: 6 } : {}) };
      updateFile(id, (d) => void d.assets.push(asset));
      return asset;
    },
  };
});

type Make = typeof import("../src/make.ts");
let make: Make;
let store: typeof import("../src/store.ts");

// ---- A stand-in for fal: uploads, the queue (waiting, then running, then done), and the files it made. And for
// OpenAI's and Meta's Images API, which answer with the picture.
type Seen = { submits: { endpoint: string; input: Record<string, unknown> }[]; uploads: number; direct: { url: string; type: string; body: string }[] };
let seen: Seen;
// And for Tein: uploads, the one endpoint (which gives the same job for the same idempotency key), and the job to follow.
let tein: { submits: Record<string, unknown>[]; keys: string[]; uploads: number; jobs: Map<string, string> };
// And for Runway: uploads (an address to send the file to, then the file), its endpoints that start a task, and the task to
// follow. A task its moderation turns down fails, and is charged for.
let runway: { submits: { path: string; body: Record<string, unknown> }[]; uploads: string[]; stored: number; tasks: Map<string, { still: boolean; moderated: boolean }>; cancelled: string[] };
// And for Higgsfield: where to PUT a file, what a request will cost, the model's own address that starts a job (once
// for each key it's sent under), and the job to follow. A job its moderation turns down ends as "nsfw".
let higgsfield: {
  submits: { model: string; body: Record<string, unknown> }[];
  keys: string[];
  uploads: string[];
  stored: number;
  estimates: string[];
  jobs: Map<string, string>;
  made: Map<string, { moderated: boolean; still: boolean }>;
  cancelled: string[];
};
// And for OpenRouter: key check, synchronous images, and async video jobs (signed URL or authenticated /content).
let openrouter: {
  images: Record<string, unknown>[];
  videos: Record<string, unknown>[];
  jobs: Map<string, { fail?: string; failCost?: number; unsignedOnly?: boolean }>;
  authedDownloads: number;
};
let refuse: string | undefined;
let server: Server;
let base = "";
const polls = new Map<string, number>();
// The clip a service sends back: 6 seconds, 9:16, with its own sound (as a lip-synced one comes back saying its line).
const clipMade = join(root, "made.mp4");

beforeAll(async () => {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=540x960:r=25:d=6", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-pix_fmt", "yuv420p", "-shortest", clipMade]);
  server = createServer((req, res) => {
    const url = req.url ?? "";
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const send = (status: number, data: unknown, type = "application/json") => {
        res.writeHead(status, { "content-type": type });
        res.end(type === "application/json" ? JSON.stringify(data) : (data as Buffer));
      };
      // Gemini's generateContent: the picture comes back as a part of the answer.
      if (url.startsWith("/gemini/")) {
        if (req.headers["x-goog-api-key"] !== "test-key") return send(400, { error: { message: "API key not valid", status: "INVALID_ARGUMENT" } });
        seen.direct.push({ url, type: String(req.headers["content-type"]), body });
        if (body.includes("free tier")) return send(429, { error: { message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 0", status: "RESOURCE_EXHAUSTED" } });
        return send(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("a made picture").toString("base64") } }] } }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 1290 } });
      }
      if (url.startsWith("/direct/")) {
        if (req.headers.authorization !== "Bearer test-key") return send(401, { error: { message: "no" } });
        seen.direct.push({ url, type: String(req.headers["content-type"]), body });
        if (refuse && body.includes(refuse)) return send(400, { error: { message: "Your request was rejected by the safety system.", code: "moderation_blocked" } });
        if (body.includes("busy")) return send(503, { error: { message: "Overloaded" } });
        return send(200, { data: [{ b64_json: Buffer.from("a made picture").toString("base64") }], usage: { input_tokens: 50, input_tokens_details: { text_tokens: 50, image_tokens: 0 }, output_tokens: 1000 } });
      }
      if (url.startsWith("/tein/")) {
        if (req.headers.authorization !== "Bearer test-key") return send(401, { error: { code: "invalid_api_key", message: "no" } });
        if (req.method === "POST" && url === "/tein/uploads") {
          tein.uploads++;
          return send(200, { url: `${base}/out/tein-upload-${tein.uploads}.jpg`, kind: "image" });
        }
        if (req.method === "POST" && url === "/tein/generate") {
          const input = JSON.parse(body) as Record<string, unknown>;
          const key = String(input.idempotency_key);
          tein.keys.push(key);
          if (refuse && String(input.prompt).includes(refuse)) return send(400, { error: { code: "content_blocked", message: "Content moderation blocked the request or its output. Nothing is charged." } });
          if (!tein.jobs.has(key)) {
            tein.submits.push(input);
            tein.jobs.set(key, `gen_${tein.submits.length}`);
          }
          return send(202, { id: tein.jobs.get(key), status: "queued" });
        }
        const id = url.match(/^\/tein\/jobs\/([^/]+)$/)?.[1];
        if (id) {
          const n = (polls.get(id) ?? 0) + 1;
          polls.set(id, n);
          if (n < 3) return send(200, { id, status: n === 1 ? "queued" : "running" });
          return send(200, { id, status: "succeeded", data: [{ url: `${base}/out/${id}.mp4`, duration: 4 }], usage: { cost: 0.5288 } });
        }
        return send(404, { error: { code: "not_found", message: "Not found." } });
      }
      // Where Runway says to send a file: its form fields first, then the file, and no key.
      if (req.method === "POST" && url.startsWith("/runway-store/")) {
        if (req.headers.authorization || !/name="key"[\s\S]*name="file"; filename="/.test(body)) return send(400, { error: "not the form that was asked for" });
        runway.stored++;
        return send(204, {});
      }
      if (url.startsWith("/runway/")) {
        if (req.headers.authorization !== "Bearer test-key") return send(401, { error: "The API key is not valid." });
        if (req.headers["x-runway-version"] !== "2024-11-06") return send(400, { error: "X-Runway-Version is required." });
        if (req.method === "POST" && url === "/runway/uploads") {
          const { filename, type } = JSON.parse(body) as { filename: string; type: string };
          if (type !== "ephemeral") return send(400, { error: "Invalid upload type." });
          runway.uploads.push(filename);
          return send(200, { uploadUrl: `${base}/runway-store/${runway.uploads.length}`, fields: { key: `uploads/${runway.uploads.length}`, policy: "p" }, runwayUri: `runway://upload-${runway.uploads.length}` });
        }
        const start = url.match(/^\/runway\/(text_to_video|image_to_video|text_to_image)$/)?.[1];
        if (req.method === "POST" && start) {
          const input = JSON.parse(body) as Record<string, unknown>;
          if (typeof input.duration === "number" && !Number.isInteger(input.duration)) return send(400, { error: "Validation of body failed", issues: [{ code: "invalid_type", path: ["duration"], message: "Expected integer, received float" }] });
          runway.submits.push({ path: start, body: input });
          const id = `task_${runway.submits.length}`;
          runway.tasks.set(id, { still: start === "text_to_image", moderated: !!refuse && String(input.promptText).includes(refuse) });
          return send(200, { id, estimatedCost: { credits: start === "text_to_image" ? 4 : 80 } });
        }
        const id = url.match(/^\/runway\/tasks\/([^/]+)$/)?.[1];
        const task = id ? runway.tasks.get(id) : undefined;
        if (id && task && req.method === "DELETE") {
          runway.cancelled.push(id);
          return send(204, {});
        }
        if (id && task) {
          const n = (polls.get(id) ?? 0) + 1;
          polls.set(id, n);
          const made = { id, createdAt: "2026-11-21T00:00:00Z" };
          if (n < 3) return send(200, n === 1 ? { ...made, status: "THROTTLED", estimatedCost: { credits: 80 } } : { ...made, status: "RUNNING", progress: 0.4, estimatedCost: { credits: 80 } });
          if (task.moderated) return send(200, { ...made, status: "FAILED", failure: "The prompt was flagged.", failureCode: "SAFETY.INPUT.TEXT", cost: { credits: 80 } });
          return send(200, { ...made, status: "SUCCEEDED", output: [`${base}/out/${id}.${task.still ? "jpg" : "mp4"}`], cost: { credits: task.still ? 4 : 64 } });
        }
        return send(404, { error: "Not found." });
      }
      // Where Higgsfield says to PUT a file: with the headers it gave, and no key.
      if (req.method === "PUT" && url.startsWith("/higgsfield-store/")) {
        if (req.headers.authorization || req.headers["x-amz-tagging"] !== "retention=temporary" || !body) return send(400, { detail: "not as asked" });
        higgsfield.stored++;
        return send(200, {});
      }
      if (url.startsWith("/higgsfield/")) {
        if (req.headers.authorization !== "Key test-key") return send(401, { detail: "Invalid credentials" });
        const path = url.slice("/higgsfield/".length);
        if (req.method === "POST" && path === "files/generate-upload-url") {
          const type = (JSON.parse(body) as { content_type: string }).content_type;
          higgsfield.uploads.push(type);
          const n = higgsfield.uploads.length;
          const ext = type === "video/mp4" ? "mp4" : type === "audio/wav" ? "wav" : type === "audio/mpeg" ? "mp3" : "jpg";
          return send(200, { public_url: `${base}/out/hf-upload-${n}.${ext}`, upload_url: `${base}/higgsfield-store/${n}`, content_type: type, upload_headers: { "Content-Type": type, "x-amz-tagging": "retention=temporary" } });
        }
        const followed = path.match(/^requests\/([^/]+)\/(status|cancel)$/);
        if (followed) {
          const id = followed[1]!;
          const made = higgsfield.made.get(id);
          if (!made) return send(404, { detail: "Request not found" });
          if (followed[2] === "cancel") {
            // Only while it waits.
            if ((polls.get(id) ?? 0) > 1) return send(400, { detail: "Request has already started" });
            higgsfield.cancelled.push(id);
            return send(202, {});
          }
          const n = (polls.get(id) ?? 0) + 1;
          polls.set(id, n);
          const links = { request_id: id, status_url: `${base}/higgsfield/requests/${id}/status`, cancel_url: `${base}/higgsfield/requests/${id}/cancel` };
          if (n < 3) return send(200, { ...links, status: n === 1 ? "queued" : "in_progress" });
          if (made.moderated) return send(200, { ...links, status: "nsfw" });
          if (made.still) return send(200, { status: "completed", request_id: id, expires_at: "2026-11-28T00:00:00Z", images: [{ url: `${base}/out/${id}.jpg` }] });
          return send(200, { status: "completed", request_id: id, expires_at: "2026-11-28T00:00:00Z", video: { url: `${base}/out/${id}.mp4` } });
        }
        if (req.method === "POST") {
          const estimate = path.startsWith("estimate/");
          const model = estimate ? path.slice("estimate/".length) : path;
          const input = JSON.parse(body) as Record<string, unknown>;
          if (!/^(bytedance|kling-video|alibaba|sand|marketing-studio|higgsfield-ai)\//.test(model)) return send(404, { detail: "Model not found" });
          const still = /^(marketing-studio|higgsfield-ai)\//.test(model);
          if (typeof input.duration === "number" && !Number.isInteger(input.duration)) return send(422, { detail: [{ type: "int_from_float", loc: ["body", "duration"], msg: "Input should be a valid integer" }] });
          if (estimate) {
            higgsfield.estimates.push(model);
            return send(200, { usd: still ? "0.0212" : "0.4708" });
          }
          const key = String(req.headers["idempotency-key"] ?? "");
          if (!key) return send(400, { detail: "This stand-in wants an Idempotency-Key" });
          higgsfield.keys.push(key);
          if (String(input.prompt).includes("broke")) return send(403, { detail: "Insufficient balance" });
          if (!higgsfield.jobs.has(key)) {
            higgsfield.submits.push({ model, body: input });
            const id = `hf_${higgsfield.submits.length}`;
            higgsfield.jobs.set(key, id);
            higgsfield.made.set(id, { moderated: !!refuse && String(input.prompt).includes(refuse), still });
          }
          const id = higgsfield.jobs.get(key)!;
          return send(200, { status: "queued", request_id: id, status_url: `${base}/higgsfield/requests/${id}/status`, cancel_url: `${base}/higgsfield/requests/${id}/cancel`, expires_after: 604800 });
        }
        return send(404, { detail: "Not Found" });
      }
      if (url.startsWith("/openrouter/")) {
        if (req.headers.authorization !== "Bearer test-key") return send(401, { error: { code: 401, message: "Invalid API key" } });
        const path = url.slice("/openrouter".length);
        if (req.method === "GET" && path === "/key") {
          return send(200, { data: { label: "sk-or-v1-test", limit: 25, limit_remaining: 18.5, is_free_tier: false } });
        }
        if (req.method === "POST" && path === "/images") {
          const input = JSON.parse(body) as Record<string, unknown>;
          if (String(input.prompt).includes("broke")) return send(402, { error: { code: 402, message: "Insufficient credits" } });
          if (String(input.prompt).includes("huge")) return send(413, { error: { code: 413, message: "Payload too large" } });
          if (refuse && String(input.prompt).includes(refuse)) return send(400, { error: { code: 400, message: "Provider returned error", metadata: { raw: "Safety policy blocked" } } });
          openrouter.images.push(input);
          return send(200, {
            created: 1795000000,
            data: [{ b64_json: Buffer.from("an openrouter picture").toString("base64"), media_type: input.output_format === "jpeg" ? "image/jpeg" : "image/png" }],
            usage: { cost: 0.0195 },
          });
        }
        if (req.method === "POST" && path === "/videos") {
          const input = JSON.parse(body) as Record<string, unknown>;
          if (String(input.prompt ?? "").includes("broke")) return send(402, { error: { code: 402, message: "Insufficient credits" } });
          if (String(input.prompt ?? "").includes("huge")) return send(413, { error: { code: 413, message: "Request payload too large" } });
          openrouter.videos.push(input);
          const id = `gen-vid-${openrouter.videos.length}`;
          const prompt = String(input.prompt ?? "");
          openrouter.jobs.set(id, {
            ...(refuse && prompt.includes(refuse) ? { fail: "Upstream moderation blocked", failCost: prompt.includes("billed") ? 0.44 : 0 } : {}),
            ...(prompt.includes("unsigned") ? { unsignedOnly: true } : {}),
          });
          return send(202, { id, polling_url: `/api/v1/videos/${id}`, status: "pending" });
        }
        const content = path.match(/^\/videos\/([^/]+)\/content$/);
        if (req.method === "GET" && content) {
          openrouter.authedDownloads++;
          return send(200, readFileSync(clipMade), "video/mp4");
        }
        const vid = path.match(/^\/videos\/([^/]+)$/)?.[1];
        const info = vid ? openrouter.jobs.get(vid) : undefined;
        if (req.method === "GET" && vid && info) {
          const n = (polls.get(vid) ?? 0) + 1;
          polls.set(vid, n);
          if (n < 3) return send(200, { id: vid, polling_url: `/api/v1/videos/${vid}`, status: n === 1 ? "pending" : "in_progress" });
          if (info.fail) return send(200, { id: vid, polling_url: `/api/v1/videos/${vid}`, status: "failed", error: info.fail, usage: { cost: info.failCost ?? 0 } });
          return send(200, {
            id: vid,
            polling_url: `/api/v1/videos/${vid}`,
            status: "completed",
            ...(info.unsignedOnly ? { unsigned_urls: [`/api/v1/videos/${vid}/content`] } : { urls: [`${base}/out/${vid}.mp4`] }),
            usage: { cost: 0.4412 },
          });
        }
        return send(404, { error: { code: 404, message: "Not found" } });
      }
      if (req.headers.authorization !== "Key test-key" && !url.startsWith("/out/") && !url.startsWith("/upload/")) return send(401, { detail: "no" });
      if (url.startsWith("/rest/storage/upload/initiate")) {
        seen.uploads++;
        return send(200, { upload_url: `${base}/upload/${seen.uploads}`, file_url: `${base}/out/uploaded-${seen.uploads}.jpg` });
      }
      if (url.startsWith("/upload/")) return send(200, {});
      if (url.startsWith("/out/")) return send(200, url.endsWith(".mp4") ? readFileSync(clipMade) : Buffer.from("a picture"), url.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
      const status = url.match(/^\/queue\/([^/]+\/[^/]+)\/requests\/([^/]+)\/status/);
      if (status) {
        const n = (polls.get(status[2]!) ?? 0) + 1;
        polls.set(status[2]!, n);
        return send(200, n === 1 ? { status: "IN_QUEUE", queue_position: 2 } : n === 2 ? { status: "IN_PROGRESS" } : { status: "COMPLETED" });
      }
      const result = url.match(/^\/queue\/([^/]+\/[^/]+)\/requests\/([^/]+)$/);
      if (result) {
        const video = !/banana|image/.test(result[1]!);
        return send(200, video ? { video: { url: `${base}/out/${result[2]}.mp4`, content_type: "video/mp4" } } : { images: [{ url: `${base}/out/${result[2]}.jpg`, content_type: "image/jpeg" }], seed: 7 });
      }
      if (req.method === "POST" && url.startsWith("/queue/")) {
        const endpoint = url.slice("/queue/".length);
        const input = JSON.parse(body) as Record<string, unknown>;
        if (refuse && String(input.prompt).includes(refuse)) return send(422, { detail: [{ loc: ["body", "prompt"], msg: "was flagged by the safety checker" }] });
        seen.submits.push({ endpoint, input });
        const id = `r${seen.submits.length}`;
        const app = `${base}/queue/${endpoint.split("/").slice(0, 2).join("/")}/requests/${id}`;
        return send(200, { request_id: id, status_url: `${app}/status`, response_url: app, cancel_url: `${app}/cancel` });
      }
      send(404, { detail: `nothing at ${url}` });
    });
  });
  keepLoopTurning();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.BEATSHEET_FAL_QUEUE = `${base}/queue`;
  process.env.BEATSHEET_FAL_REST = `${base}/rest`;
  process.env.BEATSHEET_OPENAI = `${base}/direct/openai`;
  process.env.BEATSHEET_META = `${base}/direct/meta`;
  process.env.BEATSHEET_GEMINI = `${base}/gemini`;
  process.env.BEATSHEET_TEIN = `${base}/tein`;
  process.env.BEATSHEET_RUNWAY = `${base}/runway`;
  process.env.BEATSHEET_HIGGSFIELD = `${base}/higgsfield`;
  process.env.BEATSHEET_OPENROUTER = `${base}/openrouter`;
  make = await import("../src/make.ts");
  store = await import("../src/store.ts");
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

// A 9:16 cut of the cat video with two placeholder shots, and the cat's photo.
const PROJECT = "cat";
beforeEach(() => {
  seen = { submits: [], uploads: 0, direct: [] };
  tein = { submits: [], keys: [], uploads: 0, jobs: new Map() };
  runway = { submits: [], uploads: [], stored: 0, tasks: new Map(), cancelled: [] };
  higgsfield = { submits: [], keys: [], uploads: [], stored: 0, estimates: [], jobs: new Map(), made: new Map(), cancelled: [] };
  openrouter = { images: [], videos: [], jobs: new Map(), authedDownloads: 0 };
  refuse = undefined;
  plans.ready = [];
  plans.asks = [];
  settings.services = {};
  settings.make = undefined;
  polls.clear();
  const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cat.jpg"), "the cat");
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: PROJECT,
    title: "A day in the life of my cat",
    sources: [],
    brief: { goal: "60 seconds: the cat's secret life of crime" },
    assets: [{ id: "cat-photo", kind: "image", path: join(dir, "cat.jpg"), width: 1080, height: 1440 }],
    cast: [
      { id: "cat", name: "the cat", kind: "character", about: "orange tabby, white chest", seen: [{ asset: "cat-photo" }], variants: [{ id: "heist", about: "a tiny black eye mask" }] },
      { id: "alley", name: "the alley", kind: "place", about: "narrow, wet brick" },
    ],
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "film",
        spec: {},
        formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [
          { id: "s1", track: "pic", duration: 2.5, content: { kind: "placeholder", description: "The cat slips out through the cat flap at dawn" }, fidelity: "idea" },
          { id: "s2", track: "pic", duration: 3.2, content: { kind: "placeholder", description: "The cat strolls down the alley like it owns it" }, fidelity: "idea" },
        ],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
});

const shot = (id: string) => store.loadProject(PROJECT).project.shots.find((s) => s.id === id)!;

describe("making takes for a shot", () => {
  it("makes two boards for a placeholder, which becomes a generated shot showing the first", async () => {
    const { fit, jobs } = make.startMake(PROJECT, { op: "image", shot: "s2", count: 2 });
    expect(fit).toMatchObject({ model: "nano-banana-2.1", route: "fal", aspect: "9:16", usd: 0.08 });
    expect(jobs).toHaveLength(2);
    await make.driveJobs(PROJECT);

    expect(seen.submits.map((s) => s.endpoint)).toEqual(["google/nano-banana-2.1", "google/nano-banana-2.1"]);
    expect(seen.submits[0]!.input).toMatchObject({ prompt: "The cat strolls down the alley like it owns it", aspect_ratio: "9:16", num_images: 1 });
    expect(make.listJobs(PROJECT).map((j) => j.status)).toEqual(["done", "done"]);
    const s = shot("s2");
    expect(s.fidelity).toBe("board");
    expect(s.content).toMatchObject({ kind: "generated", take: "s2-take", takes: ["s2-take", "s2-take-2"], model: "nano-banana-2.1", provider: "fal" });
    const assets = store.loadProject(PROJECT).project.assets;
    const take = assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ source: "generated", provider: "fal", model: "google/nano-banana-2.1", seed: 7, op: "image", costUsd: 0.04 });
    expect(readFileSync(take.path, "utf8")).toBe("a picture");
    // The two are made side by side, so either can come back first and be the one shown; each is its own job's.
    expect(["s2-take", "s2-take-2"].map((id) => assets.find((a) => a.id === id)!.provenance!.job).sort()).toEqual(jobs.map((j) => j.id).sort());
    // Asked for together, they're listed in the order they were asked for.
    expect(make.listJobs(PROJECT).map((j) => j.id)).toEqual(jobs.map((j) => j.id));
  });

  it("animates a board: uploads it, asks for the next length over the shot's, and the shot opens on it", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
    const { fit } = make.startMake(PROJECT, { op: "video", shot: "s2", start: "s2-take", model: "kling-2.5-turbo" });
    expect(fit).toMatchObject({ model: "kling-2.5-turbo", endpoint: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", seconds: 5, usd: 0.35 });
    await make.driveJobs(PROJECT);

    expect(seen.uploads).toBe(1);
    expect(seen.submits[1]!.input).toEqual({ prompt: "The cat strolls down the alley like it owns it", duration: "5", image_url: `${base}/out/uploaded-1.jpg` });
    const s = shot("s2");
    // The 6-second take covers the 3.2-second shot, which starts on the board it was made from.
    expect(s.content).toMatchObject({ kind: "generated", take: "s2-take-2", takes: ["s2-take", "s2-take-2"], start: "s2-take" });
    expect(s.content).not.toHaveProperty("in");
    expect(s.fidelity).toBe("rough");
  });

  it("picks a job up again after a restart, from where the service has it, without sending it twice", async () => {
    const [job] = make.startMake(PROJECT, { op: "image", shot: "s1" }).jobs;
    await make.driveJobs(PROJECT);
    // Pretend the process stopped after sending: the job is running at fal, and its lock is a dead process's.
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT, "jobs");
    const saved = JSON.parse(readFileSync(join(dir, `${job!.id}.json`), "utf8")) as import("../src/make.ts").MakeJob;
    const assets = store.loadProject(PROJECT).project.assets.filter((a) => a.id !== saved.asset);
    store.updateFile(PROJECT, (d) => {
      d.assets = assets;
      const s = d.cuts[0]!.shots.find((x) => x.id === "s1")!;
      s.content = { kind: "placeholder", description: "The cat slips out through the cat flap at dawn" };
      s.fidelity = "idea";
    });
    writeFileSync(join(dir, `${job!.id}.json`), JSON.stringify({ ...saved, status: "running", asset: undefined }));
    writeFileSync(join(dir, `${job!.id}.lock`), "999999");
    polls.clear();

    await make.driveJobs(PROJECT);
    expect(seen.submits).toHaveLength(1);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", asset: "s1-take" });
    expect(shot("s1").content).toMatchObject({ kind: "generated", take: "s1-take" });
  });

  it("gives fal's reason when it won't make something", async () => {
    refuse = "alley";
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "failed", error: "prompt: was flagged by the safety checker" });
    expect(shot("s2").content.kind).toBe("placeholder");
  });

  it("refuses what can't be made before sending anything", () => {
    expect(() => make.startMake(PROJECT, { op: "video", shot: "s2", start: "nope" })).toThrow('no asset "nope"');
    expect(() => make.startMake(PROJECT, { op: "video", prompt: "a long walk", seconds: 40 })).toThrow(/Makes up to (10|15|30)s; this shot is 40s/);
    expect(() => make.startMake(PROJECT, { op: "video", shot: "s2", model: "nano-banana" })).toThrow("doesn't make video");
    expect(seen.submits).toHaveLength(0);
  });
});

describe("Seedance 2.5 through Tein", () => {
  const board = async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
  };

  it("runs there as soon as Tein is connected (cheaper by default, or via Tein when another is preferred): the board sent up, the job followed, and what Tein charged kept", async () => {
    await board();
    const ask = { op: "video" as const, shot: "s2", prompt: "A red kite climbs over the hill", start: "s2-take", model: "seedance-2.5" };
    expect(make.makeChoices(PROJECT, ask).choices.ready.find((f) => f.model === "seedance-2.5")).toMatchObject({ route: "fal" });
    // Once Tein is connected, it's ready right away and cheaper than fal, with fal offered alongside it.
    settings.services = { tein: { addedAt: "2026-11-19" } };
    expect(make.makeChoices(PROJECT, ask).choices.ready.find((f) => f.model === "seedance-2.5")).toMatchObject({ route: "tein", also: [{ route: "fal" }] });
    // Preferring fal keeps Seedance on fal by default while explicit via: "tein" still works without switching.
    provider({ video: "fal" });
    expect(make.makeChoices(PROJECT, ask).choices.ready.find((f) => f.model === "seedance-2.5")).toMatchObject({ route: "fal", also: [{ route: "tein" }] });
    const { fit, jobs } = make.startMake(PROJECT, { ...ask, via: "tein" });
    expect(fit).toMatchObject({ model: "seedance-2.5", route: "tein", where: "Tein", endpoint: "seedance-2-5" });
    expect(fit).not.toHaveProperty("also");
    expect(fit.usd).toBeCloseTo(0.1355 * fit.seconds!, 3);
    await make.driveJobs(PROJECT);

    expect(tein.uploads).toBe(1);
    expect(tein.submits).toEqual([
      { model: "seedance-2-5", prompt: "A red kite climbs over the hill", duration: fit.seconds, resolution: "480p", ratio: "adaptive", first_frame: `${base}/out/tein-upload-1.jpg`, idempotency_key: expect.any(String) },
    ]);
    // Nothing went to fal but the board.
    expect(seen.submits).toHaveLength(1);
    expect(make.listJobs(PROJECT).find((j) => j.id === jobs[0]!.id)).toMatchObject({ status: "done", route: "tein", charged: true, usd: 0.5288, remote: { id: "gen_1" } });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take-2")!;
    expect(take.provenance).toMatchObject({ source: "generated", provider: "tein", model: "seedance-2-5", costUsd: 0.5288, refs: ["s2-take"] });
    expect(shot("s2").content).toMatchObject({ kind: "generated", take: "s2-take-2", provider: "tein", model: "seedance-2.5" });
  });

  it("draws someone from the person's own photos there and nowhere else, even when another provider is preferred", async () => {
    await board();
    // The cat's photo hasn't been looked through for faces, so the cat is taken to be a person.
    const ask = { op: "video" as const, shot: "s2", prompt: "@cat strolls down the wet street", start: "s2-take", model: "seedance-2.5" };
    expect(() => make.startMake(PROJECT, ask)).toThrow("Seedance 2.5 can't make this: With real people in it, runs only on Tein");
    settings.services = { tein: { addedAt: "2026-11-19" } };
    provider({ video: "fal" });
    expect(() => make.startMake(PROJECT, { ...ask, via: "fal" })).toThrow("Won't draw real people on fal, and the cat is from your own photos; it does on Tein");
    // Even with fal preferred, Tein is connected and handles real faces automatically without switching.
    const { fit } = make.startMake(PROJECT, ask);
    expect(fit).toMatchObject({ route: "tein" });
    expect(fit).not.toHaveProperty("also");
    await make.driveJobs(PROJECT);
    // It starts from the board, so the cat's own pictures aren't sent as references as well: Tein doesn't take both.
    expect(tein.uploads).toBe(1);
    expect(tein.submits[0]).toMatchObject({ first_frame: `${base}/out/tein-upload-1.jpg`, ratio: "adaptive" });
    expect(tein.submits[0]).not.toHaveProperty("reference_image");
    expect(shot("s2").content).toMatchObject({ take: "s2-take-2", provider: "tein" });
  });

  it("sends a request again under the same key after a stop, so it isn't made twice, and under a new one when it's tried again", async () => {
    await board();
    settings.services = { tein: { addedAt: "2026-11-19" } };
    provider({ video: "tein" });
    const [job] = make.startMake(PROJECT, { op: "video", shot: "s2", prompt: "A red kite climbs over the hill", start: "s2-take", model: "seedance-2.5" }).jobs;
    await make.driveJobs(PROJECT);
    // Pretend the process stopped after Tein took the request but before the job was saved with it.
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT, "jobs");
    const saved = JSON.parse(readFileSync(join(dir, `${job!.id}.json`), "utf8")) as import("../src/make.ts").MakeJob;
    expect(saved.once).toEqual(expect.any(String));
    store.updateFile(PROJECT, (d) => {
      d.assets = d.assets.filter((a) => a.id !== saved.asset);
      const s = d.cuts[0]!.shots.find((x) => x.id === "s2")!;
      s.content = { kind: "generated", prompt: "The cat strolls down the alley like it owns it", take: "s2-take", takes: ["s2-take"] };
      s.fidelity = "board";
    });
    writeFileSync(join(dir, `${job!.id}.json`), JSON.stringify({ ...saved, status: "queued", remote: undefined, charged: undefined, asset: undefined }));
    writeFileSync(join(dir, `${job!.id}.lock`), "999999");
    polls.clear();
    await make.driveJobs(PROJECT);
    expect(tein.keys).toEqual([saved.once, saved.once]);
    expect(tein.submits).toHaveLength(1);
    expect(make.listJobs(PROJECT).find((j) => j.id === job!.id)).toMatchObject({ status: "done", remote: { id: "gen_1" } });

    // One Tein wouldn't make says why, and trying it again is a new request.
    refuse = "kite";
    const [refused] = make.startMake(PROJECT, { op: "video", shot: "s1", prompt: "A red kite climbs over the hill", model: "seedance-2.5" }).jobs;
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT).find((j) => j.id === refused!.id)).toMatchObject({ status: "failed", error: "Content moderation blocked the request or its output. Nothing is charged." });
    refuse = undefined;
    make.retryJobs(PROJECT, [refused!.id]);
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT).find((j) => j.id === refused!.id)).toMatchObject({ status: "done", remote: { id: "gen_2" } });
    expect(tein.keys[3]).not.toBe(tein.keys[2]);
    // From a prompt alone it's asked for the cut's shape.
    expect(tein.submits[1]).toMatchObject({ ratio: "9:16" });
    expect(tein.submits[1]).not.toHaveProperty("first_frame");
  });

  it("asks for a final at 1080p, an end frame with its start, and references only when nothing starts it", async () => {
    const { teinInput } = await import("../src/tein.ts");
    expect(teinInput("seedance-2.5", "seedance-2-5", { prompt: "x", quality: "final", seconds: 5.2, start: "u", end: "v", refs: ["a"] })).toEqual({ model: "seedance-2-5", prompt: "x", duration: 6, resolution: "1080p", ratio: "adaptive", first_frame: "u", last_frame: "v" });
    expect(teinInput("seedance-2.5", "seedance-2-5", { prompt: "x", seconds: 4, aspect: "16:9", refs: ["a", "b"] })).toEqual({
      model: "seedance-2-5",
      prompt: "x The 2 reference pictures show who and what is in it.",
      duration: 4,
      resolution: "480p",
      ratio: "16:9",
      reference_image: ["a", "b"],
    });
    expect(() => teinInput("kling", "kling-4", { prompt: "x" })).toThrow('no way to ask Tein for "kling" models yet');
  });
});

describe("Runway as the provider", () => {
  const connect = () => void (settings.services = { runway: { addedAt: "2026-11-21" } });

  it("is ready alongside other connected providers, respects a preferred video provider, and sends the board, follows the task, and keeps what Runway charged", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
    const ask = { op: "video" as const, shot: "s2", prompt: "A red kite climbs over the hill", start: "s2-take", model: "seedance-2.5" };
    // Once Runway is connected, it's ready right away; preferring fal keeps Auto and shared models on fal while Runway stays selectable.
    connect();
    provider({ video: "fal" });
    expect(make.makeChoices(PROJECT, ask).choices.ready.find((f) => f.model === "seedance-2.5")).toMatchObject({ route: "fal", also: [{ route: "runway" }] });
    // Runway-only capabilities (Kling 3 Pro from a prompt alone) work immediately even when fal is preferred.
    expect(make.makeChoices(PROJECT, { op: "video", shot: "s1", quality: "final" }).choices.ready.find((f) => f.model === "kling-3")).toMatchObject({ route: "runway" });
    const onFal = make.startMake(PROJECT, { op: "video", shot: "s1", model: "kling-4" });
    expect(onFal.fit).toMatchObject({ route: "fal" });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT).find((j) => j.id === onFal.jobs[0]!.id)).toMatchObject({ status: "done", route: "fal" });
    expect(runway).toMatchObject({ submits: [], uploads: [] });

    provider({ video: "runway" });
    const { fit, jobs } = make.startMake(PROJECT, ask);
    expect(fit).toMatchObject({ model: "seedance-2.5", route: "runway", where: "Runway", endpoint: "seedance2_5", seconds: 4, also: [{ route: "fal" }] });
    // Four seconds at 20¢ is the least Runway charges for a take.
    expect(fit.usd).toBe(0.8);
    await make.driveJobs(PROJECT);

    // The board went to the address Runway gave for it, and the take is asked for in the board's shape (1080×1920).
    expect(runway).toMatchObject({ uploads: [expect.stringMatching(/\.jpg$/)], stored: 1 });
    expect(runway.submits).toEqual([
      { path: "image_to_video", body: { model: "seedance2_5", promptImage: [{ uri: "runway://upload-1", position: "first" }], promptText: "A red kite climbs over the hill", ratio: "480:854", duration: 4 } },
    ]);
    // Nothing more went to fal: the board and the take made while it was preferred.
    expect(seen.submits).toHaveLength(2);
    // 64 credits, at a cent each, in place of the estimate.
    expect(make.listJobs(PROJECT).find((j) => j.id === jobs[0]!.id)).toMatchObject({ status: "done", route: "runway", charged: true, usd: 0.64, remote: { id: "task_1" } });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take-2")!;
    expect(take.provenance).toMatchObject({ source: "generated", provider: "runway", model: "seedance2_5", costUsd: 0.64, refs: ["s2-take"] });
    expect(shot("s2").content).toMatchObject({ kind: "generated", take: "s2-take-2", provider: "runway", model: "seedance-2.5" });
  });

  it("makes stills there when Runway is preferred for stills, with the cast's pictures as references", async () => {
    connect();
    expect(make.makeChoices(PROJECT, { op: "image", shot: "s2" }).choices.auto).toMatchObject({ route: "fal" });
    provider({ image: "runway" });
    const { fit, jobs } = make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    expect(fit).toMatchObject({ model: "nano-banana-2.1", route: "runway", endpoint: "nano_banana_2.1", aspect: "16:9", usd: 0.04, also: [{ route: "fal" }] });
    await make.driveJobs(PROJECT);

    expect(runway.uploads).toEqual(["cat.jpg"]);
    expect(runway.submits).toEqual([{ path: "text_to_image", body: { model: "nano_banana_2.1", promptText: expect.stringMatching(/^A photographic reference sheet of the cat/), ratio: "1376:768", referenceImages: [{ uri: "runway://upload-1" }] } }]);
    expect(seen.submits).toHaveLength(0);
    expect(make.listJobs(PROJECT).find((j) => j.id === jobs[0]!.id)).toMatchObject({ status: "done", route: "runway", charged: true, usd: 0.04 });
    const sheet = store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-sheet")!;
    expect(sheet.provenance).toMatchObject({ provider: "runway", model: "nano_banana_2.1", costUsd: 0.04, refs: ["cat-photo"] });
    expect(readFileSync(sheet.path, "utf8")).toBe("a picture");
    // Video is still Auto's pick on fal.
    expect(make.makeChoices(PROJECT, { op: "video", shot: "s1" }).choices.auto).toMatchObject({ route: "fal" });
  });

  it("keeps what a take its moderation turned down cost, and doesn't send it again when it's tried again", async () => {
    connect();
    provider({ video: "runway" });
    refuse = "kite";
    const [job] = make.startMake(PROJECT, { op: "video", shot: "s1", prompt: "A red kite climbs over the hill", model: "kling-4" }).jobs;
    await make.driveJobs(PROJECT);
    // From a prompt alone it's asked for the cut's shape, at a rough's size.
    expect(runway.submits).toEqual([{ path: "text_to_video", body: { model: "kling_4", promptText: "A red kite climbs over the hill", ratio: "720:1280", duration: expect.any(Number) } }]);
    const failed = { status: "failed", charged: true, usd: 0.8, error: "Runway's moderation turned down what it was asked or given, and charges for the take all the same: The prompt was flagged." };
    expect(make.listJobs(PROJECT).find((j) => j.id === job!.id)).toMatchObject(failed);
    // It counts toward what's been spent, though it failed.
    expect(make.spentSince(job!.createdAt)).toBe(0.8);
    expect(shot("s1").content.kind).toBe("placeholder");
    refuse = undefined;
    make.retryJobs(PROJECT, [job!.id]);
    await make.driveJobs(PROJECT);
    expect(runway.submits).toHaveLength(1);
    expect(make.listJobs(PROJECT).find((j) => j.id === job!.id)).toMatchObject(failed);
  });

  it("says which field Runway didn't like, and stops a task that's asked to stop", async () => {
    const { runwaySubmit, runwayStatus, runwayCancel } = await import("../src/runway.ts");
    await expect(runwaySubmit("test-key", { path: "text_to_video", body: { model: "kling_4", promptText: "x", duration: 4.5 } })).rejects.toMatchObject({ message: "Validation of body failed; duration: Expected integer, received float", final: true });
    await expect(runwaySubmit("wrong", { path: "text_to_video", body: {} })).rejects.toMatchObject({ message: expect.stringContaining("Runway refused the key"), final: true });
    const { remote, usd } = await runwaySubmit("test-key", { path: "text_to_video", body: { model: "kling_4", promptText: "x", duration: 4 } });
    expect(usd).toBe(0.8);
    // Held back by the account's limit is waiting, like any other.
    expect(await runwayStatus("test-key", remote)).toEqual({ state: "queued" });
    expect(await runwayStatus("test-key", remote)).toEqual({ state: "running" });
    expect(await runwayStatus("test-key", remote)).toEqual({ state: "done", url: `${base}/out/task_1.mp4`, usd: 0.64 });
    await runwayCancel("test-key", remote);
    expect(runway.cancelled).toEqual(["task_1"]);
    await expect(runwayStatus("test-key", { ...remote, id: "nope" })).rejects.toMatchObject({ message: "Not found.", final: true });
  });

  it("asks each model for what it takes there", async () => {
    const { runwayInput } = await import("../src/runway.ts");
    const first = [{ uri: "u", position: "first" }];
    const frames = [...first, { uri: "v", position: "last" }];
    // Seedance: a final at 1080p in the picture's shape, an end frame with its start, and references only when nothing starts it.
    expect(runwayInput("seedance2_5", "seedance2_5", { prompt: "x", quality: "final", seconds: 5.2, aspect: "3:4", start: "u", end: "v", refs: ["a"] })).toEqual({
      path: "image_to_video",
      body: { model: "seedance2_5", promptImage: frames, promptText: "x", ratio: "1248:1664", duration: 6 },
    });
    expect(runwayInput("seedance2_5", "seedance2_5", { prompt: "x", seconds: 4, aspect: "16:9", refs: ["a", "b"], camera: { url: "c", blockout: false } })).toEqual({
      path: "text_to_video",
      body: {
        model: "seedance2_5",
        promptText: "x The 2 reference pictures show who and what is in it. The reference video sets the camera: keep its move, its framing, its timing and where its cuts fall.",
        ratio: "854:480",
        duration: 4,
        references: [{ uri: "a" }, { uri: "b" }],
        referenceVideos: [{ type: "video", uri: "c" }],
      },
    });
    // Kling 4.0 keeps a picture's shape and is told only the size; from a prompt, the size in the shape wanted.
    expect(runwayInput("kling_4", "kling_4", { prompt: "x", quality: "final", seconds: 12, start: "u", end: "v", aspect: "9:16" }).body).toEqual({ model: "kling_4", promptImage: frames, promptText: "x", ratio: "auto_1080p", duration: 12 });
    expect(runwayInput("kling_4", "kling_4", { prompt: "x", seconds: 3, aspect: "21:9" }).body).toEqual({ model: "kling_4", promptText: "x", ratio: "1460:624", duration: 3 });
    expect(runwayInput("kling2.5_turbo_pro", "kling2.5_turbo_pro", { prompt: "x", seconds: 5, start: "u", aspect: "9:16" }).body).toEqual({ model: "kling2.5_turbo_pro", promptImage: first, promptText: "x", duration: 5 });
    expect(runwayInput("kling2.5_turbo_pro", "kling2.5_turbo_pro", { prompt: "x", seconds: 10, aspect: "1:1" }).body).toEqual({ model: "kling2.5_turbo_pro", promptText: "x", duration: 10, ratio: "1440:1440" });
    // Kling 3 Pro without its own sound, which is the cheaper rate.
    expect(runwayInput("kling3.0", "kling3.0_pro", { prompt: "x", seconds: 7, start: "u" }).body).toEqual({ model: "kling3.0_pro", promptImage: first, promptText: "x", duration: 7, audio: false });
    expect(runwayInput("wan3", "wan3", { prompt: "x", seconds: 5, start: "u", refs: ["a"] })).toEqual({ path: "image_to_video", body: { model: "wan3", promptImage: first, promptText: "x", ratio: "auto_480p", duration: 5, audio: true } });
    expect(runwayInput("wan3", "wan3", { prompt: "x", quality: "final", seconds: 30, aspect: "4:3", refs: ["a"] }).body).toEqual({
      model: "wan3",
      promptText: "x The reference picture shows who and what is in it.",
      ratio: "1648:1248",
      duration: 30,
      audio: true,
      references: [{ uri: "a" }],
    });
    // MiniMax H3 at 768p, by shape: the nearest it makes to a 4:5 board is 3:4.
    expect(runwayInput("hailuo3", "hailuo3", { prompt: "x", seconds: 5.5, start: "u", aspect: "4:5" }).body).toEqual({ model: "hailuo3", promptImage: first, promptText: "x", resolution: "768P", ratio: "3:4", duration: 6 });
    // Gemini Omni Flash is wide or tall only, even from a square picture.
    expect(runwayInput("gemini_omni_flash_1.1", "gemini_omni_flash_1.1", { prompt: "x", quality: "final", seconds: 8, start: "u", aspect: "4:5" }).body).toMatchObject({ ratio: "1080:1920", duration: 8 });
    expect(runwayInput("gemini_omni_flash_1.1", "gemini_omni_flash_1.1", { prompt: "x", seconds: 3, aspect: "16:9" })).toEqual({ path: "text_to_video", body: { model: "gemini_omni_flash_1.1", promptText: "x", ratio: "640:360", duration: 3 } });
    // Stills at each model's own 1K sizes; GPT Image at medium quality, as on its other routes.
    expect(runwayInput("gemini_2.5_flash", "gemini_2.5_flash", { prompt: "x", aspect: "9:16" })).toEqual({ path: "text_to_image", body: { model: "gemini_2.5_flash", promptText: "x", ratio: "768:1344" } });
    expect(runwayInput("muse_image", "muse_image", { prompt: "x", aspect: "4:5", refs: ["a"] }).body).toEqual({ model: "muse_image", promptText: "x", ratio: "1344:1792", referenceImages: [{ uri: "a" }], outputFormat: "jpeg" });
    expect(runwayInput("gpt_image_2_6", "gpt_image_2_6_sunburst", { prompt: "x", aspect: "9:16" }).body).toEqual({ model: "gpt_image_2_6_sunburst", promptText: "x", ratio: "1088:1920", quality: "medium", outputFormat: "jpeg" });
    expect(() => runwayInput("gen4.5", "gen4.5", { prompt: "x" })).toThrow('no way to ask Runway for "gen4.5" models yet');
  });
});

describe("Higgsfield as the provider", () => {
  const connect = () => void (settings.services = { higgsfield: { addedAt: "2026-11-21" } });
  const job = (id: string) => make.listJobs(PROJECT).find((j) => j.id === id)!;

  it("is ready alongside other connected providers, respects a preferred video provider, and sends the board, keeps the quoted price, and follows the job", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
    const ask = { op: "video" as const, shot: "s2", prompt: "A red kite climbs over the hill", start: "s2-take", model: "seedance-2.5" };
    // Once Higgsfield is connected, it's ready right away and cheaper than fal; preferring fal keeps fal default while via: "higgsfield" still works.
    connect();
    expect(make.makeChoices(PROJECT, ask).choices.ready.find((f) => f.model === "seedance-2.5")).toMatchObject({ route: "higgsfield", also: [{ route: "fal" }] });
    provider({ video: "fal" });
    expect(make.makeChoices(PROJECT, ask).choices.ready.find((f) => f.model === "seedance-2.5")).toMatchObject({ route: "fal", also: [{ route: "higgsfield" }] });
    expect(higgsfield).toMatchObject({ submits: [], uploads: [] });

    provider({ video: "higgsfield" });
    const { fit, jobs } = make.startMake(PROJECT, ask);
    const model = "bytedance/seedance-2.5/image-to-video";
    expect(fit).toMatchObject({ model: "seedance-2.5", route: "higgsfield", where: "Higgsfield", endpoint: model, seconds: 4, also: [{ route: "fal" }] });
    // Four seconds at $0.1177.
    expect(fit.usd).toBe(0.471);
    await make.driveJobs(PROJECT);

    // The board went to the address Higgsfield gave for it, and the take keeps the board's shape: none is asked for.
    expect(higgsfield).toMatchObject({ uploads: ["image/jpeg"], stored: 1, estimates: [model] });
    expect(higgsfield.submits).toEqual([{ model, body: { prompt: "A red kite climbs over the hill", image_url: `${base}/out/hf-upload-1.jpg`, duration: 4, resolution: "480p" } }]);
    // Nothing more went to fal than the board.
    expect(seen.submits).toHaveLength(1);
    // What Higgsfield said the request would cost, in place of the estimate; sent under the job's own key.
    const done = job(jobs[0]!.id);
    expect(done).toMatchObject({ status: "done", route: "higgsfield", charged: true, usd: 0.4708, remote: { id: "hf_1" } });
    expect(higgsfield.keys).toEqual([done.once]);
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take-2")!;
    expect(take.provenance).toMatchObject({ source: "generated", provider: "higgsfield", model, costUsd: 0.4708, refs: ["s2-take"] });
    expect(shot("s2").content).toMatchObject({ kind: "generated", take: "s2-take-2", provider: "higgsfield", model: "seedance-2.5" });
  });

  it("charges nothing for a take its moderation turns down, and makes it afresh when it's tried again", async () => {
    connect();
    provider({ video: "higgsfield" });
    refuse = "kite";
    const [started] = make.startMake(PROJECT, { op: "video", shot: "s1", prompt: "A red kite climbs over the hill", model: "kling-4" }).jobs;
    await make.driveJobs(PROJECT);
    // From a prompt alone it's asked for the cut's shape, at a rough's size.
    expect(higgsfield.submits).toEqual([{ model: "kling-video/v4.0/text-to-video", body: { prompt: "A red kite climbs over the hill", aspect_ratio: "9:16", duration: expect.any(Number), resolution: "720p" } }]);
    const failed = job(started!.id);
    expect(failed).toMatchObject({ status: "failed", error: "Higgsfield's moderation turned this down (what it was asked or given, or what it made). Nothing is charged for it." });
    expect(failed.charged).toBeFalsy();
    expect(make.spentSince(started!.createdAt)).toBe(0);
    expect(shot("s1").content.kind).toBe("placeholder");
    // Nothing was made or paid for, so trying again is a new request, under a new key.
    refuse = undefined;
    make.retryJobs(PROJECT, [started!.id]);
    await make.driveJobs(PROJECT);
    expect(higgsfield.submits).toHaveLength(2);
    expect(new Set(higgsfield.keys).size).toBe(2);
    expect(job(started!.id)).toMatchObject({ status: "done", charged: true, remote: { id: "hf_2" } });
  });

  it("makes stills there once it's the stills provider: GPT Image with the cast's pictures as references, and Soul 2 from words alone", async () => {
    connect();
    expect(make.makeChoices(PROJECT, { op: "image", shot: "s2" }).choices.auto).toMatchObject({ route: "fal" });
    provider({ image: "higgsfield" });
    const { fit, jobs } = make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    const flare = "marketing-studio/image/flare";
    expect(fit).toMatchObject({ model: "gpt-image", route: "higgsfield", endpoint: flare, aspect: "16:9", usd: 0.04 });
    await make.driveJobs(PROJECT);
    expect(higgsfield.uploads).toEqual(["image/jpeg"]);
    expect(higgsfield.submits).toEqual([
      { model: flare, body: { prompt: expect.stringMatching(/^A photographic reference sheet of the cat/), quality: "medium", resolution: "1k", aspect_ratio: "16:9", image_urls: [`${base}/out/hf-upload-1.jpg`] } },
    ]);
    expect(seen.submits).toHaveLength(0);
    // What Higgsfield quoted for the picture, in place of the stand-in price here.
    expect(job(jobs[0]!.id)).toMatchObject({ status: "done", route: "higgsfield", charged: true, usd: 0.0212 });
    const sheet = store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-sheet")!;
    expect(sheet.provenance).toMatchObject({ provider: "higgsfield", model: flare, costUsd: 0.0212, refs: ["cat-photo"] });
    expect(readFileSync(sheet.path, "utf8")).toBe("a picture");

    // Soul 2 takes no pictures, so it isn't offered for a sheet made from one; from a prompt it is.
    expect(() => make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1, model: "soul-2" })).toThrow("Soul 2 can't make this");
    const soul = make.startMake(PROJECT, { op: "image", shot: "s1", prompt: "A wet alley at dusk", model: "soul-2" });
    expect(soul.fit).toMatchObject({ model: "soul-2", route: "higgsfield", endpoint: "higgsfield-ai/soul/v2/standard", usd: 0.006 });
    await make.driveJobs(PROJECT);
    expect(higgsfield.submits[1]).toEqual({ model: "higgsfield-ai/soul/v2/standard", body: { prompt: "A wet alley at dusk", resolution: "1080p", aspect_ratio: "9:16", enhance_prompt: false } });
    // Video is still made where it was.
    expect(make.makeChoices(PROJECT, { op: "video", shot: "s1" }).choices.auto).toMatchObject({ route: "fal" });
  });

  it("starts nothing new when a request is sent again under the same key", async () => {
    const { higgsfieldSubmit } = await import("../src/higgsfield.ts");
    const ask = { model: "alibaba/wan-3.0/text-to-video", body: { prompt: "x", duration: 5 } };
    const first = await higgsfieldSubmit("test-key", ask, "once-1");
    expect(await higgsfieldSubmit("test-key", ask, "once-1")).toEqual(first);
    expect(higgsfield.submits).toHaveLength(1);
    expect((await higgsfieldSubmit("test-key", ask, "once-2")).id).toBe("hf_2");
  });

  it("says what Higgsfield didn't like, follows a job by the addresses it gave, and sends the key nowhere else", async () => {
    const { higgsfieldSubmit, higgsfieldStatus, higgsfieldCancel, higgsfieldEstimate, higgsfieldUpload } = await import("../src/higgsfield.ts");
    const wan = { model: "alibaba/wan-3.0/text-to-video", body: { prompt: "x", duration: 5 } };
    await expect(higgsfieldSubmit("test-key", { ...wan, body: { prompt: "x", duration: 4.5 } }, "k1")).rejects.toMatchObject({ message: "duration: Input should be a valid integer", final: true });
    await expect(higgsfieldSubmit("wrong", wan, "k2")).rejects.toMatchObject({ message: expect.stringContaining("Higgsfield refused the key"), final: true });
    await expect(higgsfieldSubmit("test-key", { model: "veo/3", body: {} }, "k3")).rejects.toMatchObject({ message: "Higgsfield doesn't offer veo/3 to this account (Model not found)", final: true });
    await expect(higgsfieldSubmit("test-key", { ...wan, body: { prompt: "broke" } }, "k4")).rejects.toMatchObject({ message: expect.stringContaining("its balance is too low"), final: true, funds: true });
    // What it will cost comes as a string; not knowing is no error.
    expect(await higgsfieldEstimate("test-key", wan)).toBe(0.4708);
    expect(await higgsfieldEstimate("test-key", { model: "veo/3", body: {} })).toBeUndefined();

    const remote = await higgsfieldSubmit("test-key", wan, "k5");
    const at = `${base}/higgsfield/requests/hf_1`;
    expect(remote).toEqual({ id: "hf_1", status: `${at}/status`, response: `${at}/status`, cancel: `${at}/cancel` });
    expect(await higgsfieldStatus("test-key", remote)).toEqual({ state: "queued" });
    // Still waiting: it can be dropped.
    await higgsfieldCancel("test-key", remote);
    expect(higgsfield.cancelled).toEqual(["hf_1"]);
    expect(await higgsfieldStatus("test-key", remote)).toEqual({ state: "running" });
    // Once it has started it can't, which is left as it is.
    await higgsfieldCancel("test-key", remote);
    expect(higgsfield.cancelled).toEqual(["hf_1"]);
    expect(await higgsfieldStatus("test-key", remote)).toEqual({ state: "done", url: `${base}/out/hf_1.mp4` });
    await expect(higgsfieldStatus("test-key", { ...remote, status: `${at.replace("/higgsfield/", "/elsewhere/")}/status` })).rejects.toMatchObject({ message: expect.stringContaining("isn't its own"), final: true });
    await expect(higgsfieldStatus("test-key", { ...remote, status: `${base}/higgsfield/requests/nope/status` })).rejects.toMatchObject({ message: "Request not found", final: true });
    await expect(higgsfieldUpload("test-key", "/nowhere/clip.mov")).rejects.toMatchObject({ message: expect.stringContaining("clip.mov is none of them"), final: true });
  });

  it("asks each model for what it takes there", async () => {
    const { higgsfieldInput } = await import("../src/higgsfield.ts");
    const { takesSeed } = await import("../src/fal.ts");
    const magi = (kind: string) => `sand/magi-2/${kind}`;
    // MAGI-2: 1080p only, nearest supported aspect ratio even from a picture, optional seed (including 0), and blockouts.
    expect(takesSeed("magi-2")).toBe(true);
    expect(higgsfieldInput("magi-2", magi("image-to-video"), { prompt: "x", seconds: 5.2, aspect: "4:5", start: "u", end: "v", seed: 0 })).toEqual({
      model: magi("image-to-video"),
      body: { prompt: "x", image_url: "u", end_image_url: "v", duration: 6, resolution: "1080p", aspect_ratio: "3:4", seed: 0 },
    });
    expect(higgsfieldInput("magi-2", magi("text-to-video"), { prompt: "x", seconds: 10, aspect: "21:9", seed: 42 }).body).toEqual({
      prompt: "x",
      duration: 10,
      resolution: "1080p",
      aspect_ratio: "21:9",
      seed: 42,
    });
    expect(higgsfieldInput("magi-2", magi("reference-to-video"), { prompt: "x", seconds: 7, aspect: "9:16", refs: ["a", "b"], camera: { url: "c", blockout: true }, seed: 9 }).body).toEqual({
      prompt: "x The 2 reference pictures show who and what is in it. The reference video is a blockout: keep its camera exactly (the move, the framing, the timing and where the cuts fall). Its grey set and its striped stand-ins only mark where things are and how big; none of them appears in the result.",
      duration: 7,
      resolution: "1080p",
      aspect_ratio: "9:16",
      seed: 9,
      image_urls: ["a", "b"],
      video_urls: ["c"],
    });
    const seedance = (kind: string) => `bytedance/seedance-2.5/${kind}`;
    // Seedance: a final at 1080p; an end frame with its start; a shape only when nothing starts it.
    expect(higgsfieldInput("seedance-2.5", seedance("image-to-video"), { prompt: "x", quality: "final", seconds: 5.2, aspect: "3:4", start: "u", end: "v", refs: ["a"] })).toEqual({
      model: seedance("image-to-video"),
      body: { prompt: "x", image_url: "u", end_image_url: "v", duration: 6, resolution: "1080p" },
    });
    expect(higgsfieldInput("seedance-2.5", seedance("text-to-video"), { prompt: "x", seconds: 4, aspect: "21:9" }).body).toEqual({ prompt: "x", duration: 4, resolution: "480p", aspect_ratio: "21:9" });
    // References, and a clip whose camera it keeps, on its reference endpoint.
    expect(higgsfieldInput("seedance-2.5", seedance("reference-to-video"), { prompt: "x", seconds: 4, aspect: "16:9", refs: ["a", "b"], camera: { url: "c", blockout: false } }).body).toEqual({
      prompt: "x The 2 reference pictures show who and what is in it. The reference video sets the camera: keep its move, its framing, its timing and where its cuts fall.",
      duration: 4,
      resolution: "480p",
      aspect_ratio: "16:9",
      image_urls: ["a", "b"],
      video_urls: ["c"],
    });
    // A board the take would have started from goes as the one reference there.
    expect(higgsfieldInput("seedance-2.5", seedance("reference-to-video"), { prompt: "x", seconds: 7, start: "u", camera: { url: "c", blockout: true } }).body).toMatchObject({ image_urls: ["u"], video_urls: ["c"], duration: 7 });
    // Kling 4.0: roughs at 720p, finals at 1080p; from a picture, no shape.
    expect(higgsfieldInput("kling-v4.0", "kling-video/v4.0/image-to-video", { prompt: "x", quality: "final", seconds: 12, start: "u", end: "v", aspect: "9:16" }).body).toEqual({ prompt: "x", image_url: "u", end_image_url: "v", duration: 12, resolution: "1080p" });
    expect(higgsfieldInput("kling-v4.0", "kling-video/v4.0/text-to-video", { prompt: "x", seconds: 3, aspect: "21:9" }).body).toEqual({ prompt: "x", aspect_ratio: "21:9", duration: 3, resolution: "720p" });
    // Kling 3 Pro without its own sound; its end frame has its own name there.
    expect(higgsfieldInput("kling-v3.0", "kling-video/v3.0/pro/image-to-video", { prompt: "x", seconds: 7, start: "u", end: "v" }).body).toEqual({ prompt: "x", image_url: "u", last_image_url: "v", duration: 7, sound: "off" });
    expect(higgsfieldInput("kling-v3.0", "kling-video/v3.0/pro/text-to-video", { prompt: "x", seconds: 5, aspect: "1:1" }).body).toEqual({ prompt: "x", aspect_ratio: "1:1", duration: 5, sound: "off" });
    expect(higgsfieldInput("kling-v2.5-turbo", "kling-video/v2.5-turbo/pro/image-to-video", { prompt: "x", seconds: 10, start: "u", aspect: "9:16" }).body).toEqual({ prompt: "x", image_url: "u", duration: 10 });
    // Wan 3.0: a seed when there is one; references only when nothing starts it.
    expect(higgsfieldInput("wan-3.0", "alibaba/wan-3.0/image-to-video", { prompt: "x", seconds: 5, start: "u", refs: ["a"], seed: 7 }).body).toEqual({ prompt: "x", image_url: "u", duration: 5, resolution: "480p", seed: 7 });
    expect(higgsfieldInput("wan-3.0", "alibaba/wan-3.0/reference-to-video", { prompt: "x", quality: "final", seconds: 30, aspect: "4:3", refs: ["a"] }).body).toEqual({
      prompt: "x The reference picture shows who and what is in it.",
      duration: 30,
      resolution: "1080p",
      aspect_ratio: "4:3",
      image_urls: ["a"],
    });
    // Motion control: the board, the clip to move like, and not the clip's sound.
    expect(higgsfieldInput("kling-motion-control", "kling-video/v3/motion-control/pro", { prompt: "x", start: "u", video: "m" }).body).toEqual({ prompt: "x", image_url: "u", video_url: "m", character_orientation: "video", keep_original_sound: "no" });
    // Stills: GPT Image 2.5 at medium quality and 1K, in the nearest shape it makes; Soul 2 at 1080p, its prompt left as written.
    expect(higgsfieldInput("gpt-image-2.5", "marketing-studio/image/sunburst", { prompt: "x", aspect: "4:5", refs: ["a", "b"] })).toEqual({
      model: "marketing-studio/image/sunburst",
      body: { prompt: "x", quality: "medium", resolution: "1k", aspect_ratio: "3:4", image_urls: ["a", "b"] },
    });
    expect(higgsfieldInput("gpt-image-2.5", "marketing-studio/image/flare", { prompt: "x" }).body).toEqual({ prompt: "x", quality: "medium", resolution: "1k" });
    expect(higgsfieldInput("soul-2", "higgsfield-ai/soul/v2/standard", { prompt: "x", aspect: "21:9" }).body).toEqual({ prompt: "x", resolution: "1080p", aspect_ratio: "16:9", enhance_prompt: false });
    expect(() => higgsfieldInput("soul", "higgsfield-ai/soul/standard", { prompt: "x" })).toThrow('no way to ask Higgsfield for "soul" models yet');
  });

  it("runs MAGI-2 for a vertical board (preserving 9:16 and seed) and for a 3D blockout at flat 8¢/s", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
    connect();
    provider({ video: "higgsfield" });

    // Board take: preserves the 9:16 board's shape (so Higgsfield doesn't default to 16:9) and sends a seed.
    const boardTake = make.startMake(PROJECT, { op: "video", shot: "s2", prompt: "The cat leaps onto the brick wall", start: "s2-take", model: "magi-2" });
    expect(boardTake.fit).toMatchObject({ model: "magi-2", route: "higgsfield", endpoint: "sand/magi-2/image-to-video", seconds: 4, usd: 0.32 });
    await make.driveJobs(PROJECT);
    expect(higgsfield.submits[0]).toEqual({
      model: "sand/magi-2/image-to-video",
      body: {
        prompt: "The cat leaps onto the brick wall",
        image_url: `${base}/out/hf-upload-1.jpg`,
        duration: 4,
        resolution: "1080p",
        aspect_ratio: "9:16",
        seed: boardTake.jobs[0]!.request.seed,
      },
    });
    expect(boardTake.jobs[0]!.request.seed).toEqual(expect.any(Number));

    // Blockout take: renders the shot's blockout MP4 and sends it as video_urls beside the board in image_urls.
    make.setRenderStretch(async (_id, o) => void writeFileSync(o.out, readFileSync(clipMade)));
    store.updateFile(PROJECT, (d) => {
      const s = d.cuts[0]!.shots.find((x) => x.id === "s2")!;
      s.blockout = { beats: [{ id: "b1", duration: 5, component: "kit:Previs", props: { move: "orbit" } }], mode: "video" };
    });
    const camTake = make.startMake(PROJECT, { op: "video", shot: "s2", prompt: "Smooth orbit around the alley", start: "s2-take", camera: "blockout", model: "magi-2" });
    expect(camTake.fit).toMatchObject({ model: "magi-2", route: "higgsfield", endpoint: "sand/magi-2/reference-to-video", seconds: 5, aspect: "9:16", usd: 0.4 });
    await make.driveJobs(PROJECT);
    expect(higgsfield.submits[1]).toEqual({
      model: "sand/magi-2/reference-to-video",
      body: {
        prompt: expect.stringContaining("The reference video is a blockout"),
        duration: 5,
        resolution: "1080p",
        aspect_ratio: "9:16",
        seed: camTake.jobs[0]!.request.seed,
        image_urls: [`${base}/out/hf-upload-2.jpg`],
        video_urls: [`${base}/out/hf-upload-3.mp4`],
      },
    });
    expect(shot("s2").content).toMatchObject({ kind: "generated", provider: "higgsfield", model: "magi-2" });
  });
});

describe("keeping a blockout's camera", () => {
  const rendered: { cut: string; format: string; range: { from: number; to: number } }[] = [];
  // A cut drawn as a blockout: two camera moves, 4 and 3 seconds. Rendering it is stood in for by a clip that's there.
  const blockout = () => {
    rendered.length = 0;
    make.setRenderStretch(async (_id, o) => {
      rendered.push({ cut: o.cut, format: o.format, range: o.range });
      writeFileSync(o.out, readFileSync(clipMade));
    });
    const move = (id: string, duration: number) => ({ id, track: "pic", duration, content: { kind: "coded" as const, component: "scenes/Blockout.tsx#Blockout" }, fidelity: "board" as const });
    store.updateFile(PROJECT, (d) => void d.cuts.push({ ...structuredClone(d.cuts[0]!), id: "blockout", name: "Blockout", shots: [move("orbit", 4), move("push", 3)] }));
    settings.services = { tein: { addedAt: "2026-11-19" } };
    provider({ video: "tein" });
  };
  const board = async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
  };

  it("renders the stretch of the cut and sends it as the reference video, with the board as a reference picture", async () => {
    await board();
    blockout();
    const ask = { op: "video" as const, shot: "s2", prompt: "@cat, the orange stand-in, strolls down the alley", start: "board", camera: { cut: "blockout", shots: ["orbit"] } };
    // Only Seedance keeps a camera, and Tein is the cheaper of its two routes, so Auto goes there. fal isn't offered
    // beside it: the cat is from the person's own photos, which Seedance draws only through Tein.
    const { fit, jobs } = make.startMake(PROJECT, ask);
    expect(fit).toMatchObject({ model: "seedance-2.5", route: "tein", endpoint: "seedance-2-5", seconds: 4, aspect: "9:16" });
    expect(fit.also).toBeUndefined();
    // Tein bills the blockout's 4 seconds as well as the take's 4, at its rate for a take with a reference video.
    expect(fit.usd).toBeCloseTo(8 * 0.0809, 3);
    expect(jobs[0]!.request).toMatchObject({ refs: ["s2-take"], camera: { cut: "blockout", format: "vertical", from: 0, to: 4, shots: ["orbit"] }, seconds: 4 });
    expect(jobs[0]!.request.start).toBeUndefined();
    await make.driveJobs(PROJECT);

    expect(rendered).toEqual([{ cut: "blockout", format: "vertical", range: { from: 0, to: 4 } }]);
    // The board, then the clip.
    expect(tein.uploads).toBe(2);
    expect(tein.submits).toHaveLength(1);
    expect(tein.submits[0]).toMatchObject({ model: "seedance-2-5", duration: 4, resolution: "480p", ratio: "9:16", reference_image: [`${base}/out/tein-upload-1.jpg`], reference_video: [`${base}/out/tein-upload-2.jpg`] });
    expect(tein.submits[0]).not.toHaveProperty("first_frame");
    expect(tein.submits[0]!.prompt).toMatch(/The reference picture shows who and what is in it\. The reference video is a blockout: keep its camera exactly .* none of them appears in the result\.$/);

    // What went up is persisted as a deduplicated snapshot in made/blockouts/ (and temp .cache/camera cleaned up).
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take-2")!;
    const camSnap = (take.provenance?.params as { camera?: { snapshot?: string; snapshotKind?: string } } | undefined)?.camera;
    expect(camSnap?.snapshot).toMatch(/^made\/blockouts\/[a-f0-9]{16}\.mp4$/);
    expect(camSnap?.snapshotKind).toBe("video");
    const sent = join(process.env.BEATSHEET_PROJECTS!, PROJECT, camSnap!.snapshot!);
    const probed = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", sent], { encoding: "utf8" })) as { format: { duration: string }; streams: { codec_type: string; codec_name: string; width?: number; height?: number }[] };
    expect(Number(probed.format.duration)).toBeCloseTo(4, 1);
    expect(probed.streams).toMatchObject([{ codec_type: "video", codec_name: "h264", width: 540, height: 960 }]);
    expect(existsSync(join(process.env.BEATSHEET_PROJECTS!, PROJECT, ".cache", "camera", `${jobs[0]!.id}.mp4`))).toBe(false);

    expect(take.provenance).toMatchObject({ provider: "tein", costUsd: 0.5288, refs: ["s2-take"], params: { camera: { cut: "blockout", from: 0, to: 4, snapshot: camSnap!.snapshot } } });
    // The take starts where the blockout does, and the shot shows it.
    expect(shot("s2").content).toMatchObject({ kind: "generated", take: "s2-take-2", provider: "tein", model: "seedance-2.5" });
    expect(shot("s2").content).not.toHaveProperty("in");
    expect(shot("s2").content).not.toHaveProperty("start");

    // The shot keeps what it followed, so its next take (a final, say) follows the blockout again without being told;
    // null says not to, and one that copies movement instead doesn't keep the camera as well.
    expect(shot("s2").content).toMatchObject({ camera: { cut: "blockout", shots: ["orbit"] } });
    expect(make.makeChoices(PROJECT, { op: "video", shot: "s2", quality: "final" }).req).toMatchObject({ camera: { cut: "blockout", format: "vertical", from: 0, to: 4, shots: ["orbit"] }, seconds: 4 });
    expect(make.makeChoices(PROJECT, { op: "video", shot: "s2", camera: null }).req).not.toHaveProperty("camera");
    // A shot that doesn't say (its take landed through an engine from before shots kept it) is read from the take it shows.
    store.updateProject(PROJECT, (p) => {
      const c = p.shots.find((s) => s.id === "s2")!.content;
      if (c.kind === "generated") delete c.camera;
    });
    expect(shot("s2").content).not.toHaveProperty("camera");
    expect(make.makeChoices(PROJECT, { op: "video", shot: "s2" }).req).toMatchObject({ camera: { cut: "blockout", from: 0, to: 4, shots: ["orbit"] } });
    expect(make.makeChoices(PROJECT, { op: "video", shot: "s2", start: "s2-take", drive: { asset: "s2-take-2", from: 0, to: 3 } }).req).not.toHaveProperty("camera");
  });

  it("follows the whole cut when no shots are named, and a final is priced at the 1080p rate for one", () => {
    blockout();
    const { req, choices } = make.makeChoices(PROJECT, { op: "video", shot: "s1", quality: "final", camera: { cut: "blockout" } });
    expect(req).toMatchObject({ camera: { cut: "blockout", format: "vertical", from: 0, to: 7 }, seconds: 7 });
    expect(req.camera).not.toHaveProperty("shots");
    expect(choices.auto).toMatchObject({ model: "seedance-2.5", route: "tein", seconds: 7, also: [{ route: "fal" }] });
    expect(choices.auto!.usd).toBeCloseTo(14 * 0.4595, 3);
    // The same shot with fal preferred, at fal's rate, with Tein still in also.
    provider({ video: "fal" });
    const onFal = make.makeChoices(PROJECT, { op: "video", shot: "s1", quality: "final", camera: { cut: "blockout" } }).choices.auto!;
    expect(onFal).toMatchObject({ model: "seedance-2.5", route: "fal", also: [{ route: "tein" }] });
    expect(onFal.usd).toBeCloseTo(14 * 0.6964, 3);
    expect(choices.unfit.find((f) => f.model === "kling-3")).toMatchObject({ why: { reason: "Doesn't keep the camera of a clip it's given" } });
  });

  it("keeps the camera of a clip in the project too, and says that's what the video is for", async () => {
    await board();
    blockout();
    make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", model: "seedance-2.5" });
    await make.driveJobs(PROJECT);
    tein.submits.length = 0;
    const { fit, jobs } = make.startMake(PROJECT, { op: "video", shot: "s1", prompt: "The same move, at dawn", camera: { asset: "s2-take-2", from: 1, to: 5 } });
    expect(fit).toMatchObject({ route: "tein", seconds: 4 });
    await make.driveJobs(PROJECT);
    expect(rendered).toEqual([]);
    expect(tein.submits[0]).toMatchObject({ duration: 4, ratio: "9:16", reference_video: [expect.any(String)] });
    expect(tein.submits[0]).not.toHaveProperty("reference_image");
    expect(tein.submits[0]!.prompt).toBe("The same move, at dawn The reference video sets the camera: keep its move, its framing, its timing and where its cuts fall.");
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.provenance?.job === jobs[0]!.id)!;
    expect(take.provenance).toMatchObject({ refs: ["s2-take-2"], params: { camera: { asset: "s2-take-2", from: 1, to: 5 } } });
  });

  it("renders shot-owned blockouts directly and deduplicates snapshots across unchanged takes", async () => {
    await board();
    rendered.length = 0;
    let variant = 0;
    make.setRenderStretch(async (_id, o) => {
      rendered.push({ cut: o.cut, format: o.format, range: o.range });
      if (variant === 0) writeFileSync(o.out, readFileSync(clipMade));
      else execFileSync("ffmpeg", ["-v", "error", "-y", "-i", clipMade, "-vf", "eq=brightness=0.15", "-c:v", "libx264", "-pix_fmt", "yuv420p", o.out]);
    });
    settings.services = { tein: { addedAt: "2026-11-19" } };
    provider({ video: "tein" });
    store.updateProject(PROJECT, (p) => {
      const s = p.shots.find((x) => x.id === "s2")!;
      s.blockout = { beats: [{ id: "orbit", label: "Orbit", duration: 4, component: "kit:Previs", props: { move: "orbit" } }], mode: "video" };
    });

    // Roll 2 takes from the same unchanged blockout: both deduplicate onto one made/blockouts/<hash>.mp4 file.
    make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", camera: "blockout", count: 2 });
    await make.driveJobs(PROJECT);
    const takes1 = store.loadProject(PROJECT).project.assets.filter((a) => a.kind === "video");
    expect(takes1).toHaveLength(2);
    const snapA = (takes1[0]!.provenance?.params as { camera?: { blockout?: boolean; snapshot?: string } })?.camera;
    const snapB = (takes1[1]!.provenance?.params as { camera?: { blockout?: boolean; snapshot?: string } })?.camera;
    expect(snapA?.blockout).toBe(true);
    expect(snapA?.snapshot).toMatch(/^made\/blockouts\/[a-f0-9]{16}\.mp4$/);
    expect(snapB?.snapshot).toBe(snapA?.snapshot);

    // Mutate the blockout (simulating "slower camera") and roll Take 3: new hash saved, old takes keep snapA.
    variant = 1;
    make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", camera: "blockout", count: 1 });
    await make.driveJobs(PROJECT);
    const takes2 = store.loadProject(PROJECT).project.assets.filter((a) => a.kind === "video");
    expect(takes2).toHaveLength(3);
    const snapC = (takes2[2]!.provenance?.params as { camera?: { snapshot?: string } })?.camera;
    expect(snapC?.snapshot).toMatch(/^made\/blockouts\/[a-f0-9]{16}\.mp4$/);
    expect(snapC?.snapshot).not.toBe(snapA?.snapshot);
    const blockoutFiles = readdirSync(join(process.env.BEATSHEET_PROJECTS!, PROJECT, "made", "blockouts"));
    expect(blockoutFiles).toHaveLength(2);
  });

  it("goes through fal when Tein isn't connected: the clip as @Video1 beside the board, billed for its seconds too", async () => {
    await board();
    blockout();
    settings.services = {};
    const before = seen.uploads;
    // No one from the person's own photos is named, so fal will draw it.
    const { fit, jobs } = make.startMake(PROJECT, { op: "video", shot: "s2", prompt: "The orange stand-in is a ginger cat strolling down the alley", start: "board", camera: { cut: "blockout", shots: ["orbit"] } });
    expect(fit).toMatchObject({ model: "seedance-2.5", route: "fal", endpoint: "bytedance/seedance-2.5/us/reference-to-video", seconds: 4, aspect: "9:16" });
    expect(fit.also).toBeUndefined();
    expect(fit.usd).toBeCloseTo(8 * 0.1319, 3);
    await make.driveJobs(PROJECT);

    expect(rendered).toEqual([{ cut: "blockout", format: "vertical", range: { from: 0, to: 4 } }]);
    expect(tein.uploads).toBe(0);
    // The board, then the clip.
    expect(seen.uploads).toBe(before + 2);
    const sent = seen.submits.filter((s) => s.endpoint.includes("seedance"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      endpoint: "bytedance/seedance-2.5/us/reference-to-video",
      input: { duration: "4", resolution: "480p", aspect_ratio: "9:16", image_urls: [`${base}/out/uploaded-${before + 1}.jpg`], video_urls: [`${base}/out/uploaded-${before + 2}.jpg`] },
    });
    expect(sent[0]!.input).not.toHaveProperty("image_url");
    expect(sent[0]!.input.prompt).toMatch(/@Image1 is a reference for who and what is in it\. @Video1 is a blockout: keep its camera exactly .* none of them appears in the result\.$/);
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.provenance?.job === jobs[0]!.id)!;
    expect(take.provenance).toMatchObject({ provider: "fal", refs: ["s2-take"], params: { camera: { cut: "blockout", from: 0, to: 4 } } });
    expect(shot("s2").content).toMatchObject({ kind: "generated", take: take.id, provider: "fal", model: "seedance-2.5" });
  });

  it("plans the take a hand-off option starts, shows everything it sends, and starts just that when it's picked", async () => {
    await board();
    blockout();
    const ask = { op: "video" as const, shot: "s2", prompt: "@cat, the orange stand-in, strolls down the alley", start: "board", refs: ["cat-photo"], camera: { cut: "blockout", shots: ["orbit"] }, count: 1 };
    const planned = make.planTake(PROJECT, ask);
    // Nothing is sent or saved to plan it.
    expect([tein.uploads, tein.submits.length, rendered.length, make.listJobs(PROJECT).length]).toEqual([0, 0, 0, 1]);
    expect(planned).toMatchObject({
      op: "video",
      cut: "main",
      shot: "s2",
      model: "seedance-2.5",
      label: "Seedance 2.5",
      where: "Tein",
      count: 1,
      seconds: 4,
      aspect: "9:16",
      // With a blockout, the board goes as the first reference rather than a first frame.
      pictures: [
        { asset: "s2-take", as: "ref" },
        { asset: "cat-photo", as: "ref" },
      ],
      camera: { cut: "blockout", format: "vertical", from: 0, to: 4, shots: ["orbit"] },
    });
    expect(planned.usd).toBeCloseTo(8 * 0.0809, 3);
    expect(planned.told).toMatch(/strolls down the alley.* The 2 reference pictures show who and what is in it\. The reference video is a blockout: keep its camera exactly/);

    const { startPicked } = make;
    const { answerMessage } = await import("../src/turns.ts");
    const turn = {
      who: "you" as const,
      since: new Date().toISOString(),
      cut: "main",
      ask: { kind: "choose" as const, message: "Send it?", options: [{ id: "send", label: "Send it", make: planned }, { id: "wait", label: "Change it first" }] },
    };
    store.updateFile(PROJECT, (d) => void (d.turn = turn));
    // Said more than the pick: left to the agent, which may change it.
    expect(startPicked(PROJECT, { picks: ["send"], text: "and make it dusk" })).toEqual([{ option: "send", label: "Send it", waiting: true }]);
    expect(make.listJobs(PROJECT)).toHaveLength(1);
    // Picked: started as it was planned, once, and the card's option says which jobs it started.
    const started = startPicked(PROJECT, { picks: ["send"] });
    expect(started).toEqual([{ option: "send", label: "Send it", planned, jobs: [expect.any(String)], usd: planned.usd }]);
    const ids = (started[0] as { jobs: string[] }).jobs;
    expect(answerMessage(PROJECT, turn, { picks: ["send"] }, undefined, started)).toContain(`It's started, exactly as the card showed it: 1 take of shot s2 with Seedance 2.5 on Tein, about $${planned.usd!.toFixed(2)} (jobs ${ids[0]}).`);
    expect(store.loadFile(PROJECT).doc.turn?.ask).toMatchObject({ options: [{ make: { started: ids } }, {}] });
    expect(startPicked(PROJECT, { picks: ["send"] })).toMatchObject([{ jobs: ids, before: true }]);
    expect(make.listJobs(PROJECT)).toHaveLength(2);
    await make.driveJobs(PROJECT);
    // What went is what the card showed: the two pictures in that order, the blockout, and the words to the letter.
    expect(tein.submits).toHaveLength(1);
    expect(tein.submits[0]).toMatchObject({ reference_image: [`${base}/out/tein-upload-1.jpg`, `${base}/out/tein-upload-2.jpg`], reference_video: [expect.any(String)], duration: 4, ratio: "9:16" });
    expect(tein.submits[0]!.prompt).toBe(planned.told);
    expect(rendered).toEqual([{ cut: "blockout", format: "vertical", range: { from: 0, to: 4 } }]);
  });

  it("doesn't start a planned take whose pictures changed after the card was made, and says what changed", async () => {
    await board();
    blockout();
    const planned = make.planTake(PROJECT, { op: "video", shot: "s2", prompt: "The orange stand-in is a ginger cat", start: "board", camera: { cut: "blockout", shots: ["orbit"] }, count: 1 });
    store.updateFile(PROJECT, (d) => void (d.turn = { who: "you", since: "", ask: { kind: "choose", message: "Send it?", options: [{ id: "send", label: "Send it", make: planned }, { id: "no", label: "No" }] } }));
    // A new board lands on the shot: "board" now means another picture.
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    store.updateProject(PROJECT, (p) => {
      const c = p.shots.find((s) => s.id === "s2")!.content;
      if (c.kind === "generated") c.take = "s2-take-2";
    });
    const jobs = make.listJobs(PROJECT).length;
    expect(make.startPicked(PROJECT, { picks: ["send"] })).toEqual([{ option: "send", label: "Send it", error: "What it would send changed since the card was made: its pictures would be s2-take-2" }]);
    expect(make.listJobs(PROJECT)).toHaveLength(jobs);
  });

  it("says what's wrong before anything is sent: no such cut or shot", () => {
    blockout();
    const uploads = seen.uploads;
    expect(() => make.startMake(PROJECT, { op: "video", shot: "s1", camera: { cut: "previs" } })).toThrow('No cut "previs" to take the blockout from');
    expect(() => make.startMake(PROJECT, { op: "video", shot: "s1", camera: { cut: "blockout", shots: ["orbit", "crane"] } })).toThrow('No shot "crane" in cut "blockout" (9:16); it has orbit, push');
    expect([tein.uploads, seen.uploads]).toEqual([0, uploads]);
    expect(rendered).toEqual([]);
  });

  it("sends a clip no larger than 1280 on its long side and no smaller than Seedance takes, in even numbers", () => {
    expect(make.cameraSize(1280, 534)).toEqual({ width: 1280, height: 534 });
    expect(make.cameraSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(make.cameraSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
    const small = make.cameraSize(640, 360);
    expect(small.width * small.height).toBeGreaterThanOrEqual(407_696);
    expect([small.width % 2, small.height % 2]).toEqual([0, 0]);
  });
});

describe("what the agent's turn has spent", () => {
  it("adds up the takes asked for since its turn began", async () => {
    store.updateFile(PROJECT, (d) => void (d.turn = { who: "agent", since: new Date(Date.now() - 1000).toISOString() }));
    make.startMake(PROJECT, { op: "image", shot: "s1", count: 3 });
    await make.driveJobs(PROJECT);
    expect(make.spentThisTurn(PROJECT)).toBeCloseTo(0.12, 3);
    store.updateFile(PROJECT, (d) => void (d.turn = { who: "you", since: new Date().toISOString() }));
    expect(make.spentThisTurn(PROJECT)).toBe(0);
  });
});

describe("fal's inputs for each kind of model", () => {
  it("asks Wan for whole frames at 16 a second", async () => {
    const { falInput, wanFrames } = await import("../src/fal.ts");
    expect(wanFrames(5.06)).toBe(81);
    expect(wanFrames(4.2)).toBe(69);
    expect(wanFrames(0.5)).toBe(17);
    expect(wanFrames(30)).toBe(161);
    expect(falInput("wan", { prompt: "x", seconds: 4.2, start: "u" })).toMatchObject({ num_frames: 69, aspect_ratio: "auto", image_url: "u" });
    expect(falInput("kling", { prompt: "x", seconds: 10, aspect: "9:16" })).toEqual({ prompt: "x", duration: "10", aspect_ratio: "9:16" });
    expect(() => falInput("sora", { prompt: "x" })).toThrow('no way to ask fal for "sora"');
  });

  it("asks MiniMax H3 for whole seconds at 768p, H3 Max for 1080p, and names the references for it", async () => {
    const { falInput, takesSeed } = await import("../src/fal.ts");
    expect(falInput("minimax-h3", { prompt: "x", seconds: 5.4, start: "u", end: "v", seed: 3 })).toEqual({ prompt: "x", duration: 6, resolution: "768P", image_url: "u", end_image_url: "v", seed: 3 });
    expect(falInput("minimax-h3-max", { prompt: "x", seconds: 5.4, aspect: "9:16" })).toEqual({ prompt: "x", duration: 5.4, resolution: "1080P", aspect_ratio: "9:16" });
    expect(falInput("minimax-h3-max-turbo", { prompt: "x", seconds: 7 })).toMatchObject({ duration: 7, resolution: "768P" });
    expect(falInput("minimax-h3", { prompt: "Two friends fence on a pier.", seconds: 5, aspect: "16:9", refs: ["a", "b"] })).toEqual({
      prompt: "Two friends fence on a pier. Image 1 to Image 2 are references for who and what is in it.",
      duration: 5,
      resolution: "768P",
      reference_image_urls: ["a", "b"],
      aspect_ratio: "16:9",
    });
    expect(takesSeed("minimax-h3-max")).toBe(true);
  });

  it("asks the models that make roughs and finals both for a rough's size or a final's", async () => {
    const { falInput, takesSeed } = await import("../src/fal.ts");
    // Wan 3.0: 480p and 1080p, whole seconds, its start frame by its own name.
    expect(falInput("wan-3", { prompt: "x", quality: "rough", seconds: 5.4, start: "u", end: "v", seed: 3 })).toEqual({ prompt: "x", duration: 6, resolution: "480p", start_image_url: "u", end_image_url: "v", seed: 3 });
    expect(falInput("wan-3", { prompt: "x", quality: "final", seconds: 5, aspect: "9:16" })).toEqual({ prompt: "x", duration: 5, resolution: "1080p", aspect_ratio: "9:16" });
    expect(falInput("wan-3", { prompt: "x", seconds: 5, refs: ["a"] })).toMatchObject({ prompt: "x Image 1 is a reference for who and what is in it.", reference_image_urls: ["a"], resolution: "480p" });
    expect(takesSeed("wan-3")).toBe(true);
    // Seedance 2.5: seconds as a string, references as @Image1…, and no seed of its own to give.
    expect(falInput("seedance-2.5", { prompt: "x", quality: "final", seconds: 4, start: "u" })).toEqual({ prompt: "x", duration: "4", resolution: "1080p", image_url: "u" });
    expect(falInput("seedance-2.5", { prompt: "x", seconds: 6, refs: ["a", "b"], aspect: "16:9" })).toEqual({
      prompt: "x @Image1 to @Image2 are references for who and what is in it.",
      duration: "6",
      resolution: "480p",
      image_urls: ["a", "b"],
      aspect_ratio: "16:9",
    });
    expect(takesSeed("seedance-2.5")).toBe(false);
    // Kling 4.0: 720p and 1080p.
    expect(falInput("kling-4", { prompt: "x", quality: "rough", seconds: 12, start: "u" })).toEqual({ prompt: "x", duration: 12, resolution: "720p", start_image_url: "u" });
    // Gemini Omni Flash: wide or tall, even from a picture.
    expect(falInput("gemini-omni", { prompt: "x", quality: "rough", seconds: 3.5, start: "u", aspect: "9:16" })).toEqual({ prompt: "x", duration: 4, resolution: "360p", aspect_ratio: "9:16", image_url: "u" });
    expect(falInput("gemini-omni", { prompt: "x", quality: "final", seconds: 8, aspect: "4:3" })).toMatchObject({ resolution: "1080p", aspect_ratio: "16:9" });
  });

  it("gives each lip sync model the board (or the clip) and what's said, in its own words", async () => {
    const { falInput } = await import("../src/fal.ts");
    const ask = { prompt: "The cat boasts, looking into the camera", start: `${base}/out/board.jpg`, audio: `${base}/out/said.wav`, seconds: 5, seed: 3 };
    const both = { image_url: ask.start, audio_url: ask.audio };
    expect(falInput("sync", ask)).toEqual(both);
    expect(falInput("sync", { ...ask, start: undefined, video: `${base}/out/take.mp4` })).toEqual({ video_url: `${base}/out/take.mp4`, audio_url: ask.audio, sync_mode: "cut_off" });
    expect(falInput("kling-avatar", ask)).toEqual({ ...both, prompt: ask.prompt });
    expect(falInput("omnihuman", ask)).toEqual({ ...both, prompt: ask.prompt });
    expect(falInput("veed-fabric", { ...ask, quality: "final" })).toEqual({ ...both, resolution: "720p" });
    expect(falInput("h3-max-lipsync", { ...ask, quality: "final" })).toEqual({ ...both, resolution: "1080P", seed: 3 });
    // InfiniteTalk on fal makes the frames it's asked for, not as many as the sound lasts: 5 seconds at 25 a second, on its fours plus one.
    expect(falInput("infinitalk", ask)).toEqual({ ...both, prompt: ask.prompt, num_frames: 125, resolution: "480p", seed: 3 });
    // LongCat makes segments: 5.8 seconds is one, 10.8 two.
    expect(falInput("longcat-avatar", { ...ask, seconds: 5.8 })).toEqual({ ...both, prompt: ask.prompt, num_segments: 1, resolution: "480p", seed: 3 });
    expect(falInput("longcat-avatar", { ...ask, seconds: 10.8, quality: "final" })).toMatchObject({ num_segments: 2, resolution: "720p" });
    expect(falInput("latentsync", { ...ask, start: undefined, video: `${base}/out/take.mp4` })).toEqual({ video_url: `${base}/out/take.mp4`, audio_url: ask.audio, seed: 3 });
  });

  it("gives Kling's motion control the board and the stretch of the clip, and GPT Image a size in the shot's shape", async () => {
    const { falInput } = await import("../src/fal.ts");
    expect(falInput("kling-motion", { prompt: "two knights duel", start: "u", video: "w" })).toEqual({ prompt: "two knights duel", image_url: "u", video_url: "w", character_orientation: "video", keep_original_sound: false });
    expect(falInput("gpt-image", { prompt: "x", aspect: "9:16", refs: ["a"] })).toEqual({ prompt: "x", image_size: { width: 864, height: 1536 }, quality: "medium", output_format: "jpeg", image_urls: ["a"] });
  });
});

describe("cast and sets", () => {
  it("makes a sheet for the cat from its photo, and the sheet becomes the cat's picture", async () => {
    const { fit } = make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    expect(fit).toMatchObject({ model: "nano-banana-2.1", endpoint: "google/nano-banana-2.1/edit", aspect: "16:9" });
    await make.driveJobs(PROJECT);

    const sent = seen.submits[0]!.input;
    expect(sent.image_urls).toEqual([`${base}/out/uploaded-1.jpg`]);
    // A photograph, said in so many words: "reference sheet" alone comes back drawn. The face shows once.
    expect(String(sent.prompt)).toMatch(
      /^A photographic reference sheet of the cat \(orange tabby, white chest\) in three panels side by side on a plain light gray background: a close-up of the head and face, with anything worn on them; a full-length front view cropped at the neck, so the face shows only once; and a full-length back view\./,
    );
    expect(String(sent.prompt)).toMatch(/photographed rather than drawn, nothing else in the picture and no text or labels\. The reference photos show the cat: keep the cat's features, markings, colors and shape exactly\.$/);
    const cat = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!;
    expect(cat.sheet).toBe("cat-sheet");
    expect(store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-sheet")).toMatchObject({ tags: ["sheet"], provenance: { cast: ["cat"] } });
  });

  it("gives a board the pictures of the cast its prompt names, describes them, and keeps the prompt as written on the shot", async () => {
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    seen.submits = [];
    make.startMake(PROJECT, { op: "image", shot: "s2", prompt: "@cat/heist strolls down @alley like it owns it", count: 1 });
    await make.driveJobs(PROJECT);

    const sent = seen.submits[0]!;
    expect(sent.endpoint).toBe("google/nano-banana-2.1/edit");
    expect(sent.input.prompt).toBe(
      "the cat (orange tabby, white chest; a tiny black eye mask) strolls down the alley (narrow, wet brick) like it owns it. Reference pictures, in order: the cat. Keep each one's features, markings and colors as they are there; draw them in the style asked for. The picture is one single frame of the scene, not a sheet, a grid or panels.",
    );
    expect(shot("s2").content).toMatchObject({ kind: "generated", prompt: "@cat/heist strolls down @alley like it owns it" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ cast: ["cat/heist", "alley"], refs: ["cat-sheet"] });
  });

  it("draws sheets and boards in the project's style, and a cast member in its own when it has one", async () => {
    store.updateFile(PROJECT, (d) => {
      d.cast!.push({ id: "noir", name: "film noir", kind: "style", about: "black and white, hard shadows" }, { id: "toon", name: "hand-drawn", kind: "style", about: "2D animation, clean ink lines" });
      d.look = { style: "noir" };
    });
    // The alley takes the look's style; its sheet says so, and isn't a photograph.
    make.startMake(PROJECT, { op: "image", sheet: "alley", count: 1 });
    await make.driveJobs(PROJECT);
    expect(seen.submits[0]!.input.prompt).toBe(
      "A wide establishing view of the alley (narrow, wet brick), empty of people, nothing else in the picture and no text or labels, in the style of film noir (black and white, hard shadows).",
    );

    // The cat is drawn: its sheet is in its own style, and a board puts the drawn cat in the noir alley.
    store.updateFile(PROJECT, (d) => void (d.cast!.find((m) => m.id === "cat")!.style = "toon"));
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    expect(String(seen.submits[1]!.input.prompt)).toMatch(
      /^A reference sheet of the cat \(orange tabby, white chest\) in three panels .*\. Nothing else in the picture and no text or labels, in the style of hand-drawn \(2D animation, clean ink lines\)\. The reference photos show the cat: keep/,
    );
    make.startMake(PROJECT, { op: "image", shot: "s2", prompt: "@cat strolls down @alley", count: 1 });
    await make.driveJobs(PROJECT);
    expect(String(seen.submits[2]!.input.prompt)).toMatch(
      /^the cat \(orange tabby, white chest; in the style of hand-drawn: 2D animation, clean ink lines\) strolls down the alley \(narrow, wet brick\)\. In the style of film noir \(black and white, hard shadows\)\./,
    );
  });

  it("refuses a sheet for someone who isn't in the cast", () => {
    expect(() => make.startMake(PROJECT, { op: "image", sheet: "dog" })).toThrow('No cast member "dog"');
  });

  it("makes a character's portrait from their own photos, and a look's from the plain one's chosen face", async () => {
    // The plain look's: from the cat's photo, in the shape of a portrait, and it becomes the chosen one. The photo is
    // tagged "portrait" for its shape, and is still read as a photo.
    store.updateFile(PROJECT, (d) => void (d.assets.find((a) => a.id === "cat-photo")!.tags = ["portrait"]));
    const { fit, jobs } = make.startMake(PROJECT, { op: "image", sheet: "cat", portrait: true, count: 1 });
    expect(fit).toMatchObject({ aspect: "4:5" });
    expect(jobs[0]).toMatchObject({ sheet: "cat", portrait: true, request: { refs: ["cat-photo"] } });
    await make.driveJobs(PROJECT);
    const prompt = String(seen.submits[0]!.input.prompt);
    expect(prompt).toMatch(/^A photographic head-and-shoulders portrait of the cat \(orange tabby, white chest\) facing the camera, with anything worn on the head or face/);
    expect(prompt).toMatch(/The reference photos show the cat: keep the cat's features, markings, colors and shape exactly\.$/);
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.portrait).toBe("cat-portrait");
    expect(store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-portrait")).toMatchObject({ tags: ["portrait"] });

    // A look's starts from that settled face, and says what's different.
    const look = make.startMake(PROJECT, { op: "image", sheet: "cat/heist", portrait: true, count: 1 });
    expect(look.jobs[0]!.request.refs).toEqual(["cat-portrait"]);
    expect(look.jobs[0]!.request.sent).toMatch(/The first reference picture is the cat's chosen portrait: keep the cat's face, hair and features exactly\. In this portrait: a tiny black eye mask\.$/);
    await make.driveJobs(PROJECT);
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.variants![0]!.portrait).toBe("cat-heist-portrait");
  });

  it("makes a character's sheet from its chosen portrait and its wardrobe, and says which picture is which", () => {
    store.updateFile(PROJECT, (d) => {
      d.assets.push({ id: "cat-portrait", kind: "image", path: d.assets[0]!.path, tags: ["portrait"] }, { id: "cape", kind: "image", path: d.assets[0]!.path });
      Object.assign(d.cast!.find((m) => m.id === "cat")!, { portrait: "cat-portrait", wardrobe: ["cape"], wears: "a red velvet cape" });
    });
    const { jobs } = make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    expect(jobs[0]!.request.refs).toEqual(["cat-portrait", "cape"]);
    expect(jobs[0]!.request.sent).toMatch(/^A photographic reference sheet of the cat \(orange tabby, white chest; a red velvet cape\) in three panels/);
    expect(jobs[0]!.request.sent).toMatch(
      /The first reference picture is the cat's chosen portrait: keep the cat's face, hair and features exactly\. The next reference picture shows the clothes to dress the cat in: copy the garments, colors, patterns and fit exactly, and take nothing else from it, not a face and not a place\.$/,
    );
  });

  it("cuts the clothes out of a photo below the face, into a look's wardrobe", async () => {
    const { wardrobeFrom } = await import("../src/castfrom.ts");
    const { projectDir } = await import("../src/paths.ts");
    const file = join(projectDir(PROJECT), "william.jpg");
    writeFileSync(file, await sharp({ create: { width: 200, height: 300, channels: 3, background: "#806040" } }).jpeg().toBuffer());
    store.updateFile(PROJECT, (d) =>
      void d.assets.push({ id: "william", kind: "image", path: file, subjects: [{ id: "face-1", kind: "face", label: "face", samples: [[0, 0.4, 0.1, 0.2, 0.2]] }] }),
    );
    expect(await wardrobeFrom(PROJECT, { asset: "william", look: "cat/heist" })).toEqual({ asset: "cat-heist-wardrobe", cropped: true });
    const made = store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-heist-wardrobe")!;
    expect(made).toMatchObject({ tags: ["wardrobe"], provenance: { source: "capture", refs: ["william"] } });
    // From just below the face (10% down, 20% tall, and a little room) to the bottom.
    expect(await sharp(made.path).metadata()).toMatchObject({ width: 200, height: 204 });
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.variants![0]!.wardrobe).toEqual(["cat-heist-wardrobe"]);
  });

  it("makes portraits only of characters", () => {
    expect(() => make.startMake(PROJECT, { op: "image", sheet: "alley", portrait: true })).toThrow("A portrait is of a character; @alley is a place");
  });

  it("makes the first sheet the chosen one and puts the next beside it, to choose between", async () => {
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    const cat = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!;
    expect(cat.sheet).toBe("cat-sheet");
    expect(cat.sheets).toEqual(["cat-sheet-2"]);
  });
});

describe("roughs, finals and whole passes", () => {
  it("makes a final from the board with Kling 3, without its own sound, and the final replaces the rough", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", count: 1 });
    await make.driveJobs(PROJECT);
    expect(shot("s2")).toMatchObject({ fidelity: "rough", content: { take: "s2-take-2" } });

    const { fit } = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", quality: "final", model: "kling-3", count: 1 });
    expect(fit).toMatchObject({ model: "kling-3", seconds: 4, usd: 0.448 });
    await make.driveJobs(PROJECT);
    expect(seen.submits.at(-1)!.input).toEqual({ prompt: "The cat strolls down the alley like it owns it", duration: "4", start_image_url: `${base}/out/uploaded-2.jpg`, generate_audio: false });
    // The board is still where the clips start from, after a rough took its place.
    expect(shot("s2")).toMatchObject({ fidelity: "final", content: { take: "s2-take-3", start: "s2-take" } });
  });

  it("ends a clip on its end frame, keeps what it was asked on the take, and a retake ends there too unless told not to", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 2 });
    await make.driveJobs(PROJECT);
    const { fit } = make.startMake(PROJECT, { op: "video", shot: "s2", start: "s2-take", end: "s2-take-2", prompt: "It stops and looks up", model: "wan-3", count: 1 });
    // Both ends are set, so nothing's bought either side of the 3.2-second shot.
    expect(fit).toMatchObject({ model: "wan-3", seconds: 4 });
    await make.driveJobs(PROJECT);
    // The take comes back 6 seconds long, and the shot plays its last 3.2 so it lands on the end frame.
    expect(shot("s2").content).toMatchObject({ take: "s2-take-3", start: "s2-take", end: "s2-take-2", in: 2.8, model: "wan-3", clipPrompt: "It stops and looks up", prompt: "The cat strolls down the alley like it owns it" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take-3")!;
    expect(take.provenance?.params).toMatchObject({ prompt: "It stops and looks up", start: "s2-take", end: "s2-take-2", shotSeconds: 3.2 });

    const again = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", model: "wan-3", count: 1 }).jobs[0]!;
    expect(again.request).toMatchObject({ start: "s2-take", end: "s2-take-2", prompt: "It stops and looks up" });
    const plain = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", end: null, model: "wan-3", count: 1 }).jobs[0]!;
    expect(plain.request.end).toBeUndefined();
    await make.cancelJobs(PROJECT, [again.id, plain.id]);
  });

  it("says who a clip is about that its frames don't show, before anything's spent", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2", prompt: "An empty alley at dawn", count: 1 });
    await make.driveJobs(PROJECT);
    expect(make.absentFrom(PROJECT, [{ op: "video", shot: "s2", start: "board", prompt: "@cat strolls in from the left" }])).toEqual([{ shot: "s2", who: ["the cat"] }]);
    expect(make.absentFrom(PROJECT, [{ op: "video", shot: "s2", start: "board", prompt: "Mist drifts down the alley" }])).toEqual([]);
    // A shot with no board can't be asked for at all, which starting it says.
    expect(make.absentFrom(PROJECT, [{ op: "video", shot: "s1", start: "board", prompt: "@cat slips out" }])).toEqual([]);
    expect(make.requestFor(PROJECT, { op: "image", shot: "s2", prompt: "@cat in the alley" }).absent).toBeUndefined();
  });

  it("copies the movement in a clip on fal: cuts the stretch to follow, and sends it with the board to Kling's motion control", async () => {
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x480:r=25:d=6", "-pix_fmt", "yuv420p", join(dir, "fight.mp4")]);
    store.updateFile(PROJECT, (d) => void d.assets.push({ id: "fight", kind: "video", path: join(dir, "fight.mp4"), width: 640, height: 480, duration: 6 }));
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    // Without the graphics card for SCAIL-2 or Wan 2.2 Animate, fal's is the one ready.
    const { fit, jobs } = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", drive: { asset: "fight", from: 1, to: 4 }, count: 1 });
    expect(fit).toMatchObject({ model: "kling-motion", route: "fal", endpoint: "fal-ai/kling-video/v3/pro/motion-control", seconds: 4, usd: 0.672 });
    await make.driveJobs(PROJECT);

    expect(seen.submits.at(-1)!.input).toEqual({ prompt: "The cat strolls down the alley like it owns it", image_url: `${base}/out/uploaded-1.jpg`, video_url: `${base}/out/uploaded-2.jpg`, character_orientation: "video", keep_original_sound: false });
    // The stretch, half a second wider either side, at 720p in the clip's own shape and 30 frames a second.
    const cut = join(dir, ".cache", "drive", `${jobs[0]!.id}.mp4`);
    expect(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames", "-of", "csv=p=0", cut], { encoding: "utf8" }).trim()).toBe("960,720,120");
    expect(shot("s2")).toMatchObject({ fidelity: "rough", content: { take: "s2-take-2", in: 0.5 } });
  });

  it("makes the board say the line heard while the shot plays, lined up with it and silent, then redoes the mouths in that clip", async () => {
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
    // A line voiced in the cat's voice, heard from 3s to 4.5s, while s2 plays (2.5s to 5.7s).
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=1.5", join(dir, "boast.wav")]);
    store.updateProject(PROJECT, (p) => void (p.voice = { leadIn: 3, defaultGap: 0.5, tail: 1, lines: [{ id: "boast", text: "Nobody owns this alley but me.", file: join(dir, "boast.wav"), duration: 1.5, words: [], speaker: "cat" }] }));
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    // Nothing but a lip sync model can say it, and Auto's is H3 Max Lip Sync: its shortest take, 5 seconds at 480p.
    const talk = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", speech: {}, count: 1 });
    expect(talk.fit).toMatchObject({ model: "minimax-h3-max-lipsync", endpoint: "minimax/h3-max/lip-sync/image-to-video", seconds: 5, usd: 0.25 });
    await make.driveJobs(PROJECT);
    expect(seen.submits.at(-1)).toEqual({
      endpoint: "minimax/h3-max/lip-sync/image-to-video",
      input: { image_url: `${base}/out/uploaded-1.jpg`, audio_url: `${base}/out/uploaded-2.jpg`, resolution: "480P", seed: talk.jobs[0]!.request.seed },
    });
    // What it said: the shot widened by 0.9s either side, so the line starts 1.4s in.
    const said = execFileSync("ffmpeg", ["-v", "error", "-i", join(dir, ".cache", "speech", `${talk.jobs[0]!.id}.wav`), "-f", "s16le", "-ac", "1", "-ar", "8000", "-"]);
    const s = Array.from(new Int16Array(said.buffer, said.byteOffset, said.length / 2));
    const peak = (from: number, to: number) => Math.max(0, ...s.slice(from * 8000, to * 8000).map(Math.abs));
    expect(s.length / 8000).toBeCloseTo(5, 2);
    expect([peak(0, 1.3), peak(1.5, 2.8) > 1000, peak(3, 5)]).toEqual([0, true, 0]);
    // The take shows from where the shot starts in it, silent; the shot remembers what it says.
    expect(shot("s2")).toMatchObject({ fidelity: "rough", content: { take: "s2-take-2", start: "s2-take", speech: { lines: ["boast"] }, in: 0.9, model: "minimax-h3-max-lipsync" } });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take-2")!;
    expect(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", take.path], { encoding: "utf8" }).trim()).toBe("");

    // A final with the mouths redone in that clip: sync-3, sent the stretch the shot plays and half a second either side, in step with the line.
    const dub = make.startMake(PROJECT, { op: "video", shot: "s2", clip: "take", quality: "final", count: 1 });
    expect(dub.fit).toMatchObject({ model: "sync-3", endpoint: "fal-ai/sync-lipsync/v3", seconds: 4.2, usd: 0.56 });
    expect(dub.jobs[0]!.request).toMatchObject({ clip: { asset: "s2-take-2", from: 0.9, to: 4.1 }, speech: { lines: ["boast"], from: 2.5, to: 5.7 } });
    await make.driveJobs(PROJECT);
    expect(seen.submits.at(-1)!.input).toEqual({ video_url: `${base}/out/uploaded-3.jpg`, audio_url: `${base}/out/uploaded-4.jpg`, sync_mode: "cut_off" });
    const cut = join(dir, ".cache", "dub", `${dub.jobs[0]!.id}.mp4`);
    expect(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", cut], { encoding: "utf8" }))).toBeCloseTo(4.2, 1);
    // It takes the place of the clip it was made from, and keeps the board that clip came from.
    expect(shot("s2")).toMatchObject({ fidelity: "final", content: { take: "s2-take-3", start: "s2-take", speech: { lines: ["boast"] }, in: 0.5, model: "sync-3" } });

    // A rough redo goes to Kling's lip sync, which takes a clip only 720 pixels or more a side.
    store.updateFile(PROJECT, (d) => void Object.assign(d.assets.find((a) => a.id === "s2-take-3")!, { width: 540, height: 960 }));
    const rough = make.startMake(PROJECT, { op: "video", shot: "s2", clip: "take", count: 1 });
    expect(rough.fit).toMatchObject({ model: "kling-lipsync", seconds: 4.2 });
    await make.driveJobs(PROJECT);
    expect(seen.submits.at(-1)!.endpoint).toBe("fal-ai/kling-video/lipsync/audio-to-video");
    expect(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(dir, ".cache", "dub", `${rough.jobs[0]!.id}.mp4`)], { encoding: "utf8" }).trim()).toBe("720,1280");
  });

  it("says a shot has no board yet when asked to start from one", () => {
    expect(() => make.startMake(PROJECT, { op: "video", shot: "s1", start: "board" })).toThrow('Shot "s1" has no board yet');
  });

  it("checks a whole pass against what may be spent before starting any of it", () => {
    const asks = ["s1", "s2"].map((shot) => ({ op: "image" as const, shot, count: 2 }));
    expect(make.estimate(PROJECT, asks).rows.find((r) => r.model === "nano-banana-2.1")).toMatchObject({ usd: 0.16, made: 2, unfit: [] });
    // With each shot's Auto pick (Nano Banana 2.1 here, the first ready one).
    expect(make.estimate(PROJECT, asks).auto).toEqual({ usd: 0.16, made: 2 });
    // A shot that has no board to start from is set aside, and the rest is still estimated.
    expect(make.estimate(PROJECT, ["s1", "s2"].map((shot) => ({ op: "video" as const, shot, start: "board" }))).problems).toEqual([
      { shot: "s1", reason: 'Shot "s1" has no board yet: make stills for it first' },
      { shot: "s2", reason: 'Shot "s2" has no board yet: make stills for it first' },
    ]);
    expect(() => make.startMakeAll(PROJECT, asks, { spendable: 0.1 })).toThrow("This is about $0.16, and only $0.10 more can be spent");
    expect(make.listJobs(PROJECT)).toHaveLength(0);
    const { plans, usd } = make.startMakeAll(PROJECT, asks, { spendable: 1 });
    expect(usd).toBe(0.16);
    expect(plans.map((p) => p.jobs.length)).toEqual([2, 2]);
  });
});

describe("the spending limit", () => {
  it("refuses what would go past it, counting every take asked for since it was set, whoever asked", async () => {
    // From now: takes an earlier test left going were asked for before.
    settings.make = { limit: { usd: 0.1, since: new Date().toISOString() } };
    try {
      make.startMake(PROJECT, { op: "image", shot: "s1", count: 2 });
      await make.driveJobs(PROJECT);
      expect(make.spentSince(settings.make.limit!.since)).toBeCloseTo(0.08, 3);
      expect(() => make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 })).toThrow("This is about $0.04, and $0.08 of the $0.10 spending limit");
      // What failed or was stopped doesn't count.
      refuse = "alley";
      settings.make.limit!.usd = 0.12;
      make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
      await make.driveJobs(PROJECT);
      expect(make.spentSince(settings.make.limit!.since)).toBeCloseTo(0.08, 3);
    } finally {
      settings.make = undefined;
    }
  });
});

describe("a variant's sheet", () => {
  it("says the difference is in every view, since it starts from the plain sheet", async () => {
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    make.startMake(PROJECT, { op: "image", sheet: "cat/heist", count: 1 });
    await make.driveJobs(PROJECT);
    expect(String(seen.submits[1]!.input.prompt)).toMatch(/ In every view: a tiny black eye mask\.$/);
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.variants![0]!.sheet).toBe("cat-heist-sheet");
  });
});

describe("takes that finish together, and trying again", () => {
  it("brings in takes that finish at once one at a time, so each gets its own id", async () => {
    ingest.chosen = [];
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 4 });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT).map((j) => j.status)).toEqual(["done", "done", "done", "done"]);
    expect(shot("s2").content).toMatchObject({ takes: ["s2-take", "s2-take-2", "s2-take-3", "s2-take-4"] });
    // No two picked the same id (and wrote the same previews) along the way.
    expect(ingest.chosen).toEqual(["s2-take", "s2-take-2", "s2-take-3", "s2-take-4"]);
  });

  it("tries bringing a take in again when the project's side goes wrong, without asking the service again", async () => {
    ingest.failures = 2;
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", charged: true, asset: "s2-take" });
    expect(seen.submits).toHaveLength(1);
  });

  it("fetches a failed take the service had made, rather than paying for it again, and counts what it cost", async () => {
    const since = new Date().toISOString();
    const [job] = make.startMake(PROJECT, { op: "image", shot: "s1", count: 1 }).jobs;
    await make.driveJobs(PROJECT);
    // As if bringing it in had failed for good: the service made it, and it's paid for.
    const file = join(process.env.BEATSHEET_PROJECTS!, PROJECT, "jobs", `${job!.id}.json`);
    const saved = JSON.parse(readFileSync(file, "utf8")) as import("../src/make.ts").MakeJob;
    store.updateFile(PROJECT, (d) => {
      d.assets = d.assets.filter((a) => a.id !== saved.asset);
      const s = d.cuts[0]!.shots.find((x) => x.id === "s1")!;
      s.content = { kind: "placeholder", description: "The cat slips out through the cat flap at dawn" };
    });
    writeFileSync(file, JSON.stringify({ ...saved, status: "failed", error: "EPERM", asset: undefined }));
    expect(make.spentSince(since)).toBeCloseTo(0.04, 3);

    expect(make.retryJobs(PROJECT, [job!.id])).toMatchObject([{ status: "running" }]);
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", asset: "s1-take" });
    expect(seen.submits).toHaveLength(1);
  });
});

describe("stills from services that answer in one request", () => {
  it("makes a board with GPT Image at the shot's shape, saves the picture, and counts what it actually cost", async () => {
    provider({ image: "openai" });
    const { fit } = make.startMake(PROJECT, { op: "image", shot: "s2", model: "gpt-image" });
    expect(fit).toMatchObject({ model: "gpt-image", route: "openai", endpoint: "gpt-image-2.6-flare", aspect: "9:16", usd: 0.04 });
    await make.driveJobs(PROJECT);

    expect(seen.submits).toHaveLength(0);
    expect(seen.direct[0]!.url).toBe("/direct/openai/images/generations");
    expect(JSON.parse(seen.direct[0]!.body)).toEqual({ model: "gpt-image-2.6-flare", prompt: "The cat strolls down the alley like it owns it", n: 1, size: "864x1536", output_format: "jpeg", quality: "medium", output_compression: 92 });
    const [job] = make.listJobs(PROJECT);
    // 50 words in at $5 a million, a picture of 1,000 tokens out at $30.
    expect(job).toMatchObject({ status: "done", charged: true, usd: 0.0303, asset: "s2-take" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ provider: "openai", model: "gpt-image-2.6-flare", costUsd: 0.0303, params: { model: "gpt-image" } });
    expect(readFileSync(take.path, "utf8")).toBe("a made picture");
    expect(shot("s2")).toMatchObject({ fidelity: "board", content: { kind: "generated", take: "s2-take", provider: "openai" } });
  });

  it("makes a still on the ChatGPT plan when Codex is signed in, at no charge, and lets via or preference pick the key", async () => {
    plans.ready = ["chatgpt"];
    const { fit } = make.startMake(PROJECT, { op: "image", shot: "s2", model: "gpt-image" });
    // With no preference set, the free plan comes first, with connected keys listed beside it.
    expect(fit).toMatchObject({ route: "chatgpt", where: "ChatGPT plan", usd: 0, also: [{ route: "openai" }, { route: "fal" }] });
    await make.driveJobs(PROJECT);
    expect(seen.direct).toHaveLength(0);
    expect(plans.asks).toEqual([{ route: "chatgpt", prompt: "The cat strolls down the alley like it owns it", aspect: "9:16", refs: undefined }]);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", route: "chatgpt", usd: 0, asset: "s2-take" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ provider: "chatgpt", model: "gpt-image", costUsd: 0 });
    expect(take.path).toMatch(/\.png$/);

    // Explicit via works immediately without switching Settings, and preferring OpenAI makes it the default.
    const direct = make.startMake(PROJECT, { op: "image", shot: "s2", model: "gpt-image", via: "openai", count: 1 });
    expect(direct.fit).toMatchObject({ route: "openai" });
    await make.driveJobs(PROJECT);
    expect(seen.direct).toHaveLength(1);
    expect(make.listJobs(PROJECT)[1]).toMatchObject({ status: "done", route: "openai" });

    provider({ image: "openai" });
    expect(make.makeChoices(PROJECT, { op: "image", shot: "s2" }).choices.ready.find((f) => f.model === "gpt-image")).toMatchObject({ route: "openai", also: [{ route: "chatgpt" }, { route: "fal" }] });
    expect(() => make.startMake(PROJECT, { op: "image", shot: "s2", model: "muse-image", via: "muse-code" })).toThrow("Muse Image can't make this: Runs on Muse Code plan");
  });

  it("makes Nano Banana 2.1 stills on the Antigravity plan at no charge when Antigravity is signed in", async () => {
    plans.ready = ["antigravity"];
    const { fit } = make.startMake(PROJECT, { op: "image", shot: "s2" });
    expect(fit).toMatchObject({ model: "nano-banana-2.1", route: "antigravity", where: "Antigravity plan", usd: 0 });
    await make.driveJobs(PROJECT);
    expect(plans.asks).toEqual([{ route: "antigravity", prompt: "The cat strolls down the alley like it owns it", aspect: "9:16", refs: undefined }]);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", route: "antigravity", usd: 0, asset: "s2-take" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ provider: "antigravity", model: "nano-banana-2.1", costUsd: 0 });
  });

  it("brings a sheet in as the renamed one's when its cast member is renamed while it's made", async () => {
    // Nano Banana on fal: it waits in the queue a while.
    make.startMake(PROJECT, { op: "image", sheet: "cat", model: "nano-banana", count: 1 });
    store.updateFile(PROJECT, (d) => void renameCast(d, "cat", "marmalade"));
    expect(make.renameInJobs(PROJECT, "cat", "marmalade")).toBe(1);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ sheet: "marmalade", request: { cast: ["marmalade"] } });
    expect(make.listJobs(PROJECT)[0]!.request.prompt).toMatch(/^A photographic reference sheet of @marmalade in three panels/);
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", sheet: "marmalade", asset: "marmalade-sheet" });
    expect(store.loadFile(PROJECT).doc.cast!.find((m) => m.id === "marmalade")!.sheet).toBe("marmalade-sheet");
  });

  it("gives a model that takes more pictures more of the cast's, once it's picked", async () => {
    // Five characters with pictures: every still model takes four, Muse Image ten.
    store.updateFile(PROJECT, (d) => {
      for (const n of ["a", "b", "c", "d", "e"]) {
        d.assets.push({ id: `${n}-pic`, kind: "image", path: d.assets[0]!.path });
        d.cast!.push({ id: n, name: n.toUpperCase(), kind: "character", images: [`${n}-pic`] });
      }
    });
    const prompt = "@a, @b, @c, @d and @e at the table";
    expect(make.makeChoices(PROJECT, { op: "image", prompt }).req.refs).toEqual(["a-pic", "b-pic", "c-pic", "d-pic"]);
    provider({ image: "meta" });
    const { jobs } = make.startMake(PROJECT, { op: "image", prompt, model: "muse-image", count: 1 });
    expect(jobs[0]!.request.refs).toEqual(["a-pic", "b-pic", "c-pic", "d-pic", "e-pic"]);
    expect(jobs[0]!.request.sent).toContain("Reference pictures, in order: A, B, C, D, E.");
    await make.driveJobs(PROJECT);
    expect(JSON.parse(seen.direct[0]!.body).images).toHaveLength(5);
  });

  it("gives a sheet made from photos its style's picture too, when there's room", async () => {
    store.updateFile(PROJECT, (d) => {
      d.assets.push({ id: "noir-pic", kind: "image", path: d.assets[0]!.path });
      d.cast!.push({ id: "noir", name: "Film noir", kind: "style", about: "black and white", images: ["noir-pic"] });
      d.look = { ...(d.look ?? {}), style: "noir" };
    });
    provider({ image: "meta" });
    const { jobs } = make.startMake(PROJECT, { op: "image", sheet: "cat", model: "muse-image", count: 1 });
    expect(jobs[0]!.request.refs).toEqual(["cat-photo", "noir-pic"]);
    expect(jobs[0]!.request.sent).toMatch(/The reference photos show the cat: keep .* exactly\. The last reference picture shows the style to draw it in, not who or what it is\.$/);
    await make.driveJobs(PROJECT);
  });

  it("makes Nano Banana on a Gemini key, with the pictures inline and the shape in imageConfig", async () => {
    settings.services = { gemini: { addedAt: "2026-10-29" } };
    provider({ image: "gemini" });
    const { fit } = make.startMake(PROJECT, { op: "image", sheet: "cat", model: "nano-banana", count: 1 });
    expect(fit).toMatchObject({ route: "gemini", where: "Google Gemini", endpoint: "gemini-2.5-flash-image", usd: 0.039 });
    await make.driveJobs(PROJECT);
    expect(seen.direct[0]!.url).toBe("/gemini/models/gemini-2.5-flash-image:generateContent");
    const sent = JSON.parse(seen.direct[0]!.body) as { contents: { parts: Record<string, unknown>[] }[]; generationConfig: unknown };
    expect(sent.contents[0]!.parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: Buffer.from("the cat").toString("base64") } });
    expect(sent.generationConfig).toEqual({ responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } });
    // 300 tokens in at $0.30 a million and 1,290 out at $30.
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", route: "gemini", usd: 0.0388, asset: "cat-sheet" });

    // A key with no allowance for pictures says so once, rather than trying again and again.
    make.startMake(PROJECT, { op: "image", prompt: "the free tier", model: "nano-banana", count: 1 });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[1]).toMatchObject({ status: "failed", error: expect.stringContaining("limit: 0") });
    expect(seen.direct).toHaveLength(2);
  });

  it("gives Muse Image the cast's pictures as data in JSON, and GPT Image as files in a form", async () => {
    provider({ image: "meta" });
    make.startMake(PROJECT, { op: "image", sheet: "cat", model: "muse-image", count: 1 });
    await make.driveJobs(PROJECT);
    expect(seen.direct[0]!.url).toBe("/direct/meta/images/edits");
    const sent = JSON.parse(seen.direct[0]!.body) as Record<string, unknown>;
    expect(sent).toMatchObject({ model: "muse-image-1.0", size: "1536x864", response_format: "b64_json", images: [{ image_url: `data:image/jpeg;base64,${Buffer.from("the cat").toString("base64")}` }] });
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", usd: 0.01 });
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.sheet).toBe("cat-sheet");

    provider({ image: "openai" });
    make.startMake(PROJECT, { op: "image", shot: "s2", prompt: "@cat strolls down @alley", model: "gpt-image" });
    await make.driveJobs(PROJECT);
    expect(seen.direct[1]!.url).toBe("/direct/openai/images/edits");
    expect(seen.direct[1]!.type).toMatch(/^multipart\/form-data/);
    expect(seen.direct[1]!.body).toContain('name="image[]"; filename="');
    expect(seen.direct[1]!.body).toContain("a made picture");
  });

  it("says why when the service won't make it, and sends again after a hiccup", async () => {
    refuse = "alley";
    provider({ image: "meta" });
    make.startMake(PROJECT, { op: "image", shot: "s2", model: "muse-image" });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "failed", error: "Your request was rejected by the safety system." });
    expect(make.listJobs(PROJECT)[0]!.charged).toBeUndefined();

    // Busy once, then fine: nothing was made the first time, so it goes again.
    let busy = true;
    const real = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (busy && String(url).includes("/direct/")) {
        busy = false;
        return new Response(JSON.stringify({ error: { message: "Overloaded" } }), { status: 503 });
      }
      return real(url, init);
    });
    refuse = undefined;
    provider({ image: "meta" });
    make.startMake(PROJECT, { op: "image", shot: "s1", model: "muse-image" });
    await make.driveJobs(PROJECT);
    spy.mockRestore();
    expect(make.listJobs(PROJECT)[1]).toMatchObject({ status: "done", asset: "s1-take" });
  });

  it("can't pick up a still that was being made when the engine stopped, so it counts it and says so", async () => {
    const since = new Date().toISOString();
    provider({ image: "openai" });
    const [job] = make.startMake(PROJECT, { op: "image", shot: "s1", model: "gpt-image" }).jobs;
    await make.driveJobs(PROJECT);
    // As if the engine had stopped while it waited for the answer: running, no picture, a dead process's lock.
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT, "jobs");
    store.updateFile(PROJECT, (d) => {
      d.assets = d.assets.filter((a) => a.id !== "s1-take");
      d.cuts[0]!.shots.find((x) => x.id === "s1")!.content = { kind: "placeholder", description: "The cat slips out through the cat flap at dawn" };
    });
    writeFileSync(join(dir, `${job!.id}.json`), JSON.stringify({ ...job, status: "running" }));
    writeFileSync(join(dir, `${job!.id}.lock`), "999999");
    seen.direct = [];
    await make.driveJobs(PROJECT);
    expect(seen.direct).toHaveLength(0);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "failed", charged: true, error: expect.stringMatching(/^The engine stopped while this was being made/) });
    expect(make.spentSince(since)).toBeCloseTo(0.04, 3);

    // Trying again makes it again.
    make.retryJobs(PROJECT, [job!.id]);
    await make.driveJobs(PROJECT);
    expect(seen.direct).toHaveLength(1);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", asset: "s1-take" });
  });
});

describe("OpenRouter as a provider", () => {
  const connect = () => void (settings.services = { openrouter: { addedAt: "2026-11-26" } });
  const job = (id: string) => make.listJobs(PROJECT).find((j) => j.id === id)!;

  it("verifies keys against /key and reports key label and remaining limit", async () => {
    const { SERVICES } = await import("../src/services.ts");
    const svc = SERVICES.find((s) => s.id === "openrouter")!;
    expect(await svc.verify("test-key")).toMatchObject({ ok: true, detail: "sk-or-v1-test · $18.5 left on key" });
    expect(await svc.verify("wrong")).toMatchObject({ ok: false, detail: "That key was refused" });
  });

  it("makes stills synchronously with inline data-URL references and records exact usage.cost", async () => {
    connect();
    provider({ image: "openrouter" });
    const { fit, jobs } = make.startMake(PROJECT, { op: "image", sheet: "cat", model: "seedream-5-5", count: 1 });
    expect(fit).toMatchObject({ model: "seedream-5-5", route: "openrouter", where: "OpenRouter", endpoint: "bytedance-seed/seedream-5-5", aspect: "16:9", usd: 0.02 });
    await make.driveJobs(PROJECT);
    expect(openrouter.images).toHaveLength(1);
    expect(openrouter.images[0]).toMatchObject({
      model: "bytedance-seed/seedream-5-5",
      aspect_ratio: "16:9",
      resolution: "1K",
      output_format: "jpeg",
      response_format: "b64_json",
      seed: expect.any(Number),
      input_references: [{ type: "image_url", image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) } }],
    });
    expect(job(jobs[0]!.id)).toMatchObject({ status: "done", route: "openrouter", charged: true, usd: 0.0195 });
    const sheet = store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-sheet")!;
    expect(sheet.provenance).toMatchObject({ provider: "openrouter", model: "bytedance-seed/seedream-5-5", costUsd: 0.0195, refs: ["cat-photo"] });
    expect(readFileSync(sheet.path, "utf8")).toBe("an openrouter picture");
  });

  it("animates a board on Seedance 2.5 via OpenRouter, supports authenticated /content fallback, and handles failures", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
    connect();
    // OpenRouter's Seedance 2.5 is cheaper than fal, so it wins automatically without changing the preferred provider.
    const ask = { op: "video" as const, shot: "s2", prompt: "A red kite climbs over the hill", start: "s2-take", model: "seedance-2.5" };
    expect(make.makeChoices(PROJECT, ask).choices.ready.find((f) => f.model === "seedance-2.5")).toMatchObject({ route: "openrouter", also: [{ route: "fal" }] });

    const { fit, jobs } = make.startMake(PROJECT, ask);
    expect(fit).toMatchObject({ model: "seedance-2.5", route: "openrouter", endpoint: "bytedance/seedance-2.5", seconds: 4 });
    await make.driveJobs(PROJECT);
    expect(openrouter.videos[0]).toMatchObject({
      model: "bytedance/seedance-2.5",
      prompt: "A red kite climbs over the hill",
      duration: 4,
      resolution: "480p",
      generate_audio: true,
      seed: expect.any(Number),
      frame_images: [{ type: "image_url", image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) }, frame_type: "first_frame" }],
    });
    expect(openrouter.videos[0]).not.toHaveProperty("aspect_ratio");
    expect(job(jobs[0]!.id)).toMatchObject({ status: "done", route: "openrouter", charged: true, usd: 0.4412, remote: { id: "gen-vid-1" } });

    // Authenticated /videos/{id}/content download when OpenRouter returns only unsigned_urls.
    const fallback = make.startMake(PROJECT, { op: "video", shot: "s1", prompt: "An unsigned alley shot", model: "heygen-video-1" });
    await make.driveJobs(PROJECT);
    expect(openrouter.authedDownloads).toBe(1);
    expect(job(fallback.jobs[0]!.id)).toMatchObject({ status: "done", route: "openrouter", charged: true, usd: 0.4412 });

    // Failed job with $0 cost is not charged; billed upstream moderation keeps charged: true and exact cost.
    refuse = "blocked";
    const unbilled = make.startMake(PROJECT, { op: "video", shot: "s1", prompt: "A blocked scene", model: "wan-3", via: "openrouter" });
    await make.driveJobs(PROJECT);
    expect(job(unbilled.jobs[0]!.id)).toMatchObject({ status: "failed", error: "Upstream moderation blocked" });
    expect(job(unbilled.jobs[0]!.id).charged).toBeFalsy();

    const billed = make.startMake(PROJECT, { op: "video", shot: "s1", prompt: "A blocked billed scene", model: "wan-3", via: "openrouter" });
    await make.driveJobs(PROJECT);
    expect(job(billed.jobs[0]!.id)).toMatchObject({ status: "failed", charged: true, usd: 0.44 });
  });

  it("lip-syncs a board with HeyGen Avatar 6 on OpenRouter using compact MP3 speech data URL", async () => {
    connect();
    make.startMake(PROJECT, { op: "image", shot: "s2", model: "flux3-klein", via: "openrouter" });
    await make.driveJobs(PROJECT);
    // Add a voiced line heard while shot s2 plays.
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
    const lineFile = join(dir, "vo", "main", "line1.wav");
    mkdirSync(join(dir, "vo", "main"), { recursive: true });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "pcm_s16le", lineFile]);
    store.updateProject(PROJECT, (p) => {
      p.voice = { leadIn: 0, defaultGap: 0.2, tail: 0, lines: [{ id: "boast", text: "I own this alley.", file: "vo/main/line1.wav", duration: 2, words: [] }] };
      p.shots.find((s) => s.id === "s2")!.start = { kind: "line", line: "boast" };
    });

    const talk = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", speech: { lines: ["boast"] }, prompt: "Smirks and speaks calmly", model: "heygen-avatar-6" });
    expect(talk.fit).toMatchObject({ model: "heygen-avatar-6", route: "openrouter", endpoint: "heygen/heygen-avatar-6", seconds: 4.2 });
    await make.driveJobs(PROJECT);
    const sent = openrouter.videos.at(-1)!;
    expect(sent).toEqual({
      model: "heygen/heygen-avatar-6",
      prompt: "Smirks and speaks calmly",
      resolution: "1080p",
      input_references: [
        { type: "image_url", image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) } },
        { type: "audio_url", audio_url: { url: expect.stringMatching(/^data:audio\/mpeg;base64,/) } },
      ],
    });
    expect(job(talk.jobs[0]!.id)).toMatchObject({ status: "done", route: "openrouter", charged: true, usd: 0.4412 });
  });

  it("maps OpenRouter error codes cleanly and builds every still and video input shape", async () => {
    const { openrouterImage, openrouterImageInput, openrouterVideoInput, openrouterSubmit } = await import("../src/openrouter.ts");
    await expect(openrouterImage("openrouter-image-1k", "google/gemini-nano-banana-2.1", "wrong", { prompt: "x" })).rejects.toMatchObject({ message: expect.stringContaining("OpenRouter refused the key"), final: true });
    await expect(openrouterImage("openrouter-image-1k", "google/gemini-nano-banana-2.1", "test-key", { prompt: "broke" })).rejects.toMatchObject({ message: expect.stringContaining("out of credits"), final: true, funds: true });
    await expect(openrouterImage("openrouter-image-1k", "google/gemini-nano-banana-2.1", "test-key", { prompt: "huge" })).rejects.toMatchObject({ message: expect.stringContaining("too large"), final: true });
    refuse = "unsafe";
    await expect(openrouterImage("openrouter-image-1k", "google/gemini-nano-banana-2.1", "test-key", { prompt: "unsafe" })).rejects.toMatchObject({ message: "Provider returned error: Safety policy blocked", final: true });
    await expect(openrouterSubmit("test-key", { model: "alibaba/wan-3.0", prompt: "broke" })).rejects.toMatchObject({ funds: true, final: true });

    // Input shape unit checks across image and video adapters.
    expect(openrouterImageInput("openrouter-gpt-image", "openai/gpt-image-2.6-flare", { prompt: "x", aspect: "9:16", refs: ["u"] })).toEqual({
      model: "openai/gpt-image-2.6-flare",
      prompt: "x",
      response_format: "b64_json",
      aspect_ratio: "9:16",
      quality: "medium",
      output_format: "jpeg",
      output_compression: 92,
      input_references: [{ type: "image_url", image_url: { url: "u" } }],
    });
    expect(openrouterVideoInput("openrouter-seedance-2.5", "bytedance/seedance-2.5", { prompt: "x", quality: "final", seconds: 7, aspect: "9:16", refs: ["a"], camera: { url: "v", blockout: true } })).toEqual({
      model: "bytedance/seedance-2.5",
      prompt: "x The reference picture shows who and what is in it. The reference video is a blockout: keep its camera exactly (the move, the framing, the timing and where the cuts fall). Its grey set and its striped stand-ins only mark where things are and how big; none of them appears in the result.",
      duration: 7,
      resolution: "1080p",
      generate_audio: true,
      aspect_ratio: "9:16",
      input_references: [
        { type: "image_url", image_url: { url: "a" } },
        { type: "video_url", video_url: { url: "v" } },
      ],
    });
    expect(openrouterVideoInput("openrouter-gemini-omni", "google/gemini-omni-1.2-flash", { prompt: "x", quality: "final", seconds: 12, start: "u", end: "v", aspect: "4:5" })).toEqual({
      model: "google/gemini-omni-1.2-flash",
      prompt: "x",
      duration: 12,
      resolution: "1080p",
      aspect_ratio: "9:16",
      generate_audio: true,
      frame_images: [
        { type: "image_url", image_url: { url: "u" }, frame_type: "first_frame" },
        { type: "image_url", image_url: { url: "v" }, frame_type: "last_frame" },
      ],
    });
    expect(openrouterVideoInput("openrouter-hailuo-3", "minimax/hailuo-3", { prompt: "x", seconds: 6, aspect: "16:9", refs: ["r"] })).toEqual({
      model: "minimax/hailuo-3",
      prompt: "x The reference picture shows who and what is in it.",
      duration: 6,
      resolution: "2K",
      generate_audio: true,
      aspect_ratio: "16:9",
      input_references: [{ type: "image_url", image_url: { url: "r" } }],
    });
    expect(openrouterVideoInput("openrouter-heygen-video", "heygen/heygen-video-1", { prompt: "x", seconds: 8, start: "u", end: "v", seed: 42 })).toEqual({
      model: "heygen/heygen-video-1",
      prompt: "x",
      duration: 8,
      resolution: "480p",
      seed: 42,
      frame_images: [{ type: "image_url", image_url: { url: "u" }, frame_type: "first_frame" }],
    });
    expect(openrouterImageInput("openrouter-image-1k-jpeg-plain", "minimax/minimax-h3-image", { prompt: "x", aspect: "16:9", seed: 9, refs: ["u"] })).toEqual({
      model: "minimax/minimax-h3-image",
      prompt: "x",
      response_format: "b64_json",
      aspect_ratio: "16:9",
      resolution: "1K",
      output_format: "jpeg",
      input_references: [{ type: "image_url", image_url: { url: "u" } }],
    });
    expect(openrouterVideoInput("openrouter-happyhorse", "alibaba/happyhorse-1.1", { prompt: "x", quality: "final", seconds: 5, aspect: "16:9", refs: ["a"], seed: 11 })).toEqual({
      model: "alibaba/happyhorse-1.1",
      prompt: "x The reference picture shows who and what is in it.",
      duration: 5,
      resolution: "1080p",
      aspect_ratio: "16:9",
      seed: 11,
      input_references: [{ type: "image_url", image_url: { url: "a" } }],
    });
    expect(openrouterVideoInput("openrouter-grok-video", "x-ai/grok-imagine-video-1.5", { prompt: "x", quality: "final", seconds: 1, start: "u", end: "v" })).toEqual({
      model: "x-ai/grok-imagine-video-1.5",
      prompt: "x",
      duration: 1,
      resolution: "1080p",
      generate_audio: true,
      frame_images: [
        { type: "image_url", image_url: { url: "u" }, frame_type: "first_frame" },
        { type: "image_url", image_url: { url: "v" }, frame_type: "last_frame" },
      ],
    });
    expect(() => openrouterImageInput("unknown", "m", { prompt: "x" })).toThrow('no way to ask OpenRouter for "unknown" still models yet');
    expect(() => openrouterVideoInput("unknown", "m", { prompt: "x" })).toThrow('no way to ask OpenRouter for "unknown" video models yet');
  });
});

describe("multimodal reference audio (audioRefs)", () => {
  const connect = () => void (settings.services = { higgsfield: { addedAt: "2026-11-26" }, runway: { addedAt: "2026-11-26" }, openrouter: { addedAt: "2026-11-26" } });
  const hasAudioStream = (file: string) => {
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { encoding: "utf8" }).trim();
    return out.includes("audio");
  };

  it("maps audioRefs into provider inputs and role-specific prompt lines across fal, Higgsfield, Runway and OpenRouter", async () => {
    const { audioLine, falInput } = await import("../src/fal.ts");
    const { higgsfieldInput } = await import("../src/higgsfield.ts");
    const { runwayInput } = await import("../src/runway.ts");
    const { openrouterVideoInput } = await import("../src/openrouter.ts");

    const refs = [
      { url: "https://cdn/beat.wav", role: "music" as const, label: "theme" },
      { url: "https://cdn/cat.wav", role: "voice" as const, label: "Cat's voice" },
    ];
    expect(audioLine(refs, (n) => `@Audio${n}`)).toContain("@Audio1 (theme) is the music track");
    expect(audioLine(refs, (n) => `@Audio${n}`)).toContain("@Audio2 (Cat's voice) is the voice reference");

    // fal Seedance 2.5 (@Audio1, audio_urls) & Wan 3.0 (reference_audio_urls).
    expect(falInput("seedance-2.5", { prompt: "Dances.", seconds: 5, refs: ["i1"], audioRefs: refs })).toMatchObject({
      audio_urls: ["https://cdn/beat.wav", "https://cdn/cat.wav"],
      image_urls: ["i1"],
      prompt: expect.stringContaining("@Audio1 (theme) is the music track"),
    });
    expect(falInput("wan-3", { prompt: "Dances.", seconds: 5, audioRefs: [refs[0]!] })).toMatchObject({
      reference_audio_urls: ["https://cdn/beat.wav"],
      prompt: expect.stringContaining("The reference audio (theme) is the music track"),
    });

    // Higgsfield MAGI-2 (audio_urls + generate_audio: false when muteAudio), Seedance 2.5, Wan 3.0.
    expect(
      higgsfieldInput("magi-2", "sand/magi-2/reference-to-video", {
        prompt: "Dances.",
        seconds: 5,
        aspect: "9:16",
        refs: ["i1"],
        audioRefs: [refs[0]!],
        muteAudio: true,
      }).body,
    ).toMatchObject({
      audio_urls: ["https://cdn/beat.wav"],
      image_urls: ["i1"],
      generate_audio: false,
      aspect_ratio: "9:16",
    });
    expect(higgsfieldInput("seedance-2.5", "bytedance/seedance-2.5/reference-to-video", { prompt: "x", seconds: 5, audioRefs: [refs[1]!] }).body).toMatchObject({
      audio_urls: ["https://cdn/cat.wav"],
    });
    expect(higgsfieldInput("wan-3.0", "alibaba/wan-3.0/reference-to-video", { prompt: "x", seconds: 5, audioRefs: [refs[1]!] }).body).toMatchObject({
      audio_urls: ["https://cdn/cat.wav"],
    });

    // Runway Seedance 2.5, Wan 3.0 and MiniMax H3 (hailuo3) use referenceAudio.
    expect(runwayInput("seedance2_5", "seedance2_5", { prompt: "x", seconds: 5, audioRefs: [refs[0]!] })).toMatchObject({
      path: "text_to_video",
      body: { referenceAudio: [{ type: "audio", uri: "https://cdn/beat.wav" }] },
    });
    expect(runwayInput("wan3", "wan3", { prompt: "x", seconds: 5, audioRefs: [refs[0]!] }).body).toMatchObject({
      referenceAudio: [{ type: "audio", uri: "https://cdn/beat.wav" }],
    });
    expect(runwayInput("hailuo3", "hailuo3", { prompt: "x", seconds: 5, audioRefs: [refs[0]!] }).body).toMatchObject({
      referenceAudio: [{ type: "audio", uri: "https://cdn/beat.wav" }],
    });

    // OpenRouter Seedance 2.5 adds audio_url entries to input_references.
    expect(openrouterVideoInput("openrouter-seedance-2.5", "bytedance/seedance-2.5", { prompt: "x", seconds: 5, refs: ["i1"], audioRefs: [refs[0]!] })).toMatchObject({
      input_references: [
        { type: "image_url", image_url: { url: "i1" } },
        { type: "audio_url", audio_url: { url: "https://cdn/beat.wav" } },
      ],
    });
  });

  it("runs MAGI-2 with music audioRef + board + blockout (muting output audio) and with a short padded cast voiceSample (keeping output audio)", async () => {
    connect();
    // Create a board still on s2.
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);

    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
    const songFile = join(dir, "song.wav");
    const voiceFile = join(dir, "cat-voice.wav");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=10", "-c:a", "pcm_s16le", songFile]);
    // 0.8s voice sample (< 2s minSeconds) so we verify automatic silence padding to 2s.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=660:duration=0.8", "-c:a", "pcm_s16le", voiceFile]);
    const blockoutClip = join(dir, "blockout.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=540x960:r=25:d=4", "-pix_fmt", "yuv420p", blockoutClip]);
    make.setRenderStretch(async (_id, { out }) => writeFileSync(out, readFileSync(blockoutClip)));

    store.updateFile(PROJECT, (d) => {
      d.assets.push(
        { id: "song", kind: "music", path: songFile, label: "Alley Beat", duration: 10 },
        { id: "cat-voice", kind: "voice", path: voiceFile, label: "Cat sample", duration: 0.8 },
      );
      d.cast!.find((m) => m.id === "cat")!.voiceSample = "cat-voice";
    });
    store.updateProject(PROJECT, (p) => {
      p.music = { cues: [{ id: "m1", asset: "song", from: 0 }] };
      const s2 = p.shots.find((s) => s.id === "s2")!;
      s2.blockout = { beats: [{ id: "b1", duration: 4, component: "kit:Previs", props: { move: "orbit" } }] };
    });

    // 1. Plan & run MAGI-2 with start: "board" + camera: "blockout" + audioRefs: ["music"].
    const musicAsk = { op: "video" as const, shot: "s2", start: "board", camera: "blockout" as const, audioRefs: ["music" as const], prompt: "The cat struts to the beat.", model: "magi-2", count: 1 };
    const planned = make.planTake(PROJECT, musicAsk);
    expect(planned.pictures).toEqual([{ asset: "s2-take", as: "ref" }]);
    expect(planned.audioRefs).toEqual([{ kind: "music", from: 2.5, to: 5.7, label: "Alley Beat" }]);
    expect(planned.told).toContain("The reference audio (Alley Beat) is the music track");

    const started = make.startMake(PROJECT, musicAsk);
    expect(started.fit).toMatchObject({ model: "magi-2", route: "higgsfield", endpoint: "sand/magi-2/reference-to-video", seconds: 4 });
    await make.driveJobs(PROJECT);

    const musicSubmit = higgsfield.submits.at(-1)!;
    expect(musicSubmit.model).toBe("sand/magi-2/reference-to-video");
    expect(musicSubmit.body).toMatchObject({
      image_urls: [expect.stringMatching(/hf-upload-\d+\.jpg$/)],
      video_urls: [expect.stringMatching(/hf-upload-\d+\.mp4$/)],
      audio_urls: [expect.stringMatching(/hf-upload-\d+\.wav$/)],
      generate_audio: false,
      duration: 4,
      resolution: "1080p",
    });
    expect(higgsfield.uploads).toContain("audio/wav");

    const musicTake = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take-2")!;
    expect(musicTake.provenance?.params?.audioRefs).toEqual([{ kind: "music", from: 2.5, to: 5.7, label: "Alley Beat" }]);
    // Timeline-synced music ref strips output audio so it never echoes over the cut's song.
    expect(hasAudioStream(musicTake.path)).toBe(false);
    expect(shot("s2").content).toMatchObject({ kind: "generated", take: "s2-take-2", audioRefs: [{ kind: "music", from: 2.5, to: 5.7, label: "Alley Beat" }] });

    // 2. Run MAGI-2 with a short (0.8s) cast voice timbre sample: padded to 2s, generate_audio kept on, output keeps its audio stream.
    const voiceStarted = make.startMake(PROJECT, {
      op: "video",
      shot: "s2",
      start: "board",
      camera: null,
      audioRefs: [{ kind: "voice", cast: "cat" }],
      prompt: 'The cat says: "Welcome to my alley."',
      model: "magi-2",
      count: 1,
    });
    await make.driveJobs(PROJECT);

    const voiceSubmit = higgsfield.submits.at(-1)!;
    expect(voiceSubmit.body).toMatchObject({
      audio_urls: [expect.stringMatching(/hf-upload-\d+\.wav$/)],
      image_urls: [expect.stringMatching(/hf-upload-\d+\.jpg$/)],
    });
    expect(voiceSubmit.body).not.toHaveProperty("generate_audio");
    // Verify the prepared WAV cached for upload was padded up to 2.0s.
    const preparedWav = join(dir, ".cache", "audioref", `${voiceStarted.jobs[0]!.id}-0.wav`);
    const wavDur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", preparedWav], { encoding: "utf8" }).trim());
    expect(wavDur).toBeCloseTo(2, 1);

    const voiceTake = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take-3")!;
    // Voice timbre reference preserves generated audio on the output clip.
    expect(hasAudioStream(voiceTake.path)).toBe(true);
    expect(voiceTake.provenance?.refs).toContain("cat-voice");
  });
});

describe("decoupled face & wardrobe sheets, procedural compositing, and model-adaptive delivery", () => {
  it("generates bare portraits, 360° face sheets, and headless/ghost-mannequin outfit sheets (with zero face photos on outfit sheets)", async () => {
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
    const makePng = async (name: string, r: number, g: number, b: number) => {
      const p = join(dir, name);
      await sharp({ create: { width: 120, height: 150, channels: 3, background: { r, g, b } } }).png().toFile(p);
      return p;
    };
    const p1 = await makePng("will-photo-1.png", 180, 120, 90);
    const p2 = await makePng("will-photo-2.png", 170, 110, 85);

    store.updateFile(PROJECT, (d) => {
      d.assets.push(
        { id: "will-p1", kind: "image", path: p1, label: "Will front", provenance: { source: "import" } },
        { id: "will-p2", kind: "image", path: p2, label: "Will side", provenance: { source: "import" } },
      );
      d.cast!.push(
        {
          id: "will",
          name: "Galileo",
          kind: "character",
          about: "17-year-old with ginger hair and freckles",
          wears: "dark wool doublet and breeches",
          headwear: "none",
          seen: [{ asset: "will-p1" }, { asset: "will-p2" }],
          variants: [{ id: "battle", about: "torn, mud-splattered doublet with ripped sleeve" }],
        },
        {
          id: "cloak",
          name: "Inquisitor Cloak",
          kind: "wardrobe",
          about: "heavy black hooded Renaissance robe with silver clasp and white mask",
          headwear: "ghost",
        },
      );
    });

    // 1. Portrait (4:5 bare shoulders because headwear is not "face"): attaches to portrait.
    const portReq = make.requestFor(PROJECT, { op: "image", sheet: "will", sheetKind: "portrait" });
    expect(portReq.aspect).toBe("4:5");
    expect(portReq.refs).toEqual(["will-p1", "will-p2"]);
    expect(portReq.sent).toContain("bare neck and shoulders");
    expect(portReq.sent).not.toContain("dark wool doublet");
    make.startMake(PROJECT, { op: "image", sheet: "will", sheetKind: "portrait", count: 1 });
    await make.driveJobs(PROJECT);
    let will = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "will")!;
    expect(will.portrait).toBe("will-portrait");

    // 2. 360° Face Sheet (3:2 6-panel 3×2 turnaround anchored on chosen portrait + extra angled photos): attaches to faceSheet.
    const faceReq = make.requestFor(PROJECT, { op: "image", sheet: "will", sheetKind: "face-sheet" });
    expect(faceReq.aspect).toBe("3:2");
    expect(faceReq.refs).toEqual(["will-portrait", "will-p1", "will-p2"]);
    expect(faceReq.sent).toContain("3x2");
    expect(faceReq.sent).toContain("bare neck and shoulders");
    expect(faceReq.sent).toContain("natural facial hair");
    expect(faceReq.sent).not.toContain("dark wool doublet");
    // 2b. With usePortrait: false, face-sheet skips the chosen portrait and anchors directly on raw face photos (avoids costumed-portrait bleed).
    const rawFaceReq = make.requestFor(PROJECT, { op: "image", sheet: "will", sheetKind: "face-sheet", usePortrait: false });
    expect(rawFaceReq.refs).toEqual(["will-p1", "will-p2"]);
    expect(rawFaceReq.sent).toContain("do not clean-shave or add facial hair");
    make.startMake(PROJECT, { op: "image", sheet: "will", sheetKind: "face-sheet", count: 1 });
    await make.driveJobs(PROJECT);
    will = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "will")!;
    expect(will.faceSheet).toBe("will-face-sheet");
    expect(store.loadProject(PROJECT).project.assets.find((a) => a.id === "will-face-sheet")?.tags).toContain("face-sheet");

    // 3. Headless Outfit Sheet (1:1): sends ZERO face photos and clears realPeople so real-person filters don't block costumes!
    const outfitReq = make.requestFor(PROJECT, { op: "image", sheet: "will", sheetKind: "outfit-sheet" });
    expect(outfitReq.aspect).toBe("1:1");
    expect(outfitReq.refs).toBeUndefined();
    expect(outfitReq.realPeople).toBeUndefined();
    expect(outfitReq.sent).toContain("headless");
    expect(outfitReq.sent).toContain("dark wool doublet");
    make.startMake(PROJECT, { op: "image", sheet: "will", sheetKind: "outfit-sheet", count: 1 });
    await make.driveJobs(PROJECT);
    will = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "will")!;
    expect(will.outfitSheet).toBe("will-outfit-sheet");

    // 4. Outfit variant edits directly from the plain outfitSheet (still zero face photos / zero realPeople).
    const battleReq = make.requestFor(PROJECT, { op: "image", sheet: "will/battle", sheetKind: "outfit-sheet" });
    expect(battleReq.refs).toEqual(["will-outfit-sheet"]);
    expect(battleReq.realPeople).toBeUndefined();
    expect(battleReq.sent).toContain("torn, mud-splattered doublet");
    make.startMake(PROJECT, { op: "image", sheet: "will/battle", sheetKind: "outfit-sheet", count: 1 });
    await make.driveJobs(PROJECT);
    will = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "will")!;
    expect(will.variants![0]!.outfitSheet).toBe("will-battle-outfit-sheet");

    // 5. Reusable wardrobe entry with headwear: "ghost" defaults to outfit-sheet and uses ghost-mannequin wording.
    const cloakReq = make.requestFor(PROJECT, { op: "image", sheet: "cloak" });
    expect(cloakReq.aspect).toBe("1:1");
    expect(cloakReq.sent).toContain("over an empty neutral-gray void");
    make.startMake(PROJECT, { op: "image", sheet: "cloak", count: 1 });
    await make.driveJobs(PROJECT);
    const cloak = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cloak")!;
    expect(cloak.outfitSheet).toBe("cloak-outfit-sheet");
  });

  it("packs decoupled cast per model (split-single vs split-360 vs procedural sharp composite) and translates @ImageN on Seedance", async () => {
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
    const mkImg = async (name: string, w: number, h: number, r: number, g: number, b: number) => {
      const p = join(dir, name);
      await sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).jpeg().toFile(p);
      return p;
    };
    const [pFace, p360, pOutfit, pRobe, bPort, b360] = await Promise.all([
      mkImg("g-port.jpg", 400, 500, 210, 150, 120),
      mkImg("g-360.jpg", 600, 400, 200, 140, 110),
      mkImg("g-out.jpg", 500, 500, 60, 70, 95),
      mkImg("robe.jpg", 500, 500, 35, 35, 40),
      mkImg("b-port.jpg", 400, 500, 190, 160, 140),
      mkImg("b-360.jpg", 600, 400, 180, 150, 130),
    ]);

    store.updateFile(PROJECT, (d) => {
      d.assets.push(
        { id: "g-port", kind: "image", path: pFace, provenance: { source: "generated" } },
        { id: "g-360", kind: "image", path: p360, provenance: { source: "generated" } },
        { id: "g-out", kind: "image", path: pOutfit, provenance: { source: "generated" } },
        { id: "robe-out", kind: "image", path: pRobe, provenance: { source: "generated" } },
        { id: "b-port", kind: "image", path: bPort, provenance: { source: "generated" } },
        { id: "b-360", kind: "image", path: b360, provenance: { source: "generated" } },
      );
      d.cast!.push(
        { id: "robe", name: "Cloak", kind: "wardrobe", about: "black hooded cloak", headwear: "ghost", outfitSheet: "robe-out" },
        { id: "galileo", name: "Galileo", kind: "character", about: "young astronomer", wears: "wool doublet", portrait: "g-port", faceSheet: "g-360", outfitSheet: "g-out" },
        { id: "bobby", name: "Bobby", kind: "character", about: "tall inquisitor", portrait: "b-port", faceSheet: "b-360", outfit: "robe" },
      );
    });

    // 1. Grid-sensitive still model (nano-banana → split-single): gets [portrait, outfitSheet], never the 6-panel 360° grid.
    const nanoPlan = make.planTake(PROJECT, { op: "image", prompt: "@galileo stands by the telescope", model: "nano-banana", count: 1 });
    expect(nanoPlan.pictures).toEqual([
      { asset: "g-port", as: "ref", role: "portrait" },
      { asset: "g-out", as: "ref", role: "outfit" },
    ]);
    expect(nanoPlan.told).toContain("Image 1 is Galileo's portrait");
    expect(nanoPlan.told).toContain("Image 2 is Galileo's outfit turnaround");

    // 2. Instruction-following still model (gpt-image-sunburst → split-360): gets [faceSheet, outfitSheet].
    const gptPlan = make.planTake(PROJECT, { op: "image", prompt: "@galileo stands by the telescope", model: "gpt-image-sunburst", count: 1 });
    expect(gptPlan.pictures).toEqual([
      { asset: "g-360", as: "ref", role: "face-sheet" },
      { asset: "g-out", as: "ref", role: "outfit" },
    ]);
    expect(gptPlan.told).toContain("Image 1 is Galileo's 360-degree face sheet");

    // 3. Combined / tight-budget procedural compositing: builds real 1536×864 JPEG in .cache/castpack/, uploads 1 file per
    // character, and records both underlying real asset ids in provenance.refs.
    const { compositeSheet } = await import("../src/castpack.ts");
    const projLoaded = store.loadProject(PROJECT);
    const compPath1 = await compositeSheet(projLoaded.project, projLoaded.dir, { face: "g-port", outfit: "g-out", mode: "portrait-outfit" });
    const compPath2 = await compositeSheet(projLoaded.project, projLoaded.dir, { face: "g-port", outfit: "g-out", mode: "portrait-outfit" });
    expect(compPath1).toBe(compPath2);
    const meta = await sharp(compPath1).metadata();
    expect([meta.width, meta.height]).toEqual([1536, 864]);

    const uploadsBefore = seen.uploads;
    const compStart = make.startMake(PROJECT, {
      op: "image",
      prompt: "@galileo faces @bobby in the courtyard",
      model: "nano-banana",
      via: "fal",
      castPack: "combined",
      count: 1,
    });
    expect(compStart.jobs[0]!.request.packedRefs).toHaveLength(2);
    expect(compStart.jobs[0]!.request.packedRefs![0]).toMatchObject({ kind: "composite", face: "g-port", outfit: "g-out" });
    expect(compStart.jobs[0]!.request.packedRefs![1]).toMatchObject({ kind: "composite", face: "b-port", outfit: "robe-out" });
    await make.driveJobs(PROJECT);
    // Only 2 composited images uploaded (one per character), not 4!
    expect(seen.uploads - uploadsBefore).toBe(2);
    const compAsset = store.loadProject(PROJECT).project.assets.find((a) => a.provenance?.job === compStart.jobs[0]!.id)!;
    // Provenance records all 4 real underlying asset IDs (never synthetic cache IDs).
    expect(compAsset.provenance?.refs).toEqual(["g-port", "g-out", "b-port", "robe-out"]);

    // 4. Reference-to-video on Seedance 2.5 (fal) with no start board auto-attaches decoupled [faceSheet, outfitSheet]
    // and translates Image 1 / Image 2 role labels into @Image1 / @Image2!
    const seedanceStart = make.startMake(PROJECT, {
      op: "video",
      prompt: "@galileo turns slowly toward the lantern",
      model: "seedance-2.5",
      via: "fal",
      seconds: 4,
      count: 1,
    });
    expect(seedanceStart.fit).toMatchObject({ model: "seedance-2.5", route: "fal", endpoint: "bytedance/seedance-2.5/us/reference-to-video" });
    await make.driveJobs(PROJECT);
    const sentSeedance = seen.submits.filter((s) => s.endpoint === "bytedance/seedance-2.5/us/reference-to-video").at(-1)!;
    expect(sentSeedance.input.image_urls).toHaveLength(2);
    expect(String(sentSeedance.input.prompt)).toContain("@Image1 is Galileo's 360-degree face sheet");
    expect(String(sentSeedance.input.prompt)).toContain("@Image2 is Galileo's outfit turnaround");
  });

  it("generates full-body hero stills and multi-angle turnaround sheets for non-human characters without wardrobe or cropped-neck prompts", async () => {
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
    const petPhoto = join(dir, "mochi-photo.png");
    await sharp({ create: { width: 120, height: 120, channels: 3, background: { r: 220, g: 130, b: 60 } } }).png().toFile(petPhoto);

    store.updateFile(PROJECT, (d) => {
      d.assets.push({ id: "mochi-photo", kind: "image", path: petPhoto, label: "Mochi", provenance: { source: "import" } });
      d.cast!.push({
        id: "mochi",
        name: "Mochi",
        kind: "character",
        nonHuman: true,
        about: "orange tabby cat, white chest and paws, notch in left ear",
        seen: [{ asset: "mochi-photo" }],
        variants: [{ id: "heist", about: "wearing a tiny black eye mask" }],
      });
    });

    // Rejects human-only face-sheet and outfit-sheet kinds cleanly.
    expect(() => make.requestFor(PROJECT, { op: "image", sheet: "mochi", sheetKind: "face-sheet" })).toThrow(/non-human character/);
    expect(() => make.requestFor(PROJECT, { op: "image", sheet: "mochi", sheetKind: "outfit-sheet" })).toThrow(/non-human character/);

    // Hero still (portrait): 1:1 full-figure study, never "bare neck and shoulders" or "head-and-shoulders".
    const heroReq = make.requestFor(PROJECT, { op: "image", sheet: "mochi", sheetKind: "portrait" });
    expect(heroReq.aspect).toBe("1:1");
    expect(heroReq.refs).toEqual(["mochi-photo"]);
    expect(heroReq.sent).toContain("full-figure hero study");
    expect(heroReq.sent).not.toContain("bare neck and shoulders");

    // Full-body turnaround sheet: 16:9 multi-angle front/3/4/side/back, never "cropped at the neck", works directly from pet photo!
    const sheetReq = make.requestFor(PROJECT, { op: "image", sheet: "mochi", sheetKind: "sheet" });
    expect(sheetReq.aspect).toBe("16:9");
    expect(sheetReq.refs).toEqual(["mochi-photo"]);
    expect(sheetReq.sent).toContain("multi-angle full-body character turnaround sheet");
    expect(sheetReq.sent).not.toContain("cropped at the neck");

    make.startMake(PROJECT, { op: "image", sheet: "mochi", sheetKind: "sheet", count: 1 });
    await make.driveJobs(PROJECT);
    const mochi = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "mochi")!;
    expect(mochi.sheet).toBe("mochi-sheet");

    // Variant (@mochi/heist) anchors on the plain full-body turnaround sheet.
    const heistReq = make.requestFor(PROJECT, { op: "image", sheet: "mochi/heist", sheetKind: "sheet" });
    expect(heistReq.refs).toEqual(["mochi-sheet"]);
    expect(heistReq.sent).toContain("wearing a tiny black eye mask");
  });
});
