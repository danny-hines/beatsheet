import type { AgentChange, Presence } from "@beatsheet/engine";
import { useEffect } from "react";
import { TopBar } from "./components/Chrome";
import { Home } from "./components/Home";
import { Library } from "./components/Library";
import { Shortcuts } from "./components/Dialogs";
import { NotePopover } from "./components/NoteEditor";
import { NewProjectDialog } from "./components/NewProject";
import { SettingsDialog, SetupScreen } from "./components/Setup";
import { SidePanel } from "./components/Side";
import { Timeline } from "./components/Timeline";
import { Preview, Transport } from "./components/Preview";
import { useTurn } from "./components/Turn";
import { desktop, isTyping, noteHere, pictureTrack, WINDOWS } from "./lib";
import { actions, getState, hasPlayer, setState, timelineFor, useStore } from "./store";

export function App() {
  const project = useStore((s) => s.project);
  const loadError = useStore((s) => s.loadError);
  const newProjectOpen = useStore((s) => s.newProjectOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setup = useStore((s) => s.setup);
  const settingsLoaded = useStore((s) => s.settingsLoaded);

  useEffect(() => {
    // The app opens on the list of projects; a link to one (#project or #project/cut, as after a reload) opens it.
    void actions.loadList();
    const [hashId, hashCut] = location.hash.slice(1).split("/");
    if (hashId) void actions.open(hashId, hashCut);
    const onHash = () => {
      const [id, cut] = location.hash.slice(1).split("/");
      if (!id) return void (getState().projectId && actions.goHome());
      if (id !== getState().projectId) actions.open(id, cut);
      else if (cut && cut !== getState().cutId) actions.setCut(cut);
    };
    window.addEventListener("hashchange", onHash);
    // Live updates from the engine: project files changed on disk, agent sessions, the hosted agent's progress.
    const events = new EventSource("/api/events");
    const on = <T,>(name: string, fn: (data: T) => void) => events.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data) as T));
    on<{ id: string; version: string }>("changed", (d) => actions.externalChange(d.id, d.version));
    // A scene's code changed (the agent wrote it): the player reloads that project's scenes.
    on<{ id: string; version: string }>("code", (d) => d.id === getState().projectId && setState({ codeVersion: d.version }));
    on<Presence[]>("agents", (agents) => actions.setAgents(agents));
    on<AgentChange>("agent", (change) => actions.applyAgent(change));
    // The stream reconnects by itself; anything missed while it was down is fetched again.
    events.addEventListener("open", () => {
      void actions.loadAgent();
      const { projectId, version } = getState();
      if (projectId) void fetch(`/api/projects/${projectId}`).then(async (r) => r.ok && actions.externalChange(projectId, ((await r.json()) as { version: string }).version ?? version!));
    });
    // New projects can appear from the CLI or an agent; pick them up when the window comes back.
    const onFocus = () => void actions.loadList();
    window.addEventListener("focus", onFocus);
    void actions.loadSettings();
    // The Mac app's menu.
    const offMenu = desktop?.onMenu((command) => {
      if (command === "new-project") actions.setNewProjectOpen(true);
      else if (command === "home") void actions.goHome();
      else if (command === "settings") actions.setSettingsOpen(true);
      else if (command === "add-footage") window.dispatchEvent(new CustomEvent("beatsheet:add-footage"));
      else if (command === "export") window.dispatchEvent(new CustomEvent("beatsheet:export"));
      else if (command === "new-cut") window.dispatchEvent(new CustomEvent("beatsheet:new-cut"));
      else if (command.startsWith("record-")) window.dispatchEvent(new CustomEvent("beatsheet:record", { detail: command.slice("record-".length) }));
    });
    if (desktop) document.documentElement.classList.add("desktop");
    if (desktop && WINDOWS) document.documentElement.classList.add("win");
    void actions.loadAgent().then(() => getState().agent.agent && actions.loadAgentList());
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("focus", onFocus);
      events.close();
      offMenu?.();
    };
  }, []);
  usePlayback();
  useKeys();

  // Nothing until the settings answer, so first launch doesn't flash the editor before its own screen.
  if (!settingsLoaded) return null;
  if (setup && !setup.settings.setupDone) return <SetupScreen setup={setup} />;
  if (loadError) {
    return (
      <div className="fatal">
        <h2>This project file doesn't validate</h2>
        <pre>{loadError.join("\n")}</pre>
        <button onClick={() => void actions.goHome()}>‹ All projects</button>
      </div>
    );
  }
  const overlays = (
    <>
      {newProjectOpen && <NewProjectDialog />}
      {settingsOpen && <SettingsDialog />}
      <NotePopover />
      <Shortcuts />
    </>
  );
  if (!project) {
    return (
      <>
        <Home />
        {overlays}
      </>
    );
  }
  // Media on the left, the cut in the middle, the agent and notes on the right.
  return (
    <div className="app">
      <TopBar />
      <Library />
      <main className="main">
        <Notice />
        <div className="player">
          <PlayerOrWaiting />
        </div>
      </main>
      <Timeline />
      <aside className="side">
        <SidePanel />
      </aside>
      {overlays}
    </div>
  );
}

