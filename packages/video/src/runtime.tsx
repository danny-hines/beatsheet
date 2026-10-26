/**
 * Running scenes: a coded shot's component, compiled by the engine (one CommonJS module per scene file), is fetched
 * and run here with the page's own React, Remotion, three and kit, so it shares Remotion's clock with the composition.
 * Ready-made kit scenes (`kit:Name`) need no code at all. A scene that fails to compile or throws shows what went
 * wrong in its place, which is what the agent sees when it looks at the frame.
 */
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import * as React from "react";
import * as JSX from "react/jsx-runtime";
import * as Remotion from "remotion";
import { AbsoluteFill, continueRender, delayRender, getRemotionEnvironment, useVideoConfig } from "remotion";
import * as Kit from "./kit/index.tsx";

const STATIC: Record<string, unknown> = { react: React, "react/jsx-runtime": JSX, remotion: Remotion, "@beatsheet/motion": Kit };
/** Big modules only fetched when a scene uses them. */
const LAZY: Record<string, () => Promise<unknown>> = { three: () => import("three"), "react-dom": () => import("react-dom") };
const loaded = new Map<string, unknown>();
const modules = new Map<string, Promise<Record<string, unknown>>>();

/** A scene module by URL, fetched and run once (a new code version means a new URL). */
export function loadScene(url: string): Promise<Record<string, unknown>> {
  let p = modules.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) throw new Error(text || `couldn't load the scene (${res.status})`);
      const hosts = JSON.parse(/^\/\*bs-hosts:(.*?)\*\//.exec(text)?.[1] ?? "[]") as string[];
      for (const h of hosts) if (LAZY[h] && !loaded.has(h)) loaded.set(h, await LAZY[h]!());
      const module = { exports: {} as Record<string, unknown> };
      const require = (name: string) => {
        const m = STATIC[name] ?? loaded.get(name);
        if (m === undefined) throw new Error(`Scenes can import react, remotion, three and @beatsheet/motion (other packages are bundled in); "${name}" isn't available`);
        return m;
      };
      new Function("require", "module", "exports", text)(require, module, module.exports);
      return module.exports;
    })();
    modules.set(url, p);
  }
  return p;
}

/**
 * Shows what's wrong with a scene in its place (a compile error, a missing export, a crash) as a red banner over
 * `fallback`: on the picture track, the shot's placeholder card, so a scene written for another project's composition
 * still reads as what it's meant to be; on an overlay track, nothing (and the banner sits top right), so the picture
 * underneath and its own banner still show.
 */
export function SceneProblem({ title, message, fallback }: { title: string; message: string; fallback?: ReactNode }) {
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  return (
    <AbsoluteFill>
      {fallback}
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: fallback ? "flex-start" : "flex-end", padding: 24 * u, pointerEvents: "none" }}>
        <div style={{ background: "rgba(42,15,18,0.94)", color: "#ffd7d2", borderRadius: 10 * u, padding: `${12 * u}px ${18 * u}px`, fontFamily: "SF Mono, Menlo, monospace", fontSize: 20 * u, lineHeight: 1.4, maxWidth: "80%" }}>
          <div style={{ color: "#ff8a80", fontWeight: 700 }}>{title}</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{message.split("\n").slice(0, 4).join("\n")}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

class Boundary extends Component<{ title: string; fallback?: ReactNode; children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`beatsheet scene ${this.props.title}:`, error, info.componentStack);
  }
  render() {
    return this.state.error ? (
      <SceneProblem fallback={this.props.fallback} title={`${this.props.title} crashed`} message={`${this.state.error.name}: ${this.state.error.message}`} />
    ) : (
      this.props.children
    );
  }
}

/**
 * A coded shot's component, ready to draw: from the kit, or loaded from the project's code. While a scene file loads
 * the render waits for it (in the studio it just appears a moment later).
 */
export function SceneComponent({ component, codeBase, codeVersion, props, fallback }: { component: string; codeBase: string; codeVersion?: string; props: Record<string, unknown>; fallback?: ReactNode }) {
  if (component.startsWith("kit:")) {
    const name = component.slice(4);
    const K = Kit.KIT[name];
    if (!K) return <SceneProblem fallback={fallback} title={`No kit scene "${name}"`} message={`The kit has: ${Object.keys(Kit.KIT).join(", ")}`} />;
    return (
      <Boundary title={component} fallback={fallback}>
        <K {...props} />
      </Boundary>
    );
  }
  return <LoadedScene component={component} codeBase={codeBase} codeVersion={codeVersion} props={props} fallback={fallback} />;
}

function LoadedScene({ component, codeBase, codeVersion, props, fallback }: { component: string; codeBase: string; codeVersion?: string; props: Record<string, unknown>; fallback?: ReactNode }) {
  const [path, name = "default"] = component.split("#");
  const url = `${codeBase}/${path!.split("/").map(encodeURIComponent).join("/")}${codeVersion ? `?v=${encodeURIComponent(codeVersion)}` : ""}`;
  const [state, setState] = useState<{ url: string; C?: React.FC<Record<string, unknown>>; error?: string }>({ url });
  const [handle] = useState(() => (getRemotionEnvironment().isRendering ? delayRender(`Loading ${component}`, { timeoutInMilliseconds: 60_000 }) : null));
  useEffect(() => {
    let gone = false;
    loadScene(url)
      .then((m) => {
        if (gone) return;
        const C = (m[name] ?? (name === "default" ? m.default : undefined)) as React.FC<Record<string, unknown>> | undefined;
        setState(C ? { url, C } : { url, error: `${path} has no export "${name}". It exports: ${Object.keys(m).join(", ") || "nothing"}` });
      })
      .catch((err: unknown) => !gone && setState({ url, error: err instanceof Error ? err.message : String(err) }))
      .finally(() => handle !== null && continueRender(handle));
    return () => {
      gone = true;
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.error) return <SceneProblem fallback={fallback} title={`${component} didn't load`} message={state.error} />;
  if (!state.C || state.url !== url) return null;
  return (
    <Boundary key={url} title={component} fallback={fallback}>
      <state.C {...props} />
    </Boundary>
  );
}
