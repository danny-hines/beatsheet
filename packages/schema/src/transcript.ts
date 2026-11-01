/**
 * What was said in a clip: every word with its time (and who said it, when the transcriber can tell), from whichever
 * transcriber suits the machine. Whisper runs on the computer itself through whisper.cpp, quick with a graphics card
 * and slow on an old laptop's processor; services do it elsewhere, with the person's key. Which can be used, and which
 * Auto picks, depends on the machine and the keys, never on one machine in particular. Pure, so the studio and the
 * agent's tools give the same answer.
 */

/** A word as it was said, in seconds into the clip. `speaker` is the transcriber's own label ("speaker_1"). */
export type SaidWord = { w: string; s: number; e: number; speaker?: string };

export type Transcript = {
  /** The transcriber's id in TRANSCRIBERS, and the model it used. */
  by: string;
  model?: string;
  language?: string;
  at: string;
  words: SaidWord[];
  /** Sounds that aren't words, when the transcriber marks them: laughter, applause, music. */
  events?: { s: number; e: number; label: string }[];
  /** What it cost, in US dollars, when it was a service. */
  costUsd?: number;
};

export type Transcriber = {
  id: string;
  label: string;
  by: string;
  /** One line on what it's for. */
  note: string;
  /** On this computer, or a service. */
  runs: "here" | "service";
  /** What it needs: a service's key ("elevenlabs") or an install ("whisper-cpp"). */
  needs: string;
  gives: { words: boolean; speakers: boolean; events?: boolean };
  /** US dollars an hour of audio; none when it's free. */
  perHour?: number;
};

export const TRANSCRIBERS: Transcriber[] = [
  {
    id: "whisper",
    label: "Whisper",
    by: "OpenAI, run by whisper.cpp",
    note: "Free, and the audio never leaves this computer. Quick with a graphics card or Apple silicon; slow on an older laptop's processor. Tells speakers apart once Who's speaking is installed with it.",
    runs: "here",
    needs: "whisper-cpp",
    gives: { words: true, speakers: false },
  },
  {
    id: "scribe",
    label: "Scribe",
    by: "ElevenLabs",
    note: "Says who's speaking, and marks laughter and applause. Uses your ElevenLabs credits.",
    runs: "service",
    needs: "elevenlabs",
    gives: { words: true, speakers: true, events: true },
    // elevenlabs.io/pricing/api: Scribe v2, batch.
    perHour: 0.22,
  },
  {
    id: "openai-whisper",
    label: "Whisper on OpenAI",
    by: "OpenAI",
    note: "The same Whisper, on OpenAI's computers: for a machine that's slow at it.",
    runs: "service",
    needs: "openai",
    gives: { words: true, speakers: false },
    // platform.openai.com/docs/pricing: whisper-1, $0.006 a minute.
    perHour: 0.36,
  },
];

/**
 * Whether a transcriber can be used on this machine now. `speed` is seconds of work for a second of audio, measured
 * here when it was set up (0.05 is twenty times faster than the clip plays). `where` says what it runs on. `speakers`
 * says one that can't tell speakers apart by itself can here (Whisper, with speaker labelling installed beside it).
 */
export type TranscriberState =
  | { state: "ready"; speed?: number; where?: string; speakers?: boolean }
  | { state: "install"; detail: string }
  | { state: "key"; detail: string }
  | { state: "unfit"; detail: string };

export type TranscriberChoice = {
  id: string;
  label: string;
  ok: boolean;
  /** Why it can't be used now, and what would let it. */
  why?: string;
  /** What it's waiting on: something to install, a key, or nothing it can get on this machine. */
  kind?: "install" | "key" | "unfit" | "speakers";
  where?: string;
  /** For the clip asked about: about how long (seconds) and what it would cost (US dollars). */
  seconds?: number;
  usd?: number;
};

/** On this computer, slower than this (a quarter of the clip's length) is slow enough that a service is the better pick. */
export const SLOW = 0.25;

/**
 * The transcribers for a clip, with Auto first: the person's own order when they've set one; otherwise Whisper here
 * when this machine is quick at it, then the services cheapest first, then Whisper here even though it's slow.
 * Wanting speakers leaves out the ones that can't tell them apart.
 */
