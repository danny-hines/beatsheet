import { describe, expect, it } from "vitest";
import type { CastMember } from "@beatsheet/schema";
import { activeMention, applyMention, castMentionItems, filterMentionItems, insertMentionAt, unknownCastMentions } from "../src/mentions.ts";

const cast: CastMember[] = [
  {
    id: "galileo",
    name: "Galileo (William)",
    kind: "character",
    about: "17-year-old boy with ginger hair",
    wears: "charcoal wool doublet",
    portrait: "gal-port",
    faceSheet: "gal-face",
    outfit: "galileo-outfit",
    variants: [
      {
        id: "bloodied",
        about: "Stage blood on beard and doublet",
        faceAbout: "Stage blood on face",
        portrait: "gal-blood-port",
        faceSheet: "gal-blood-face",
        outfit: "galileo-bloodied-outfit",
      },
    ],
  },
  {
    id: "bellarmine",
    name: "Cardinal Bellarmine (Danny)",
    kind: "character",
    about: "16-year-old cardinal",
    wears: "scarlet silk cassock",
    portrait: "bell-port",
    outfitSheet: "bell-outfit",
    variants: [{ id: "highland", about: "tartan kilt and bagpipes" }],
  },
  {
    id: "young-galileo",
    name: "Young Galileo (Andy)",
    kind: "character",
    about: "younger version",
    portrait: "yg-port",
  },
  {
    id: "character",
    name: "",
    kind: "character",
  },
  {
    id: "galileo-bloodied-outfit",
    name: "Galileo (William) (bloodied) outfit",
    kind: "wardrobe",
    about: "Stage blood on beard and doublet",
    outfitSheet: "gal-blood-outfit-sheet",
  },
  {
    id: "galileo-outfit",
    name: "Galileo outfit",
    kind: "wardrobe",
    about: "dark charcoal doublet",
    outfitSheet: "gal-outfit-sheet",
  },
  {
    id: "epic",
    name: "Period epic",
    kind: "style",
    about: "35mm cinema",
    images: ["epic-img"],
  },
];

describe("activeMention", () => {
  it("triggers right after @ at start, after whitespace, or after opening punctuation", () => {
    expect(activeMention("@", 1)).toEqual({ start: 0, end: 1, query: "" });
    expect(activeMention("Shot of @gal", 12)).toEqual({ start: 8, end: 12, query: "gal" });
    expect(activeMention("(@galileo/bl", 12)).toEqual({ start: 1, end: 12, query: "galileo/bl" });
    expect(activeMention("@galileo/", 9)).toEqual({ start: 0, end: 9, query: "galileo/" });
  });

  it("ignores emails, finished tokens after spaces, and double slashes", () => {
    expect(activeMention("user@example.com", 12)).toBeUndefined();
    expect(activeMention("@galileo lunges", 9)).toBeUndefined();
    expect(activeMention("@galileo/a/b", 12)).toBeUndefined();
  });

  it("extends end across the remainder of the token when the caret is mid-mention", () => {
    expect(activeMention("@galileo/bloodied lunges", 4)).toEqual({ start: 0, end: 17, query: "gal" });
    expect(activeMention("@galileo/bloodied lunges", 11)).toEqual({ start: 0, end: 17, query: "galileo/bl" });
  });
});

describe("castMentionItems & filterMentionItems", () => {
  const items = castMentionItems(cast);

  it("includes base members and variants with face and outfit thumbnails, putting unnamed placeholders last within kind", () => {
    expect(items.map((x) => x.id)).toEqual([
      "galileo",
      "galileo/bloodied",
      "bellarmine",
      "bellarmine/highland",
      "young-galileo",
      "character",
      "galileo-bloodied-outfit",
      "galileo-outfit",
      "epic",
    ]);
    const gal = items.find((x) => x.id === "galileo")!;
    expect(gal).toMatchObject({ thumb: "gal-port", outfitThumb: "gal-outfit-sheet", badge: "Plain" });
    const blood = items.find((x) => x.id === "galileo/bloodied")!;
    expect(blood).toMatchObject({ thumb: "gal-blood-port", outfitThumb: "gal-blood-outfit-sheet", badge: "Look", parentName: "Galileo (William)" });
  });

  it("surfaces a character's variants immediately underneath it when typing its name", () => {
    expect(filterMentionItems(items, "galileo").map((x) => x.id)).toEqual([
      "galileo",
      "galileo/bloodied",
      "galileo-bloodied-outfit",
      "galileo-outfit",
      "young-galileo",
    ]);
    expect(filterMentionItems(items, "gal").map((x) => x.id).slice(0, 2)).toEqual(["galileo", "galileo/bloodied"]);
  });

  it("narrows to variants when a slash is typed", () => {
    expect(filterMentionItems(items, "galileo/").map((x) => x.id)).toEqual(["galileo/bloodied"]);
    expect(filterMentionItems(items, "gal/bl").map((x) => x.id)).toEqual(["galileo/bloodied"]);
    expect(filterMentionItems(items, "galileo/nope")).toEqual([]);
  });

  it("matches variants directly by look name and characters by actor/display name", () => {
    expect(filterMentionItems(items, "blood").map((x) => x.id)).toEqual(["galileo/bloodied", "galileo-bloodied-outfit"]);
    expect(filterMentionItems(items, "high").map((x) => x.id)).toEqual(["bellarmine/highland"]);
    expect(filterMentionItems(items, "cardinal").map((x) => x.id)).toEqual(["bellarmine", "bellarmine/highland"]);
  });
});

describe("applyMention & insertMentionAt", () => {
  it("replaces an active mention cleanly and avoids duplicate spaces or spaces before punctuation", () => {
    const m1 = activeMention("Handheld: @gal", 14)!;
    expect(applyMention("Handheld: @gal", m1, "galileo/bloodied")).toEqual({
      text: "Handheld: @galileo/bloodied ",
      caret: 28,
      closedBySpace: true,
    });

    const m2 = activeMention("@galileo lunges", 8)!;
    expect(applyMention("@galileo lunges", m2, "galileo/bloodied")).toEqual({
      text: "@galileo/bloodied lunges",
      caret: 18,
      closedBySpace: true,
    });

    const m3 = activeMention("@galileo, who leans back", 8)!;
    expect(applyMention("@galileo, who leans back", m3, "galileo/bloodied")).toEqual({
      text: "@galileo/bloodied, who leans back",
      caret: 17,
      closedBySpace: false,
    });
  });

  it("inserts at caret or replaces active mention via insertMentionAt", () => {
    expect(insertMentionAt("In the forest", 13, "galileo/bloodied")).toEqual({
      text: "In the forest @galileo/bloodied ",
      caret: 32,
      closedBySpace: true,
    });
    expect(insertMentionAt("In the @gal forest", 11, "galileo/bloodied")).toEqual({
      text: "In the @galileo/bloodied forest",
      caret: 25,
      closedBySpace: true,
    });
  });
});

describe("unknownCastMentions", () => {
  it("recognizes valid base and variant mentions and flags unknown members or variants", () => {
    expect(unknownCastMentions("@galileo and @galileo/bloodied fight @bellarmine/highland", cast)).toEqual([]);
    expect(unknownCastMentions("@galileo/nope and @stranger", cast)).toEqual(["galileo/nope", "stranger"]);
  });
});
