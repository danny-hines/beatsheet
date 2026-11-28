import { describe, expect, it } from "vitest";
import { dismissJob, isJobDismissed, readDismissedJobs } from "../src/dismissedJobs";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("dismissedJobs persistence", () => {
  it("persists dismissed failures per project across reloads and re-shows a job if a later retry fails", () => {
    const store = memoryStorage();
    const job = { id: "j1", updatedAt: "2026-11-28T01:35:01.027Z" };

    expect(isJobDismissed(readDismissedJobs("proj-a", store), job)).toBe(false);

    dismissJob("proj-a", job, store);

    // Persists on fresh reads (navigating away & back or reloading Studio).
    expect(isJobDismissed(readDismissedJobs("proj-a", store), job)).toBe(true);
    // Scoped to the project.
    expect(isJobDismissed(readDismissedJobs("proj-b", store), job)).toBe(false);
    // If the same job is retried and fails again with a newer timestamp, the new failure shows.
    expect(isJobDismissed(readDismissedJobs("proj-a", store), { id: "j1", updatedAt: "2026-11-28T01:40:00.000Z" })).toBe(false);
  });

  it("handles corrupt storage gracefully and prunes stale entries past the cap", () => {
    const store = memoryStorage();
    store.setItem("beatsheet.dismissedJobs.broken", "{not-json");
    expect(readDismissedJobs("broken", store)).toEqual({});

    const now = Date.parse("2026-11-28T02:00:00.000Z");
    const old: Record<string, string> = {};
    for (let i = 0; i < 205; i++) old[`old-${i}`] = "2026-11-01T00:00:00.000Z";
    store.setItem("beatsheet.dismissedJobs.big", JSON.stringify(old));
    const next = dismissJob("big", { id: "fresh", updatedAt: "2026-11-28T01:59:00.000Z" }, store, now);
    expect(next).toEqual({ fresh: "2026-11-28T01:59:00.000Z" });
  });
});