export function chooseTranscriber(
  states: Record<string, TranscriberState>,
  ask: { seconds?: number; speakers?: boolean },
  ranking: string[] = [],
  catalog: Transcriber[] = TRANSCRIBERS,
): { auto?: TranscriberChoice; ready: TranscriberChoice[]; setup: TranscriberChoice[] } {
  const all = catalog.map((t): TranscriberChoice => {
    const s = states[t.id] ?? { state: "unfit", detail: "Not available here" };
    const base = { id: t.id, label: t.label };
    if (ask.speakers && !t.gives.speakers && !(s.state === "ready" && s.speakers))
      return { ...base, ok: false, kind: "speakers", why: t.runs === "here" && s.state === "ready" ? "Needs Who's speaking installed with it (Settings → Transcription)" : "Can't tell who's speaking" };
    if (s.state !== "ready") return { ...base, ok: false, kind: s.state, why: s.detail };
    const seconds = ask.seconds !== undefined && s.speed !== undefined ? Math.round(ask.seconds * s.speed) : undefined;
    const usd = ask.seconds !== undefined && t.perHour !== undefined ? Math.round((ask.seconds / 3600) * t.perHour * 1000) / 1000 : undefined;
    return { ...base, ok: true, where: s.where, ...(seconds !== undefined ? { seconds } : {}), ...(usd !== undefined ? { usd } : {}) };
  });
  const rankOf = (c: TranscriberChoice) => {
    const i = ranking.indexOf(c.id);
    if (i !== -1) return i;
    const t = catalog.find((x) => x.id === c.id)!;
    const s = states[c.id];
    const slow = t.runs === "here" && s?.state === "ready" && (s.speed ?? 0) > SLOW;
    return ranking.length + (t.runs === "here" ? (slow ? 2000 : 0) : 1000 + (t.perHour ?? 0));
  };
  const ready = all.filter((c) => c.ok).sort((a, b) => rankOf(a) - rankOf(b));
  return { auto: ready[0], ready, setup: all.filter((c) => !c.ok) };
}

/** Who spoke when, from a speaker labeller: turns in seconds, each with the labeller's name for the voice. */
export type SpeakerTurn = { s: number; e: number; speaker: string };

/**
 * Gives each word the speaker whose turn it falls in most; a word between turns takes the nearest one within half a
 * second, and one further off is left without. Speakers are named in the order they first speak: speaker_0, speaker_1…
 */
export function assignSpeakers(words: SaidWord[], turns: SpeakerTurn[]): SaidWord[] {
  const order = new Map<string, string>();
  const name = (raw: string) => order.get(raw) ?? order.set(raw, `speaker_${order.size}`).get(raw)!;
  const sorted = [...turns].sort((a, b) => a.s - b.s);
  return words.map((w) => {
    let best: SpeakerTurn | undefined;
    let most = 0;
    for (const t of sorted) {
      const overlap = Math.min(w.e, t.e) - Math.max(w.s, t.s);
      if (overlap > most) [best, most] = [t, overlap];
    }
    if (!best) {
      const gap = (t: SpeakerTurn) => Math.max(t.s - w.e, w.s - t.e, 0);
      const near = sorted.reduce<SpeakerTurn | undefined>((a, t) => (!a || gap(t) < gap(a) ? t : a), undefined);
      if (near && gap(near) <= 0.5) best = near;
    }
    const { speaker: _old, ...rest } = w;
    return best ? { ...rest, speaker: name(best.speaker) } : rest;
  });
}

/** "speaker_1" as people read it: Speaker 2. */
export const speakerLabel = (speaker: string) => (/^speaker_\d+$/.test(speaker) ? `Speaker ${Number(speaker.slice(8)) + 1}` : speaker);

/** The cast member a speaker in a clip's transcript is, when they've been named. */
export function whoSpeaks<T extends { id: string; heard?: { asset: string; speaker: string }[] }>(cast: T[] | undefined, asset: string, speaker: string): T | undefined {
  return cast?.find((m) => m.heard?.some((h) => h.asset === asset && h.speaker === speaker));
}

