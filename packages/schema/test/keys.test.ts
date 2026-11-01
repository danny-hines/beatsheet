import { describe, expect, it } from "vitest";
import { addKeyAt, KEY_DEFAULTS, keyValue, rampAt, rampSteps, removeKey, setKey, type Shot } from "../src/index.ts";

const shot = (): Shot => ({ id: "s1", track: "pic", fidelity: "rough", content: { kind: "clip", asset: "a" } });

describe("keys", () => {
  it("eases a value between keys, holds it before the first and after the last, and holds when told", () => {
    const keys = [
      { t: 1, scale: 1, ease: "linear" as const },
      { t: 3, scale: 2, ease: "hold" as const },
      { t: 4, scale: 1.5 },
    ];
    expect(keyValue(keys, "scale", 0, 9)).toBe(1);
    expect(keyValue(keys, "scale", 2, 9)).toBe(1.5);
    expect(keyValue(keys, "scale", 3.5, 9)).toBe(2);
    expect(keyValue(keys, "scale", 5, 9)).toBe(1.5);
    // Nothing keyed: the shot's own value.
    expect(keyValue(keys, "opacity", 2, 0.7)).toBe(0.7);
  });

  it("moves a value only between the keys that give it", () => {
    const keys = [{ t: 0, x: 0, opacity: 1, ease: "linear" as const }, { t: 1, opacity: 0, ease: "linear" as const }, { t: 2, x: 0.4 }];
    expect(keyValue(keys, "x", 1, 0)).toBeCloseTo(0.2);
    expect(keyValue(keys, "opacity", 0.5, 1)).toBeCloseTo(0.5);
  });

  it("sets a value for the whole shot until it's keyed, then at the playhead", () => {
    const s = shot();
    setKey(s, "scale", 1.2, 1.5);
    expect(s.keys).toEqual([{ t: 0, scale: 1.5 }]);
    addKeyAt(s, 2, ["scale"], KEY_DEFAULTS);
    setKey(s, "scale", 2, 2);
    expect(s.keys).toEqual([{ t: 0, scale: 1.5 }, { t: 2, scale: 2 }]);
    setKey(s, "scale", 1, 1.8);
    expect(s.keys!.map((k) => k.t)).toEqual([0, 1, 2]);
    removeKey(s, 1, "scale");
    expect(s.keys).toEqual([{ t: 0, scale: 1.5 }, { t: 2, scale: 2 }]);
    removeKey(s, 0);
    removeKey(s, 2);
    expect(s.keys).toBeUndefined();
  });

  it("adds a key holding what each value is at that moment", () => {
    const s = shot();
    s.keys = [{ t: 0, opacity: 1, ease: "linear" }, { t: 2, opacity: 0 }];
    addKeyAt(s, 1, ["opacity", "scale"], KEY_DEFAULTS);
    expect(s.keys[1]).toEqual({ t: 1, opacity: 0.5, scale: 1 });
  });
});

describe("speed ramps", () => {
  it("adds up the speed to know how far into the footage it is", () => {
    // From 1× to 3×, linearly, over 2 s: 2 s at an average of 2× is 4 s of footage.
    expect(rampAt(1, 3, 2, 2, "linear").source).toBeCloseTo(4, 2);
    expect(rampAt(1, 3, 2, 1, "linear")).toMatchObject({ speed: 2 });
  });

  it("plays as steady stretches that meet end to end and add up to the same footage", () => {
    const steps = rampSteps(1, 0.25, 4, "in-out", 8);
    expect(steps).toHaveLength(8);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!.source).toBeCloseTo(steps[i - 1]!.source + steps[i - 1]!.speed * steps[i - 1]!.seconds, 6);
    expect(steps[0]!.speed).toBeGreaterThan(0.9);
    expect(steps[7]!.speed).toBeLessThan(0.3);
  });
});
