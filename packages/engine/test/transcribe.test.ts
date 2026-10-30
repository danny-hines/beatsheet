import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";

// Where projects live (and settings) is read when the engine's modules load, so they're imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-transcribe-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

// Keys for ElevenLabs and OpenAI unless a test takes them away.
const keys = vi.hoisted(() => ({ services: ["elevenlabs", "openai"] as string[] }));
vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return {
    ...real,
    getSecret: async (id: string) => (keys.services.includes(id) ? "test-key" : undefined),
    readSettings: () => ({ services: Object.fromEntries(keys.services.map((s) => [s, { addedAt: "2026-10-29" }])), checks: {} }),
  };
});
// Whisper on this computer: installed (quick or slow, as a test says) or not, and hearing the same three words.
const whisper = vi.hoisted(() => ({ speed: 0.04 as number | undefined, ran: 0 }));
vi.mock("../src/whispercpp.ts", () => ({
  whisperReady: () => (whisper.speed === undefined ? undefined : { binary: "whisper-cli", build: "windows-cuda", where: "the NVIDIA card", model: "best", speed: whisper.speed, at: "", bytes: 0 }),
  whisperStatus: async () =>
    whisper.speed === undefined ? { state: "missing", detail: "", plan: { where: "the processor", model: "good", bytes: 199_899_225 } } : { state: "ready", detail: "" },
  runWhisper: async (_bin: string, wav: string, opts: { onProgress?: (f: number) => void }) => {
    whisper.ran++;
    expect(wav).toMatch(/\.wav$/);
    opts.onProgress?.(1);
    return { words: [{ w: "Happy", s: 0.2, e: 0.6 }, { w: "birthday,", s: 0.6, e: 1.1 }, { w: "Lily.", s: 1.1, e: 1.5 }], language: "en", err: "" };
  },
}));

let t: typeof import("../src/transcribe.ts");
let store: typeof import("../src/store.ts");

// A stand-in for ElevenLabs' speech-to-text and OpenAI's transcriptions.
let server: Server;
let seen: { url: string; body: string }[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d.toString("latin1")));
    req.on("end", () => {
      seen.push({ url: req.url ?? "", body });
      const send = (data: unknown) => (res.writeHead(200, { "content-type": "application/json" }), res.end(JSON.stringify(data)));
      if (req.url === "/eleven/speech-to-text") {
        if (req.headers["xi-api-key"] !== "test-key") return (res.writeHead(401), res.end("{}"));
        return send({
          language_code: "en",
          words: [
            { text: "Happy", start: 0.2, end: 0.6, type: "word", speaker_id: "speaker_0" },
            { text: " ", start: 0.6, end: 0.6, type: "spacing", speaker_id: "speaker_0" },
            { text: "birthday!", start: 0.6, end: 1.1, type: "word", speaker_id: "speaker_0" },
            { text: "(laughter)", start: 1.2, end: 1.9, type: "audio_event", speaker_id: null },
            { text: "Thanks!", start: 2.0, end: 2.4, type: "word", speaker_id: "speaker_1" },
          ],
        });
      }
      if (req.url === "/openai/audio/transcriptions") return send({ language: "english", words: [{ word: "Happy", start: 0.2, end: 0.6 }, { word: "birthday", start: 0.6, end: 1.1 }] });
      res.writeHead(404);
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.BEATSHEET_ELEVENLABS = `${base}/eleven`;
  process.env.BEATSHEET_OPENAI = `${base}/openai`;
  t = await import("../src/transcribe.ts");
  store = await import("../src/store.ts");
});
afterAll(() => server.close());

