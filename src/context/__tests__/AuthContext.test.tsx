// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

const h = vi.hoisted(() => ({
  listener: null as null | ((u: unknown) => void),
  unsubscribe: vi.fn(),
  ensureUserProfile: vi.fn(),
  logoutUser: vi.fn(),
  waitForPendingRegistration: vi.fn(),
  cfg: { configured: true, auth: { currentUser: null as null | { uid: string } } },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    h.listener = cb;
    return h.unsubscribe;
  },
}));
vi.mock("@/lib/firebase/config", () => ({
  get auth() {
    return h.cfg.configured ? h.cfg.auth : null;
  },
  isFirebaseConfigured: () => h.cfg.configured,
}));
vi.mock("../../lib/firebase/config", () => ({
  get auth() {
    return h.cfg.configured ? h.cfg.auth : null;
  },
  isFirebaseConfigured: () => h.cfg.configured,
}));
vi.mock("../../lib/firebase/firestore", () => ({ ensureUserProfile: h.ensureUserProfile }));
vi.mock("../../lib/firebase/auth", () => ({
  logoutUser: h.logoutUser,
  waitForPendingRegistration: h.waitForPendingRegistration,
}));

import { AuthProvider, useAuth } from "@/context/AuthContext";

type Snap = ReturnType<typeof useAuth>;
let latest: Snap;
const history: Array<{
  loading: boolean;
  initializing: boolean;
  uid: string | undefined;
  profileUid: string | undefined;
  profileError: boolean;
}> = [];

function Probe() {
  const a = useAuth();
  latest = a;
  history.push({
    loading: a.loading,
    initializing: a.initializing,
    uid: a.user?.uid,
    profileUid: a.profile?.uid,
    profileError: a.profileError !== null,
  });
  return null;
}

const profile = (uid: string, over: Record<string, unknown> = {}) => ({
  uid,
  email: `${uid}@example.com`,
  displayName: uid,
  role: "user",
  volunteerStatus: "none",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});
const fbUser = (uid: string) => ({ uid, email: `${uid}@example.com` });

