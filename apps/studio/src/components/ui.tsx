import { describeAnchor, formatTime, resolveAnchor, type Anchor, type Fidelity } from "@beatsheet/schema";
import { useEffect, useState, type ReactNode } from "react";
import { FIDELITY_LABEL } from "../lib";
import { useProject, useStore } from "../store";

export function AnchorChip({ anchor, fallback }: { anchor?: Anchor; fallback?: string }) {
  const project = useProject();
  const format = useStore((s) => s.format);
  if (!anchor) return <span className="chip chip-default">{fallback ?? "default"}</span>;
  const t = resolveAnchor(project, anchor, format);
  return (
    <span className={`chip chip-${anchor.kind}`} title={Number.isFinite(t) ? formatTime(t) : "does not resolve"}>
      <span className="chip-kind">{anchor.kind}</span>
      {describeAnchor(anchor, project)}
      {!Number.isFinite(t) && <span className="chip-bad"> ⚠</span>}
    </span>
  );
}

export function FidelityPill({ fidelity }: { fidelity: Fidelity }) {
  return <span className={`pill fid-${fidelity}`}>{FIDELITY_LABEL[fidelity]}</span>;
}

export function Pill({ children, tone = "plain" }: { children: ReactNode; tone?: string }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Stars({ rating, onChange }: { rating?: number; onChange?: (r: number) => void }) {
  const r = rating ?? 0;
  return (
    <span className="stars" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={`star ${r >= n ? "on" : ""}`} onClick={() => onChange?.(r === n ? 0 : n)} disabled={!onChange} title={`${n} star${n > 1 ? "s" : ""}`}>
          ★
        </button>
      ))}
      <button className={`reject ${r === -1 ? "on" : ""}`} onClick={() => onChange?.(r === -1 ? 0 : -1)} disabled={!onChange} title="Reject">
        ✕
      </button>
    </span>
  );
}

/** A text input that commits on blur or Enter, so typing doesn't create one undo step per keystroke. */
export function TextField({
  value,
  onCommit,
  multiline,
  placeholder,
  disabled,
  autoFocus,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  const props = {
    value: draft,
    placeholder,
    disabled,
    autoFocus,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return multiline ? (
    <textarea {...props} rows={3} />
  ) : (
    <input {...props} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

export function NumberField({
  value,
  onCommit,
  step = 0.01,
  min,
  max,
  disabled,
  suffix,
}: {
  value: number | undefined;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft !== "" && Number.isFinite(n) && n !== value) onCommit(n);
  };
  return (
    <span className="numfield">
      <input
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** beatsheet's mark: beat bars on a warm square, as on the app icon. */
export function Mark() {
  const bars = [0.35, 0.6, 0.85, 0.5, 0.95, 0.65, 0.4];
  return (
    <svg className="mark" viewBox="0 0 1024 1024" aria-hidden>
      <defs>
        <linearGradient id="mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a2210" />
          <stop offset="1" stopColor="#121317" />
        </linearGradient>
      </defs>
      <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#mark-g)" stroke="#f2b544" strokeOpacity="0.35" strokeWidth="8" />
      {bars.map((h, i) => (
        <rect key={i} x={512 - (7 * 64 + 6 * 40) / 2 + i * 104} y={552 - (520 * h) / 2} width="64" height={520 * h} rx="32" fill={i === 4 ? "#f2b544" : "#e6e8ec"} fillOpacity={i === 4 ? 1 : 0.85} />
      ))}
      <circle cx="512" cy="852" r="18" fill="#f2b544" />
    </svg>
  );
}
