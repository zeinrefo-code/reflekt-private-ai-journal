import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  fetchAndActivate,
  getAll,
  getRemoteConfig,
  type RemoteConfig,
} from "firebase/remote-config";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import {
  firebaseConfig,
  isAppCheckConfigured,
  isFirebaseConfigured,
} from "./firebase-config";

export interface RemoteFlags {
  /** Remote Config: allow the cloud "Deep Reflection" feature. */
  cloudReflectionEnabled: boolean;
  /** Remote Config: texts longer than this are routed to the cloud model. */
  ondeviceMaxChars: number;
  /** Remote Config: greeting shown on the home screen. */
  welcomeMessage: string;
}

const DEFAULT_FLAGS: RemoteFlags = {
  cloudReflectionEnabled: true,
  ondeviceMaxChars: 4000,
  welcomeMessage: "Your thoughts stay yours. Reflekt thinks on your device first.",
};

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  user: User;
  flags: RemoteFlags;
}

let servicesPromise: Promise<FirebaseServices | null> | null = null;

/**
 * Lazily initialise Firebase. Returns null in demo mode (no real config),
 * so every caller can gracefully fall back to local behaviour.
 */
export function getFirebaseServices(): Promise<FirebaseServices | null> {
  if (!isFirebaseConfigured) return Promise.resolve(null);
  if (!servicesPromise) servicesPromise = initFirebase();
  return servicesPromise;
}

async function initFirebase(): Promise<FirebaseServices | null> {
  try {
    const app = initializeApp(firebaseConfig);

    // App Check with the debug provider: on localhost the SDK exchanges the
    // debug token for a real attestation token, which the hackathon rules
    // explicitly accept. In production this same code path uses reCAPTCHA
    // Enterprise attestation via the site key.
    // App Check is only initialised once a real reCAPTCHA Enterprise site
    // key is present in the config; with a placeholder key the provider
    // would fail and take the whole Firebase init down with it. Enforcement
    // is off by default, so Auth/Firestore/AI Logic work without it.
    if (isAppCheckConfigured) {
      if (typeof self !== "undefined") {
        (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean })[
          "FIREBASE_APPCHECK_DEBUG_TOKEN"
        ] = true;
      }
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(firebaseConfig.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }

    const auth = getAuth(app);
    const credential = await signInAnonymously(auth);
    const db = getFirestore(app);

    // Remote Config drives feature flags + hybrid routing limits.
    const rc: RemoteConfig = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = 60_000;
    rc.defaultConfig = { ...DEFAULT_FLAGS };
    let flags: RemoteFlags = { ...DEFAULT_FLAGS };
    try {
      await fetchAndActivate(rc);
      const all = getAll(rc);
      flags = {
        cloudReflectionEnabled:
          all["cloud_reflection_enabled"]?.asBoolean() ??
          DEFAULT_FLAGS.cloudReflectionEnabled,
        ondeviceMaxChars:
          all["ondevice_max_chars"]?.asNumber() ?? DEFAULT_FLAGS.ondeviceMaxChars,
        welcomeMessage:
          all["welcome_message"]?.asString() || DEFAULT_FLAGS.welcomeMessage,
      };
    } catch {
      // Remote Config is best-effort; defaults keep the app fully working.
    }

    return { app, auth, db, user: credential.user, flags };
  } catch (err) {
    console.warn("[Reflekt] Firebase init failed, falling back to demo mode:", err);
    return null;
  }
}

export { DEFAULT_FLAGS };
