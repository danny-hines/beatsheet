import { describeAnchor, formatTime, resolveAnchor, type Anchor, type Fidelity } from "@beatsheet/schema";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FIDELITY_LABEL } from "../lib";
import { initial, markFile } from "../marks";
import { useProject, useStore } from "../store";
import { Icon } from "./Icon";

export function AnchorChip({ anchor, fallback }: { anchor?: Anchor; fallback?: string }) {
  const project = useProject();
  const format = useStore((s) => s.format);
  if (!anchor) return <span className="chip chip-default">{fallback ?? "default"}</span>;
  const t = resolveAnchor(project, anchor, format);
  return (
    <span className={`chip chip-${anchor.kind}`} title={Number.isFinite(t) ? formatTime(t) : "does not resolve"}>
      <span className="chip-kind">{anchor.kind}</span>
      {describeAnchor(anchor, project)}
      {!Number.isFinite(t) && <span className="chip-bad"><Icon name="warn" size={12} /></span>}
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
          <Icon name="star" size={14} />
        </button>
      ))}
      <button className={`reject ${r === -1 ? "on" : ""}`} onClick={() => onChange?.(r === -1 ? 0 : -1)} disabled={!onChange} title="Reject">
        <Icon name="close" size={14} />
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

/**
 * A small menu at a point (a right-click, a ⋯): it takes the focus, and closes on a click outside, Escape, or the
 * window moving under it. Opens leftward near the right edge.
 */
export function PopMenu({
  x,
  y,
  onClose,
  className = "",
  width = 220,
  estHeight = 220,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  className?: string;
  width?: number;
  estHeight?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const outside = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);
  const place = {
    ...(x > window.innerWidth - width - 16 ? { right: Math.max(12, window.innerWidth - x) } : { left: Math.max(12, x) }),
    top: Math.max(12, Math.min(y, window.innerHeight - estHeight)),
  };
  return (
    <div className={`card-menu ${className}`.trim()} style={place} ref={ref} role="menu">
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/**
 * A service's or an agent's own mark, for the rows where a person picks or connects one. Decoration only: the name is
 * always written beside it. Without a mark of theirs it's a tile with their initial, so a list's names still line up;
 * `tile={false}` leaves the space empty instead, where nothing has to line up.
 */
export function ServiceMark({ id, label = id, tile = true }: { id: string; label?: string; tile?: boolean }) {
  const mark = markFile(id);
  if (!mark) return tile ? <span className="service-mark tile" aria-hidden>{initial(label)}</span> : null;
  const larger = mark.scale ? { transform: `scale(${mark.scale})` } : undefined;
  if (mark.shape) return <span className="service-mark shape" style={{ "--mark": `url("${mark.url}")`, ...larger } as CSSProperties} aria-hidden />;
  return <img className="service-mark" src={mark.url} style={larger} alt="" aria-hidden />;
}

/** Whose the marks are: the line Google's and OpenAI's terms ask for wherever their marks are shown. */
export function MarksNote() {
  return (
    <p className="dim small marks-note">
      Each logo belongs to the company it stands for and only says what that row connects to; beatsheet isn't made or endorsed by any of them. The OpenAI logo is OpenAI's. Gemini and Google
      Antigravity are trademarks of Google LLC.
    </p>
  );
}

/** beatsheet's mark: a lowercase b made of a bar line and a beat, on a ruled baseline. The app icon draws the same one (apps/desktop/scripts/icon.mjs). */
export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 64 64" aria-hidden>
      <rect x="4" y="4" width="56" height="56" rx="12" style={{ fill: "var(--panel)", stroke: "var(--line-2)" }} />
      <path d="M12 55.5h40" style={{ stroke: "var(--line-2)" }} />
      <rect x="19" y="13" width="7" height="38" style={{ fill: "var(--text)" }} />
      <circle cx="38" cy="40" r="11" style={{ fill: "var(--accent)" }} />
    </svg>
  );
}
