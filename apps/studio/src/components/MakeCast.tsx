/**
 * Make's Cast & sets page: everyone and everywhere made shots keep the same, a card each, by kind; and one of them
 * opened across the page, where its steps sit side by side and its pictures are large enough to judge a face by.
 */
import { useState } from "react";
import type { CastMember } from "@beatsheet/schema";
import { hideBroken, posterUrl } from "../lib";
import { actions, useProject, useStore } from "../store";
import { castPicture, CastView, findCast, KINDS, label, newMember, shotsWith, WORD, type Kind } from "./Cast";
import { PopMenu } from "./ui";
import { Icon } from "./Icon";

const PLURAL: Record<Kind, string> = { character: "Characters", place: "Sets", prop: "Props", style: "Styles" };

/** What a cast member still needs before models can keep it the same, if anything. */
function needs(m: CastMember): string | undefined {
  if (m.kind === "style") return m.about ? undefined : "No description yet";
  const looks = [m, ...(m.variants ?? [])];
  const pictured = looks.some((l) => l.sheet || l.portrait || l.images?.length);
  if (!pictured) return m.seen?.length ? "Photos, no portrait or sheet yet" : m.about ? "Described, no pictures yet" : "Nothing yet";
  if (m.kind === "character" && !looks.some((l) => l.sheet)) return "No sheet yet";
  return undefined;
}

export function CastPage() {
  const p = useProject();
  const projectId = useStore((s) => s.projectId)!;
  const [adding, setAdding] = useState<{ x: number; y: number }>();
  const cast = p.cast ?? [];
  // Enough of the person's own pictures that someone or somewhere could recur in them.
  const pictures = p.assets.filter((a) => (a.kind === "image" || a.kind === "video") && a.provenance?.source !== "generated").length;
  const add = (
    <>
      {pictures >= 3 && (
        <button onClick={() => void findCast()} title="The agent looks through your photos and clips for who and what recurs, and you keep the ones you want">
          Find in my photos
        </button>
      )}
      <button className={cast.length ? "" : "primary"} onClick={(e) => setAdding({ x: e.clientX, y: e.clientY })} title="A character, set, prop or style, from a description">
        <Icon name="add" size={12} /> New
      </button>
      {adding && (
        <PopMenu {...adding} onClose={() => setAdding(undefined)}>
          {KINDS.map(([k, name]) => (
            <button
              key={k}
              role="menuitem"
              onClick={() => {
                setAdding(undefined);
                newMember(k);
              }}
            >
              {name}
            </button>
          ))}
        </PopMenu>
      )}
    </>
  );
  if (!cast.length) {
    return (
      <div className="make-empty">
        <h2>No cast or sets yet</h2>
        <p className="dim">
          The characters, places, props and styles that made shots keep the same from one to the next. Start one from a description, or right-click a photo in the Library to make one from it.
        </p>
        <div className="make-row">{add}</div>
      </div>
    );
  }
  return (
    <div className="make-page">
      <header className="page-head">
        <h2>Cast &amp; sets</h2>
        <span className="dim small">What made shots keep the same. Name one in a prompt with @.</span>
        <span className="spacer" />
        {add}
      </header>
      {KINDS.map(([kind]) => {
        const members = cast.filter((m) => m.kind === kind);
        if (!members.length) return null;
        return (
          <section key={kind} className="cast-section">
            <h4>
              {PLURAL[kind]} <span className="dim">{members.length}</span>
            </h4>
            <div className="cast-grid">
              {members.map((m) => {
                const pic = castPicture(p, m);
                const n = shotsWith(p, m.id);
                const need = needs(m);
                const looks = m.variants?.length ?? 0;
                return (
                  <button key={m.id} className="cast-card" onClick={() => actions.select({ kind: "cast", id: m.id })} title={m.about}>
                    <span className="cast-card-pic">{pic ? <img src={posterUrl(projectId, pic)} loading="lazy" alt="" onError={hideBroken} /> : <span className="cast-card-letter">{label(m)[0]!.toUpperCase()}</span>}</span>
                    <span className="cast-card-body">
                      <span className={`cast-card-name ${m.name ? "" : "dim"}`}>{label(m)}</span>
                      <span className="mono dim small">@{m.id}</span>
                      <span className="dim small">
                        {[looks && `${looks + 1} looks`, kind !== "style" && (n ? `in ${n} shot${n === 1 ? "" : "s"}` : "in no shots yet")].filter(Boolean).join(" · ") || WORD[kind]}
                      </span>
                      {need && <span className="warn small">{need}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** One cast member across the page: the same steps as ever, laid out side by side. */
export function CastMemberPage({ id, back, backLabel }: { id: string; back: () => void; backLabel: string }) {
  const p = useProject();
  const cast = p.cast ?? [];
  const at = cast.findIndex((m) => m.id === id);
  const go = (m: CastMember | undefined) => m && actions.select({ kind: "cast", id: m.id });
  return (
    <div className="make-page cast-page">
      <header className="page-head">
        <button className="back" onClick={back}>
          <Icon name="back" size={12} /> {backLabel}
        </button>
        <span className="spacer" />
        {at >= 0 && (
          <span className="dim small">
            {at + 1} of {cast.length}
          </span>
        )}
        <button className="icon" disabled={at <= 0} onClick={() => go(cast[at - 1])} title="The one before" aria-label="The one before">
          <Icon name="back" size={12} />
        </button>
        <button className="icon" disabled={at < 0 || at >= cast.length - 1} onClick={() => go(cast[at + 1])} title="The next one" aria-label="The next one">
          <Icon name="forward" size={12} />
        </button>
      </header>
      <CastView id={id} />
    </div>
  );
}
