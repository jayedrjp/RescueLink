import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  createUser: vi.fn(),
  updateProfile: vi.fn(),
  sendReset: vi.fn(),
  signInWithPopup: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  signOut: vi.fn(),
  createUserProfile: vi.fn(),
  ensureUserProfile: vi.fn(),
  getUserProfile: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: h.signIn,
  createUserWithEmailAndPassword: h.createUser,
  updateProfile: h.updateProfile,
  sendPasswordResetEmail: h.sendReset,
  signInWithPopup: h.signInWithPopup,
  getAdditionalUserInfo: h.getAdditionalUserInfo,
  signOut: h.signOut,
  GoogleAuthProvider: class {
    addScope() {}
    setCustomParameters() {}
  },
}));
vi.mock("@/lib/firebase/config", () => ({
  auth: { fake: true },
  db: {},
  isFirebaseConfigured: () => true,
}));
vi.mock("@/lib/firebase/firestore", () => ({
  createUserProfile: h.createUserProfile,
  ensureUserProfile: h.ensureUserProfile,
  getUserProfile: h.getUserProfile,
}));

import {
  AuthInputError,
  getAdminEmail,
  getFriendlyAuthErrorMessage,
  getFriendlyPasswordResetError,
  loginUser,
  registerUser,
  resetPassword,
  resolveLoginIdentifier,
  signInWithGoogle,
  waitForPendingRegistration,
} from "@/lib/firebase/auth";
import { PASSWORD_HELP_TEXT } from "@/lib/auth-validation";

const cred = (uid = "u1") => ({ user: { uid, email: "u@example.com" } });

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("VITE_ADMIN_EMAIL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AUTH-4 + admin-email findings: login identifier resolution", () => {
  it("has NO built-in default admin account", () => {
    expect(getAdminEmail()).toBeNull();
    expect(resolveLoginIdentifier("admin")).toMatchObject({ ok: false });
    expect(JSON.stringify(resolveLoginIdentifier("admin"))).not.toContain("rescuelink.org");
  });
  it("maps the 'admin' username only to the configured email", () => {
    vi.stubEnv("VITE_ADMIN_EMAIL", " Boss@Example.com ");
    expect(getAdminEmail()).toBe("boss@example.com");
    expect(resolveLoginIdentifier(" ADMIN ")).toEqual({ ok: true, email: "boss@example.com" });
  });
  it("ignores the .env.example placeholder as an admin email", () => {
    vi.stubEnv("VITE_ADMIN_EMAIL", "your_admin_email");
    expect(getAdminEmail()).toBeNull();
  });
  it("accepts emails (lower-cased) and rejects other usernames / junk", () => {
    expect(resolveLoginIdentifier(" Rahim@Example.COM ")).toEqual({
      ok: true,
      email: "rahim@example.com",
    });
    expect(resolveLoginIdentifier("rahim")).toMatchObject({ ok: false });
    expect(resolveLoginIdentifier("not an email")).toMatchObject({ ok: false });
    expect(resolveLoginIdentifier("   ")).toMatchObject({ ok: false });
  });
});

