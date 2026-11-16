import type { OnDeviceState } from "./types";

/**
 * On-device inference via Chrome's built-in AI (Prompt API / Gemini Nano).
 *
 * Chrome exposes this as the global `LanguageModel` (older builds used
 * `window.ai.languageModel`). Everything runs locally in the browser:
 * no network, no cost, and journal text never leaves the device.
 */

interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): Promise<ReadableStream<string>>;
  destroy(): void;
}

interface LanguageModelFactory {
  availability(): Promise<string>;
  create(options?: {
    systemPrompt?: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<LanguageModelSession>;
}

function getFactory(): LanguageModelFactory | null {
  const w = window as unknown as Record<string, unknown>;
  const modern = w["LanguageModel"] as LanguageModelFactory | undefined;
  if (modern && typeof modern.availability === "function") return modern;
  const legacyRoot = w["ai"] as Record<string, unknown> | undefined;
  const legacy = legacyRoot?.["languageModel"] as
    | LanguageModelFactory
    | undefined;
  if (legacy && typeof legacy.availability === "function") return legacy;
  return null;
}

export async function getOnDeviceState(): Promise<{
  state: OnDeviceState;
  detail: string;
}> {
  const factory = getFactory();
  if (!factory) {
    return {
      state: "unavailable",
      detail:
        "Chrome Built-in AI (Prompt API) not detected in this browser. Use Chrome 138+ with Gemini Nano enabled.",
    };
  }
  try {
    const raw = await factory.availability();
    switch (raw) {
      case "available":
        return { state: "available", detail: "Gemini Nano is ready on this device." };
      case "downloadable":
        return {
          state: "downloadable",
          detail: "Gemini Nano can be downloaded to this device on first use.",
        };
      case "downloading":
        return { state: "downloading", detail: "Gemini Nano is downloading…" };
      default:
        return {
          state: "unavailable",
          detail: `Gemini Nano is not available here (${raw}).`,
        };
    }
  } catch (err) {
    return {
      state: "unavailable",
      detail: `Availability check failed: ${String(err)}`,
    };
  }
}

let sessionCache: { systemPrompt: string; session: LanguageModelSession } | null =
  null;

async function getSession(systemPrompt: string): Promise<LanguageModelSession> {
  const factory = getFactory();
  if (!factory) throw new Error("On-device model API not present in this browser.");
  if (sessionCache && sessionCache.systemPrompt === systemPrompt) {
    return sessionCache.session;
  }
  sessionCache?.session.destroy();
  const session = await factory.create({
    systemPrompt,
    monitor: (m) => {
      m.addEventListener("downloadprogress", (e) => {
        const loaded = (e as unknown as { loaded?: number }).loaded ?? 0;
        console.info(
          `[Reflekt] Gemini Nano download progress: ${Math.round(loaded * 100)}%`,
        );
      });
    },
  });
  sessionCache = { systemPrompt, session };
  return session;
}

/** Run a one-shot prompt on Gemini Nano. Throws if the model is unusable. */
export async function runOnDevice(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const session = await getSession(systemPrompt);
  const text = await session.prompt(userPrompt);
  return text.trim();
}
