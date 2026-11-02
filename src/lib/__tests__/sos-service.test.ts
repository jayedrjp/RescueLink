import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- In-memory fake of the parts of Firestore the SOS service uses ----
const store = new Map<string, Record<string, unknown>>();
let setDocImpl: (ref: { path: string }, data: Record<string, unknown>) => Promise<void>;

vi.mock("@/lib/firebase/config", () => ({ db: { fake: true }, auth: null }));
vi.mock("firebase/firestore", () => {
  const ref = (path: string) => ({ path, id: path.split("/").pop() });
  return {
    collection: (_db: unknown, name: string) => ({ path: name }),
    doc: (_a: unknown, ...segs: string[]) =>
      segs.length === 0
        ? ref(`sos_requests/auto${store.size + 1}`) // doc(collection(...)) -> auto id
        : ref(segs.join("/")),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    addDoc: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    onSnapshot: vi.fn(),
    updateDoc: vi.fn(async (r: { path: string }, upd: Record<string, unknown>) => {
      const cur = store.get(r.path) ?? {};
      store.set(r.path, { ...cur, ...upd });
    }),
    setDoc: (r: { path: string }, data: Record<string, unknown>) => setDocImpl(r, data),
    getDocFromServer: async (r: { path: string }) => ({
      exists: () => store.has(r.path),
      id: r.path.split("/").pop(),
      data: () => store.get(r.path),
    }),
    runTransaction: async (
      _db: unknown,
      fn: (tx: {
        get: (r: { path: string }) => Promise<unknown>;
        update: (r: { path: string }, u: Record<string, unknown>) => void;
      }) => Promise<void>,
    ) => {
      const pending: Array<[string, Record<string, unknown>]> = [];
      await fn({
        get: async (r) => ({
          exists: () => store.has(r.path),
          id: r.path.split("/").pop(),
          data: () => store.get(r.path),
        }),
        update: (r, u) => {
          pending.push([r.path, u]);
        },
      });
      for (const [path, u] of pending) store.set(path, { ...store.get(path), ...u });
    },
  };
});

import {
  SosError,
  cancelSosRequest,
  claimSosRequest,
  createSosRequest,
  getSosRequestOnce,
  resolveSosRequest,
  updateSosLocation,
  updateSosStatus,
} from "@/lib/firebase/firestore";

const base = { requestId: "req1", userId: "u1", userName: "Rahim" };
const gps = {
  source: "gps" as const,
  address: "Road 5",
  lat: 23.75,
  lng: 90.39,
  accuracyMeters: 12.4,
};

beforeEach(() => {
  store.clear();
  setDocImpl = async (r, data) => {
    store.set(r.path, data);
  };
});

