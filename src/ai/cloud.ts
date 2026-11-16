import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { getFirebaseServices } from "../lib/firebase";

/**
 * Cloud inference via **Firebase AI Logic**.
 *
 * The Firebase AI Logic client SDK (`firebase/ai`) talks to Gemini through
 * the Gemini Developer API backend (GoogleAIBackend) — free tier, no API key
 * in client code, and requests are attested by App Check. This is the cloud
 * half of Reflekt's hybrid engine: used for long, multi-entry reasoning that
 * the on-device model is not sized for.
 */

const CLOUD_MODEL = "gemini-2.5-flash";

export async function isCloudReady(): Promise<boolean> {
  return (await getFirebaseServices()) !== null;
}

export async function cloudDetail(): Promise<string> {
  const services = await getFirebaseServices();
  if (!services) {
    return "Firebase is not configured yet (demo mode), so the cloud model is offline.";
  }
  return `Firebase AI Logic ready — ${CLOUD_MODEL} via GoogleAIBackend (project ${services.app.options.projectId}).`;
}

/** Run a one-shot prompt on Gemini in the cloud via Firebase AI Logic. */
export async function runCloud(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const services = await getFirebaseServices();
  if (!services) throw new Error("Firebase is not configured (demo mode).");

  const ai = getAI(services.app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: CLOUD_MODEL,
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userPrompt);
  return result.response.text().trim();
}
