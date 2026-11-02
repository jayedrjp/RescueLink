import type { FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";

/**
 * Initializes Firebase App Check in browser environments if a reCAPTCHA v3 site key is configured.
 *
 * App Check helps protect your backend resources (such as Firestore) from abuse by ensuring
 * requests originate from your authentic application.
 *
 * Operational instructions for production:
 * 1. Register your web app in Firebase Console -> App Check.
 * 2. Obtain a reCAPTCHA v3 site key from the Google reCAPTCHA admin console.
 * 3. Set VITE_FIREBASE_APPCHECK_KEY in your production environment (.env).
 * 4. In development / testing / CI, App Check remains disabled when the key is omitted,
 *    preventing development or test blocking.
 */
let appCheckInstance: AppCheck | null = null;

export function getAppCheckInstance(): AppCheck | null {
  return appCheckInstance;
}

export function resetAppCheckInstance(): void {
  appCheckInstance = null;
}

export function initAppCheck(app: FirebaseApp | null): AppCheck | null {
  if (!app || typeof window === "undefined") {
    return null;
  }

  if (appCheckInstance) {
    return appCheckInstance;
  }

  const appCheckKey =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env["VITE_FIREBASE_APPCHECK_KEY"] as string | undefined)
      : typeof process !== "undefined" && process.env
        ? process.env["VITE_FIREBASE_APPCHECK_KEY"]
        : undefined;

  if (!appCheckKey || appCheckKey.startsWith("your_") || appCheckKey.trim() === "") {
    return null;
  }

  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckKey.trim()),
      isTokenAutoRefreshEnabled: true,
    });
    return appCheckInstance;
  } catch (err) {
    console.warn("[RescueLink] App Check initialization failed:", err);
    return null;
  }
}
