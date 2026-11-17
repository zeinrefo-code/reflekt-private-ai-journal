// ============================================================================
// Config project Firebase ASLI Muhammad — project "buildhybridai-72b2d"
// ----------------------------------------------------------------------------
// Web config of Muhammad's own Firebase project (Firebase Console ->
// Project settings -> "Your apps" -> Web app -> SDK setup and configuration).
//
// A Firebase web config is NOT a secret — it identifies the project, and
// access is governed by Firebase Security Rules + App Check.
//
// App Check (reCAPTCHA Enterprise) site key: filled in below — Muhammad
// created the Fraud Defense key and registered App Check in the console on
// 2026-11-17 (status: Registered). firebase.ts initialises App Check with
// the ReCaptchaEnterpriseProvider automatically; on localhost/test rigs a
// registered debug token may be used instead (hackathon-accepted).
// ============================================================================

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  /** reCAPTCHA Enterprise site key used by App Check (public site key). */
  appCheckSiteKey: string;
}

export const firebaseConfig: FirebaseWebConfig = {
  apiKey: "AIzaSyA4PT9LWhWPND7BObYj3PfSD5Nbdm-Uj9s",
  authDomain: "buildhybridai-72b2d.firebaseapp.com",
  projectId: "buildhybridai-72b2d",
  storageBucket: "buildhybridai-72b2d.firebasestorage.app",
  messagingSenderId: "438957688677",
  appId: "1:438957688677:web:feaf72f42fffc10d45438c",
  measurementId: "G-8TPX99VBGS",
  // App Check site key (reCAPTCHA Enterprise / Fraud Defense), registered in
  // the Firebase console by Muhammad on 2026-11-17. Public identifier.
  appCheckSiteKey: "6LfvgyMuAAAAALZfVcepZGgWnFNjyuxHHekgjNd7",
};

/** True once a real project config has been pasted above. */
export const isFirebaseConfigured: boolean =
  !firebaseConfig.apiKey.includes("GANTI") &&
  !firebaseConfig.projectId.includes("GANTI") &&
  !firebaseConfig.appId.includes("GANTI");

/** True once a real App Check site key has been filled in. */
export const isAppCheckConfigured: boolean =
  !firebaseConfig.appCheckSiteKey.includes("GANTI");
