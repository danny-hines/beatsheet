import { configDefaults, defineConfig } from "vitest/config";

// Sessions working in their own git worktrees keep them under .claude/worktrees: their copies aren't this checkout's tests.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, ".claude/**"] } });
