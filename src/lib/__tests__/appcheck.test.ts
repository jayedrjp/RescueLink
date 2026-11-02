// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FirebaseApp } from "firebase/app";

const mockInitializeAppCheck = vi.fn((..._args: unknown[]) => ({ appId: "mock-app-check" }));
const mockReCaptchaV3Provider = vi.fn();

vi.mock("firebase/app-check", () => ({
  initializeAppCheck: (...args: [unknown, unknown]) => mockInitializeAppCheck(...args),
  ReCaptchaV3Provider: vi.fn(function (this: unknown, key: string) {
    mockReCaptchaV3Provider(key);
  }),
}));

import { initAppCheck, resetAppCheckInstance } from "../firebase/appcheck";

describe("Firebase App Check Configuration & Resilience", () => {
  const fakeApp = { name: "test-app" } as unknown as FirebaseApp;

  beforeEach(() => {
    resetAppCheckInstance();
    mockInitializeAppCheck.mockClear();
    mockReCaptchaV3Provider.mockClear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetAppCheckInstance();
  });

  it("returns null when app is null", () => {
    const res = initAppCheck(null);
    expect(res).toBeNull();
    expect(mockInitializeAppCheck).not.toHaveBeenCalled();
  });

  it("returns null when VITE_FIREBASE_APPCHECK_KEY is not configured", () => {
    vi.stubEnv("VITE_FIREBASE_APPCHECK_KEY", "");
    const res = initAppCheck(fakeApp);
    expect(res).toBeNull();
    expect(mockInitializeAppCheck).not.toHaveBeenCalled();
  });

  it("returns null when key is a placeholder", () => {
    vi.stubEnv("VITE_FIREBASE_APPCHECK_KEY", "your_recaptcha_v3_key");
    const res = initAppCheck(fakeApp);
    expect(res).toBeNull();
    expect(mockInitializeAppCheck).not.toHaveBeenCalled();
  });

  it("initializes App Check when a valid key is provided", () => {
    vi.stubEnv("VITE_FIREBASE_APPCHECK_KEY", "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI");
    const res = initAppCheck(fakeApp);
    expect(res).toEqual({ appId: "mock-app-check" });
    expect(mockInitializeAppCheck).toHaveBeenCalledTimes(1);
    expect(mockReCaptchaV3Provider).toHaveBeenCalledWith(
      "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI",
    );

    // Repeated call should return existing instance without re-initializing
    const res2 = initAppCheck(fakeApp);
    expect(res2).toBe(res);
    expect(mockInitializeAppCheck).toHaveBeenCalledTimes(1);
  });

  it("handles provider initialization errors gracefully", () => {
    vi.stubEnv("VITE_FIREBASE_APPCHECK_KEY", "valid-key");
    mockInitializeAppCheck.mockImplementationOnce(() => {
      throw new Error("reCAPTCHA script blocked");
    });

    const res = initAppCheck(fakeApp);
    expect(res).toBeNull();
  });
});
