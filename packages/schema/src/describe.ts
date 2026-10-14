/** Human-readable descriptions of anchors and times, for UI chips and for notes sent to the agent. */
import type { Anchor, NoteTarget, Project } from "./types.ts";

export function formatTime(t: number): string {
  if (!Number.isFinite(t)) return "—";
  const sign = t < 0 ? "-" : "";
  const a = Math.abs(t);
  const m = Math.floor(a / 60);
  const s = a - m * 60;
  return `${sign}${m}:${s.toFixed(2).padStart(5, "0")}`;
}

export function formatOffset(o: number | undefined): string {
  if (!o) return "";
  return ` ${o < 0 ? "−" : "+"} ${Math.abs(o).toFixed(2)}s`;
}

/** Bars and beats are stored counting from 0 and shown counting from 1, the way musicians count. */
export function describeAnchor(a: Anchor, project?: Project): string {
  const sectionLabel = (id: string) =>
    project?.assets.flatMap((x) => x.sections ?? []).find((s) => s.id === id)?.label ?? id;
  const base = (() => {
    switch (a.kind) {
      case "time":
        return formatTime(a.t);
      case "line":
        return a.edge === "end" ? `end of line ${a.line}` : `line ${a.line}`;
      case "word":
        return `${a.edge === "end" ? "after " : ""}"${a.word}"${a.nth ? ` (#${a.nth + 1})` : ""} in ${a.line}`;
      case "beat": {
        const unit = a.unit === "bar" ? "bar" : "beat";
        return `${unit} ${+(a.n + 1).toFixed(2)}${a.from ? ` of ${sectionLabel(a.from)}` : ""}`;
      }
      case "section":
        return `${sectionLabel(a.section)} ${a.edge === "end" ? "ends" : "starts"}`;
      case "moment":
        return `moment "${a.moment}" in ${a.shot}`;
      case "shot":
        return `${a.shot} ${a.edge === "end" ? "ends" : "starts"}`;
      case "marker":
        return `marker ${project?.markers?.find((m) => m.id === a.marker)?.label ?? a.marker}`;
      case "end":
        return "end of cut";
    }
  })();
  return base + formatOffset(a.offset);
}

export function describeTarget(t: NoteTarget, project?: Project): string {
  switch (t.kind) {
    case "project":
      return "whole project";
    case "shot": {
      const s = project?.shots.find((x) => x.id === t.shot);
      return s?.label ? `${t.shot} · ${s.label}` : t.shot;
    }
    case "line":
      return `line ${t.line}`;
    case "word":
      return `"${t.word}" in ${t.line}`;
    case "asset":
      return project?.assets.find((a) => a.id === t.asset)?.label ?? t.asset;
    case "cue":
      return `music ${t.cue}`;
    case "section":
      return `section ${t.section}`;
    case "time":
      return `at ${formatTime(t.t)}`;
  }
}
