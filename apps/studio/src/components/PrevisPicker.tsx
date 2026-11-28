/**
 * Visual 1:1 square thumbnail picker for `PREVIS_MOVES` camera presets (with live 3D hover animation via a single
 * shared WebGL context) and the editable brief dialog used before asking the agent to block out a shot.
 */
import { PREVIS_BY_ID, PREVIS_FAMILIES, PREVIS_MOVES, type PrevisFamily, type PrevisPreset } from "@beatsheet/schema";
import { getCachedPrevisPoster, renderPrevisPoster, renderPrevisPosters, startPrevisHoverLoop } from "@beatsheet/video";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { MentionField } from "./MentionField";

const FAMILY_LABELS: Record<PrevisFamily, string> = {
  people: "People",
  action: "Action & aerial",
  objects: "Objects",
  famous: "Famous",
  scenes: "Scenes",
};

const ACTIVE_FAMILIES = PREVIS_FAMILIES.filter((f) => PREVIS_MOVES.some((m) => m.family === f));

function subjectTag(preset: PrevisPreset): string {
  const subs = preset.defaultSubjects;
  if (subs.some((s) => s.kind === "prop" || s.kind === "box")) return "Prop";
  const moving = subs.some((s) => !!s.moveTo);
  if (subs.length >= 2) return moving ? "2 moving" : "2 subjects";
  return moving ? "Moving" : "Solo";
}

/** Formats a clear instruction for the agent when blocking out a shot from an edited user brief. */
export function formatBlockoutAgentPrompt(opts: {
  target: string;
  brief: string;
  presetId?: string;
  hasExisting?: boolean;
  durationSeconds?: number;
}): string {
  const brief = opts.brief.trim();
  const preset = opts.presetId ? PREVIS_BY_ID.get(opts.presetId) : undefined;
  const durNote = opts.durationSeconds ? ` (~${Math.max(2, Math.min(15, Math.round(opts.durationSeconds)))}s)` : "";
  const head = opts.hasExisting
    ? `Update ${opts.target}'s 3D camera blockout${durNote} using set_blockout (never create a separate cut) and hand off a blockout review so I can check the move before generating video.`
    : `Design a 3D camera blockout for ${opts.target}${durNote} using set_blockout (never create a separate cut) and hand off a blockout review so I can approve the move before generating video.`;
  const parts = [head];
  if (brief) {
    parts.push(`Blockout brief (follow this over any earlier shot or board description):\n${brief}`);
  }
  if (preset) {
    parts.push(`Use the "${preset.label}" (${preset.id}) preset as a starting reference (${preset.summary}).`);
  }
  return parts.join("\n\n");
}

/** Lazy 1:1 resting thumbnail for a single preset (used on picker trigger buttons). */
function PrevisThumb({ moveId, size = 32 }: { moveId?: string; size?: number }) {
  const [src, setSrc] = useState<string | undefined>(() => (moveId ? getCachedPrevisPoster(moveId) : undefined));
  useEffect(() => {
    if (!moveId) {
      setSrc(undefined);
      return;
    }
    const hit = getCachedPrevisPoster(moveId);
    if (hit) {
      setSrc(hit);
      return;
    }
    let live = true;
    void renderPrevisPoster(moveId).then((url) => {
      if (live && url) setSrc(url);
    });
    return () => {
      live = false;
    };
  }, [moveId]);

  return (
    <span className="previs-thumb" style={{ width: size, height: size }} aria-hidden="true">
      {src ? <img src={src} alt="" /> : <Icon name="camera" size={Math.round(size * 0.48)} />}
    </span>
  );
}