describe("createSosRequest (SOS-1/2/3/5/7)", () => {
  it("stores real GPS data with rounded accuracy and no fabricated values", async () => {
    const res = await createSosRequest({
      ...base,
      userPhone: "+8801712345678",
      message: "help",
      location: gps,
    });
    const saved = store.get("sos_requests/req1")!;
    expect(saved["status"]).toBe("active");
    expect(saved["message"]).toBe("help");
    expect(saved["userPhone"]).toBe("+8801712345678");
    expect(saved["location"]).toMatchObject({
      source: "gps",
      lat: 23.75,
      lng: 90.39,
      accuracyMeters: 12,
    });
    expect(JSON.stringify(saved)).not.toContain("Dhanmondi 27");
    expect(JSON.stringify(saved)).not.toContain("GPS strong");
    expect(res.id).toBe("req1");
  });

  it("rejects GPS source without valid coordinates (no default coords)", async () => {
    await expect(
      createSosRequest({ ...base, location: { source: "gps", address: "x" } }),
    ).rejects.toMatchObject({ code: "invalid-location" });
    await expect(
      createSosRequest({ ...base, location: { source: "gps", address: "x", lat: 999, lng: 0 } }),
    ).rejects.toMatchObject({ code: "invalid-location" });
    expect(store.size).toBe(0);
  });

  it("rejects an empty/too-short manual address and accepts a real one without coordinates", async () => {
    await expect(
      createSosRequest({ ...base, location: { source: "manual", address: "ab" } }),
    ).rejects.toBeInstanceOf(SosError);
    await createSosRequest({
      ...base,
      location: { source: "manual", address: "House 12, Road 5" },
    });
    const loc = store.get("sos_requests/req1")!["location"] as Record<string, unknown>;
    expect(loc["source"]).toBe("manual");
    expect("lat" in loc).toBe(false);
    expect("accuracyMeters" in loc).toBe(false);
  });

  it("never writes undefined values (Firestore rejects them)", async () => {
    await createSosRequest({ ...base, location: { source: "gps", address: "", lat: 1, lng: 2 } });
    const loc = store.get("sos_requests/req1")!["location"] as Record<string, unknown>;
    expect(Object.values(loc).includes(undefined)).toBe(false);
    expect(loc["address"]).toBe("Coordinates 1.00000, 2.00000");
  });

  it("requires a signed-in user id", async () => {
    await expect(createSosRequest({ ...base, userId: "", location: gps })).rejects.toMatchObject({
      code: "invalid-input",
    });
  });

  it("reports a timeout instead of success when the server never acknowledges", async () => {
    setDocImpl = () => new Promise(() => {}); // never settles (offline)
    await expect(
      createSosRequest({ ...base, location: gps }, { timeoutMs: 20 }),
    ).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("propagates server rejections (e.g. permission-denied)", async () => {
    setDocImpl = async () => {
      throw Object.assign(new Error("denied"), { code: "permission-denied" });
    };
    await expect(createSosRequest({ ...base, location: gps })).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("retrying with the same id is verifiable via getSosRequestOnce", async () => {
    await createSosRequest({ ...base, location: gps });
    const found = await getSosRequestOnce("req1");
    expect(found?.userId).toBe("u1");
    expect(await getSosRequestOnce("missing")).toBeNull();
  });
});

describe("status transitions (SOS-4, SOS-6)", () => {
  beforeEach(async () => {
    await createSosRequest({ ...base, location: gps });
  });

  it("cancel and resolve write different, correct statuses", async () => {
    await resolveSosRequest("req1", { uid: "u1" });
    expect(store.get("sos_requests/req1")).toMatchObject({ status: "resolved" });
    expect(store.get("sos_requests/req1")!["resolvedAt"]).toBeTruthy();
    expect(store.get("sos_requests/req1")!["cancelledAt"]).toBeUndefined();

    await createSosRequest({ ...base, requestId: "req2", location: gps });
    await cancelSosRequest("req2", { uid: "u1" });
    expect(store.get("sos_requests/req2")).toMatchObject({ status: "cancelled" });
    expect(store.get("sos_requests/req2")!["cancelledAt"]).toBeTruthy();
  });

  it("does not allow re-cancelling a resolved request or resolving a cancelled one", async () => {
    await resolveSosRequest("req1", { uid: "u1" });
    await expect(cancelSosRequest("req1", { uid: "u1" })).rejects.toMatchObject({
      code: "invalid-transition",
    });
    expect(store.get("sos_requests/req1")).toMatchObject({ status: "resolved" });

    await createSosRequest({ ...base, requestId: "req3", location: gps });
    await cancelSosRequest("req3", { uid: "u1" });
    await expect(resolveSosRequest("req3", { uid: "u1" })).rejects.toMatchObject({
      code: "invalid-transition",
    });
  });

  it("only the owner (or admin) may cancel", async () => {
    await expect(cancelSosRequest("req1", { uid: "someone-else" })).rejects.toMatchObject({
      code: "not-authorized",
    });
    expect(store.get("sos_requests/req1")).toMatchObject({ status: "active" });
    await cancelSosRequest("req1", { uid: "admin1", isAdmin: true });
    expect(store.get("sos_requests/req1")).toMatchObject({ status: "cancelled" });
  });

  it("reports not-found for a missing request", async () => {
    await expect(cancelSosRequest("nope", { uid: "u1" })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("volunteer claim records the responder-supplied ETA and id; second claimer is refused", async () => {
    await claimSosRequest("req1", { uid: "v1" }, { unit: "Karim", etaMinutes: 12 });
    const saved = store.get("sos_requests/req1")!;
    expect(saved["status"]).toBe("assigned");
    expect(saved["assignedResponder"]).toMatchObject({
      unit: "Karim",
      eta: "12 min",
      responderId: "v1",
    });
    expect((saved["assignedResponder"] as Record<string, unknown>)["assignedAt"]).toBeTruthy();

    await expect(
      claimSosRequest("req1", { uid: "v2" }, { unit: "Other", etaMinutes: 5 }),
    ).rejects.toMatchObject({ code: "not-authorized" });
    expect(
      (store.get("sos_requests/req1")!["assignedResponder"] as Record<string, unknown>)[
        "responderId"
      ],
    ).toBe("v1");
  });

  it("validates the ETA instead of inventing one", async () => {
    for (const bad of [0, -3, NaN, 100000]) {
      await expect(
        claimSosRequest("req1", { uid: "v1" }, { unit: "Karim", etaMinutes: bad }),
      ).rejects.toMatchObject({ code: "invalid-input" });
    }
    expect(store.get("sos_requests/req1")).toMatchObject({ status: "active" });
  });

  it("assigned responder may resolve; unrelated volunteer may not", async () => {
    await claimSosRequest("req1", { uid: "v1" }, { unit: "Karim", etaMinutes: 10 });
    await expect(resolveSosRequest("req1", { uid: "v9" })).rejects.toMatchObject({
      code: "not-authorized",
    });
    await resolveSosRequest("req1", { uid: "v1" });
    expect(store.get("sos_requests/req1")).toMatchObject({ status: "resolved" });
  });

  it("admin dispatch via updateSosStatus still works and is transition-checked", async () => {
    await updateSosStatus("req1", "assigned", { unit: "Unit 04", eta: "7 min" });
    expect(store.get("sos_requests/req1")).toMatchObject({ status: "assigned" });
    await updateSosStatus("req1", "resolved");
    await expect(
      updateSosStatus("req1", "assigned", { unit: "x", eta: "1 min" }),
    ).rejects.toMatchObject({
      code: "invalid-transition",
    });
  });
});

describe("updateSosLocation (SOS-3)", () => {
  it("writes real coordinates with a timestamp", async () => {
    await createSosRequest({ ...base, location: gps });
    await updateSosLocation("req1", { lat: 23.8, lng: 90.4, accuracyMeters: 8.2 });
    const saved = store.get("sos_requests/req1")!;
    expect(saved["location.lat"]).toBe(23.8);
    expect(saved["location.accuracyMeters"]).toBe(8);
    expect(saved["location.updatedAt"]).toBeTruthy();
  });
  it("rejects non-finite coordinates", async () => {
    await expect(updateSosLocation("req1", { lat: NaN, lng: 1 })).rejects.toMatchObject({
      code: "invalid-location",
    });
  });
});