/**
 * When a clip is transcribed again its speakers get new labels: each old label becomes the new one most of its words
 * now have, by time, so names given to speakers carry over. Labels with no words in common are left out.
 */
export function remapSpeakers(before: SaidWord[], after: SaidWord[]): Record<string, string> {
  const tally = new Map<string, Map<string, number>>();
  for (const o of before) {
    if (!o.speaker) continue;
    for (const n of after) {
      if (!n.speaker || n.e <= o.s || n.s >= o.e) continue;
      const t = tally.get(o.speaker) ?? new Map<string, number>();
      t.set(n.speaker, (t.get(n.speaker) ?? 0) + Math.min(o.e, n.e) - Math.max(o.s, n.s));
      tally.set(o.speaker, t);
    }
  }
  return Object.fromEntries([...tally].map(([old, t]) => [old, [...t].sort((a, b) => b[1] - a[1])[0]![0]]));
}

/** The voice group `turns` mostly give a stretch of time, and how much of the stretch that is (0..1). */
function groupOf(turns: SpeakerTurn[], s: number, e: number): { group?: string; share: number } {
  const tally = new Map<string, number>();
  for (const t of turns) {
    const overlap = Math.min(e, t.e) - Math.max(s, t.s);
    if (overlap > 0) tally.set(t.speaker, (tally.get(t.speaker) ?? 0) + overlap);
  }
  const all = [...tally.values()].reduce((a, b) => a + b, 0);
  const [group, most] = [...tally].sort((a, b) => b[1] - a[1])[0] ?? [];
  return { group, share: all ? most! / all : 0 };
}

/**
 * Which known people a clip's speakers are, from one labelling run over each known person's voice sample and then the
 * clip (starting at `offset` seconds): a sample's group is the voice group it mostly falls in, and a clip speaker's is
 * the one their words mostly fall in. A clip speaker whose group holds exactly one person's sample is that person; a
 * group two people's samples share decides nothing, and nor does a sample split between groups.
 */
export function voicesFromTurns(turns: SpeakerTurn[], samples: { who: string; s: number; e: number }[], words: SaidWord[], offset: number): Record<string, string> {
  const owners = new Map<string, Set<string>>();
  for (const x of samples) {
    const g = groupOf(turns, x.s, x.e);
    if (!g.group || g.share < 0.6) continue;
    owners.set(g.group, (owners.get(g.group) ?? new Set()).add(x.who));
  }
  const bySpeaker = new Map<string, Map<string, number>>();
  for (const w of words) {
    if (!w.speaker) continue;
    for (const t of turns) {
      const overlap = Math.min(w.e + offset, t.e) - Math.max(w.s + offset, t.s);
      if (overlap <= 0) continue;
      const m = bySpeaker.get(w.speaker) ?? new Map<string, number>();
      m.set(t.speaker, (m.get(t.speaker) ?? 0) + overlap);
      bySpeaker.set(w.speaker, m);
    }
  }
  const out: Record<string, string> = {};
  for (const [speaker, groups] of bySpeaker) {
    const [group] = [...groups].sort((a, b) => b[1] - a[1])[0]!;
    const who = owners.get(group);
    if (who?.size === 1) out[speaker] = [...who][0]!;
  }
  return out;
}

/**
 * A stretch of someone's voice to recognise them by: their longest lines in a transcript, up to `most` seconds in
 * all, earliest first.
 */
export function voiceSample(t: Pick<Transcript, "words">, speaker: string, most = 12): { s: number; e: number }[] {
  const lines = linesOf(t).filter((l) => l.speaker === speaker && l.e - l.s >= 0.6);
  const out: { s: number; e: number }[] = [];
  let total = 0;
  for (const l of [...lines].sort((a, b) => b.e - b.s - (a.e - a.s))) {
    if (total >= most) break;
    const e = Math.min(l.e, l.s + (most - total));
    out.push({ s: l.s, e });
    total += e - l.s;
  }
  return out.sort((a, b) => a.s - b.s);
}

