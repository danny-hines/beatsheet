/**
 * Prompt input / textarea with caret-anchored `@cast` and `@cast/variant` autocomplete.
 * Typing `@` (or editing inside an `@mention`) opens a keyboard-navigable popover showing matching characters, their
 * looks/variants grouped directly underneath, sets, props, wardrobes, and styles, complete with face + outfit
 * thumbnails so you can visually verify which look you're picking.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { hideBroken, posterUrl } from "../lib";
import { activeMention, applyMention, castMentionItems, filterMentionItems, type MentionItem } from "../mentions";
import { useProject, useStore } from "../store";

type InputEl = HTMLTextAreaElement | HTMLInputElement;

const MIRROR_PROPS = [
  "boxSizing",
  "width",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "tabSize",
] as const;

/** Measures the viewport coordinates of character `index` inside a textarea or text input via an offscreen mirror div. */
function measureCaret(el: InputEl, index: number): { left: number; top: number; bottom: number } {
  const rect = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  const s = mirror.style;
  s.position = "fixed";
  s.left = "-9999px";
  s.top = "0";
  s.visibility = "hidden";
  s.pointerEvents = "none";
  s.overflow = "hidden";
  s.whiteSpace = el.tagName === "TEXTAREA" ? "pre-wrap" : "pre";
  if (el.tagName === "TEXTAREA") {
    s.wordWrap = "break-word";
    s.overflowWrap = "break-word";
  }
  for (const prop of MIRROR_PROPS) {
    s[prop] = cs[prop];
  }
  const safe = Math.max(0, Math.min(index, el.value.length));
  mirror.appendChild(document.createTextNode(el.value.slice(0, safe)));
  const mark = document.createElement("span");
  mark.textContent = el.value.slice(safe, safe + 1) || "@";
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const left = rect.left + mark.offsetLeft - el.scrollLeft;
  const lineH = mark.offsetHeight || parseFloat(cs.lineHeight) || 20;
  const rawTop = rect.top + mark.offsetTop - el.scrollTop;
  document.body.removeChild(mirror);
  const top = Math.max(rect.top, Math.min(rawTop, rect.bottom - lineH));
  const bottom = Math.max(rect.top + lineH, Math.min(rawTop + lineH, rect.bottom));
  return { left, top, bottom };
}

function menuPlacement(el: InputEl, atIndex: number): CSSProperties {
  const pos = measureCaret(el, atIndex);
  const width = Math.min(380, window.innerWidth - 16);
  const left = Math.max(8, Math.min(pos.left, window.innerWidth - width - 8));
  const maxHeight = 296;
  const spaceBelow = window.innerHeight - pos.bottom - 8;
  const spaceAbove = pos.top - 8;
  if (spaceBelow < maxHeight && spaceAbove > spaceBelow) {
    return { left, bottom: Math.max(8, window.innerHeight - pos.top + 4), width };
  }
  return { left, top: Math.min(window.innerHeight - 64, pos.bottom + 4), width };
}

export type MentionFieldProps = {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  includeStyles?: boolean;
  inputRef?: RefObject<InputEl | null>;
  onKeyDown?: (e: KeyboardEvent<InputEl>) => void;
  onBlur?: () => void;
  onPick?: (next: string, item: MentionItem) => void;
};

