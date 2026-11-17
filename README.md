# Reflekt — Private AI Journal

**Reflekt** is a journaling web app built for the **#BuildHybridAI 2026** hackathon. It is powered by **Firebase AI Logic** and uses **hybrid inference**: Gemini Nano runs *on the user's device* first (Chrome Built-in AI / Prompt API), and **Firebase AI Logic** calls Gemini in the cloud only when a task genuinely needs long-context reasoning.

> Your journal is the most private text you own. Reflekt is designed so it doesn't have to leave your device.

## How the hybrid engine works

Every AI task is routed by a transparent hybrid engine (`src/ai/hybrid.ts`) across three paths, and **every result is labelled with the path that actually produced it**:

| Path | Technology | Used for |
| --- | --- | --- |
| **On-device** | Gemini Nano via Chrome's Prompt API (`LanguageModel`) | Instant per-entry summary, themes and sentiment — private, offline, zero cost |
| **Cloud** | **Firebase AI Logic** (`firebase/ai`, `GoogleAIBackend`, `gemini-3.8-flash`) | "Deep Reflection" across many entries — long context, heavier reasoning |
| **Demo** | Deterministic local extractive engine | Graceful fallback so the app always works, even before Firebase is configured |

Routing rules (Auto mode):

- Single-entry analysis prefers on-device; texts longer than the Remote Config limit `ondevice_max_chars` are routed to the cloud.
- Multi-entry reflection prefers **Firebase AI Logic** in the cloud, and can be disabled remotely via the Remote Config flag `cloud_reflection_enabled`.
- Any failure falls through to the next path — the user always sees which path answered, and why.
- Users can override the router at any time: **Auto / On-device / Cloud**.

## Firebase products used

- **Firebase AI Logic** — cloud inference via the `firebase/ai` client SDK (`getAI`, `getGenerativeModel`, `GoogleAIBackend`). No API key lives in client code; requests are attested by App Check.
- **Cloud Firestore** — journal entries under `users/{uid}/entries`.
- **Firebase Authentication** — anonymous sign-in, so every user's journal is scoped to their own uid.
- **Remote Config** — feature flags and routing limits (`cloud_reflection_enabled`, `ondevice_max_chars`, `welcome_message`).
- **App Check** — debug token flow for local development (explicitly accepted by the hackathon), reCAPTCHA Enterprise provider in production.
- **Firebase Hosting** — static hosting for the built web app.

## Run it locally

```bash
npm install
npm run dev
```

Out of the box the app runs in **demo mode** (local storage + local demo engine), so anyone can try it with zero setup.

To connect a real Firebase project:

1. Create a project in the [Firebase Console](https://console.firebase.google.com), enable **Firestore**, **Anonymous Authentication**, and **AI Logic**.
2. Paste your web config into `src/lib/firebase-config.ts` (the file is clearly marked — a Firebase web config is a project identifier, not a secret; access is governed by Security Rules + App Check).
3. Reload — the badge switches to "Synced · Firestore" and the cloud path of the hybrid engine comes alive.

For the full on-device experience use Chrome 138+ with Gemini Nano (Built-in AI) enabled; Reflekt detects it automatically and shows its status in the **Hybrid Engine** panel.

## Build

```bash
npm run build   # type-check + production build into dist/
npm run preview # serve the production build locally
```

## Tech stack

Vite · TypeScript · Firebase JS SDK (`firebase/ai`, `firebase/firestore`, `firebase/auth`, `firebase/remote-config`, `firebase/app-check`) · Chrome Built-in AI (Prompt API / Gemini Nano)

## License

MIT — see [LICENSE](LICENSE).
