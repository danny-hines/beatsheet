/**
 * Optional media services the person can add with an API key. Each one gives the agent new abilities (images, video,
 * music, a voice); keys are checked with a request that spends nothing, then kept in the Keychain.
 */
import { findSamToken } from "./sam-cuda.ts";
import { samReady } from "./sam.ts";
import { deleteSecret, getSecret, readSettings, setSecret, updateSettings } from "./settings.ts";

export type Capability = "images" | "video" | "music" | "voice" | "sfx" | "transcribe" | "segment";
export const CAPABILITY_LABELS: Record<Capability, string> = {
  images: "Generate images",
  video: "Generate video",
  music: "Generate music",
  voice: "Voiceover",
  sfx: "Sound effects",
  transcribe: "Transcribe speech",
  segment: "Cut out anything you describe",
};

export type KeyCheck = { ok: boolean; detail: string };
type Service = {
  id: string;
  label: string;
  /** One line on what it's for. */
  does: string;
  unlocks: Capability[];
  /** Where to get a key. */
  keyUrl: string;
  verify: (key: string) => Promise<KeyCheck>;
};

/**
 * Calls `url` with the key and reads the answer. 401 means the key is wrong; a rate limit or an outage means it
 * couldn't be checked, which isn't the same thing.
 */
async function tryKey(url: string, headers: Record<string, string>, describe: (body: Record<string, unknown>, res: Response) => string): Promise<KeyCheck & { status: number }> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    return { ok: false, status: 0, detail: `Couldn't reach the service (${err instanceof Error ? err.message : String(err)})` };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, status: res.status, detail: describe(body, res) };
  // Gemini answers a bad key with 400 API_KEY_INVALID rather than 401.
  if (res.status === 401 || (res.status === 400 && JSON.stringify(body).includes("API_KEY_INVALID"))) return { ok: false, status: res.status, detail: "That key was refused" };
  if (res.status === 403) return { ok: false, status: 403, detail: "That key works but doesn't have permission for this" };
  if (res.status === 429 || res.status >= 500) return { ok: false, status: res.status, detail: `Couldn't check the key right now (the service answered ${res.status}); try again shortly` };
  return { ok: false, status: res.status, detail: `The service answered ${res.status}` };
}

const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : undefined);

export const SERVICES: Service[] = [
  {
    id: "fal",
    label: "fal",
    does: "Hundreds of models in one place: video (Kling, Wan, MiniMax), images, music (Lyria, Stable Audio), voiceover and sound effects.",
    unlocks: ["video", "images", "music", "voice", "sfx", "segment"],
    keyUrl: "https://fal.ai/dashboard/keys",
    async verify(key) {
      const auth = { Authorization: `Key ${key}` };
      // The balance needs a key with billing access; an ordinary API key gets 403 there, so fall back to the model list.
      const billing = await tryKey("https://api.fal.ai/v1/account/billing?expand=credits", auth, (b) => {
        const c = b.credits as { current_balance?: number; currency?: string } | undefined;
        return [b.username ? `Signed in as ${b.username}` : "Key works", c?.current_balance !== undefined ? `${num(c.current_balance)} ${c.currency ?? ""} in credits`.trim() : ""].filter(Boolean).join(" · ");
      });
      if (billing.status !== 403) return billing;
      return tryKey("https://api.fal.ai/v1/models?limit=1", auth, () => "Key works");
    },
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    does: "Voiceover in any voice, sound effects, music, and transcription (Scribe).",
    unlocks: ["voice", "sfx", "music", "transcribe"],
    keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    verify: (key) =>
      tryKey("https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": key }, (b) =>
        [b.tier ? `${String(b.tier)} plan` : "Key works", b.character_limit ? `${num(b.character_count)} of ${num(b.character_limit)} credits used` : ""].filter(Boolean).join(" · "),
      ),
  },
  {
    id: "gemini",
    label: "Google Gemini",
    does: "Images (Nano Banana), video (Gemini Omni), music (Lyria) and voiceover, with a Google AI Studio key.",
    unlocks: ["images", "video", "music", "voice"],
    keyUrl: "https://aistudio.google.com/apikey",
    verify: (key) => tryKey("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { "x-goog-api-key": key }, () => "Key works"),
  },
  {
    id: "meta",
    label: "Meta",
    does: "Meta's Model API: cheap images (Muse Image, about 1¢ each), transcription (Muse Voice Transcribe), and SAM 3.1 for photos and video.",
    // SAM 3.1 joins `unlocks` once cut_out can use it here.
    unlocks: ["images", "transcribe"],
    keyUrl: "https://dev.meta.ai/platform/settings/api-keys",
    verify: (key) => tryKey("https://api.meta.ai/v1/models", { Authorization: `Bearer ${key}` }, () => "Key works"),
  },
  {
    id: "runway",
    label: "Runway",
    does: "Other makers' models on one key: video (Kling, Seedance, Wan, MiniMax H3, Gemini Omni) and images (Nano Banana, GPT Image, Muse Image). A take its moderation turns down is still charged.",
    unlocks: ["video", "images"],
    keyUrl: "https://dev.runway.com",
    // The organization reads the account without starting anything. Its balance is in credits of a cent each.
    verify: (key) =>
      tryKey("https://api.dev.runwayml.com/v1/organization", { Authorization: `Bearer ${key}`, "X-Runway-Version": "2024-11-06" }, (b) =>
        typeof b.creditBalance === "number" ? `Key works · $${num(b.creditBalance / 100)} to spend` : "Key works",
      ),
  },
  {
    id: "tein",
    label: "Tein",
    does: "Seedance 2.5 for less than elsewhere, and with real people in the shot (your own photos of them; Tein's terms want each person's consent).",
    unlocks: ["video"],
    keyUrl: "https://app.tein.ai",
    // The balance reads the account without starting anything; a key that can't run models is refused there with 403.
    verify: (key) =>
      tryKey("https://api.tein.ai/v1/balance", { Authorization: `Bearer ${key}` }, (b) => (typeof b.available === "number" ? `Key works · $${num(b.available)} to spend` : "Key works")),
  },
  {
    id: "openai",
    label: "OpenAI",
    does: "Images with GPT Image, and transcription.",
    unlocks: ["images", "transcribe"],
    keyUrl: "https://platform.openai.com/api-keys",
    verify: (key) => tryKey("https://api.openai.com/v1/models", { Authorization: `Bearer ${key}` }, () => "Key works"),
  },
  {
    id: "replicate",
    label: "Replicate",
    does: "Almost any public model on one key. The key can be saved now; beatsheet can't make anything with it yet.",
    // Nothing runs through Replicate until it has routes in the catalog, so it unlocks nothing and isn't offered as a provider.
    unlocks: [],
    keyUrl: "https://replicate.com/account/api-tokens",
    verify: (key) => tryKey("https://api.replicate.com/v1/account", { Authorization: `Bearer ${key}` }, (b) => (b.username ? `Signed in as ${b.username}` : "Key works")),
  },
];

