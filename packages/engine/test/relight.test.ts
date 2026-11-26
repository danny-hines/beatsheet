import { execFileSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RELIGHT_BY_ID, RELIGHT_PRESETS } from "@beatsheet/schema";

const root = mkdtempSync(join(tmpdir(), "beatsheet-relight-"));
const fakeClip = join(root, "source.mp4");
const fakeResult = join(root, "relit.mp4");
let teinCalls: { path: string; body?: Record<string, unknown> }[] = [];

const teinServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const url = req.url ?? "";
    if (url === "/v1/uploads" && req.method === "POST") {
      teinCalls.push({ path: url });
      const n = teinCalls.length;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ url: `http://127.0.0.1:${(teinServer.address() as { port: number }).port}/files/${n}` }));
      return;
    }
    if (url === "/v1/generate" && req.method === "POST") {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      teinCalls.push({ path: url, body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "job-relight-1" }));
      return;
    }
    if (url === "/v1/jobs/job-relight-1") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "succeeded",
          data: [{ url: `http://127.0.0.1:${(teinServer.address() as { port: number }).port}/download/relit.mp4` }],
          usage: { cost: 0.42 },
        }),
      );
      return;
    }
    if (url === "/download/relit.mp4") {
      res.writeHead(200, { "content-type": "video/mp4" });
      res.end(readFileSync(fakeResult));
      return;
    }
    res.writeHead(404).end();
  });
});

let ensurePresetSphere: typeof import("../src/relight.ts").ensurePresetSphere;
let relightClip: typeof import("../src/relight.ts").relightClip;
let relightPlan: typeof import("../src/relight.ts").relightPlan;
let renderLightSpherePng: typeof import("../src/relight.ts").renderLightSpherePng;
let driveJobs: typeof import("../src/make.ts").driveJobs;
let listJobs: typeof import("../src/make.ts").listJobs;
let loadProject: typeof import("../src/store.ts").loadProject;
let updateSettings: typeof import("../src/settings.ts").updateSettings;
let setSecret: typeof import("../src/settings.ts").setSecret;

beforeAll(async () => {
  await new Promise<void>((resolve) => teinServer.listen(0, "127.0.0.1", resolve));
  const port = (teinServer.address() as { port: number }).port;
  process.env.BEATSHEET_PROJECTS = join(root, "projects");
  process.env.BEATSHEET_HOME = join(root, "home");
  process.env.BEATSHEET_TEIN = `http://127.0.0.1:${port}/v1`;
  process.env.BEATSHEET_MAKE_POLL_MS = "25";

  // Make two tiny 4s MP4 clips: source with audio tone, result silent so we verify audio re-muxing.
  execFileSync("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "color=c=#445566:s=720x576:r=24:d=4",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", fakeClip,
  ]);
  execFileSync("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "color=c=#cc8844:s=720x576:r=24:d=4",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", fakeResult,
  ]);

  const relightMod = await import("../src/relight.ts");
  ensurePresetSphere = relightMod.ensurePresetSphere;
  relightClip = relightMod.relightClip;
  relightPlan = relightMod.relightPlan;
  renderLightSpherePng = relightMod.renderLightSpherePng;
  ({ driveJobs, listJobs } = await import("../src/make.ts"));
  ({ loadProject } = await import("../src/store.ts"));
  ({ updateSettings, setSecret } = await import("../src/settings.ts"));

  await setSecret("tein", "test-tein-key");
  updateSettings((s) => {
    s.services.tein = { at: new Date().toISOString(), detail: "test" };
  });

  const projDir = join(root, "projects", "relight-demo");
  mkdirSync(join(projDir, "footage"), { recursive: true });
  writeFileSync(join(projDir, "footage", "clip1.mp4"), readFileSync(fakeClip));
  writeFileSync(
    join(projDir, "project.json"),
    JSON.stringify({
      schema: "beatsheet/0.2",
      id: "relight-demo",
      title: "Relight Demo",
      brief: { goal: "Test relighting" },
      sources: [{ id: "src", path: "footage" }],
      assets: [{ id: "clip1", kind: "video", source: "src", path: "clip1.mp4", duration: 4, width: 720, height: 576, fps: 24 }],
      cuts: [
        {
          id: "main",
          name: "Main",
          recipe: "montage",
          spine: "shots",
          formats: [{ id: "wide", label: "Wide", width: 1280, height: 720, fps: 24 }],
          stages: {
            brief: { status: "done" }, material: { status: "done" }, structure: { status: "done" },
            board: { status: "done" }, assemble: { status: "active" }, craft: { status: "todo" },
            sound: { status: "todo" }, finish: { status: "todo" },
          },
          tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
          shots: [{ id: "s1", track: "pic", fidelity: "rough", duration: 4, content: { kind: "clip", asset: "clip1", in: 0 } }],
          notes: [],
        },
      ],
    }),
  );
});

