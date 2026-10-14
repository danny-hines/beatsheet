import type { StageId } from "@beatsheet/schema";
import { useEffect, type ReactNode } from "react";
import { StageHeader, StageRail, TopBar } from "./components/Chrome";
import { SidePanel } from "./components/Side";
import { Timeline } from "./components/Timeline";
import { AssembleView, BoardView, BriefView, CraftView, FinishView, MaterialView, SoundView, StructureView } from "./components/views";
import { isTyping } from "./lib";
import { actions, getState, setState, timelineFor, useStore } from "./store";

const VIEWS: Record<StageId, () => ReactNode> = {
  brief: BriefView,
  material: MaterialView,
  structure: StructureView,
  board: BoardView,
  assemble: AssembleView,
  craft: CraftView,
  sound: SoundView,
  finish: FinishView,
};

export function App() {
  const project = useStore((s) => s.project);
  const loadError = useStore((s) => s.loadError);
  const stage = useStore((s) => s.stage);

  useEffect(() => {
    actions.loadList().then(() => {
      const id = location.hash.slice(1) || getState().list[0]?.id;
      if (id) actions.open(id);
    });
    const onHash = () => {
      const id = location.hash.slice(1);
      if (id && id !== getState().projectId) actions.open(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  usePlayback();
  useKeys();

  if (loadError) {
    return (
      <div className="fatal">
        <h2>This project file doesn't validate</h2>
        <pre>{loadError.join("\n")}</pre>
      </div>
    );
  }
  if (!project) return <div className="fatal dim">Loading…</div>;
  const View = VIEWS[stage];
  return (
    <div className="app">
      <TopBar />
      <StageRail />
      <main className="main">
        <StageHeader />
        <View />
      </main>
      <Timeline />
      <aside className="side">
        <SidePanel />
      </aside>
    </div>
  );
}

/** Advances the playhead in real time while playing. */
function usePlayback() {
  const playing = useStore((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const s = getState();
      if (!s.project) return;
      const end = timelineFor(s.project, s.format).duration;
      const t = s.playhead + (now - last) / 1000;
      last = now;
      if (t >= end) {
        setState({ playhead: end, playing: false });
        return;
      }
      setState({ playhead: t });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getState();
      if (!s.project) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        if (isTyping(e)) return;
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (isTyping(e) || mod) return;
      const fps = s.project.formats.find((f) => f.id === s.format)?.fps ?? 30;
      if (e.key === " ") {
        e.preventDefault();
        actions.togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        actions.seek(s.playhead - (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        actions.seek(s.playhead + (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        actions.compose();
      } else if (e.key === "Escape") {
        actions.select(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
