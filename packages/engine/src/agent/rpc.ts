/**
 * JSON-RPC 2.0 over a child process's stdio, one message per line. `muse serve` and `codex app-server` both speak it.
 * Notifications and the server's own requests come out as events; the adapter answers requests with `respond`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";

/** Command and turn ids both protocols want: UUIDv7. */
export function uuid7(): string {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
export type RpcId = number | string;

/**
 * Events: `notification` (method, params), `request` (id, method, params) for requests from the server, and `closed`
 * (error) once the process is gone.
 */
export class StdioRpc extends EventEmitter {
  private child?: ChildProcess;
  private pending = new Map<number, Pending>();
  private nextId = 0;
  private buffer = "";
  private stderr = "";
  closed = false;
  /** How errors refer to the server, e.g. "Codex". */
  private name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  spawn(command: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }) {
    const child = spawn(command, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => this.consume(chunk));
    child.stderr!.on("data", (d: Buffer) => (this.stderr = (this.stderr + d.toString()).slice(-4000)));
    child.on("error", (err) => this.fail(new Error(`Couldn't start ${this.name}: ${err.message}`)));
    child.on("exit", (code, signal) => this.fail(new Error(`${this.name} stopped (${signal ?? code}). ${this.stderr.trim().split("\n").pop() ?? ""}`.trim())));
  }

  private consume(chunk: string) {
    this.buffer += chunk;
    let end: number;
    while ((end = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + 1);
      if (!line) continue;
      let msg: { id?: RpcId; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message?: string; code?: number } };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.method && msg.id !== undefined) this.emit("request", msg.id, msg.method, msg.params ?? {});
      else if (msg.method) this.emit("notification", msg.method, msg.params ?? {});
      else if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(Object.assign(new Error(msg.error.message ?? `${this.name} refused the request`), { code: msg.error.code }));
        else p.resolve(msg.result);
      }
    }
  }

  request<T = unknown>(method: string, params: unknown, timeoutMs = 60_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error(`${this.name} isn't running`));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name} didn't answer ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params?: unknown) {
    if (!this.closed) this.write({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) });
  }

  respond(id: RpcId, result: unknown) {
    if (!this.closed) this.write({ jsonrpc: "2.0", id, result });
  }

  refuse(id: RpcId, message = "Unsupported client method", code = -32601) {
    if (!this.closed) this.write({ jsonrpc: "2.0", id, error: { code, message } });
  }

  private write(obj: unknown) {
    this.child?.stdin?.write(JSON.stringify(obj) + "\n");
  }

  private fail(err: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    this.emit("closed", err);
  }

  close() {
    this.fail(new Error("closed"));
    this.child?.kill();
  }
}
