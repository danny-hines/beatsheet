/**
 * What services cost outside making takes (cleaning sound, restoring picture, transcribing), a line each in the
 * project's spent.jsonl, so the spending limit and the agent's budget for a turn count it with the takes.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectDir } from "./paths.ts";
import { listProjects } from "./store.ts";

export type Spend = { at: string; what: string; by: string; usd: number };

const fileOf = (projectId: string) => join(projectDir(projectId), "spent.jsonl");

export function recordSpend(projectId: string, s: Omit<Spend, "at">): Spend {
  const line: Spend = { at: new Date().toISOString(), ...s, usd: Math.round(s.usd * 1000) / 1000 };
  appendFileSync(fileOf(projectId), `${JSON.stringify(line)}\n`);
  return line;
}

export function ledger(projectId: string): Spend[] {
  const f = fileOf(projectId);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .flatMap((l) => {
      try {
        return l.trim() ? [JSON.parse(l) as Spend] : [];
      } catch {
        return [];
      }
    });
}

/** What the ledgers say was spent since a time: in one project, or in every one. */
export function ledgerSince(since: string, projectId?: string): number {
  const ids = projectId ? [projectId] : listProjects().map((p) => p.id);
  return ids.flatMap((id) => ledger(id)).filter((s) => s.at >= since).reduce((sum, s) => sum + s.usd, 0);
}