async function mount() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}
const emit = async (u: unknown) => {
  await act(async () => {
    h.listener!(u);
    await Promise.resolve();
  });
};
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  history.length = 0;
  h.listener = null;
  h.cfg.configured = true;
  h.cfg.auth.currentUser = null;
  h.unsubscribe.mockReset();
  h.ensureUserProfile.mockReset();
  h.logoutUser.mockReset().mockResolvedValue(undefined);
  h.waitForPendingRegistration.mockReset().mockResolvedValue(undefined);
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AuthContext lifecycle", () => {
  it("is 'initializing' until the first auth callback, then settles (signed out)", async () => {
    await mount();
    expect(latest.initializing).toBe(true);
    expect(latest.loading).toBe(true);
    await emit(null);
    expect(latest.initializing).toBe(false);
    expect(latest.loading).toBe(false);
    expect(latest.isAuthenticated).toBe(false);
    expect(h.ensureUserProfile).not.toHaveBeenCalled();
  });

  it("AUTH-2: a sign-in reads/provisions the profile exactly once", async () => {
    h.ensureUserProfile.mockResolvedValue(profile("u1"));
    await mount();
    await emit(fbUser("u1"));
    await flush();
    expect(h.ensureUserProfile).toHaveBeenCalledTimes(1);
    expect(latest.profile?.uid).toBe("u1");
    expect(latest.loading).toBe(false);
    expect(latest.isAdmin).toBe(false);
  });

  it("recognises an administrator from the verified Firestore role", async () => {
    h.ensureUserProfile.mockResolvedValue(profile("a1", { role: "admin" }));
    await mount();
    await emit(fbUser("a1"));
    await flush();
    expect(latest.isAdmin).toBe(true);
    expect(latest.role).toBe("admin");
  });

  it("AUTH-1: refreshProfile never flips the app into a loading state (even while the read is in flight)", async () => {
    h.ensureUserProfile.mockResolvedValueOnce(profile("u1"));
    await mount();
    await emit(fbUser("u1"));
    await flush();
    h.cfg.auth.currentUser = { uid: "u1" };

    let release!: (p: unknown) => void;
    h.ensureUserProfile.mockImplementationOnce(() => new Promise((r) => (release = r)));

    history.length = 0;
    let pending!: Promise<void>;
    await act(async () => {
      pending = latest.refreshProfile();
      await new Promise((r) => setTimeout(r, 0)); // let React render whatever the refresh set
    });
    // The read is still in flight: the app must remain fully usable.
    expect(latest.loading).toBe(false);
    expect(latest.initializing).toBe(false);
    expect(latest.profile?.uid).toBe("u1");

    await act(async () => {
      release(profile("u1", { volunteerStatus: "pending" }));
      await pending;
    });
    expect(history.some((s) => s.loading || s.initializing)).toBe(false);
    expect(latest.profile?.volunteerStatus).toBe("pending");
    expect(h.ensureUserProfile).toHaveBeenCalledTimes(2);
  });

  it("AUTH-1: a failed background refresh keeps the profile we already hold (no lock-out)", async () => {
    h.ensureUserProfile.mockResolvedValueOnce(
      profile("u1", { role: "volunteer", volunteerStatus: "approved" }),
    );
    await mount();
    await emit(fbUser("u1"));
    await flush();
    h.cfg.auth.currentUser = { uid: "u1" };
    h.ensureUserProfile.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await latest.refreshProfile();
    });
    expect(latest.profile?.uid).toBe("u1");
    expect(latest.profileError).toBeNull();
    expect(latest.isVolunteerApproved).toBe(true);
  });

  it("an initial profile failure is surfaced, never a silent citizen default", async () => {
    h.ensureUserProfile.mockRejectedValue(
      Object.assign(new Error("denied"), { code: "permission-denied" }),
    );
    await mount();
    await emit(fbUser("a1"));
    await flush();
    expect(latest.profile).toBeNull();
    expect(latest.profileError?.message).toBe("denied");
    expect(latest.loading).toBe(false); // does not spin forever
    expect(latest.role).toBeNull();
    expect(latest.isAdmin).toBe(false);
  });

  it("retrying after an error recovers", async () => {
    h.ensureUserProfile.mockRejectedValueOnce(new Error("blip"));
    await mount();
    await emit(fbUser("u1"));
    await flush();
    expect(latest.profileError).not.toBeNull();
    h.cfg.auth.currentUser = { uid: "u1" };
    h.ensureUserProfile.mockResolvedValueOnce(profile("u1"));
    await act(async () => {
      await latest.refreshProfile();
    });
    expect(latest.profileError).toBeNull();
    expect(latest.profile?.uid).toBe("u1");
  });

  it("switching accounts never exposes the previous account's profile", async () => {
    h.ensureUserProfile.mockResolvedValueOnce(profile("alice", { role: "admin" }));
    await mount();
    await emit(fbUser("alice"));
    await flush();
    let release!: (p: unknown) => void;
    h.ensureUserProfile.mockImplementationOnce(() => new Promise((r) => (release = r)));
    history.length = 0;
    await emit(fbUser("bob"));
    expect(latest.profile).toBeNull();
    expect(latest.isAdmin).toBe(false);
    expect(latest.loading).toBe(true);
    await act(async () => release(profile("bob")));
    expect(latest.profile?.uid).toBe("bob");
    for (const s of history)
      expect(s.profileUid === undefined || s.profileUid === s.uid).toBe(true);
  });

  it("a slow load for a user who has since signed out is discarded", async () => {
    let release!: (p: unknown) => void;
    h.ensureUserProfile.mockImplementationOnce(() => new Promise((r) => (release = r)));
    await mount();
    await emit(fbUser("u1"));
    await emit(null); // signed out while the load is in flight
    await act(async () => release(profile("u1", { role: "admin" })));
    expect(latest.profile).toBeNull();
    expect(latest.isAuthenticated).toBe(false);
    expect(latest.isAdmin).toBe(false);
  });

  it("AUTH-3: waits for an in-flight registration before provisioning a profile", async () => {
    let openGate!: () => void;
    h.waitForPendingRegistration.mockImplementation(() => new Promise<void>((r) => (openGate = r)));
    h.ensureUserProfile.mockResolvedValue(profile("new1", { displayName: "Real Name" }));
    await mount();
    await emit(fbUser("new1"));
    await flush();
    expect(h.ensureUserProfile).not.toHaveBeenCalled();
    expect(latest.loading).toBe(true);
    await act(async () => openGate());
    await flush();
    expect(h.ensureUserProfile).toHaveBeenCalledTimes(1);
    expect(latest.profile?.displayName).toBe("Real Name");
  });

  it("AUTH-5: signed-in users are marked as having completed the intro (not shown it again after logout)", async () => {
    h.ensureUserProfile.mockResolvedValue(profile("u1"));
    await mount();
    expect(window.localStorage.getItem("rescuelink_intro_completed")).toBeNull();
    await emit(fbUser("u1"));
    await flush();
    expect(window.localStorage.getItem("rescuelink_intro_completed")).toBe("true");
  });

  it("does not mark the intro as done when the profile could not be loaded", async () => {
    h.ensureUserProfile.mockRejectedValue(new Error("x"));
    await mount();
    await emit(fbUser("u1"));
    await flush();
    expect(window.localStorage.getItem("rescuelink_intro_completed")).toBeNull();
  });

  it("logout clears everything and drops in-flight loads", async () => {
    h.ensureUserProfile.mockResolvedValue(profile("u1"));
    await mount();
    await emit(fbUser("u1"));
    await flush();
    await act(async () => {
      await latest.logout();
    });
    expect(h.logoutUser).toHaveBeenCalled();
    expect(latest.profile).toBeNull();
    expect(latest.user).toBeNull();
    expect(latest.activeMode).toBe("user");
  });

  it("unsubscribes from auth changes on unmount", async () => {
    await mount();
    cleanup();
    expect(h.unsubscribe).toHaveBeenCalled();
  });

  it("when Firebase is not configured it settles immediately instead of spinning forever", async () => {
    h.cfg.configured = false;
    await mount();
    await flush();
    expect(latest.initializing).toBe(false);
    expect(latest.loading).toBe(false);
    expect(latest.isFirebaseReady).toBe(false);
  });
});
