/**
 * Review on the local network: an export of a cut shared by an unguessable link that anyone on the same network
 * opens in a browser. They watch it and write notes at a moment, and the notes come into the cut as notes from them,
 * beside the person's own. It's a small server of its own, on only while something is shared, that serves the shared
 * files and their notes and nothing else (the studio and its API stay on this computer).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { SETTINGS_DIR } from "./settings.ts";
import { loadProject, updateFile } from "./store.ts";

/** A shared export: `offset` is where in the cut its file starts (an export of a marked stretch starts partway in). */
export type Share = { token: string; project: string; cut: string; format?: string; file: string; title: string; at: string; offset?: number };

const FILE = join(SETTINGS_DIR, "shares.json");
const PORT = Number(process.env.BEATSHEET_SHARE_PORT ?? 47230);
let shares: Share[] | undefined;
let server: Server | undefined;
let port = 0;

const load = () => (shares ??= existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Share[]) : []);
const keep = () => writeFileSync(FILE, JSON.stringify(load(), null, 2));

/** This computer's address on the local network, for the link (the first one that isn't a loopback). */
export function lanAddress(): string | undefined {
  for (const list of Object.values(networkInterfaces()))
    for (const n of list ?? []) if (n.family === "IPv4" && !n.internal) return n.address;
  return undefined;
}

const linkOf = (s: Share) => `http://${lanAddress() ?? "127.0.0.1"}:${port}/r/${s.token}`;

/** Shares an export of a cut for review; returns the link. The server starts if it isn't running. */
export async function share(projectId: string, opts: { cut: string; format?: string; file: string; offset?: number }): Promise<{ token: string; url: string }> {
  if (!existsSync(opts.file)) throw new Error("Export it first: there's no file to share");
  const { project } = loadProject(projectId, opts.cut);
  const s: Share = { token: randomBytes(16).toString("base64url"), project: projectId, cut: opts.cut, format: opts.format, file: opts.file, title: project.cut.id === "main" ? project.title : `${project.title}: ${project.cut.name}`, at: new Date().toISOString(), ...(opts.offset ? { offset: opts.offset } : {}) };
  load().push(s);
  keep();
  await serve();
  return { token: s.token, url: linkOf(s) };
}

/** Stops sharing; the link stops working. The server stops when nothing's shared. */
export function unshare(token: string) {
  shares = load().filter((s) => s.token !== token);
  keep();
  if (!shares.length && server) {
    server.close();
    server = undefined;
  }
}

/** What a project has shared, with each link. Starts the server for them if it isn't running. */
export async function sharesOf(projectId: string): Promise<(Share & { url: string })[]> {
  const mine = load().filter((s) => s.project === projectId && existsSync(s.file));
  if (mine.length) await serve();
  return mine.map((s) => ({ ...s, url: linkOf(s) }));
}

async function serve(): Promise<void> {
  if (server) return;
  server = createServer((req, res) => void handle(req, res).catch((err) => send(res, 500, "text/plain", String(err instanceof Error ? err.message : err))));
  await new Promise<void>((ok, fail) => {
    server!.once("error", (err: NodeJS.ErrnoException) => {
      // The usual port taken: any free one.
      if (err.code === "EADDRINUSE") server!.listen(0, "0.0.0.0", () => ok());
      else fail(err);
    });
    server!.listen(PORT, "0.0.0.0", () => ok());
  });
  const addr = server.address();
  port = typeof addr === "object" && addr ? addr.port : PORT;
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const [, r, token, what] = (req.url ?? "").split("?")[0]!.split("/");
  const s = r === "r" && token ? load().find((x) => x.token === token) : undefined;
  if (!s || !existsSync(s.file)) return send(res, 404, "text/plain", "This link isn't shared any more.");
  if (!what && req.method === "GET") return send(res, 200, "text/html; charset=utf-8", page(s));
  if (what === "video" && req.method === "GET") {
    const { sendFile } = await import("./http.ts");
    return sendFile(req, res, s.file);
  }
  if (what === "notes" && req.method === "GET") return send(res, 200, "application/json", JSON.stringify(notesOf(s)));
  if (what === "notes" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 10_000) return send(res, 413, "text/plain", "Too long");
    }
    const b = JSON.parse(body || "{}") as { name?: string; text?: string; t?: number };
    const text = String(b.text ?? "").trim().slice(0, 2000);
    const name = String(b.name ?? "").trim().slice(0, 60) || "A reviewer";
    const t = Math.max(0, Math.round((Number(b.t ?? 0) + (s.offset ?? 0)) * 100) / 100);
    if (!text) return send(res, 400, "text/plain", "Write something first");
    updateFile(s.project, (d) => {
      const cut = d.cuts.find((c) => c.id === s.cut);
      if (!cut) return;
      let k = cut.notes.length + 1;
      while (cut.notes.some((n) => n.id === `n${k}`)) k++;
      cut.notes.push({ id: `n${k}`, text, status: "open", target: { kind: "time", t }, at: t, ...(s.format ? { format: s.format } : {}), author: "reviewer", by: name, createdAt: new Date().toISOString() });
    });
    return send(res, 200, "application/json", JSON.stringify(notesOf(s)));
  }
  send(res, 404, "text/plain", "Not here");
}

