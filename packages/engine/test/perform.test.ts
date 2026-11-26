import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type FacePerformanceTrack, type ProjectFile } from "@beatsheet/schema";

const root = mkdtempSync(join(tmpdir(), "beatsheet-perform-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

let server: Server;
let baseUrl: string;
let lastTeinRequest: Record<string, unknown> | undefined;
let outVideoBytes: Buffer;

let perform: typeof import("../src/perform.ts");
let make: typeof import("../src/make.ts");
let store: typeof import("../src/store.ts");
let settings: typeof import("../src/settings.ts");

beforeAll(async () => {
  const driverPath = join(root, "webcam.mp4");
  const outPath = join(root, "performed.mp4");
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x320:rate=15:duration=3",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    driverPath,
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=#996633:s=320x320:r=15:duration=3",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outPath,
  ]);
  outVideoBytes = readFileSync(outPath);

  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = req.url ?? "";

    if (req.method === "POST" && url === "/v1/uploads") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ url: `${baseUrl}/uploaded/${Date.now().toString(36)}` }));
    }
    if (req.method === "POST" && url === "/v1/generate") {
      lastTeinRequest = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ id: "gen-perform-1" }));
    }
    if (req.method === "GET" && url === "/v1/jobs/gen-perform-1") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: "succeeded", data: [{ url: `${baseUrl}/result.mp4` }], usage: { cost: 0.35 } }));
    }
    if (req.method === "GET" && url === "/result.mp4") {
      res.writeHead(200, { "content-type": "video/mp4" });
      return res.end(outVideoBytes);
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  process.env.BEATSHEET_TEIN = `${baseUrl}/v1`;
  process.env.BEATSHEET_MAKE_POLL_MS = "25";

  settings = await import("../src/settings.ts");
  perform = await import("../src/perform.ts");
  make = await import("../src/make.ts");
  store = await import("../src/store.ts");

  await settings.setSecret("tein", "tein-test-key");
  settings.updateSettings((s) => {
    s.services.tein = { addedAt: new Date().toISOString() };
  });

  const dir = join(process.env.BEATSHEET_PROJECTS!, "perform-demo");
  mkdirSync(join(dir, "footage"), { recursive: true });
  copyFileSync(driverPath, join(dir, "footage", "webcam.mp4"));
  await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 240, g: 180, b: 90 } } }).png().toFile(join(dir, "footage", "cat-board.png"));

  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "perform-demo",
    title: "Perform Demo",
    sources: [{ id: "src", path: "footage" }],
    brief: { goal: "Test facial performance transfer" },
    assets: [
      { id: "rec1", kind: "video", source: "src", path: "webcam.mp4", label: "Director facial take", duration: 3, width: 320, height: 320, fps: 15, provenance: { source: "recorded" } },
      { id: "cat-board", kind: "image", source: "src", path: "cat-board.png", label: "Marmalade close-up board", width: 256, height: 256 },
    ],
    cast: [{ id: "cat", name: "Marmalade", kind: "character", about: "orange tabby cat with emerald eyes", sheet: "cat-board" }],
    cuts: [
      {
        id: "main",
        name: "Main",
        recipe: "film",
        spec: {},
        formats: [{ id: "wide", label: "16:9", width: 1280, height: 720, fps: 24 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [{ id: "s1", track: "pic", fidelity: "rough", start: { kind: "time", t: 0 }, duration: 3, content: { kind: "generated", prompt: "Marmalade looks shocked", cast: ["cat"], takes: ["cat-board"], take: "cat-board" } }],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
});

afterAll(() => {
  server?.close();
  rmSync(root, { recursive: true, force: true });
});

describe("Facial Performance Transfer (ARKit blendshapes -> clay mask -> Seedance 2.5)", () => {
  const syntheticTrack: FacePerformanceTrack = {
    version: 1,
    fps: 15,
    duration: 3,
    frames: [
      { t: 0, pose: { pitch: 0, yaw: 0, roll: 0 }, shapes: { browInnerUp: 0.1 } },
      { t: 1.5, pose: { pitch: -0.1, yaw: 0.2, roll: 0.05 }, shapes: { browInnerUp: 0.85, eyeWideLeft: 0.8, eyeWideRight: 0.8, jawOpen: 0.6 } },
      { t: 3.0, pose: { pitch: 0.05, yaw: -0.1, roll: 0 }, shapes: { mouthSmileLeft: 0.7, mouthSmileRight: 0.7 } },
    ],
  };

  it("caches extracted ARKit blendshape tracks, renders clay mask conditioning video, and lands a finished take on the target shot", async () => {
    // 1. Track performance & verify caching.
    const first = await perform.trackFacePerformance("perform-demo", "rec1", { tracker: async () => syntheticTrack });
    expect(first.reused).toBe(false);
    expect(first.track.frames).toHaveLength(3);
    expect(existsSync(first.file)).toBe(true);
    const cached = await perform.trackFacePerformance("perform-demo", "rec1");
    expect(cached.reused).toBe(true);

    // 2. Plan & run performance transfer onto shot s1 (@cat).
    const plan = perform.performPlan("perform-demo", { driver: "rec1", shot: "s1", cast: "cat", from: 0, to: 3 });
    expect(plan.refs).toContain("cat-board");
    expect(plan.choices.auto?.route).toBe("tein");

    const started = await perform.transferPerformance("perform-demo", {
      driver: "rec1",
      shot: "s1",
      cast: "cat",
      from: 0,
      to: 3,
      intensity: 1.2,
      renderer: async ({ out, track, intensity }) => {
        expect(track.frames).toHaveLength(3);
        expect(intensity).toBe(1.2);
        copyFileSync(join(root, "webcam.mp4"), out);
        return out;
      },
    });
    expect(started.frames).toBe(3);
    expect(existsSync(started.clayVideo)).toBe(true);

    await make.driveJobs("perform-demo");
    const done = make.listJobs("perform-demo").find((j) => j.id === started.jobs[0]!.id);
    expect(done?.status).toBe("done");
    expect(done?.asset).toBeTruthy();

    // Prompt sent to Tein includes the neutral clay-head performance transfer directive.
    expect(String(lastTeinRequest?.prompt ?? "")).toMatch(/neutral clay head/i);

    // Take landed on shot s1!
    const { project } = store.loadProject("perform-demo");
    const s1 = project.shots.find((s) => s.id === "s1")!;
    expect(s1.content.kind === "generated" ? s1.content.takes : []).toContain(done!.asset);
  });
});
