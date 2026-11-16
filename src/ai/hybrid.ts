import { getFirebaseServices } from "../lib/firebase";
import { cloudDetail, isCloudReady, runCloud } from "./cloud";
import { analyzeEntryDemo, reflectDemo } from "./demo";
import { getOnDeviceState, runOnDevice } from "./ondevice";
import type {
  AiResult,
  EngineMode,
  EngineStatus,
  EntryAnalysis,
} from "./types";

/**
 * The Hybrid Engine — Reflekt's core.
 *
 * Every AI task is routed across three execution paths, transparently:
 *   1. on-device  — Gemini Nano via Chrome's Prompt API (private, offline, free)
 *   2. cloud      — Gemini via Firebase AI Logic (long-context, deep reasoning)
 *   3. demo       — deterministic local fallback so the app always works
 *
 * Routing rules (mode "auto"):
 *   - Single-entry analysis prefers on-device; texts longer than the Remote
 *     Config limit `ondevice_max_chars` go straight to the cloud.
 *   - Multi-entry reflection prefers the cloud (long context), unless Remote
 *     Config disables it; on-device stitches per-entry summaries instead.
 *   - Any failure falls through to the next path, and the caller always
 *     learns which path actually answered, and why.
 */

const MODE_KEY = "reflekt.engineMode";

const ANALYZE_SYSTEM = [
  "You are the journaling companion inside Reflekt, a private AI journal.",
  "Analyse one journal entry and reply with ONLY a JSON object, no markdown:",
  '{"summary": "1-2 sentence summary in first person plural-free neutral tone",',
  ' "themes": ["up to 4 short theme labels"],',
  ' "sentiment": "Positive" | "Balanced" | "Reflective" | "Heavy",',
  ' "sentimentScore": number between -1 and 1}',
  "Be warm, concrete and non-clinical. Never give medical advice.",
].join("\n");

const REFLECT_SYSTEM = [
  "You are the journaling companion inside Reflekt, a private AI journal.",
  "You receive several recent journal entries. Write a short, warm weekly",
  "reflection (3 short paragraphs): recurring themes, the emotional arc, and",
  "one gentle prompt for the next entry. Plain text, no markdown headings.",
  "Never give medical advice.",
].join("\n");

export function getEngineMode(): EngineMode {
  const raw = localStorage.getItem(MODE_KEY);
  return raw === "ondevice" || raw === "cloud" ? raw : "auto";
}

export function setEngineMode(mode: EngineMode): void {
  localStorage.setItem(MODE_KEY, mode);
}

export async function getEngineStatus(): Promise<EngineStatus> {
  const [od, cloud] = await Promise.all([getOnDeviceState(), isCloudReady()]);
  return {
    onDeviceState: od.state,
    onDeviceDetail: od.detail,
    cloudReady: cloud,
    cloudDetail: await cloudDetail(),
    mode: getEngineMode(),
  };
}

/**
 * Some environments expose the Prompt API surface but back it with a stub
 * that echoes the prompt instead of running a model (e.g. headless shells).
 * Treat degenerate output as a path failure so routing falls through to the
 * next path instead of showing the user an echo of their own text.
 */
function assertUsableOutput(raw: string, sourceText: string): string {
  if (!raw || raw.trim().length === 0) throw new Error("empty model output");
  if (/model is not available/i.test(raw)) {
    throw new Error("model backend unavailable (stub response)");
  }
  const probe = sourceText.replace(/\s+/g, " ").trim().slice(0, 80);
  if (probe.length > 40 && raw.replace(/\s+/g, " ").includes(probe)) {
    throw new Error("model echoed its input (degenerate backend)");
  }
  return raw;
}

function parseAnalysis(raw: string, fallbackText: string): EntryAnalysis {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<EntryAnalysis>;
      if (typeof obj.summary === "string" && obj.summary.length > 0) {
        return {
          summary: obj.summary,
          themes: Array.isArray(obj.themes) ? obj.themes.slice(0, 4).map(String) : [],
          sentiment: typeof obj.sentiment === "string" ? obj.sentiment : "Balanced",
          sentimentScore:
            typeof obj.sentimentScore === "number"
              ? Math.max(-1, Math.min(1, obj.sentimentScore))
              : 0,
        };
      }
    }
  } catch {
    // fall through to the local analysis of the raw reply
  }
  const local = analyzeEntryDemo(fallbackText);
  return { ...local, summary: raw.slice(0, 400) || local.summary };
}

interface PathAttempt {
  path: "ondevice" | "cloud";
  run: () => Promise<string>;
  reason: string;
}

