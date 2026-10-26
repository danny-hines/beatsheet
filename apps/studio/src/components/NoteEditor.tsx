import { describeTarget } from "@beatsheet/schema";
import { useEffect, useRef, useState } from "react";
import { actions, useProject, useStore } from "../store";

/**
 * The note editor, wherever a note is started: a shot, a stretch of the timeline, a clip in the media panel, a region
 * of the frame. Enter keeps the note as an attachment on the next message; nothing goes to the agent until that's sent.
 */
export function NotePopover() {
  const draft = useStore((s) => s.noteDraft);
  // Mounted with the app's overlays, which show before a project is open.
  const p = useStore((s) => s.project);
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setText(draft?.text ?? "");
    if (draft) setTimeout(() => ref.current?.focus(), 0);
  }, [draft]);
  if (!draft || !p) return null;
  // Keep the editor on screen near where it was opened.
  const left = Math.max(12, Math.min(draft.x - 150, window.innerWidth - 332));
  const top = Math.max(12, Math.min(draft.y + 10, window.innerHeight - 190));
  return (
    <>
      <div className="note-pop-back" onPointerDown={() => actions.closeNote()} />
      <div className="note-pop" style={{ left, top }}>
        <div className="small dim">
          {draft.id ? "Edit note on " : "Note on "}
          <strong>{describeTarget(draft.target, p)}</strong>
          {draft.region && " · part of the frame"}
        </div>
        <textarea
          ref={ref}
          rows={3}
          value={text}
          placeholder={draft.target.kind === "asset" ? "e.g. use this somewhere near the end" : "What should change here?"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              actions.saveNote(text);
            }
            if (e.key === "Escape") actions.closeNote();
          }}
        />
        <div className="note-pop-actions">
          <span className="dim small">Enter attaches it to your next message</span>
          <span className="spacer" />
          <button onClick={() => actions.closeNote()}>Cancel</button>
          <button className="primary" disabled={!text.trim()} onClick={() => actions.saveNote(text)}>
            {draft.id ? "Save" : "Attach"}
          </button>
        </div>
      </div>
    </>
  );
}

/** Notes waiting to go with the next message, as chips above the message box. */
export function AttachedNotes() {
  const p = useProject();
  const attached = p.notes.filter((n) => n.status === "queued" && n.author === "you");
  if (!attached.length) return null;
  return (
    <div className="attached">
      {attached.map((n) => (
        <span key={n.id} className="attached-note" title={n.text}>
          <button
            className="attached-body"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              actions.noteOn(n.target, { x: r.left + r.width / 2, y: r.top - 170 }, { id: n.id, text: n.text, at: n.at, region: n.region });
            }}
          >
            <span className="attached-on">{describeTarget(n.target, p)}</span>
            <span className="attached-text">{n.text}</span>
          </button>
          <button className="attached-x" onClick={() => actions.removeNote(n.id)} title="Remove this note">
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}