/** A face or person found in a clip, as faces and voices are paired: its id and its boxes over time ([t, x, y, w, h]). */
type Seen = { id: string; kind: string; samples: number[][] };

/**
 * Which face is whose voice in a clip, by who's on screen while each speaker talks. Every word a speaker says credits
 * the faces on screen then: all of it to a face alone, a share by size when there are several. A speaker and a face
 * are paired when each is the other's clear best (most of the speaker's words with that face on screen, well ahead of
 * the next face, and that face on screen mostly for this speaker), so someone talking off camera (the person filming)
 * pairs with nobody. A person the tracker split in two (they left the frame and came back) can pair with both pieces,
 * since the pieces are never on screen together. Uses faces when the clip has any, else people.
 */
export function pairFacesVoices(subjects: Seen[], words: SaidWord[], opts: { least?: number; ahead?: number } = {}): { subject: string; speaker: string; share: number }[] {
  const least = opts.least ?? 0.5;
  const ahead = opts.ahead ?? 2;
  const faces = subjects.some((s) => s.kind === "face") ? subjects.filter((s) => s.kind === "face") : subjects.filter((s) => s.kind === "person");
  if (!faces.length) return [];
  // How long each sample stands for: a little over half the usual gap either side (so a time between two samples is in
  // one of them), within reason.
  const gapOf = (f: Seen) => {
    const ts = f.samples.map((x) => x[0]!).sort((a, b) => a - b);
    const gaps = ts.slice(1).map((t, i) => t - ts[i]!).sort((a, b) => a - b);
    return Math.min(1, Math.max(0.1, gaps[Math.floor(gaps.length / 2)] ?? 0.5));
  };
  const half = new Map(faces.map((f) => [f.id, gapOf(f) * 0.6]));
  /** The size of each face on screen at `t` (0 when it isn't). */
  const onScreen = (t: number) =>
    faces.flatMap((f) => {
      const h = half.get(f.id)!;
      const s = f.samples.find((x) => Math.abs(x[0]! - t) <= h);
      return s ? [{ id: f.id, size: s[3]! * s[4]! }] : [];
    });
  const credit = new Map<string, Map<string, number>>();
  const talked = new Map<string, number>();
  for (const w of words) {
    if (!w.speaker) continue;
    const d = Math.max(0.05, w.e - w.s);
    talked.set(w.speaker, (talked.get(w.speaker) ?? 0) + d);
    const there = onScreen((w.s + w.e) / 2);
    const all = there.reduce((a, b) => a + b.size, 0);
    const c = credit.get(w.speaker) ?? new Map<string, number>();
    for (const f of there) c.set(f.id, (c.get(f.id) ?? 0) + (d * f.size) / (all || 1));
    credit.set(w.speaker, c);
  }
  const of = (speaker: string, face: string) => credit.get(speaker)?.get(face) ?? 0;
  /** A face on screen mostly for this speaker, not just watching someone else. */
  const theirs = (speaker: string, face: string) => ![...credit.keys()].some((s) => s !== speaker && of(s, face) * ahead > of(speaker, face));
  // Two faces never on screen at once may be one person the tracker lost and found again (out of frame and back).
  const times = new Map(faces.map((f) => [f.id, f.samples.map((x) => x[0]!)]));
  const together = (a: string, b: string) => {
    const tb = times.get(b)!;
    const h = Math.max(half.get(a)!, half.get(b)!);
    return times.get(a)!.some((t) => tb.some((u) => Math.abs(t - u) <= h));
  };
  const out: { subject: string; speaker: string; share: number }[] = [];
  for (const [speaker, c] of credit) {
    const said = talked.get(speaker)!;
    const ranked = [...c].sort((a, b) => b[1] - a[1]);
    if (!ranked.length || !theirs(speaker, ranked[0]![0])) continue;
    // The best face, and any more of them that are this speaker's, never on screen with the ones already taken, and
    // carry a fair part of what they said.
    const took = [ranked[0]!];
    for (const r of ranked.slice(1)) if (r[1] >= said * 0.15 && theirs(speaker, r[0]) && !took.some((x) => together(x[0], r[0]))) took.push(r);
    const sum = took.reduce((a, x) => a + x[1], 0);
    const next = ranked.find((r) => !took.includes(r));
    if (sum / said < least || (next && sum < next[1] * ahead)) continue;
    for (const [face, got] of took) out.push({ subject: face, speaker, share: Math.round((got / said) * 100) / 100 });
  }
  // Each speaker's faces in the order they appear.
  const first = (face: string) => Math.min(...times.get(face)!);
  return out.sort((a, b) => a.speaker.localeCompare(b.speaker) || first(a.subject) - first(b.subject));
}

