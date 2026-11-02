import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Record<string, unknown>>();
const writes: Array<{ kind: "set" | "update"; path: string; data: Record<string, unknown> }> = [];

vi.mock("@/lib/firebase/config", () => ({ db: { fake: true }, auth: null }));
vi.mock("firebase/firestore", () => {
  const ref = (path: string) => ({ path, id: path.split("/").pop() });
  const snap = (path: string) => ({
    exists: () => store.has(path),
    id: path.split("/").pop(),
    data: () => store.get(path),
  });
  return {
    collection: (_d: unknown, name: string) => ({ path: name }),
    doc: (_d: unknown, ...segs: string[]) => ref(segs.join("/")),
    getDoc: async (r: { path: string }) => snap(r.path),
    getDocs: vi.fn(),
    addDoc: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    onSnapshot: vi.fn(),
    getDocFromServer: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    runTransaction: async (
      _d: unknown,
      fn: (tx: {
        get: (r: { path: string }) => Promise<unknown>;
        set: (r: { path: string }, d: Record<string, unknown>) => void;
        update: (r: { path: string }, d: Record<string, unknown>) => void;
      }) => Promise<void>,
    ) => {
      await fn({
        get: async (r) => snap(r.path),
        set: (r, d) => {
          writes.push({ kind: "set", path: r.path, data: d });
          store.set(r.path, d);
        },
        update: (r, d) => {
          writes.push({ kind: "update", path: r.path, data: d });
          store.set(r.path, { ...store.get(r.path), ...d });
        },
      });
    },
  };
});

import { createUserProfile, ensureUserProfile, getUserProfile } from "@/lib/firebase/firestore";

const stored = (over: Record<string, unknown> = {}) => ({
  uid: "u1",
  email: "u1@example.com",
  displayName: "U One",
  role: "user",
  volunteerStatus: "none",
  phone: "",
  area: "Dhaka",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  store.clear();
  writes.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("SEC-2: getUserProfile honours only the authoritative role field", () => {
  it.each([
    ["isAdmin flag", { isAdmin: true }],
    ["admin flag", { admin: true }],
    ["Role alias", { Role: "admin" }],
    ["userRole alias", { userRole: "admin" }],
    ["user_role alias", { user_role: "admin" }],
  ])("ignores a legacy %s", async (_name, extra) => {
    store.set("users/u1", stored(extra));
    expect((await getUserProfile("u1"))?.role).toBe("user");
  });

  it("still recognises the real role field (case/space tolerant) and rejects unknown roles", async () => {
    store.set("users/a", stored({ uid: "a", role: " ADMIN " }));
    store.set("users/v", stored({ uid: "v", role: "volunteer" }));
    store.set("users/x", stored({ uid: "x", role: "superuser" }));
    store.set("users/m", stored({ uid: "m", role: undefined }));
    expect((await getUserProfile("a"))?.role).toBe("admin");
    expect((await getUserProfile("v"))?.role).toBe("volunteer");
    expect((await getUserProfile("x"))?.role).toBe("user");
    expect((await getUserProfile("m"))?.role).toBe("user");
  });

  it("ignores the legacy volunteer_status alias and unknown statuses", async () => {
    store.set("users/u1", stored({ volunteer_status: "approved" }));
    expect((await getUserProfile("u1"))?.volunteerStatus).toBe("none");
    store.set("users/u2", stored({ uid: "u2", volunteerStatus: "super-approved" }));
    expect((await getUserProfile("u2"))?.volunteerStatus).toBe("none");
    store.set("users/u3", stored({ uid: "u3", volunteerStatus: "Approved" }));
    expect((await getUserProfile("u3"))?.volunteerStatus).toBe("approved");
  });

  it("does not log the user's email or role", async () => {
    const info = vi.spyOn(console, "info");
    store.set("users/u1", stored({ role: "admin" }));
    await getUserProfile("u1");
    expect(JSON.stringify(info.mock.calls)).not.toContain("u1@example.com");
  });
});

describe("profile provisioning is transactional and never rewrites privileged fields", () => {
  it("createUserProfile creates a citizen profile when none exists", async () => {
    const p = await createUserProfile("u1", { email: "U1@Example.com ", displayName: " Rahim " });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: "set", path: "users/u1" });
    expect(p).toMatchObject({
      role: "user",
      volunteerStatus: "none",
      displayName: "Rahim",
      email: "u1@example.com",
    });
    expect(p.createdAt).toBe(p.updatedAt); // required by the rules on create
  });

  it("createUserProfile on an existing profile only updates non-privileged fields (keeps createdAt and role)", async () => {
    store.set(
      "users/u1",
      stored({ displayName: "u1", role: "volunteer", volunteerStatus: "approved" }),
    );
    await createUserProfile("u1", {
      email: "u1@example.com",
      displayName: "Real Name",
      phone: "+8801712345678",
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]!.kind).toBe("update");
    expect(Object.keys(writes[0]!.data).sort()).toEqual(["displayName", "phone", "updatedAt"]);
    expect(store.get("users/u1")).toMatchObject({
      role: "volunteer",
      volunteerStatus: "approved",
      createdAt: "2026-10-01T00:00:00.000Z",
      displayName: "Real Name",
    });
  });

  it("ensureUserProfile provisions a missing profile as a plain citizen and returns the stored copy", async () => {
    const p = await ensureUserProfile({ uid: "u2", email: "u2@example.com", displayName: null });
    expect(writes).toHaveLength(1);
    expect(writes[0]!.kind).toBe("set");
    expect(p).toMatchObject({
      uid: "u2",
      role: "user",
      volunteerStatus: "none",
      displayName: "u2",
    });
  });

  it("ensureUserProfile never writes for an existing profile (admins/volunteers preserved)", async () => {
    store.set("users/u1", stored({ role: "admin" }));
    const p = await ensureUserProfile({ uid: "u1", email: "u1@example.com" });
    expect(writes).toHaveLength(0);
    expect(p.role).toBe("admin");
  });

  it("losing the creation race falls back to the stored document without overwriting it", async () => {
    // The profile appears between ensure's read and its transaction (another flow created it first).
    let first = true;
    const original = store.get.bind(store);
    vi.spyOn(store, "has").mockImplementation((k: string) => {
      if (first && k === "users/u3") {
        first = false;
        store.set("users/u3", stored({ uid: "u3", displayName: "From Register", role: "user" }));
        return false; // ensure's getDoc saw "missing"
      }
      return Map.prototype.has.call(store, k);
    });
    void original;
    const p = await ensureUserProfile({ uid: "u3", email: "u3@example.com" });
    expect(p.displayName).toBe("From Register");
  });
});
