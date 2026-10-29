/**
 * Turns: whose move it is on a project. The agent's turn starts when it's handed something (a new project, an answer,
 * notes) and ends when it calls hand_off with what it needs; then it's the person's turn until they answer. The turn
 * lives in the project file, so the studio, a reload and an agent in a terminal all see the same thing.
 *
 * When the studio hands the agent its turn it keeps a snapshot of the project, so the whole turn can be undone in one
 * step, and when the turn comes back it records what changed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keepCast, parseFile, type HandOff, type ProjectFile, type Turn } from "@beatsheet/schema";
import { ConflictError, loadFile, saveFile, updateFile, updateProject } from "./store.ts";

/** Snapshots taken at the start of agent turns, newest kept. */
const SNAPSHOTS = ".turns";
const KEEP = 20;

export function currentTurn(id: string): Turn | undefined {
  return loadFile(id).doc.turn;
}

function snapshot(id: string): string {
  const { doc, dir } = loadFile(id);
  const folder = join(dir, SNAPSHOTS);
  mkdirSync(folder, { recursive: true });
  const name = `${Date.now()}.json`;
  writeFileSync(join(folder, name), JSON.stringify(doc));
  const all = readdirSync(folder).filter((f) => f.endsWith(".json")).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(folder, old), { force: true });
  return name;
}

function readSnapshot(id: string, name: string): ProjectFile | undefined {
  const file = join(loadFile(id).dir, SNAPSHOTS, name);
  if (!existsSync(file)) return undefined;
  const parsed = parseFile(JSON.parse(readFileSync(file, "utf8")));
  return parsed.ok ? parsed.file : undefined;
}

/**
 * The agent's turn begins. A turn already under way keeps the snapshot from its start. `session` is the hosted
 * conversation taking it, remembered so the studio can reopen it later.
 */
export function agentsTurn(id: string, cut?: string, session?: Turn["session"]) {
  const ongoing = currentTurn(id);
  const before = ongoing?.who === "agent" && ongoing.before ? ongoing.before : snapshot(id);
  const keep = session ?? ongoing?.session;
  updateFile(id, (d) => void (d.turn = { who: "agent", since: new Date().toISOString(), before, ...(cut ? { cut } : {}), ...(keep ? { session: keep } : {}) }));
}

/** The person's turn, with what the agent asked for and what its turn changed. */
export function yourTurn(id: string, ask?: HandOff, cut?: string) {
  const prev = currentTurn(id);
  const before = prev?.who === "agent" ? prev.before : undefined;
  const was = before ? readSnapshot(id, before) : undefined;
  updateFile(id, (d) => {
    const changes = was ? describeChanges(was, d) : undefined;
    const session = prev?.session;
    d.turn = {
      who: "you",
      since: new Date().toISOString(),
      ...(ask ? { ask } : {}),
      ...(cut ? { cut } : {}),
      ...(before ? { before } : {}),
      ...(changes?.length ? { changes } : {}),
      ...(session ? { session } : {}),
    };
  });
}

/** Clears what the agent asked without answering it; it's still the person's move. */
export function skipAsk(id: string) {
  updateFile(id, (d) => {
    if (d.turn) delete d.turn.ask;
    else d.turn = { who: "you", since: new Date().toISOString() };
  });
}

/**
 * Puts the project back the way it was when the agent's last turn began: one step, the whole turn. Anything the
 * person changed since then goes too, which is why the studio asks first.
 */
export function undoAgentTurn(id: string): { restored: boolean; reason?: string } {
  const { doc, version } = loadFile(id);
  const turn = doc.turn;
  if (!turn?.before || turn.who !== "you") return { restored: false, reason: "There's no finished agent turn to undo." };
  const was = readSnapshot(id, turn.before);
  if (!was) return { restored: false, reason: "The snapshot from before that turn is gone." };
  try {
    saveFile(id, { ...was, turn: { who: "you", since: new Date().toISOString(), changes: ["Undid the agent's last turn"] } }, version);
  } catch (err) {
    if (err instanceof ConflictError) return { restored: false, reason: "The project changed while undoing; try again." };
    throw err;
  }
  return { restored: true };
}

/** What a turn did, as a few short lines a person can scan: logging, the brief, new cuts, music, shots, notes. */
export function describeChanges(before: ProjectFile, after: ProjectFile): string[] {
  const lines: string[] = [];
  const oldAssets = new Map(before.assets.map((a) => [a.id, a]));
  const logged = after.assets.filter((a) => {
    const o = oldAssets.get(a.id);
    return o && (o.rating !== a.rating || o.label !== a.label || JSON.stringify(o.moments) !== JSON.stringify(a.moments) || JSON.stringify(o.tags) !== JSON.stringify(a.tags));
  }).length;
  if (logged) lines.push(`Logged ${logged} clip${logged === 1 ? "" : "s"}`);
  const added = after.assets.filter((a) => !oldAssets.has(a.id));
  if (added.length) lines.push(`Added ${added.length} file${added.length === 1 ? "" : "s"}${added.some((a) => a.provenance?.source === "generated") ? " (generated)" : ""}`);
  if (JSON.stringify(before.brief) !== JSON.stringify(after.brief) || before.title !== after.title) lines.push("Updated the brief");
  const oldCuts = new Map(before.cuts.map((c) => [c.id, c]));
  const made = after.cuts.filter((c) => !oldCuts.has(c.id));
  if (made.length) lines.push(`Made ${made.length === 1 ? "a cut" : `${made.length} cuts`}: ${made.map((c) => c.name).join(", ")}`);
  const gone = before.cuts.filter((c) => !after.cuts.some((x) => x.id === c.id));
  if (gone.length) lines.push(`Removed ${gone.map((c) => c.name).join(", ")}`);
  for (const c of after.cuts) {
    const o = oldCuts.get(c.id);
    const bits: string[] = [];
    const oldShots = new Map((o?.shots ?? []).map((s) => [s.id, JSON.stringify(s)]));
    const changed = c.shots.filter((s) => oldShots.get(s.id) !== JSON.stringify(s)).length + [...oldShots.keys()].filter((k) => !c.shots.some((s) => s.id === k)).length;
    if (!o && c.shots.length) bits.push(`${c.shots.length} shot${c.shots.length === 1 ? "" : "s"}`);
    else if (changed) bits.push(`${changed} shot${changed === 1 ? "" : "s"} changed`);
    if (o && JSON.stringify(o.music) !== JSON.stringify(c.music) && c.music?.cues.length) {
      const song = after.assets.find((a) => a.id === c.music!.cues[0]!.asset);
      bits.push(`music: ${song?.label ?? c.music.cues[0]!.asset}`);
    }
    const answered = c.notes.filter((n) => (n.status === "done" || n.status === "open") && n.reply && o?.notes.find((x) => x.id === n.id)?.status === "working").length;
    if (answered) bits.push(`${answered} note${answered === 1 ? "" : "s"} answered`);
    if (bits.length) lines.push(`${c.name}: ${bits.join(", ")}`);
  }
  return lines;
}

