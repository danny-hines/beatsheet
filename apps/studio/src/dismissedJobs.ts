import { useEffect, useState } from "react";

type JobRef = { id: string; updatedAt: string };
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const KEY = (projectId: string) => `beatsheet.dismissedJobs.${projectId}`;
const MAX_ENTRIES = 200;
const STALE_MS = 7 * 24 * 3600_000;

const listeners = new Map<string, Set<() => void>>();

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof globalThis !== "undefined" && "localStorage" in globalThis ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Reads dismissed failed jobs (`jobId -> updatedAt`) for a project from storage. */
export function readDismissedJobs(projectId: string, storage: StorageLike | undefined = defaultStorage()): Record<string, string> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(KEY(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** True when this exact failure occurrence (`id` + `updatedAt`) has been dismissed; a later retry that fails again reappears. */
export function isJobDismissed(dismissed: Record<string, string>, job: JobRef): boolean {
  return dismissed[job.id] === job.updatedAt;
}

/** Persists dismissal of a failed job occurrence and notifies any mounted listeners for the same project. */
export function dismissJob(projectId: string, job: JobRef, storage: StorageLike | undefined = defaultStorage(), now = Date.now()): Record<string, string> {
  const next = { ...readDismissedJobs(projectId, storage), [job.id]: job.updatedAt };
  const keys = Object.keys(next);
  if (keys.length > MAX_ENTRIES) {
    const cutoff = new Date(now - STALE_MS).toISOString();
    for (const k of keys) {
      if (k !== job.id && next[k]! < cutoff) delete next[k];
    }
  }
  try {
    storage?.setItem(KEY(projectId), JSON.stringify(next));
  } catch {
    // Storage full or unavailable; in-memory state still updates.
  }
  for (const fn of listeners.get(projectId) ?? []) fn();
  return next;
}

/** React hook keeping dismissed failed-job state persisted per project across remounts, navigation, and reloads. */
export function useDismissedJobs(projectId: string) {
  const [dismissed, setDismissed] = useState<Record<string, string>>(() => readDismissedJobs(projectId));

  useEffect(() => {
    setDismissed(readDismissedJobs(projectId));
    const sync = () => setDismissed(readDismissedJobs(projectId));
    let set = listeners.get(projectId);
    if (!set) listeners.set(projectId, (set = new Set()));
    set.add(sync);
    return () => {
      set?.delete(sync);
      if (set?.size === 0) listeners.delete(projectId);
    };
  }, [projectId]);

  const dismiss = (job: JobRef) => setDismissed(dismissJob(projectId, job));
  return { dismissed, isDismissed: (job: JobRef) => isJobDismissed(dismissed, job), dismiss };
}