/** Analyse a single journal entry through the hybrid router. */
export async function analyzeEntry(
  text: string,
): Promise<AiResult<EntryAnalysis>> {
  const mode = getEngineMode();
  const services = await getFirebaseServices();
  const maxChars = services?.flags.ondeviceMaxChars ?? 4000;
  const tooLongForDevice = text.length > maxChars;

  const od = await getOnDeviceState();
  const deviceUsable = od.state === "available" || od.state === "downloadable";
  const cloudUsable = await isCloudReady();

  const attempts: PathAttempt[] = [];
  const deviceAttempt: PathAttempt = {
    path: "ondevice",
    run: () => runOnDevice(ANALYZE_SYSTEM, `Journal entry:\n\n${text}`),
    reason: "On-device · your words never left this device",
  };
  const cloudAttempt: PathAttempt = {
    path: "cloud",
    run: () => runCloud(ANALYZE_SYSTEM, `Journal entry:\n\n${text}`),
    reason: "Cloud · Firebase AI Logic (Gemini) handled this entry",
  };

  if (mode === "ondevice") {
    if (deviceUsable) attempts.push(deviceAttempt);
    if (cloudUsable) attempts.push(cloudAttempt);
  } else if (mode === "cloud") {
    if (cloudUsable) attempts.push(cloudAttempt);
    if (deviceUsable) attempts.push(deviceAttempt);
  } else {
    // Auto: privacy-first for single entries, unless the text is long.
    if (tooLongForDevice) {
      if (cloudUsable)
        attempts.push({
          ...cloudAttempt,
          reason: `Cloud · entry is long (${text.length} chars > ${maxChars} on-device limit)`,
        });
      if (deviceUsable) attempts.push(deviceAttempt);
    } else {
      if (deviceUsable) attempts.push(deviceAttempt);
      if (cloudUsable) attempts.push(cloudAttempt);
    }
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const raw = assertUsableOutput(await attempt.run(), text);
      return {
        data: parseAnalysis(raw, text),
        path: attempt.path,
        reason: attempt.reason,
      };
    } catch (err) {
      errors.push(`${attempt.path}: ${String(err)}`);
    }
  }

  return {
    data: analyzeEntryDemo(text),
    path: "demo",
    reason:
      attempts.length === 0
        ? "Demo engine · no AI model is configured yet, so a local extractive summary was used"
        : `Demo engine · the model paths failed (${errors.join("; ")})`,
  };
}

export interface ReflectEntry {
  title: string;
  body: string;
  mood: string;
  sentimentScore: number;
  createdAt: number;
}

/** Deep reflection across several entries — the cloud-first task. */
export async function reflectOnEntries(
  entries: ReflectEntry[],
): Promise<AiResult<string>> {
  const mode = getEngineMode();
  const services = await getFirebaseServices();
  const cloudAllowedByFlags = services?.flags.cloudReflectionEnabled ?? true;
  const cloudUsable = (await isCloudReady()) && cloudAllowedByFlags;
  const od = await getOnDeviceState();
  const deviceUsable = od.state === "available" || od.state === "downloadable";

  const corpus = entries
    .map(
      (e, i) =>
        `Entry ${i + 1} (${new Date(e.createdAt).toLocaleDateString()}, mood: ${e.mood || "—"}):\n${e.title}\n${e.body}`,
    )
    .join("\n\n---\n\n");

  const attempts: PathAttempt[] = [];
  const cloudAttempt: PathAttempt = {
    path: "cloud",
    run: () => runCloud(REFLECT_SYSTEM, corpus),
    reason: "Cloud · Firebase AI Logic reasoned across all entries at once",
  };
  const deviceAttempt: PathAttempt = {
    path: "ondevice",
    run: () => runOnDevice(REFLECT_SYSTEM, corpus.slice(0, 6000)),
    reason: "On-device · reflection generated locally by Gemini Nano",
  };

  if (mode === "ondevice") {
    if (deviceUsable) attempts.push(deviceAttempt);
    if (cloudUsable) attempts.push(cloudAttempt);
  } else {
    if (cloudUsable) attempts.push(cloudAttempt);
    if (deviceUsable) attempts.push(deviceAttempt);
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const raw = assertUsableOutput(await attempt.run(), corpus);
      return { data: raw, path: attempt.path, reason: attempt.reason };
    } catch (err) {
      errors.push(`${attempt.path}: ${String(err)}`);
    }
  }

  return {
    data: reflectDemo(entries),
    path: "demo",
    reason:
      attempts.length === 0
        ? "Demo engine · connect Firebase AI Logic for a true deep reflection"
        : `Demo engine · the model paths failed (${errors.join("; ")})`,
  };
}