const dir = join(root, "projects", "party");
beforeEach(() => {
  seen = [];
  keys.services = ["elevenlabs", "openai"];
  whisper.speed = 0.04;
  whisper.ran = 0;
  mkdirSync(dir, { recursive: true });
  // Three seconds of a clip with sound, and one without.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=160x90:r=10:d=3", "-f", "lavfi", "-i", "sine=d=3", "-shortest", "-pix_fmt", "yuv420p", join(dir, "cake.mp4")]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=160x90:r=10:d=2", "-pix_fmt", "yuv420p", join(dir, "silent.mp4")]);
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "party",
    title: "The party",
    sources: [],
    brief: { goal: "test" },
    assets: [
      { id: "cake", kind: "video", path: join(dir, "cake.mp4"), duration: 3 },
      { id: "silent", kind: "video", path: join(dir, "silent.mp4"), duration: 2 },
      { id: "photo", kind: "image", path: join(dir, "cake.mp4") },
    ],
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "montage",
        spec: {},
        formats: [{ id: "wide", label: "16:9", width: 1920, height: 1080, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
});

describe("transcribing on whatever this computer has", () => {
  it("uses Whisper here when it's quick, keeps the words beside the project, and notes it on the clip", async () => {
    const { transcript, choice } = await t.transcribeAsset("party", "cake");
    expect(choice).toMatchObject({ id: "whisper", where: "on the NVIDIA card" });
    expect(seen).toHaveLength(0);
    expect(transcript).toMatchObject({ by: "whisper", model: "best", language: "en", words: [{ w: "Happy", s: 0.2, e: 0.6 }, {}, {}] });
    expect(t.readTranscript("party", "cake")!.words).toHaveLength(3);
    expect(store.loadFile("party").doc.assets[0]!.transcript).toMatchObject({ by: "whisper", language: "en", words: 3 });
    expect(t.transcriptLines(transcript)).toEqual([{ s: 0.2, e: 1.5, text: "Happy birthday, Lily." }]);
    expect(t.transcriptLines(transcript, { search: "lily happy" })).toHaveLength(1);
    expect(t.transcriptLines(transcript, { search: "cake" })).toHaveLength(0);
  });

  it("sends it to a service when this computer is slow at it, and Scribe says who spoke and when they laughed", async () => {
    whisper.speed = 1.6;
    const { transcript, choice } = await t.transcribeAsset("party", "cake");
    expect(choice.id).toBe("scribe");
    expect(whisper.ran).toBe(0);
    expect(seen[0]!.url).toBe("/eleven/speech-to-text");
    expect(seen[0]!.body).toContain('name="model_id"\r\n\r\nscribe_v2');
    expect(seen[0]!.body).toContain('name="diarize"\r\n\r\ntrue');
    expect(transcript).toMatchObject({
      by: "scribe",
      words: [
        { w: "Happy", s: 0.2, e: 0.6, speaker: "speaker_0" },
        { w: "birthday!", s: 0.6, e: 1.1, speaker: "speaker_0" },
        { w: "Thanks!", s: 2.0, e: 2.4, speaker: "speaker_1" },
      ],
      events: [{ s: 1.2, e: 1.9, label: "laughter" }],
    });
    // Three seconds at 22¢ an hour.
    expect(transcript.costUsd).toBe(0);
    expect(store.loadFile("party").doc.assets[0]!.transcript).toMatchObject({ by: "scribe", speakers: 2 });
  });

  it("wants speakers: only a transcriber that tells them apart, even when Whisper here is quick", async () => {
    expect((await t.transcribeAsset("party", "cake", { speakers: true })).choice.id).toBe("scribe");
    keys.services = ["openai"];
    await expect(t.transcribeAsset("party", "cake", { speakers: true })).rejects.toThrow(
      "Nothing can transcribe it here now. Whisper: Can't tell who's speaking. Scribe: Needs an ElevenLabs key (Settings → Media services). Whisper on OpenAI: Can't tell who's speaking.",
    );
  });

  it("uses OpenAI's Whisper when asked, and says what's needed when nothing can do it", async () => {
    const { transcript } = await t.transcribeAsset("party", "cake", { with: "openai-whisper" });
    expect(seen[0]!.url).toBe("/openai/audio/transcriptions");
    expect(seen[0]!.body).toContain('name="timestamp_granularities[]"\r\n\r\nword');
    expect(transcript).toMatchObject({ by: "openai-whisper", model: "whisper-1", words: [{ w: "Happy", s: 0.2 }, { w: "birthday", s: 0.6 }] });

    whisper.speed = undefined;
    keys.services = [];
    await expect(t.transcribeAsset("party", "cake")).rejects.toThrow(
      "Nothing can transcribe it here now. Whisper: Install it in Settings → Transcription (about 200 MB, for the processor). Scribe: Needs an ElevenLabs key (Settings → Media services). Whisper on OpenAI: Needs an OpenAI key (Settings → Media services).",
    );
  });

  it("says when there's nothing to hear", async () => {
    await expect(t.transcribeAsset("party", "silent")).rejects.toThrow("It has no sound to transcribe");
    await expect(t.transcribeAsset("party", "photo")).rejects.toThrow("is a photo");
  });
});
