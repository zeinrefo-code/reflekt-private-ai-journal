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

    // App Check: production (hosted) builds use real reCAPTCHA Enterprise
    // attestation via the site key. Debug tokens are a local/test-rig tool
    // only (the hackathon rules explicitly accept them): honour a token the
    // test harness pre-set on `self`, or let the SDK generate one on
    // localhost — but NEVER force a debug token on a hosted origin, where an
    // unregistered random token would fail attestation for every real user.
    if (isAppCheckConfigured) {
      if (typeof self !== "undefined") {
        const scope = self as unknown as {
          FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
          location?: Location;
        };
        const isLocalhost =
          scope.location?.hostname === "localhost" ||
          scope.location?.hostname === "127.0.0.1";
        if (
          scope["FIREBASE_APPCHECK_DEBUG_TOKEN"] === undefined &&
          isLocalhost
        ) {
          scope["FIREBASE_APPCHECK_DEBUG_TOKEN"] = true;
        }
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
