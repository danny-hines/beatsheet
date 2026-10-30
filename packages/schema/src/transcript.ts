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
    note: "Free, and the audio never leaves this computer. Quick with a graphics card or Apple silicon; slow on an older laptop's processor.",
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
 * here when it was set up (0.05 is twenty times faster than the clip plays). `where` says what it runs on.
 */
export type TranscriberState =
  | { state: "ready"; speed?: number; where?: string }
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
    if (ask.speakers && !t.gives.speakers) return { ...base, ok: false, kind: "speakers", why: "Can't tell who's speaking" };
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