/**
 * Sends a cut's attached notes: marks them as the agent's (one batch), and returns how many went and the line that
 * tells the agent where to find them.
 */
export function takeNotes(id: string, cut?: string): { count: number; line?: string } {
  const batch = `b${Date.now().toString(36)}`;
  let count = 0;
  const { project } = updateProject(
    id,
    (p) => {
      for (const n of p.notes) {
        if (n.status !== "queued" || !n.text.trim()) continue;
        n.status = "working";
        n.batch = batch;
        count++;
      }
    },
    cut,
  );
  if (!count) return { count };
  const c = project.cut;
  return {
    count,
    line: `(Attached: ${count} beatsheet note${count === 1 ? "" : "s"} on "${project.title}" (project ${id}), cut "${c.name}" (cut ${c.id}). Call get_batch for project ${id} and cut ${c.id}, handle each note in that cut, check visual changes with frame, close each one with resolve_note, then hand_off for review.)`,
  };
}

/** The person's answer to a hand-off, as the agent's next message. `notes` is the line from takeNotes. */
export type Answer = { picks?: string[]; also?: Record<string, string[]>; text?: string; looksGood?: boolean; provided?: string; notes?: string; keep?: string[] };

/**
 * The cast proposals the person kept, put into the cast before the agent hears about it, so its next turn starts with
 * them there. Nothing happens for any other hand-off.
 */
export function keepProposals(id: string, a: Answer): { added: string[]; joined: string[] } | undefined {
  const ask = loadFile(id).doc.turn?.ask;
  if (ask?.kind !== "cast" || !a.keep) return undefined;
  let kept: { added: string[]; joined: string[] } = { added: [], joined: [] };
  updateFile(id, (d) => void (kept = keepCast(d, ask.proposals, a.keep!)));
  return kept;
}

export function answerMessage(id: string, turn: Turn | undefined, a: Answer, kept?: { added: string[]; joined: string[] }): string {
  const ask = turn?.ask;
  const parts: string[] = [];
  const where = `project ${id}${turn?.cut ? `, cut ${turn.cut}` : ""}`;
  if (ask?.kind === "cast" && a.keep) {
    const left = ask.proposals.filter((p) => !a.keep!.includes(p.id)).map((p) => `"${p.name}"`);
    const said = [
      kept?.added.length ? `I kept ${kept.added.map((x) => `@${x}`).join(", ")}: they're in the cast now, seen in the pictures you proposed.` : "",
      kept?.joined.length ? `The pictures for ${kept.joined.map((x) => `@${x}`).join(", ")} were added to the one already in the cast.` : "",
      left.length ? `I didn't keep ${left.join(", ")}.` : "",
    ].filter(Boolean);
    parts.push(`On ${where}: ${said.join(" ") || "I didn't keep any of them."}`);
  }
  if (a.picks?.length) {
    const options = ask?.kind === "choose" ? ask.options : [];
    const picked = a.picks.map((id) => options.find((o) => o.id === id) ?? { id, label: id });
    parts.push(
      `On ${where}, I picked ${picked.map((o) => `"${o.label}" (${o.id})`).join(" and ")}${ask?.kind === "choose" ? ` for "${ask.message}"` : ""}.` +
        (picked.length > 1 ? " Make each one its own cut." : ""),
    );
  }
  // The card's other questions, each with what was picked.
  for (const q of ask?.kind === "choose" ? (ask.questions ?? []) : []) {
    const ids = a.also?.[q.id];
    if (!ids?.length) {
      if (a.picks?.length) parts.push(`For "${q.message}" (${q.id}), no pick: it's your call.`);
      continue;
    }
    const picked = ids.map((id) => q.options.find((o) => o.id === id) ?? { id, label: id });
    parts.push(`For "${q.message}" (${q.id}), I picked ${picked.map((o) => `"${o.label}" (${o.id})`).join(" and ")}.`);
  }
  if (a.looksGood) parts.push(`On ${where}: this looks good.`);
  if (a.provided) parts.push(`On ${where}: ${a.provided}`);
  if (a.text?.trim()) parts.push(a.text.trim());
  if (!parts.length && !a.notes) parts.push(`Go ahead on ${where}.`);
  // The notes line goes last, so what the person typed reads first.
  if (a.notes) parts.push(a.notes);
  return parts.join("\n\n");
}
