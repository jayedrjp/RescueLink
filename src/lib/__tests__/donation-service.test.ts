import { beforeEach, describe, expect, it, vi } from "vitest";

const localStore = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => localStore.get(k) ?? null,
  setItem: (k: string, v: string) => localStore.set(k, String(v)),
  removeItem: (k: string) => localStore.delete(k),
  clear: () => localStore.clear(),
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, "window", {
  value: globalThis,
  configurable: true,
  writable: true,
});

let mockCurrentUser: { uid: string; email?: string; displayName?: string } | null = null;
const setDocCalls: Array<{ path: string; data: Record<string, unknown> }> = [];

vi.mock("@/lib/firebase/config", () => ({
  db: { fake: true },
  get auth() {
    return {
      get currentUser() {
        return mockCurrentUser;
      },
    };
  },
}));

vi.mock("firebase/firestore", () => {
  const ref = (path: string) => ({ path, id: path.split("/").pop() });
  return {
    collection: (_d: unknown, name: string) => ({ path: name }),
    doc: (_d: unknown, ...segs: string[]) => ref(segs.join("/")),
    setDoc: vi.fn(async (docRef: { path: string }, data: Record<string, unknown>) => {
      setDocCalls.push({ path: docRef.path, data });
    }),
    getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
    getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
  };
});

import { recordDonation } from "../firebase/firestore";

describe("recordDonation service security enforcement", () => {
  beforeEach(() => {
    localStore.clear();
    setDocCalls.length = 0;
    mockCurrentUser = null;
    vi.clearAllMocks();
  });

  it("throws authentication error when user is unauthenticated", async () => {
    mockCurrentUser = null;

    await expect(
      recordDonation({
        donorName: "Anonymous",
        donorEmail: "anon@example.com",
        type: "money",
        amount: 500,
        shelterId: "mirpur",
        shelterName: "Mirpur Shelter",
        date: new Date().toISOString(),
        status: "completed",
      }),
    ).rejects.toThrow("Authentication required to record a donation.");

    expect(setDocCalls).toHaveLength(0);
  });

  it("succeeds when user is authenticated and attaches donorUid", async () => {
    mockCurrentUser = { uid: "user-123", email: "citizen@example.com" };

    const result = await recordDonation({
      donorName: "Rahim Citizen",
      donorEmail: "citizen@example.com",
      type: "money",
      amount: 1000,
      shelterId: "mirpur",
      shelterName: "Mirpur Shelter",
      date: new Date().toISOString(),
      status: "completed",
    });

    expect(result.donorUid).toBe("user-123");
    expect(setDocCalls).toHaveLength(1);
    expect(setDocCalls[0]!.data["donorUid"]).toBe("user-123");
    expect(setDocCalls[0]!.data["amount"]).toBe(1000);
  });

  it("rejects attempt to spoof a different donorUid than authenticated user", async () => {
    mockCurrentUser = { uid: "user-123" };

    await expect(
      recordDonation({
        donorName: "Imposter",
        donorEmail: "imposter@example.com",
        donorUid: "victim-456",
        type: "money",
        amount: 500,
        shelterId: "mirpur",
        shelterName: "Mirpur Shelter",
        date: new Date().toISOString(),
        status: "completed",
      }),
    ).rejects.toThrow("Authenticated user cannot record donation for another user.");

    expect(setDocCalls).toHaveLength(0);
  });
});