describe("AUTH-2: sign-in helpers authenticate only (no profile reads/writes)", () => {
  it("loginUser signs in with the resolved email and never touches Firestore", async () => {
    h.signIn.mockResolvedValue(cred());
    await loginUser(" Rahim@Example.com ", "pw");
    expect(h.signIn).toHaveBeenCalledWith({ fake: true }, "rahim@example.com", "pw");
    expect(h.ensureUserProfile).not.toHaveBeenCalled();
    expect(h.getUserProfile).not.toHaveBeenCalled();
    expect(h.createUserProfile).not.toHaveBeenCalled();
  });
  it("loginUser resolves the admin username via configuration only", async () => {
    vi.stubEnv("VITE_ADMIN_EMAIL", "boss@example.com");
    h.signIn.mockResolvedValue(cred("admin-uid"));
    await loginUser("admin", "pw");
    expect(h.signIn).toHaveBeenCalledWith({ fake: true }, "boss@example.com", "pw");
  });
  it("loginUser rejects bad input before calling Firebase", async () => {
    await expect(loginUser("admin", "pw")).rejects.toBeInstanceOf(AuthInputError); // not configured
    await expect(loginUser("rahim@example.com", "")).rejects.toBeInstanceOf(AuthInputError);
    await expect(loginUser("junk", "pw")).rejects.toBeInstanceOf(AuthInputError);
    expect(h.signIn).not.toHaveBeenCalled();
  });
  it("signInWithGoogle takes isNewUser from Firebase, not from Firestore timestamps", async () => {
    h.signInWithPopup.mockResolvedValue(cred());
    h.getAdditionalUserInfo.mockReturnValueOnce({ isNewUser: true });
    expect((await signInWithGoogle()).isNewUser).toBe(true);
    h.getAdditionalUserInfo.mockReturnValueOnce({ isNewUser: false });
    expect((await signInWithGoogle()).isNewUser).toBe(false);
    h.getAdditionalUserInfo.mockReturnValueOnce(null);
    expect((await signInWithGoogle()).isNewUser).toBe(false);
    expect(h.ensureUserProfile).not.toHaveBeenCalled();
  });
});

describe("AUTH-3: registration is deterministic", () => {
  it("validates before touching Firebase", async () => {
    await expect(registerUser("A", "a@b.co", "abcdefg1")).rejects.toBeInstanceOf(AuthInputError);
    await expect(registerUser("Rahim", "bad", "abcdefg1")).rejects.toBeInstanceOf(AuthInputError);
    await expect(registerUser("Rahim", "a@b.co", "short1")).rejects.toBeInstanceOf(AuthInputError);
    await expect(registerUser("Rahim", "a@b.co", "onlyletters")).rejects.toBeInstanceOf(
      AuthInputError,
    );
    expect(h.createUser).not.toHaveBeenCalled();
  });

  it("refuses to register the reserved administrator email", async () => {
    vi.stubEnv("VITE_ADMIN_EMAIL", "boss@example.com");
    await expect(registerUser("Boss", "BOSS@example.com", "abcdefg1")).rejects.toThrow(/reserved/i);
    expect(h.createUser).not.toHaveBeenCalled();
  });

  it("holds the gate until the chosen name is saved, in the right order", async () => {
    const order: string[] = [];
    let finishCreate!: () => void;
    h.createUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCreate = () => {
            order.push("account-created");
            resolve(cred("new1"));
          };
        }),
    );
    h.updateProfile.mockImplementation(async () => order.push("auth-name"));
    h.createUserProfile.mockImplementation(async (_uid: string, d: { displayName: string }) => {
      order.push(`profile:${d.displayName}`);
      return { uid: "new1" };
    });

    let gateOpen = false;
    const reg = registerUser("  Rahim Uddin ", "New@Example.com", "abcdefg1");
    const gate = waitForPendingRegistration().then(() => {
      gateOpen = true;
      order.push("gate-open");
    });

    await Promise.resolve();
    expect(gateOpen).toBe(false); // the auth listener must wait
    finishCreate();
    await reg;
    await gate;

    expect(order).toEqual(["account-created", "auth-name", "profile:Rahim Uddin", "gate-open"]);
    expect(h.createUser).toHaveBeenCalledWith({ fake: true }, "new@example.com", "abcdefg1");
  });

  it("still opens the gate when registration fails (email already in use)", async () => {
    h.createUser.mockRejectedValue({ code: "auth/email-already-in-use" });
    await expect(registerUser("Rahim", "a@b.co", "abcdefg1")).rejects.toMatchObject({
      code: "auth/email-already-in-use",
    });
    await expect(waitForPendingRegistration()).resolves.toBeUndefined();
  });

  it("a failed profile write does not lose the account: it is reported, the gate opens", async () => {
    h.createUser.mockResolvedValue(cred("new2"));
    h.updateProfile.mockResolvedValue(undefined);
    h.createUserProfile.mockRejectedValue(new Error("offline"));
    const res = await registerUser("Rahim", "a@b.co", "abcdefg1");
    expect(res.profile).toBeNull();
    expect(res.profileError?.message).toBe("offline");
    await expect(waitForPendingRegistration()).resolves.toBeUndefined();
  });
});