/** One 1:1 preset card inside the gallery modal; animates live 3D on hover or keyboard focus. */
function PrevisCard({
  preset,
  poster,
  selected,
  suggested,
  active,
  onActivate,
  onDeactivate,
  onPick,
}: {
  preset: PrevisPreset;
  poster?: string;
  selected: boolean;
  suggested: boolean;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onPick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.opacity = "0";
    let painted = false;
    const stop = startPrevisHoverLoop(preset.id, canvas, (u) => {
      if (!painted) {
        painted = true;
        canvas.style.opacity = "1";
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${u})`;
    });
    return () => {
      stop();
      if (barRef.current) barRef.current.style.transform = "scaleX(0)";
    };
  }, [active, preset.id]);

  return (
    <button
      type="button"
      className={`previs-card${selected ? " on" : ""}${active ? " playing" : ""}`}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
      onClick={onPick}
      aria-pressed={selected}
    >
      <div className="previs-stage">
        {poster ? <img className="previs-poster" src={poster} alt="" /> : <div className="previs-poster-wait" />}
        {active && <canvas ref={canvasRef} className="previs-live" aria-hidden="true" />}
        {selected ? (
          <span className="previs-badge on">
            <Icon name="check" size={10} /> Current
          </span>
        ) : suggested ? (
          <span className="previs-badge suggested">Suggested</span>
        ) : null}
        <span className="previs-lens mono">{preset.defaultLens}mm</span>
        <span className={`previs-play${active ? " live" : ""}`} aria-hidden="true">
          <Icon name="play" size={9} />
        </span>
        {active && (
          <span className="previs-track" aria-hidden="true">
            <span ref={barRef} className="previs-bar" />
          </span>
        )}
      </div>
      <div className="previs-meta">
        <div className="previs-meta-head">
          <strong className="previs-label">{preset.label}</strong>
          <span className="previs-tag">{subjectTag(preset)}</span>
        </div>
        <p className="previs-summary">{preset.summary}</p>
      </div>
    </button>
  );
}

/** Modal gallery of all camera-move presets with category tabs, search, 1:1 posters and live 3D hover previews. */
function PrevisPresetModal({
  value,
  suggested,
  onSelect,
  onAskCustom,
  onClose,
}: {
  value?: string;
  suggested?: string;
  onSelect: (presetId: string) => void;
  onAskCustom?: () => void;
  onClose: () => void;
}) {
  const [family, setFamily] = useState<"all" | PrevisFamily>("all");
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string>();
  const [posters, setPosters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const m of PREVIS_MOVES) {
      const hit = getCachedPrevisPoster(m.id);
      if (hit) initial[m.id] = hit;
    }
    return initial;
  });

  // Render any uncached 1:1 posters in smooth animation-frame batches via the single shared WebGL context.
  useEffect(() => {
    const ac = new AbortController();
    void renderPrevisPosters(
      PREVIS_MOVES.map((m) => m.id),
      (id, url) => {
        setPosters((prev) => (prev[id] === url ? prev : { ...prev, [id]: url }));
      },
      ac.signal,
    );
    return () => ac.abort();
  }, []);

  // Capture Escape so closing a nested preset picker doesn't also dismiss an underlying dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return PREVIS_MOVES.filter((m) => {
      if (family !== "all" && m.family !== family) return false;
      if (!trimmed) return true;
      return (
        m.label.toLowerCase().includes(trimmed) ||
        m.summary.toLowerCase().includes(trimmed) ||
        m.id.toLowerCase().includes(trimmed) ||
        m.defaultSet.toLowerCase().includes(trimmed) ||
        subjectTag(m).toLowerCase().includes(trimmed)
      );
    });
  }, [family, trimmed]);

  return createPortal(
    <div className="modal-back previs-modal-back" onClick={onClose}>
      <div className="modal previs-modal" role="dialog" aria-modal="true" aria-label="Camera move presets" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head previs-modal-head">
          <h3>Camera move presets</h3>
          <input
            type="search"
            className="previs-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter moves (orbit, crane, low, product…)"
            aria-label="Filter camera presets"
            autoFocus
          />
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            <Icon name="close" size={12} />
          </button>
        </div>

        <div className="previs-toolbar">
          <div className="segmented" role="tablist" aria-label="Shot preset category">
            <button type="button" role="tab" aria-selected={family === "all"} className={family === "all" ? "on" : ""} onClick={() => setFamily("all")}>
              All ({PREVIS_MOVES.length})
            </button>
            {ACTIVE_FAMILIES.map((f) => {
              const count = PREVIS_MOVES.filter((m) => m.family === f).length;
              return (
                <button key={f} type="button" role="tab" aria-selected={family === f} className={family === f ? "on" : ""} onClick={() => setFamily(f)}>
                  {FAMILY_LABELS[f]} ({count})
                </button>
              );
            })}
          </div>
          <span className="dim small previs-hint">Hover to preview · Click to apply</span>
        </div>

        <div className="previs-grid">
          {filtered.map((m) => (
            <PrevisCard
              key={m.id}
              preset={m}
              poster={posters[m.id]}
              selected={value === m.id}
              suggested={suggested === m.id}
              active={hoveredId === m.id}
              onActivate={() => setHoveredId(m.id)}
              onDeactivate={() => setHoveredId((cur) => (cur === m.id ? undefined : cur))}
              onPick={() => {
                onSelect(m.id);
                onClose();
              }}
            />
          ))}
          {filtered.length === 0 && (
            <div className="previs-empty dim small">
              No camera presets match “{query}”
              {family !== "all" && (
                <>
                  {" "}
                  in {FAMILY_LABELS[family]}.{" "}
                  <button type="button" className="link small" onClick={() => setFamily("all")}>
                    Search all categories
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {onAskCustom && (
          <div className="previs-modal-foot">
            <span className="dim small">Need a multi-beat move or custom blocking?</span>
            <button
              type="button"
              className="small"
              onClick={() => {
                onClose();
                onAskCustom();
              }}
            >
              Describe custom blockout for agent…
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Trigger button with a 1:1 preset thumbnail that opens the visual camera-move preset gallery. */
export function PrevisPresetPicker({
  value,
  suggested,
  placeholder = "Choose camera preset…",
  onSelect,
  onAskCustom,
  compact = false,
  ariaLabel = "Camera preset",
}: {
  value?: string;
  suggested?: string;
  placeholder?: string;
  onSelect: (presetId: string) => void;
  onAskCustom?: () => void;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = value ? PREVIS_BY_ID.get(value) : undefined;
  return (
    <>
      <button
        type="button"
        className={`previs-trigger${compact ? " compact" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={current ? `${current.label} — ${current.summary}` : placeholder}
      >
        <PrevisThumb moveId={current?.id} size={compact ? 26 : 32} />
        <span className="previs-trigger-text">
          <span className="previs-trigger-name">{current ? current.label : placeholder}</span>
          {!compact && current && <span className="previs-trigger-sub dim">{current.defaultLens}mm · {subjectTag(current)}</span>}
        </span>
        <Icon name="down" size={12} className="previs-trigger-caret" />
      </button>
      {open && (
        <PrevisPresetModal
          value={value}
          suggested={suggested}
          onSelect={onSelect}
          onAskCustom={onAskCustom}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Editable brief dialog shown before asking the agent to block out a shot, so you can inspect and rewrite any stale
 * board/shot description and optionally pick a starting camera move before sending.
 */
export function AskBlockoutDialog({
  open,
  title,
  durationSeconds,
  initialBrief,
  initialPreset,
  hasExistingBlockout = false,
  onClose,
  onSend,
}: {
  open: boolean;
  title: string;
  durationSeconds?: number;
  initialBrief: string;
  initialPreset?: string;
  hasExistingBlockout?: boolean;
  onClose: () => void;
  onSend: (brief: string, presetId?: string) => void;
}) {
  const [brief, setBrief] = useState(initialBrief);
  const [presetId, setPresetId] = useState<string | undefined>(initialPreset);
  const areaRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setBrief(initialBrief);
    setPresetId(initialPreset);
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [open, initialBrief, initialPreset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canSend = !!brief.trim() || !!presetId;
  const submit = () => {
    if (!canSend) return;
    onSend(brief.trim(), presetId);
    onClose();
  };

  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal blockout-brief-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          {durationSeconds !== undefined && <span className="pill small">{durationSeconds}s</span>}
          <span className="spacer" />
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            <Icon name="close" size={12} />
          </button>
        </div>

        <p className="dim small blockout-brief-lead">
          {hasExistingBlockout
            ? "Describe how you want this camera blockout rebuilt. The agent will follow this brief over any earlier shot or board description."
            : "Review or rewrite what happens in this shot and how the camera should move before sending. The agent will follow this brief over any earlier board description."}
        </p>

        <label className="blockout-brief-field">
          <span className="small">Blockout description & camera notes <span className="dim">(type @ for cast & sets)</span></span>
          <MentionField
            multiline
            inputRef={areaRef}
            className="blockout-brief-textarea"
            rows={5}
            value={brief}
            onChange={setBrief}
            placeholder='e.g. "Start tight on @maya opening the box, then smoothly pull back and orbit left to reveal the whole room."'
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>

        <div className="blockout-brief-preset">
          <span className="small dim">Starting move (optional)</span>
          <div className="make-row">
            <PrevisPresetPicker
              value={presetId}
              placeholder="Let agent decide (or pick a move…)"
              onSelect={setPresetId}
              compact
              ariaLabel="Optional starting camera move"
            />
            {presetId && (
              <button type="button" className="link small" onClick={() => setPresetId(undefined)}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="modal-actions blockout-brief-actions">
          <span className="dim small">⌘ Enter to send</span>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!canSend} onClick={submit}>
            {hasExistingBlockout ? "Update blockout" : "Ask agent to block out"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
