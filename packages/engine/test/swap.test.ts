import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";

const root = mkdtempSync(join(tmpdir(), "beatsheet-swap-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

let server: Server;
let baseUrl: string;
let lastTeinRequest: Record<string, unknown> | undefined;
let outVideoBytes: Buffer;

let swap: typeof import("../src/swap.ts");
let make: typeof import("../src/make.ts");
let store: typeof import("../src/store.ts");
let settings: typeof import("../src/settings.ts");

function probeStreams(file: string): string[] {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { encoding: "utf8" });
  return out.trim().split(/\s+/).filter(Boolean);
}

beforeAll(async () => {
  const clipPath = join(root, "source.mp4");
  const outPath = join(root, "swapped-silent.mp4");
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=15:duration=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    clipPath,
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=#336699:s=320x180:r=15:duration=3",
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
      return res.end(JSON.stringify({ id: "gen-swap-1" }));
    }
    if (req.method === "GET" && url === "/v1/jobs/gen-swap-1") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: "succeeded", data: [{ url: `${baseUrl}/result.mp4` }], usage: { cost: 0.4 } }));
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
  swap = await import("../src/swap.ts");
  make = await import("../src/make.ts");
  store = await import("../src/store.ts");

  await settings.setSecret("tein", "tein-test-key");
  settings.updateSettings((s) => {
    s.services.tein = { addedAt: new Date().toISOString() };
  });

  const dir = join(process.env.BEATSHEET_PROJECTS!, "swap-demo");
  mkdirSync(join(dir, "footage"), { recursive: true });
  copyFileSync(clipPath, join(dir, "footage", "actor.mp4"));
  await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 210, g: 160, b: 120 } } }).png().toFile(join(dir, "footage", "hero-face.png"));

  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "swap-demo",
    title: "Swap Demo",
    sources: [{ id: "src", path: "footage" }],
    brief: { goal: "Test character swap" },
    assets: [
      {
        id: "a1",
        kind: "video",
        source: "src",
        path: "actor.mp4",
        label: "Actor walking",
        duration: 3,
        width: 320,
        height: 180,
        fps: 15,
        subjects: [{ id: "face-1", label: "Actor", kind: "face", samples: [[0, 0.3, 0.2, 0.4, 0.5], [3, 0.35, 0.2, 0.4, 0.5]] }],
      },
      { id: "hero-pic", kind: "image", source: "src", path: "hero-face.png", label: "Hero photo", width: 256, height: 256 },
    ],
    cast: [{ id: "hero", name: "Maya", kind: "character", about: "brown leather jacket, short black hair", faces: ["hero-pic"], portrait: "hero-pic", seen: [{ asset: "hero-pic" }] }],
    cuts: [
      {
        id: "main",
        name: "Main",
        recipe: "story",
        spec: {},
        formats: [{ id: "wide", label: "16:9", width: 1280, height: 720, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [{ id: "s1", track: "pic", fidelity: "rough", start: { kind: "time", t: 0 }, duration: 3, content: { kind: "clip", asset: "a1", in: 0 } }],
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

describe("Character Swap (Fast & Advanced conditioning + Tein routing + audio pitch shift)", () => {
  it("routes real-person cast swaps to Tein, runs conditioning + pitch shift, and lands as a clip version with sound", async () => {
    const plan = swap.swapPlan("swap-demo", "a1", { cast: "hero", mode: "advanced", from: 0, to: 3 });
    expect(plan.req.realPeople).toEqual(["Maya"]);
    expect(plan.choices.auto?.route).toBe("tein");
    expect(plan.subject?.id).toBe("face-1");

    let seenSubjectJson: string | undefined;
    const started = await swap.swapCharacter("swap-demo", "a1", {
      cast: "hero",
      mode: "advanced",
      from: 0,
      to: 3,
      pitchShift: -2,
      use: true,
      worker: async (args) => {
        seenSubjectJson = args.subjectJson;
        expect(existsSync(args.input)).toBe(true);
        copyFileSync(args.input, args.output);
      },
    });
    expect(seenSubjectJson && existsSync(seenSubjectJson)).toBe(false); // cleaned up after worker ran
    expect(started.pitchShifted).toBe(true);
    expect(started.fit.route).toBe("tein");
    expect(started.jobs).toHaveLength(1);

    await make.driveJobs("swap-demo");
    const done = make.listJobs("swap-demo").find((j) => j.id === started.jobs[0]!.id);
    expect(done?.status).toBe("done");
    expect(done?.asset).toBeTruthy();

    // Prompt sent to Tein should contain the swap conditioning instruction.
    expect(String(lastTeinRequest?.prompt ?? "")).toMatch(/replace the marked person/i);

    const { project, dir } = store.loadProject("swap-demo");
    const version = project.assets.find((a) => a.id === done!.asset)!;
    expect(version.version).toEqual({ of: "a1", from: 0 });
    expect(version.tags).toContain("swap");
    expect(version.provenance?.op).toBe("swap");
    // Shot s1 automatically switches to the swapped version.
    const s1 = project.shots.find((s) => s.id === "s1")!;
    expect(s1.content.kind === "clip" ? s1.content.version : undefined).toBe(version.id);
    // Shifted audio was muxed back into the silent generated video.
    const { assetPath } = await import("../src/paths.ts");
    const streams = probeStreams(assetPath(project, dir, version));
    expect(streams).toContain("video");
    expect(streams).toContain("audio");
  });
});