/** The notes reviewers left on a shared cut, for its page. */
function notesOf(s: Share) {
  const { project } = loadProject(s.project, s.cut);
  return project.notes
    .filter((n) => n.author === "reviewer" && (n.at ?? 0) >= (s.offset ?? 0))
    .map((n) => ({ by: n.by ?? "A reviewer", text: n.text, t: Math.round(((n.at ?? 0) - (s.offset ?? 0)) * 100) / 100, done: n.status === "done", reply: n.reply }));
}

const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The review page: the video, a note at the moment it's paused on, and the notes so far. */
function page(s: Share): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.title)} · review</title>
<style>
:root{color-scheme:dark;--bg:#121317;--panel:#1a1c21;--line:#2a2e36;--text:#e6e8ec;--dim:#9aa0ab;--accent:#f2b544}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:20px 16px 60px}h1{font-size:20px;margin:0 0 4px}.dim{color:var(--dim)}
video{width:100%;max-height:70vh;background:#000;border-radius:8px;margin:12px 0}
form{display:grid;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px}
input,textarea{background:#0f1013;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:8px;font:inherit}
textarea{min-height:70px;resize:vertical}button{background:var(--accent);color:#1a1408;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer;justify-self:start}
ul{list-style:none;padding:0;margin:16px 0 0}li{border-top:1px solid var(--line);padding:10px 0}li a{color:var(--accent);text-decoration:none;font-variant-numeric:tabular-nums}
.done{opacity:.6}.reply{color:var(--dim);font-size:14px;margin-top:2px}
</style></head><body><main>
<h1>${esc(s.title)}</h1><div class="dim">Pause where you have something to say, write it, and it goes to the editor as a note at that moment.</div>
<video id="v" src="/r/${s.token}/video" controls playsinline preload="metadata"></video>
<form id="f"><label class="dim">Your name <input id="name" maxlength="60" autocomplete="name"></label>
<textarea id="text" maxlength="2000" placeholder="What's on your mind at this moment?" required></textarea>
<button id="go" type="submit">Note at 0:00</button></form>
<ul id="list"></ul>
<script>
const v=document.getElementById("v"),go=document.getElementById("go"),list=document.getElementById("list"),nameEl=document.getElementById("name"),text=document.getElementById("text");
try{nameEl.value=localStorage.getItem("bs-review-name")||""}catch{}
const fmt=t=>{const m=Math.floor(t/60),s=(t%60).toFixed(1).padStart(4,"0");return m+":"+s};
v.addEventListener("timeupdate",()=>go.textContent="Note at "+fmt(v.currentTime));
text.addEventListener("focus",()=>v.pause());
const esc=x=>String(x).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const show=notes=>{list.innerHTML=notes.sort((a,b)=>a.t-b.t).map(n=>'<li class="'+(n.done?"done":"")+'"><a href="#" data-t="'+n.t+'">'+fmt(n.t)+'</a> <strong>'+esc(n.by)+'</strong>: '+esc(n.text)+(n.reply?'<div class="reply">'+esc(n.reply)+'</div>':"")+'</li>').join("")};
list.addEventListener("click",e=>{const t=e.target.dataset&&e.target.dataset.t;if(t!==undefined){e.preventDefault();v.currentTime=Number(t);v.play()}});
fetch("/r/${s.token}/notes").then(r=>r.json()).then(show);
document.getElementById("f").addEventListener("submit",async e=>{e.preventDefault();try{localStorage.setItem("bs-review-name",nameEl.value)}catch{}
const r=await fetch("/r/${s.token}/notes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:nameEl.value,text:text.value,t:v.currentTime})});
if(r.ok){text.value="";show(await r.json())}else alert(await r.text())});
</script></main></body></html>`;
}