/** The cut, or while it has no shots yet, what's happening instead of a black frame. */
function PlayerOrWaiting() {
  const empty = useStore((s) => !s.project?.shots.length);
  const t = useTurn();
  // A turn on another cut says nothing about this one.
  const mine = !t.elsewhere;
  if (!empty) {
    return (
      <>
        <Preview />
        <Transport />
      </>
    );
  }
  return (
    <div className="player-waiting">
      {mine && t.who === "agent" && t.interrupted ? (
        <>
          <p>
            <strong>{t.name}</strong> stopped partway through its turn.
          </p>
          <p className="dim small">Carry on, or take the turn back, in the panel on the right.</p>
        </>
      ) : mine && t.who === "agent" ? (
        <>
          <span className="dots" />
          <p>
            <strong>{t.name}</strong> is {t.line}.
          </p>
          <p className="dim small">Your cut shows up here as soon as there is one. Nothing is needed from you yet.</p>
        </>
      ) : (
        <>
          <p>Nothing to play yet.</p>
          <p className="dim small">
            {mine && t.ask
              ? "The agent asked you something; it's in the panel on the right."
              : t.who === "agent" && t.elsewhere && !t.interrupted
                ? `${t.name} is working on "${t.elsewhere.name}". Ask for this cut once it hands back, or add footage on the left.`
                : "Tell the agent what to make, or add footage on the left."}
          </p>
        </>
      )}
    </div>
  );
}

function Notice() {
  const notice = useStore((s) => s.notice);
  if (!notice) return null;
  return (
    <div className="notice">
      {notice}
      <button className="link" onClick={actions.dismissNotice}>Dismiss</button>
    </div>
  );
}

/** Advances the playhead in real time while playing, when no live player is on screen. */
function usePlayback() {
  const playing = useStore((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const s = getState();
      if (!s.project || hasPlayer()) return; // the live player keeps time while it's on screen
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
      // Not while setup or Settings is on screen: the editor behind isn't what the keys are for.
      if (!s.project || s.settingsOpen || (s.setup && !s.setup.settings.setupDone)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        if (isTyping(e)) return;
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      // Windows' own redo.
      if (WINDOWS && e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "y" && !isTyping(e)) {
        e.preventDefault();
        actions.redo();
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
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const tl = timelineFor(s.project, s.format);
        const pic = pictureTrack(s.project);
        const cuts = tl.shots.filter((x) => x.track === pic && Number.isFinite(x.start)).map((x) => x.start);
        const to = e.key === "ArrowUp" ? [...cuts].reverse().find((c) => c < s.playhead - 0.01) : cuts.find((c) => c > s.playhead + 0.01);
        if (to !== undefined) actions.seek(to);
      } else if (e.key === "Home") {
        e.preventDefault();
        actions.seek(0);
      } else if (e.key === "End") {
        e.preventDefault();
        actions.seek(timelineFor(s.project, s.format).duration);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        noteHere();
      } else if (e.key === "Escape") {
        actions.select(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