describe("forgot-password flow", () => {
  it("validates input before calling Firebase", async () => {
    await expect(resetPassword("nope")).rejects.toBeInstanceOf(AuthInputError);
    await expect(resetPassword("")).rejects.toBeInstanceOf(AuthInputError);
    expect(h.sendReset).not.toHaveBeenCalled();
  });
  it("resolves only after Firebase accepted the request", async () => {
    let done = false;
    h.sendReset.mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(() => {
            done = true;
            r(undefined);
          }, 10),
        ),
    );
    await resetPassword(" A@B.co ");
    expect(done).toBe(true);
    expect(h.sendReset).toHaveBeenCalledWith({ fake: true }, "a@b.co");
  });
  it("does not reveal whether an account exists (user-not-found is not an error)", async () => {
    h.sendReset.mockRejectedValue({ code: "auth/user-not-found" });
    await expect(resetPassword("ghost@example.com")).resolves.toBeUndefined();
  });
  it("re-throws real failures", async () => {
    h.sendReset.mockRejectedValue({ code: "auth/network-request-failed" });
    await expect(resetPassword("a@b.co")).rejects.toMatchObject({
      code: "auth/network-request-failed",
    });
  });
});

describe("safe, user-friendly error messages", () => {
  it("never leaks raw Firebase codes or messages", () => {
    const raw = { code: "auth/some-new-code", message: "Firebase: Error (auth/some-new-code)." };
    const msg = getFriendlyAuthErrorMessage(raw);
    expect(msg).not.toContain("auth/");
    expect(msg).not.toContain("Firebase");
    expect(getFriendlyAuthErrorMessage({ message: "Firebase: boom" })).not.toContain("boom");
    expect(getFriendlyAuthErrorMessage(null)).toMatch(/unexpected/i);
  });
  it("maps common codes", () => {
    expect(getFriendlyAuthErrorMessage({ code: "auth/invalid-credential" })).toMatch(
      /incorrect email or password/i,
    );
    expect(getFriendlyAuthErrorMessage({ code: "auth/network-request-failed" })).toMatch(
      /network/i,
    );
    expect(getFriendlyAuthErrorMessage({ code: "auth/email-already-in-use" })).toMatch(
      /already exists/i,
    );
  });
  it("weak-password message states the real policy", () => {
    expect(getFriendlyAuthErrorMessage({ code: "auth/weak-password" })).toContain(
      PASSWORD_HELP_TEXT,
    );
  });
  it("hides deployment/configuration details from end users", () => {
    for (const code of [
      "auth/unauthorized-domain",
      "auth/operation-not-allowed",
      "auth/invalid-api-key",
      "permission-denied",
    ]) {
      const m = getFriendlyAuthErrorMessage({ code });
      expect(m).not.toMatch(/Firebase Console|security rules|Authorized Domains|Firestore/i);
    }
  });
  it("our own validation messages pass through", () => {
    expect(getFriendlyAuthErrorMessage(new AuthInputError("Please enter your password."))).toBe(
      "Please enter your password.",
    );
  });
  it("password-reset messages are safe", () => {
    expect(getFriendlyPasswordResetError({ code: "auth/invalid-email" })).toMatch(/valid email/i);
    expect(getFriendlyPasswordResetError({ code: "auth/too-many-requests" })).toMatch(/too many/i);
    expect(getFriendlyPasswordResetError({ code: "auth/network-request-failed" })).toMatch(
      /network/i,
    );
    const unknown = getFriendlyPasswordResetError({
      code: "auth/internal-error",
      message: "Firebase: x",
    });
    expect(unknown).not.toContain("auth/");
    expect(unknown).not.toContain("Firebase");
    expect(getFriendlyPasswordResetError({ code: "auth/user-not-found" })).not.toMatch(
      /no account|not found/i,
    );
  });
});
