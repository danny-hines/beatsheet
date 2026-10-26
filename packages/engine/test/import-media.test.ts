import { describe, expect, it } from "vitest";
import { duplicateOf, type Seen } from "../src/ingest.ts";

const have: Seen[] = [
  { id: "v1", name: "PXL_20260412_101500.mp4", kind: "video", size: 9_000_000, capturedAt: "2026-04-12T10:15:00Z", duration: 12.4, width: 1920, height: 1080 },
  { id: "p1", name: "IMG_1234.HEIC", kind: "image", size: 2_400_000, capturedAt: "2026-04-12T10:20:03Z", width: 4032, height: 3024 },
];

describe("telling whether a downloaded file is already in the project", () => {
  it("matches the same file, a browser's second copy, and the same shot in another format", () => {
    expect(duplicateOf({ name: "PXL_20260412_101500.mp4", kind: "video", size: 9_000_000 }, have)?.id).toBe("v1");
    expect(duplicateOf({ name: "PXL_20260412_101500 (1).mp4", kind: "video", size: 9_000_000 }, have)?.id).toBe("v1");
    expect(duplicateOf({ name: "IMG_1234.JPG", kind: "image", size: 900_000, capturedAt: "2026-04-12T10:20:03Z" }, have)?.id).toBe("p1");
  });

  it("matches a renamed copy: the same bytes at the same second, or a video of the same length and size", () => {
    expect(duplicateOf({ name: "photo-7.heic", kind: "image", size: 2_400_000, capturedAt: "2026-04-12T10:20:03.400Z" }, have)?.id).toBe("p1");
    expect(duplicateOf({ name: "clip.mov", kind: "video", size: 5_000_000, capturedAt: "2026-04-12T10:15:00Z", duration: 12.43, width: 1920, height: 1080 }, have)?.id).toBe("v1");
  });

  it("lets in another photo from the same burst, and anything new", () => {
    expect(duplicateOf({ name: "IMG_1235.HEIC", kind: "image", size: 2_380_000, capturedAt: "2026-04-12T10:20:03Z" }, have)).toBeUndefined();
    expect(duplicateOf({ name: "PXL_20260413_090000.mp4", kind: "video", size: 7_000_000, capturedAt: "2026-04-13T09:00:00Z", duration: 8 }, have)).toBeUndefined();
  });
});

describe("a renamed copy with no capture date", () => {
  it("is caught by its bytes when the sizes match", () => {
    const seen: Seen[] = [{ id: "v2", name: "clip2.mp4", kind: "video", size: 14_927, hash: "abc" }];
    expect(duplicateOf({ name: "renamed-download.mp4", kind: "video", size: 14_927, hash: "abc" }, seen)?.id).toBe("v2");
    expect(duplicateOf({ name: "other.mp4", kind: "video", size: 14_927, hash: "def" }, seen)).toBeUndefined();
  });
});
