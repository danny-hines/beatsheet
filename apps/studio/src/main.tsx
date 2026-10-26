import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { reportError } from "./lib";
import "./styles.css";

// The local server only acts on requests that carry this header, which a web page on another site can't add.
const plainFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("/api/") && !url.startsWith(`${location.origin}/api/`)) return plainFetch(input, init);
  const headers = new Headers(init.headers);
  headers.set("x-beatsheet", "1");
  return plainFetch(input, { ...init, headers });
};

// Errors the page doesn't handle go to the studio's log too (.beatsheet/studio.log): the Mac app has no console to read.
window.addEventListener("error", (e) => reportError("page", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => reportError("promise", e.reason));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
