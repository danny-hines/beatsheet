import type { Reference } from "@beatsheet/schema";
import { pickPath } from "../lib";

const KINDS: { kind: Reference["kind"]; label: string; value: string; note: string }[] = [
  { kind: "url", label: "Link", value: "https://…", note: "What it's for, e.g. match its pacing and titles" },
  { kind: "folder", label: "Folder", value: "A folder to look at", note: "What it's for, e.g. last year's video: same intro" },
  { kind: "file", label: "File", value: "A file to look at", note: "What it's for, e.g. our logo, for the end card" },
  { kind: "note", label: "Note", value: "e.g. Warm, golden-hour, like last summer's video", note: "" },
];

/**
 * References for the agent: links, folders, files and notes. Each can say what it is or what to do with it ("match
 * this pacing", "use the logo on the end card"), which the agent reads beside it. A note is its own description.
 */
export function ReferencesField({ value, onChange }: { value: Reference[]; onChange: (v: Reference[]) => void }) {
  const set = (i: number, patch: Partial<Reference>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="field">
      <span className="field-label">References</span>
      {value.map((r, i) => {
        const k = KINDS.find((x) => x.kind === r.kind) ?? KINDS[0]!;
        return (
          <div key={i} className="np-ref">
            <div className="np-ref-row">
              <select value={r.kind} onChange={(e) => set(i, { kind: e.target.value as Reference["kind"] })}>
                {KINDS.map((x) => (
                  <option key={x.kind} value={x.kind}>
                    {x.label}
                  </option>
                ))}
                {!KINDS.some((x) => x.kind === r.kind) && <option value={r.kind}>{r.kind}</option>}
              </select>
              <input value={r.value} placeholder={k.value} onChange={(e) => set(i, { value: e.target.value })} />
              {(r.kind === "folder" || r.kind === "file") && <button onClick={() => void pickPath(r.kind as "folder" | "file").then((p) => p && set(i, { value: p }))}>Choose…</button>}
              <button className="link" onClick={() => onChange(value.filter((_, j) => j !== i))} title="Remove">
                ✕
              </button>
            </div>
            {r.kind !== "note" && (
              <input className="np-ref-note" value={r.note ?? ""} placeholder={k.note} onChange={(e) => set(i, { note: e.target.value || undefined })} />
            )}
          </div>
        );
      })}
      <div className="row">
        {KINDS.map((x) => (
          <button key={x.kind} className="link small" onClick={() => onChange([...value, { kind: x.kind, value: "" }])}>
            + {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Only the references that say something, tidied for saving. */
export const keptReferences = (refs: Reference[]): Reference[] =>
  refs.filter((r) => r.value.trim()).map((r) => ({ ...r, value: r.value.trim(), note: r.note?.trim() || undefined }));