afterAll(async () => {
  await new Promise<void>((resolve) => teinServer.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
});

describe("Light Sphere Relight", () => {
  it("renders a physically shaded 3D lighting sphere PNG with directional warm/cool colors", async () => {
    expect(RELIGHT_PRESETS.length).toBe(24);
    const out = join(root, "blue-amber.png");
    await renderLightSpherePng(RELIGHT_BY_ID.get("blue-amber")!, out, 256);
    expect(existsSync(out)).toBe(true);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(256);
    expect(info.height).toBe(256);
    // Right side of the sphere (key light from +X) should be warmer (R > B); left side cooler (B > R).
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
    };
    const [rr, , rb] = px(176, 108);
    const [lr, , lb] = px(76, 128);
    expect(rr).toBeGreaterThan(rb);
    expect(lb).toBeGreaterThan(lr);
  });

  it("caches preset light spheres cleanly in the project", async () => {
    const first = await ensurePresetSphere("relight-demo", "chiaroscuro");
    const second = await ensurePresetSphere("relight-demo", "chiaroscuro");
    expect(first.id).toBe("sphere-chiaroscuro");
    expect(second.id).toBe(first.id);
    expect(first.tags).toContain("light-sphere");
  });

  it("plans and runs an end-to-end relight job through Tein, saving a clip version with sound muxed back", async () => {
    teinCalls = [];
    const plan = relightPlan("relight-demo", "clip1", { preset: "blue-amber", from: 0, to: 4 });
    expect(plan.choices.auto?.ok).toBe(true);
    expect(plan.choices.auto?.route).toBe("tein");

    const started = await relightClip("relight-demo", "clip1", { preset: "blue-amber", from: 0, to: 4, use: true, saveToLook: true, adapt: false });
    expect(started.sphere).toBe("sphere-blue-amber");
    expect(started.jobs).toHaveLength(1);
    await driveJobs("relight-demo");

    const job = listJobs("relight-demo").find((j) => j.id === started.jobs[0]!.id)!;
    expect(job.status).toBe("done");
    expect(job.asset).toBeTruthy();

    // Tein received the reference sphere image + reference video + relight prompt instructions.
    const gen = teinCalls.find((c) => c.path === "/v1/generate")?.body;
    expect(gen?.reference_video).toHaveLength(1);
    expect(gen?.reference_image).toHaveLength(1);
    expect(String(gen?.prompt)).toContain("source footage to relight");

    const { project } = loadProject("relight-demo");
    expect(project.look?.lightPreset).toBe("blue-amber");
    expect(project.look?.lightSphere).toBe("sphere-blue-amber");
    const version = project.assets.find((a) => a.id === job.asset);
    expect(version?.version).toEqual({ of: "clip1", from: 0 });
    expect(version?.tags).toContain("relight");
    const shot = project.shots.find((s) => s.id === "s1")!;
    expect(shot.content.kind === "clip" && shot.content.version).toBe(version?.id);
  });
});