export function MentionField({
  value,
  onChange,
  multiline = false,
  rows = 3,
  className,
  placeholder,
  disabled,
  autoFocus,
  includeStyles = true,
  inputRef,
  onKeyDown,
  onBlur,
  onPick,
}: MentionFieldProps) {
  const projectId = useStore((s) => s.projectId);
  const cast = useProject().cast;
  const localRef = useRef<InputEl | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedKey, setDismissedKey] = useState<string>();
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();

  const setEl = (node: InputEl | null) => {
    localRef.current = node;
    if (inputRef) inputRef.current = node;
  };

  const allItems = useMemo(() => castMentionItems(cast, { includeStyles }), [cast, includeStyles]);
  const mention = focused && !disabled ? activeMention(value, caret) : undefined;
  const mentionKey = mention ? `${mention.start}:${mention.query}` : undefined;
  const suppressed = !!mentionKey && dismissedKey === mentionKey;
  const matches = useMemo(() => (mention && !suppressed ? filterMentionItems(allItems, mention.query) : []), [allItems, mention, suppressed]);
  const open = !!mention && !suppressed && matches.length > 0;
  const clampedIndex = open ? Math.min(activeIndex, matches.length - 1) : 0;

  // Reset highlighted item whenever the active `@` token or typed query changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [mention?.start, mention?.query]);

  // Clear stale dismissal once the user leaves that `@` token.
  useEffect(() => {
    if (dismissedKey && dismissedKey !== mentionKey) setDismissedKey(undefined);
  }, [dismissedKey, mentionKey]);

  // Keep the popover anchored to the `@` character across edits, scrolling, and window resizes.
  useLayoutEffect(() => {
    if (!open || !mention || !localRef.current) {
      setMenuStyle(undefined);
      return;
    }
    const update = () => {
      if (localRef.current) setMenuStyle(menuPlacement(localRef.current, mention.start));
    };
    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [open, mention?.start, value]);

  // Keep the keyboard-highlighted option scrolled into view inside the popover.
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-mention-idx="${clampedIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [open, clampedIndex]);

  const syncCaret = (el: InputEl) => {
    setCaret(el.selectionStart ?? el.value.length);
  };

  const pick = (item: MentionItem) => {
    if (!mention) return;
    const res = applyMention(value, mention, item.id);
    setDismissedKey(res.closedBySpace ? undefined : `${mention.start}:${item.id}`);
    setCaret(res.caret);
    onChange(res.text);
    onPick?.(res.text, item);
    requestAnimationFrame(() => {
      const el = localRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(res.caret, res.caret);
    });
  };

  const handleKeyDown = (e: KeyboardEvent<InputEl>) => {
    // Never swallow shortcut chords like ⌘+Enter (submit).
    if (open && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const chosen = matches[clampedIndex];
        if (chosen) pick(chosen);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (mentionKey) setDismissedKey(mentionKey);
        return;
      }
    }
    onKeyDown?.(e);
  };

  const shared = {
    className,
    value,
    placeholder,
    disabled,
    autoFocus,
    "aria-autocomplete": "list" as const,
    "aria-expanded": open,
    onChange: (e: { target: InputEl }) => {
      setDismissedKey(undefined);
      setCaret(e.target.selectionStart ?? e.target.value.length);
      onChange(e.target.value);
    },
    onFocus: (e: { target: InputEl }) => {
      setFocused(true);
      syncCaret(e.target);
    },
    onBlur: () => {
      setFocused(false);
      onBlur?.();
    },
    onClick: (e: { currentTarget: InputEl }) => syncCaret(e.currentTarget),
    onSelect: (e: { currentTarget: InputEl }) => syncCaret(e.currentTarget),
    onKeyDown: handleKeyDown,
  };

  const popover =
    open && menuStyle
      ? createPortal(
          <div className="mention-menu" style={menuStyle} role="listbox" aria-label="Cast and look suggestions">
            <div className="mention-list" ref={listRef}>
              {matches.map((item, idx) => {
                const isActive = idx === clampedIndex;
                const showParentName = item.variantId ? item.parentName : item.name !== item.id ? item.name : undefined;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-mention-idx={idx}
                    className={`mention-row ${item.variantId ? "variant" : ""} ${isActive ? "on" : ""}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      // Keep focus inside the input so blur doesn't fire before insertion.
                      e.preventDefault();
                      pick(item);
                    }}
                  >
                    <span className="mention-thumbs" aria-hidden>
                      {projectId && item.thumb ? (
                        <img className="mention-thumb" src={posterUrl(projectId, item.thumb)} alt="" onError={hideBroken} />
                      ) : (
                        <span className="mention-thumb empty">{(item.parentName ?? item.name)[0]?.toUpperCase() ?? "@"}</span>
                      )}
                      {projectId && item.outfitThumb && (
                        <img className="mention-thumb outfit" src={posterUrl(projectId, item.outfitThumb)} alt="" onError={hideBroken} />
                      )}
                    </span>
                    <span className="mention-body">
                      <span className="mention-head">
                        <span className="mention-tag">
                          @{item.memberId}
                          {item.variantId && <span className="mention-var">/{item.variantId}</span>}
                        </span>
                        {showParentName && <span className="mention-name dim">{showParentName}</span>}
                        <span className="spacer" />
                        <span className={`mention-badge ${item.variantId ? "look" : ""}`}>{item.badge}</span>
                      </span>
                      {item.detail && <span className="mention-detail dim">{item.detail}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mention-foot dim">↑↓ choose · Enter or Tab to insert · Esc to close</div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {multiline ? <textarea ref={setEl} rows={rows} {...shared} /> : <input ref={setEl} {...shared} />}
      {popover}
    </>
  );
}

/**
 * Commit-on-blur wrapper around `MentionField` (matching `ui.tsx`'s `TextField` undo batching): typing stays local
 * until blur, while picking a suggestion commits immediately so live cast previews update on the spot.
 */
export function MentionTextField({
  value,
  onCommit,
  multiline = true,
  rows = 3,
  placeholder,
  disabled,
  autoFocus,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (v = draft) => {
    if (v !== value) onCommit(v);
  };
  return (
    <MentionField
      multiline={multiline}
      rows={rows}
      className={className}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={setDraft}
      onBlur={() => commit()}
      onPick={(next) => commit(next)}
    />
  );
}
