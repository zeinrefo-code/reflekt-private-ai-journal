// ============================================================================
// GANTI DENGAN CONFIG PROJECT MUHAMMAD
// ----------------------------------------------------------------------------
// Paste the Firebase *web* config of Muhammad's own Firebase project here.
// How to get it: Firebase Console -> Project settings -> "Your apps" ->
// Web app (</>) -> SDK setup and configuration -> "Config".
//
// A Firebase web config is NOT a secret — it identifies the project, and
// access is governed by Firebase Security Rules + App Check. Until this file
// holds a real config, Reflekt automatically runs in DEMO MODE: entries are
// stored in localStorage and the AI runs on the built-in local demo engine,
// so the app can be developed, screenshotted and demoed with zero setup.
// ============================================================================

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  /** reCAPTCHA Enterprise site key used by App Check (public site key). */
  appCheckSiteKey: string;
}

export const firebaseConfig: FirebaseWebConfig = {
  apiKey: "GANTI-DENGAN-API-KEY",
  authDomain: "GANTI-DENGAN-PROJECT-ID.firebaseapp.com",
  projectId: "GANTI-DENGAN-PROJECT-ID",
  storageBucket: "GANTI-DENGAN-PROJECT-ID.appspot.com",
  messagingSenderId: "GANTI-DENGAN-SENDER-ID",
  appId: "GANTI-DENGAN-APP-ID",
  appCheckSiteKey: "GANTI-DENGAN-APPCHECK-SITE-KEY",
};

/** True once a real project config has been pasted above. */
export const isFirebaseConfigured: boolean =
  !firebaseConfig.apiKey.includes("GANTI") &&
  !firebaseConfig.projectId.includes("GANTI") &&
  !firebaseConfig.appId.includes("GANTI");
