import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
}));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  browserLocalPersistence: {},
  setPersistence: vi.fn(async () => {}),
}));
vi.mock("firebase/firestore", () => ({ getFirestore: vi.fn(() => ({})) }));

const KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_MEASUREMENT_ID",
];

async function loadConfig(env: Record<string, string>) {
  vi.resetModules();
  for (const k of KEYS) vi.stubEnv(k, env[k] ?? "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  return import("@/lib/firebase/config");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const REAL = {
  VITE_FIREBASE_API_KEY: "AIzaFakeKeyForTests",
  VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-project",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("SEC-6: Firebase config has no silent fallbacks", () => {
  it("reports every required variable as missing when nothing is set (never falls back to a built-in project)", async () => {
    const cfg = await loadConfig({});
    expect(cfg.isFirebaseConfigured()).toBe(false);
    expect(cfg.getMissingFirebaseConfig().sort()).toEqual(
      [
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_APP_ID",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
      ].sort(),
    );
    expect(cfg.firebaseConfig.projectId).toBe("");
    expect(cfg.firebaseConfig.apiKey).toBe("");
    expect(cfg.db).toBeNull();
    expect(cfg.auth).toBeNull();
  });

  it("treats the .env.example placeholders as missing", async () => {
    const cfg = await loadConfig({
      VITE_FIREBASE_API_KEY: "your_firebase_api_key_here",
      VITE_FIREBASE_AUTH_DOMAIN: "your_project_id.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "your_project_id",
      VITE_FIREBASE_APP_ID: "your_firebase_app_id",
    });
    expect(cfg.isFirebaseConfigured()).toBe(false);
    expect(cfg.getMissingFirebaseConfig()).toHaveLength(4);
  });

  it("reports a single missing variable by name only (never its value)", async () => {
    const { VITE_FIREBASE_APP_ID: _omit, ...partial } = REAL;
    void _omit;
    const cfg = await loadConfig(partial);
    expect(cfg.getMissingFirebaseConfig()).toEqual(["VITE_FIREBASE_APP_ID"]);
    expect(cfg.isFirebaseConfigured()).toBe(false);
  });

  it("initialises Firebase only when everything required is present (measurement id optional)", async () => {
    const cfg = await loadConfig(REAL);
    expect(cfg.isFirebaseConfigured()).toBe(true);
    expect(cfg.getMissingFirebaseConfig()).toEqual([]);
    expect(cfg.db).not.toBeNull();
    expect(cfg.auth).not.toBeNull();
  });
});