export type ServiceInfo = Omit<Service, "verify"> & { configured: boolean; detail?: string; addedAt?: string };

export function listServices(): ServiceInfo[] {
  const saved = readSettings().services;
  return SERVICES.map(({ verify: _verify, ...s }) => ({ ...s, configured: !!saved[s.id], detail: saved[s.id]?.detail, addedAt: saved[s.id]?.addedAt }));
}

let found: Promise<void> | undefined;
/**
 * Keys already in the Keychain that settings don't list, checked again and listed, once a run. Settings can be new while
 * the keys aren't: its file was deleted, or (on Windows) the first copy of it was kept inside another app's container.
 */
export function findSavedKeys(): Promise<void> {
  const listed = readSettings().services;
  const find = async (s: Service) => {
    const key = await getSecret(s.id);
    const check = key ? await s.verify(key).catch(() => undefined) : undefined;
    if (check?.ok) updateSettings((x) => void (x.services[s.id] = { addedAt: new Date().toISOString(), detail: check.detail }));
  };
  return (found ??= Promise.all([...SERVICES.filter((s) => !listed[s.id]).map(find), process.platform === "win32" && findSamToken()]).then(
    () => undefined,
    () => undefined,
  ));
}

/** Checks the key, and only if it works stores it in the Keychain. */
export async function addServiceKey(id: string, key: string): Promise<KeyCheck> {
  const service = SERVICES.find((s) => s.id === id);
  if (!service) return { ok: false, detail: `Unknown service "${id}"` };
  const check = await service.verify(key.trim());
  if (!check.ok) return check;
  await setSecret(id, key.trim());
  updateSettings((s) => void (s.services[id] = { addedAt: new Date().toISOString(), detail: check.detail }));
  return check;
}

/** Re-checks a stored key, e.g. from Settings. */
export async function recheckService(id: string): Promise<KeyCheck> {
  const service = SERVICES.find((s) => s.id === id);
  const key = await getSecret(id);
  if (!service || !key) return { ok: false, detail: "No key saved" };
  const check = await service.verify(key);
  updateSettings((s) => s.services[id] && (s.services[id].detail = check.detail));
  return check;
}

export async function removeServiceKey(id: string) {
  await deleteSecret(id);
  updateSettings((s) => void delete s.services[id]);
}

/** What the agent can do beyond editing, given the services added and what's installed on this Mac. */
export function capabilities(): Capability[] {
  const { services: saved, comfy } = readSettings();
  // The Mac's own voices (or Windows') can always read narration; SAM 3 cuts out anything once it's installed; ComfyUI
  // makes video (SCAIL-2) on the graphics card once it's connected.
  const local: Capability[] = [
    ...(samReady() ? (["segment"] as const) : []),
    ...(process.platform === "darwin" || process.platform === "win32" ? (["voice"] as const) : []),
    ...(comfy ? (["video"] as const) : []),
  ];
  return [...new Set([...SERVICES.filter((s) => saved[s.id]).flatMap((s) => s.unlocks), ...local])];
}

