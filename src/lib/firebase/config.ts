import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { initAppCheck } from "./appcheck";

// Read environment variables (supports Vite import.meta.env and Node process.env)
const getEnv = (key: string): string => {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key] as string;
  }
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  return "";
};

export const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("VITE_FIREBASE_APP_ID"),
  measurementId: getEnv("VITE_FIREBASE_MEASUREMENT_ID"),
};

/** Variables that must be set for Firebase to initialise (measurement id is optional). */
const REQUIRED_CONFIG_VARS = [
  ["VITE_FIREBASE_API_KEY", "apiKey"],
  ["VITE_FIREBASE_AUTH_DOMAIN", "authDomain"],
  ["VITE_FIREBASE_PROJECT_ID", "projectId"],
  ["VITE_FIREBASE_APP_ID", "appId"],
] as const;

/** True for empty values and for the placeholders shipped in .env.example. */
const isMissingValue = (value: string | undefined): boolean => {
  const v = (value ?? "").trim();
  return v === "" || v.startsWith("your_") || v.includes("your_project_id");
};

/**
 * Names (never values) of the required Firebase variables that are missing or still contain
 * the .env.example placeholder text. There are deliberately NO built-in fallbacks: a missing
 * variable must never silently connect the app to some other Firebase project.
 */
export const getMissingFirebaseConfig = (): string[] =>
  REQUIRED_CONFIG_VARS.filter(([, key]) => isMissingValue(firebaseConfig[key])).map(
    ([name]) => name,
  );

/** True only when every required Firebase variable has a real value. */
export const isFirebaseConfigured = (): boolean => getMissingFirebaseConfig().length === 0;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (!isFirebaseConfigured()) {
  console.error(
    `[RescueLink] Firebase is NOT configured. Missing or placeholder environment variables: ${getMissingFirebaseConfig().join(", ")}. ` +
      "Copy .env.example to .env and fill in the values from your Firebase project.",
  );
} else {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Set local session persistence across browser refreshes (browser-only)
    if (typeof window !== "undefined") {
      setPersistence(auth, browserLocalPersistence).catch((err) => {
        console.warn("Failed to set auth persistence:", err);
      });
      initAppCheck(app);
    }
  } catch (error) {
    console.error("Error initializing Firebase:", error);
  }
}

export { app, auth, db };