/** A line of a transcript: words run together until a pause, a new speaker, or the end of a sentence after a while. */
export type SaidLine = { s: number; e: number; text: string; speaker?: string };

export function linesOf(t: Pick<Transcript, "words">, opts: { pause?: number; longest?: number } = {}): SaidLine[] {
  const pause = opts.pause ?? 0.8;
  const longest = opts.longest ?? 12;
  const out: SaidLine[] = [];
  let cur: SaidLine | undefined;
  for (const w of t.words) {
    const text = w.w.trim();
    if (!text) continue;
    const ended = cur && /[.!?]["')\]]?$/.test(cur.text) && w.s - cur.s > 4;
    if (!cur || w.s - cur.e > pause || w.speaker !== cur.speaker || ended || w.e - cur.s > longest) {
      if (cur) out.push(cur);
      cur = { s: w.s, e: w.e, text, ...(w.speaker ? { speaker: w.speaker } : {}) };
    } else {
      cur.text += /^[,.!?;:'’)\]]/.test(text) ? text : ` ${text}`;
      cur.e = w.e;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Words fitted to the sound: a transcriber often stretches a word over the pause after it (whisper.cpp does), which
 * would keep a caption up through silence and hide the pause from anything looking for one. Each word's end (and
 * start) is pulled in to where the sound is actually loud, from the clip's waveform (`peaks`, `rate` a second, 0..255).
 * A word with no loud moment at all is left as it was.
 */
export function fitWordsToSound(words: SaidWord[], peaks: ArrayLike<number>, rate: number): SaidWord[] {
  if (!peaks.length) return words;
  // Loud means well above the clip's own quiet (its tenth-quietest moment), whatever the recording's level.
  const sorted = Array.from(peaks).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  const loud = Math.max(6, floor * 2.5);
  const at = (t: number) => Math.min(peaks.length - 1, Math.max(0, Math.floor(t * rate)));
  // A word has short quiet moments inside it (before a "t" or a "p"); a quarter of a second is a pause.
  const gap = Math.max(1, Math.round(0.25 * rate));
  const fitted = words.map((w) => {
    const end = Math.max(at(w.s), at(w.e) - 1);
    let a = at(w.s);
    while (a <= end && (peaks[a] ?? 0) < loud) a++;
    if (a > end) return w;
    // From its first loud moment on, until the sound stops for a pause (what's loud after that is the next word,
    // which the transcriber started late).
    let last = a;
    for (let i = a, quiet = 0; i <= end; i++) {
      if ((peaks[i] ?? 0) >= loud) (last = i), (quiet = 0);
      else if (++quiet >= gap) break;
    }
    const s = Math.max(w.s, a / rate - 0.02);
    const e = Math.min(w.e, (last + 1) / rate + 0.04);
    return e - s >= 0.05 && (s !== w.s || e !== w.e) ? { ...w, s: Math.round(s * 1000) / 1000, e: Math.round(e * 1000) / 1000 } : w;
  });
  // A word heard starting late (already loud where it starts) starts where its sound does, after the word before.
  return fitted.map((w, k) => {
    const before = k ? fitted[k - 1]!.e : 0;
    let i = at(w.s);
    if ((peaks[i] ?? 0) < loud) return w;
    while (i - 1 >= 0 && (i - 1) / rate >= before && (peaks[i - 1] ?? 0) >= loud) i--;
    if (i === at(w.s)) return w;
    const s = Math.max(before, i / rate - 0.02);
    return s < w.s - 0.01 ? { ...w, s: Math.round(s * 1000) / 1000 } : w;
  });
}
