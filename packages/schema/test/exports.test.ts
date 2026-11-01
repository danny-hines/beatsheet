import { describe, expect, it } from "vitest";
import { exportLanes, Project, resolveTimeline, SCHEMA_VERSION, STAGE_IDS, toOtio, toXmeml, type ProjectInput } from "../src/index.ts";

const make = (over: Partial<ProjectInput> = {}): Project =>
  Project.parse({
    schema: SCHEMA_VERSION,
    id: "t",
    title: "Bread",
    recipe: "story",
    brief: { goal: "test" },
    formats: [{ id: "land", label: "16:9", width: 1920, height: 1080, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "shots",
    assets: [
      { id: "a", kind: "video", path: "a.mp4", duration: 20, fps: 30, width: 1920, height: 1080 },
      { id: "song", kind: "music", path: "song.mp3", duration: 60 },
    ],
    tracks: [
      { id: "pic", kind: "picture", label: "Picture" },
      { id: "txt", kind: "text", label: "Text" },
    ],
    shots: [
      { id: "s1", track: "pic", duration: 2, content: { kind: "clip", asset: "a", in: 5 }, fidelity: "rough" },
      { id: "s2", track: "pic", duration: 1, content: { kind: "coded", component: "kit:Title" }, fidelity: "final" },
      { id: "s3", track: "pic", duration: 2, content: { kind: "clip", asset: "a", in: 10, speed: 2 }, fidelity: "rough" },
      { id: "t1", track: "txt", start: { kind: "time", t: 0 }, duration: 1, content: { kind: "text", text: "Hi" }, fidelity: "final" },
    ],
    music: { cues: [{ id: "m1", asset: "song", from: 30 }] },
    notes: [],
    ...over,
  });
const files = (p: Project) => (id: string) => {
  const a = p.assets.find((x) => x.id === id);
  return a ? { path: `C:\\Footage\\${a.path}`, duration: a.duration, fps: a.fps, width: a.width, height: a.height, audio: true } : undefined;
};

describe("the cut as a timeline for another editor", () => {
  it("lays footage out as clips of their files, anything else as named gaps, then the sound", () => {
    const p = make();
    const lanes = exportLanes(p, resolveTimeline(p), files(p), () => undefined);
    expect(lanes.map((l) => `${l.kind}:${l.name}:${l.items.length}`)).toEqual(["video:Picture:3", "audio:Clip sound:2", "audio:Music:1"]);
    expect(lanes[0]!.items[1]).toMatchObject({ name: "s2", start: 2, end: 3, note: "Designed: kit:Title" });
    expect(lanes[0]!.items[2]).toMatchObject({ from: 10, speed: 2 });
  });

  it("writes OpenTimelineIO, with gaps where there's nothing and a speed change as a time warp", () => {
    const p = make();
    const tl = resolveTimeline(p);
    const otio = JSON.parse(toOtio("Bread", exportLanes(p, tl, files(p), () => undefined), tl.duration, 30));
    const video = otio.tracks.children[0];
    expect(video.kind).toBe("Video");
    expect(video.children.map((c: { OTIO_SCHEMA: string }) => c.OTIO_SCHEMA)).toEqual(["Clip.2", "Gap.1", "Clip.2", "Gap.1"]);
    const first = video.children[0];
    expect(first.source_range.start_time).toEqual({ OTIO_SCHEMA: "RationalTime.1", rate: 30, value: 150 });
    expect(first.media_references.DEFAULT_MEDIA.target_url).toBe("file:///C:/Footage/a.mp4");
    expect(video.children[2].effects[0]).toMatchObject({ OTIO_SCHEMA: "LinearTimeWarp.1", time_scalar: 2 });
    // The music track starts 30 s into the song.
    expect(otio.tracks.children[2].children[0].source_range.start_time.value).toBe(900);
  });

  it("writes Final Cut Pro 7 XML that Premiere reads, each file described once", () => {
    const p = make();
    const tl = resolveTimeline(p);
    const xml = toXmeml("Bread", exportLanes(p, tl, files(p), () => undefined), tl.duration, { fps: 30, width: 1920, height: 1080 });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>')).toBe(true);
    expect(xml).toContain("<clipitem id=\"clip-1\"><name>s1</name><rate><timebase>30</timebase><ntsc>FALSE</ntsc></rate><start>0</start><end>60</end><in>150</in><out>210</out>");
    expect(xml.match(/<file id="file-1">/g)).toHaveLength(1);
    expect(xml).toContain('<file id="file-1"/>');
    expect(xml).toContain("<pathurl>file:///C:/Footage/a.mp4</pathurl>");
    expect(xml).toContain("<value>200</value>");
  });
});
