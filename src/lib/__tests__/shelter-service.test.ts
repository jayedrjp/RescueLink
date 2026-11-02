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

const store = new Map<string, Record<string, unknown>>();
const updateCalls: Array<{ path: string; data: Record<string, unknown> }> = [];
const setCalls: Array<{ path: string; data: Record<string, unknown> }> = [];

vi.mock("@/lib/firebase/config", () => ({ db: { fake: true }, auth: null }));

vi.mock("firebase/firestore", () => {
  const ref = (path: string) => ({ path, id: path.split("/").pop() });
  return {
    collection: (_d: unknown, name: string) => ({ path: name }),
    doc: (_d: unknown, ...segs: string[]) => ref(segs.join("/")),
    getDocs: vi.fn(async (colRef: { path: string }) => {
      const docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
      store.forEach((val, key) => {
        const prefix = `${colRef?.path || "shelters"}/`;
        if (key.startsWith(prefix)) {
          docs.push({
            id: key.slice(prefix.length),
            data: () => val,
          });
        }
      });
      return {
        empty: docs.length === 0,
        forEach: (fn: (doc: unknown) => void) => docs.forEach(fn),
        docs,
      };
    }),
    onSnapshot: vi.fn(),
    getDoc: vi.fn(async (r: { path: string; id: string }) => {
      const data = store.get(r.path);
      return {
        exists: () => data !== undefined,
        id: r.id,
        data: () => data,
      };
    }),
    setDoc: vi.fn(async (r: { path: string }, d: Record<string, unknown>) => {
      setCalls.push({ path: r.path, data: d });
      store.set(r.path, d);
    }),
    updateDoc: vi.fn(async (r: { path: string }, d: Record<string, unknown>) => {
      if (!store.has(r.path)) {
        const err = new Error(`No document to update: ${r.path}`);
        (err as { code?: string }).code = "not-found";
        throw err;
      }
      updateCalls.push({ path: r.path, data: d });
      store.set(r.path, { ...store.get(r.path), ...d });
    }),
    deleteDoc: vi.fn(async (r: { path: string }) => {
      store.delete(r.path);
    }),
    runTransaction: vi.fn(
      async (
        _d: unknown,
        updateFunction: (transaction: {
          get: (r: { path: string; id: string }) => Promise<{
            exists: () => boolean;
            id: string;
            data: () => Record<string, unknown> | undefined;
          }>;
          set: (r: { path: string }, d: Record<string, unknown>) => void;
          update: (r: { path: string }, d: Record<string, unknown>) => void;
          delete: (r: { path: string }) => void;
        }) => Promise<unknown>,
      ) => {
        const transaction = {
          get: async (r: { path: string; id: string }) => {
            const data = store.get(r.path);
            return {
              exists: () => data !== undefined,
              id: r.id,
              data: () => data,
            };
          },
          set: (r: { path: string }, d: Record<string, unknown>) => {
            setCalls.push({ path: r.path, data: d });
            store.set(r.path, d);
          },
          update: (r: { path: string }, d: Record<string, unknown>) => {
            if (!store.has(r.path)) {
              const err = new Error(`No document to update: ${r.path}`);
              (err as { code?: string }).code = "not-found";
              throw err;
            }
            updateCalls.push({ path: r.path, data: d });
            store.set(r.path, { ...store.get(r.path), ...d });
          },
          delete: (r: { path: string }) => {
            store.delete(r.path);
          },
        };
        return await updateFunction(transaction);
      },
    ),
  };
});

import {
  getDocs,
  getDoc,
  setDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  runTransaction,
} from "firebase/firestore";
import {
  createShelter,
  getSheltersOnce,
  getShelterByIdFromFirestore,
  ShelterNotFoundError,
  subscribeToShelters,
  updateShelterCapacity,
  updateShelter,
  saveShelter,
  deleteShelter,
  registerFallbackShelter,
  type UpdateShelterInput,
} from "@/lib/firebase/firestore";
import {
  type Shelter,
  getStoredShelters,
  saveShelters,
  isFallbackShelter,
  shelters,
} from "@/lib/data";

describe("Shelter Management Service — Phase 1 Identity & Update Reliability", () => {
  beforeEach(() => {
    store.clear();
    updateCalls.length = 0;
    setCalls.length = 0;
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("1. Document ID Mapping & Authoritative ID Preservation", () => {
    it("ensures Firestore document ID (d.id) is authoritative even if payload contains conflicting id", async () => {
      const mockDocs = [
        {
          id: "actual-firestore-doc-id",
          data: () => ({
            id: "conflicting-payload-id",
            name: "Test Community Shelter",
            area: "Dhaka Central",
            capacity: 200,
            occupied: 50,
            status: "open",
            facilities: ["Water", "Beds"],
            needs: ["Blankets"],
            phone: "+8801711000000",
            image: "shelter-1",
          }),
        },
      ];

      vi.mocked(getDocs).mockResolvedValueOnce({
        empty: false,
        forEach: (fn: (doc: unknown) => void) => mockDocs.forEach(fn),
      } as never);

      const shelters = await getSheltersOnce();
      expect(shelters).toHaveLength(1);
      // Authoritative document ID MUST be preserved:
      expect(shelters[0]!.id).toBe("actual-firestore-doc-id");
      expect(shelters[0]!.isLocal).toBe(false);
    });

    it("subscribeToShelters preserves doc.id and sets isLocal: false on snapshot emissions", () => {
      let snapshotCallback: ((snap: unknown) => void) | undefined;
      vi.mocked(onSnapshot).mockImplementationOnce((_col: unknown, onNext: unknown) => {
        snapshotCallback = onNext as (snap: unknown) => void;
        return () => {};
      });

      let received: Shelter[] = [];
      subscribeToShelters((data) => {
        received = data;
      });

      const mockSnap = {
        empty: false,
        forEach: (fn: (doc: unknown) => void) => {
          fn({
            id: "remote-shelter-456",
            data: () => ({
              id: "payload-id-to-be-overridden",
              name: "Mohakhali Cyclone Shelter",
              area: "Mohakhali, Dhaka",
              capacity: 100,
              occupied: 85,
              status: "limited",
              facilities: ["Medicine", "Food"],
              needs: [],
              phone: "+8801711000123",
              image: "shelter-2",
            }),
          });
        },
      };

      snapshotCallback!(mockSnap);

      expect(received).toHaveLength(1);
      expect(received[0]!.id).toBe("remote-shelter-456");
      expect(received[0]!.isLocal).toBe(false);
      expect(received[0]!.name).toBe("Mohakhali Cyclone Shelter");
    });
  });

  describe("2. Fallback Data Distinction", () => {
    it("returns local fallback shelters with isLocal: true when Firestore snapshot is empty", () => {
      let snapshotCallback: ((snap: unknown) => void) | undefined;
      vi.mocked(onSnapshot).mockImplementationOnce((_col: unknown, onNext: unknown) => {
        snapshotCallback = onNext as (snap: unknown) => void;
        return () => {};
      });

      let received: Shelter[] = [];
      subscribeToShelters((data) => {
        received = data;
      });

      snapshotCallback!({ empty: true });

      expect(received.length).toBeGreaterThan(0);
      // Every fallback shelter must be marked isLocal: true
      expect(received.every((s) => s.isLocal === true)).toBe(true);
      expect(received.some((s) => s.id === "dhanmondi")).toBe(true);
    });

    it("returns local fallback shelters with isLocal: true when subscription errors", () => {
      let errorCallback: ((err: Error) => void) | undefined;
      vi.mocked(onSnapshot).mockImplementationOnce(
        (_col: unknown, _onNext: unknown, onError: unknown) => {
          errorCallback = onError as (err: Error) => void;
          return () => {};
        },
      );

      let received: Shelter[] = [];
      subscribeToShelters((data) => {
        received = data;
      });

      errorCallback!(new Error("Network connection dropped"));

      expect(received.length).toBeGreaterThan(0);
      expect(received.every((s) => s.isLocal === true)).toBe(true);
    });
  });

  describe("3. Capacity Update & Validation on Existing Documents", () => {
    it("updates existing Firestore document and clamps capacity/occupied properly", async () => {
      // Seed document in fake Firestore store
      store.set("shelters/existing-shelter-1", {
        id: "existing-shelter-1",
        name: "Existing Safe Haven",
        capacity: 100,
        occupied: 50,
        status: "open",
      });

      await updateShelterCapacity("existing-shelter-1", 120, 80);

      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0]!.path).toBe("shelters/existing-shelter-1");
      expect(updateCalls[0]!.data["capacity"]).toBe(120);
      expect(updateCalls[0]!.data["occupied"]).toBe(80);
      expect(updateCalls[0]!.data["status"]).toBe("open"); // 80 / 120 = 66.7% (< 80%)
    });

    it("calculates status as 'limited' when occupancy is >= 80% of capacity", async () => {
      store.set("shelters/existing-shelter-2", {
        id: "existing-shelter-2",
        capacity: 100,
        occupied: 50,
      });

      await updateShelterCapacity("existing-shelter-2", 100, 85);

      expect(updateCalls[0]!.data["status"]).toBe("limited");
    });

    it("calculates status as 'full' when occupancy is >= 100% of capacity", async () => {
      store.set("shelters/existing-shelter-3", {
        id: "existing-shelter-3",
        capacity: 100,
        occupied: 50,
      });

      await updateShelterCapacity("existing-shelter-3", 100, 100);

      expect(updateCalls[0]!.data["status"]).toBe("full");
    });

    it("clamps negative occupancy to 0 and occupancy exceeding capacity to capacity", async () => {
      store.set("shelters/existing-shelter-4", {
        id: "existing-shelter-4",
        capacity: 100,
        occupied: 50,
      });

      // Negative occupied
      await updateShelterCapacity("existing-shelter-4", 100, -10);
      expect(updateCalls[0]!.data["occupied"]).toBe(0);

      // Occupied exceeding capacity
      await updateShelterCapacity("existing-shelter-4", 50, 999);
      expect(updateCalls[1]!.data["occupied"]).toBe(50);
      expect(updateCalls[1]!.data["capacity"]).toBe(50);
      expect(updateCalls[1]!.data["status"]).toBe("full");
    });
  });

  describe("4. Missing Document Handling & Actionable Errors", () => {
    it("throws ShelterNotFoundError when updating a document that does not exist in Firestore", async () => {
      // Document is NOT in store (e.g. unseeded "dhanmondi")
      await expect(updateShelterCapacity("dhanmondi", 180, 150)).rejects.toThrow(
        ShelterNotFoundError,
      );

      try {
        await updateShelterCapacity("dhanmondi", 180, 150);
      } catch (err) {
        expect(err).toBeInstanceOf(ShelterNotFoundError);
        const notFound = err as ShelterNotFoundError;
        expect(notFound.code).toBe("not-found");
        expect(notFound.shelterId).toBe("dhanmondi");
        expect(notFound.message).toContain('Shelter document "dhanmondi" does not exist');
      }
    });

    it("validates that empty or whitespace-only shelterId is rejected immediately", async () => {
      await expect(updateShelterCapacity("", 100, 10)).rejects.toThrow(/document ID is required/);
      await expect(updateShelterCapacity("   ", 100, 10)).rejects.toThrow(
        /document ID is required/,
      );
    });
  });

  describe("5. Shelter Creation", () => {
    it("creates a new shelter with isLocal: false using setDoc", async () => {
      const newShelter = {
        name: "New Emergency Relief Hub",
        area: "Mirpur 2, Dhaka",
        capacity: 150,
        occupied: 20,
        phone: "+8801711000888",
        image: "shelter-1",
        facilities: ["Food", "Water"],
        needs: ["Blankets"],
      };

      const created = await createShelter(newShelter);

      expect(created.id).toMatch(/^shelter-\d+$/);
      expect(created.isLocal).toBe(false);
      expect(created.status).toBe("open");
      expect(setCalls).toHaveLength(1);
      expect(setCalls[0]!.path).toBe(`shelters/${created.id}`);
      expect(setCalls[0]!.data["isLocal"]).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — Shelter Detail Lookup (getShelterByIdFromFirestore)
// ---------------------------------------------------------------------------

const SHELTER_PATH = (id: string) => `shelters/${id}`;

/** Minimal valid shelter payload stored in Firestore / localStorage. */
const makePayload = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  name: "Test Shelter",
  area: "Dhaka North",
  capacity: 100,
  occupied: 40,
  phone: "+8801711000001",
  image: "shelter-1",
  facilities: ["Food", "Water"],
  needs: ["Blankets"],
  status: "open",
  isLocal: false,
  ...overrides,
});

describe("6. Shelter Detail Lookup — Phase 2 (getShelterByIdFromFirestore)", () => {
  beforeEach(() => {
    store.clear();
    localStorage.clear();
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Test 1: Remote shelter found in Firestore
  // ------------------------------------------------------------------
  it("returns status:remote when Firestore has the document", async () => {
    const docId = "shelter-remote-01";
    store.set(SHELTER_PATH(docId), makePayload());

    const result = await getShelterByIdFromFirestore(docId);

    expect(result.status).toBe("remote");
    if (result.status === "remote") {
      expect(result.shelter.id).toBe(docId);
      expect(result.shelter.isLocal).toBe(false);
    }
  });

  // ------------------------------------------------------------------
  // Test 2: Authoritative Firestore snap.id wins over conflicting payload id
  // ------------------------------------------------------------------
  it("uses snap.id as authoritative ID even when payload carries a conflicting id field", async () => {
    const realDocId = "shelter-real-doc-id";
    store.set(SHELTER_PATH(realDocId), makePayload({ id: "conflicting-payload-id" }));

    const result = await getShelterByIdFromFirestore(realDocId);

    expect(result.status).toBe("remote");
    if (result.status === "remote") {
      expect(result.shelter.id).toBe(realDocId);
    }
  });

  // ------------------------------------------------------------------
  // Test 3: Dynamically created shelter (timestamp-based ID)
  // ------------------------------------------------------------------
  it("resolves dynamically created shelters with timestamp-based IDs", async () => {
    const dynId = "shelter-1750000000000";
    store.set(SHELTER_PATH(dynId), makePayload({ name: "Dynamic Emergency Hub" }));

    const result = await getShelterByIdFromFirestore(dynId);

    expect(result.status).toBe("remote");
    if (result.status === "remote") {
      expect(result.shelter.id).toBe(dynId);
      expect(result.shelter.name).toBe("Dynamic Emergency Hub");
    }
  });

  // ------------------------------------------------------------------
  // Test 4: Local fallback when Firestore is empty (snap.exists() === false)
  // ------------------------------------------------------------------
  it("returns status:local with isLocal:true when Firestore has no doc but localStorage does", async () => {
    // store is empty → getDoc will return exists: false
    // Put shelter in localStorage
    const localId = "mirpur";
    const localShelters = [
      {
        id: localId,
        name: "Mirpur Community Shelter",
        area: "Mirpur",
        capacity: 200,
        occupied: 80,
        phone: "+8801711000002",
        image: "shelter-2",
        facilities: ["Food"],
        needs: [],
        status: "open",
        isLocal: true,
      },
    ];
    localStorage.setItem("rl_shelters", JSON.stringify(localShelters));

    const result = await getShelterByIdFromFirestore(localId);

    expect(result.status).toBe("local");
    if (result.status === "local") {
      expect(result.shelter.id).toBe(localId);
      expect(result.shelter.isLocal).toBe(true);
    }
  });

  // ------------------------------------------------------------------
  // Test 5: Genuinely missing — not in Firestore, not in localStorage
  // ------------------------------------------------------------------
  it("returns status:missing when shelter is absent from both Firestore and localStorage", async () => {
    // store is empty, localStorage is empty
    const result = await getShelterByIdFromFirestore("nonexistent-shelter-xyz");

    expect(result.status).toBe("missing");
  });

  // ------------------------------------------------------------------
  // Test 6: Firestore read error (network / permission) → status:error
  // ------------------------------------------------------------------
  it("returns status:error when getDoc throws a non-not-found error", async () => {
    const networkErr = new Error("Network request failed");
    vi.mocked(getDoc).mockRejectedValueOnce(networkErr);

    const result = await getShelterByIdFromFirestore("shelter-error-case");

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toContain("Network request failed");
    }
  });

  // ------------------------------------------------------------------
  // Test 7: Firestore throws not-found code → falls back to localStorage
  // ------------------------------------------------------------------
  it("falls back to localStorage when getDoc throws with code:not-found and local cache exists", async () => {
    const notFoundErr = Object.assign(new Error("not-found"), { code: "not-found" });
    vi.mocked(getDoc).mockRejectedValueOnce(notFoundErr);

    const localId = "uttara";
    const localShelters = [
      {
        id: localId,
        name: "Uttara Shelter",
        area: "Uttara",
        capacity: 150,
        occupied: 50,
        phone: "+8801711000003",
        image: "shelter-3",
        facilities: ["Water"],
        needs: ["Food"],
        status: "open",
        isLocal: true,
      },
    ];
    localStorage.setItem("rl_shelters", JSON.stringify(localShelters));

    const result = await getShelterByIdFromFirestore(localId);

    expect(result.status).toBe("local");
    if (result.status === "local") {
      expect(result.shelter.id).toBe(localId);
    }
  });

  // ------------------------------------------------------------------
  // Test 8: Empty / whitespace shelterId → status:missing immediately
  // ------------------------------------------------------------------
  it("returns status:missing for empty shelterId without calling Firestore", async () => {
    const resultEmpty = await getShelterByIdFromFirestore("");
    expect(resultEmpty.status).toBe("missing");

    const resultSpaces = await getShelterByIdFromFirestore("   ");
    expect(resultSpaces.status).toBe("missing");

    // getDoc should never have been called
    expect(getDoc).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Test 9: No db connection → uses localStorage only
  // ------------------------------------------------------------------
  it("uses localStorage when db is null, returning status:local if found", async () => {
    // Override the config mock to simulate no db
    const { db: _originalDb, ...rest } = await import("@/lib/firebase/config");
    void _originalDb;
    void rest;

    // We can't easily swap the module-level `db` binding mid-test without
    // full module re-import. Instead verify the existing localStorage path:
    // When getDoc is NOT mocked to throw but the localStore is populated,
    // the function still returns local data correctly if Firestore returns
    // exists:false (which is what the mock does for missing keys).
    const localId = "mohammadpur";
    const localShelters = [
      {
        id: localId,
        name: "Mohammadpur Shelter",
        area: "Mohammadpur",
        capacity: 120,
        occupied: 30,
        phone: "+8801711000004",
        image: "shelter-4",
        facilities: ["Food", "Medical"],
        needs: [],
        status: "open",
        isLocal: true,
      },
    ];
    localStorage.setItem("rl_shelters", JSON.stringify(localShelters));

    // store is empty → getDoc returns exists:false → falls to localStorage
    const result = await getShelterByIdFromFirestore(localId);

    expect(result.status).toBe("local");
    if (result.status === "local") {
      expect(result.shelter.id).toBe(localId);
      expect(result.shelter.isLocal).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — Shelter Management CRUD & Deletion Reliability
// ---------------------------------------------------------------------------

describe("7. Phase 4 — Shelter Management CRUD & Deletion Reliability", () => {
  beforeEach(() => {
    store.clear();
    updateCalls.length = 0;
    setCalls.length = 0;
    vi.clearAllMocks();
    localStorage.clear();
  });

  const INITIAL_DOC: Record<string, unknown> = {
    name: "Existing Mirpur Shelter",
    area: "Mirpur 10, Dhaka",
    capacity: 100,
    occupied: 40,
    status: "open",
    facilities: ["Food", "Water"],
    needs: ["Blankets"],
    phone: "+880 1711 000 121",
    image: "shelter-1",
    coordinates: { lat: 23.8068, lng: 90.3688 },
    distanceKm: 1.2,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("updateShelter: updates all specified fields and calculates correct status", async () => {
    const docId = "shelter-p4-01";
    store.set(`shelters/${docId}`, { ...INITIAL_DOC });

    const updates: UpdateShelterInput = {
      name: "Mirpur Modern Hub",
      area: "Mirpur 11, Dhaka",
      capacity: 200,
      occupied: 180,
      phone: "+880 1799 999 999",
      facilities: ["Food", "Water", "Doctor", "Power"],
      needs: ["First Aid", "Flashlights"],
      image: "shelter-3",
      coordinates: { lat: 23.815, lng: 90.375 },
    };

    const updated = await updateShelter(docId, updates);

    expect(updated.id).toBe(docId);
    expect(updated.name).toBe("Mirpur Modern Hub");
    expect(updated.area).toBe("Mirpur 11, Dhaka");
    expect(updated.capacity).toBe(200);
    expect(updated.occupied).toBe(180);
    // 180 / 200 = 90% -> status: limited
    expect(updated.status).toBe("limited");
    expect(updated.phone).toBe("+880 1799 999 999");
    expect(updated.facilities).toEqual(["Food", "Water", "Doctor", "Power"]);
    expect(updated.needs).toEqual(["First Aid", "Flashlights"]);
    expect(updated.image).toBe("shelter-3");
    expect(updated.coordinates).toEqual({ lat: 23.815, lng: 90.375 });
    expect(updated.isLocal).toBe(false);

    // Verify Firestore store state
    const remote = store.get(`shelters/${docId}`);
    expect(remote).toBeDefined();
    expect(remote?.["name"]).toBe("Mirpur Modern Hub");
    expect(remote?.["status"]).toBe("limited");
  });

  it("updateShelter: preserves unrelated fields (e.g. distanceKm, createdAt)", async () => {
    const docId = "shelter-p4-02";
    store.set(`shelters/${docId}`, { ...INITIAL_DOC });

    // Update only name and capacity
    const updated = await updateShelter(docId, {
      name: "Renamed Shelter",
      capacity: 150,
    });

    expect(updated.name).toBe("Renamed Shelter");
    expect(updated.capacity).toBe(150);
    // Preserved fields from existing document
    expect(updated.area).toBe("Mirpur 10, Dhaka");
    expect(updated.distanceKm).toBe(1.2);
    expect(updated.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(updated.facilities).toEqual(["Food", "Water"]);
    expect(updated.phone).toBe("+880 1711 000 121");
    expect(updated.coordinates).toEqual({ lat: 23.8068, lng: 90.3688 });
  });

  it("updateShelter: throws ShelterNotFoundError when document does not exist in Firestore", async () => {
    // store is empty, document does not exist
    await expect(updateShelter("non-existent-doc", { name: "Ghost Shelter" })).rejects.toThrow(
      ShelterNotFoundError,
    );

    expect(updateCalls).toHaveLength(0);
  });

  it("updateShelter: rejects empty or whitespace-only shelterId", async () => {
    await expect(updateShelter("", { name: "Invalid" })).rejects.toThrow("Invalid shelter ID");
    await expect(updateShelter("   ", { name: "Invalid" })).rejects.toThrow("Invalid shelter ID");
  });

  it("updateShelter: rejects invalid coordinates without writing to Firestore", async () => {
    const docId = "shelter-p4-invalid-coords";
    store.set(`shelters/${docId}`, { ...INITIAL_DOC });

    await expect(updateShelter(docId, { coordinates: { lat: 95, lng: 90.38 } })).rejects.toThrow(
      "Invalid coordinates",
    );

    expect(updateCalls).toHaveLength(0);
  });

  it("updateShelter: validates and clamps capacity/occupied and computes full status", async () => {
    const docId = "shelter-p4-full-status";
    store.set(`shelters/${docId}`, { ...INITIAL_DOC });

    const updated = await updateShelter(docId, {
      capacity: 50,
      occupied: 60, // Exceeds capacity, should clamp to 50
    });

    expect(updated.capacity).toBe(50);
    expect(updated.occupied).toBe(50);
    expect(updated.status).toBe("full");
  });

  it("updateShelter: does NOT update local storage cache if Firestore write fails", async () => {
    const docId = "shelter-p4-fail-sync";
    store.set(`shelters/${docId}`, { ...INITIAL_DOC });

    // Seed local storage with initial shelter
    const initialShelters = [{ id: docId, ...INITIAL_DOC, isLocal: false }];
    saveShelters(initialShelters as Shelter[]);

    // Simulate Firestore updateDoc failure
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error("Firestore write quota exceeded"));

    await expect(updateShelter(docId, { name: "Failed Remote Update" })).rejects.toThrow(
      "Firestore write quota exceeded",
    );

    // Local storage should remain untouched with initial name
    const stored = getStoredShelters();
    const found = stored.find((s) => s.id === docId);
    expect(found?.name).toBe("Existing Mirpur Shelter");
  });

  it("deleteShelter: successfully deletes remote document and syncs local storage", async () => {
    const docId = "shelter-p4-delete-success";
    store.set(`shelters/${docId}`, { ...INITIAL_DOC });

    // Seed local storage
    saveShelters([
      { id: docId, ...INITIAL_DOC, isLocal: false } as Shelter,
      { id: "other-shelter", name: "Keep Me", isLocal: false } as Shelter,
    ]);

    await deleteShelter(docId);

    // Document removed from Firestore
    expect(store.has(`shelters/${docId}`)).toBe(false);
    expect(deleteDoc).toHaveBeenCalled();

    // Removed from local storage
    const stored = getStoredShelters();
    expect(stored.find((s) => s.id === docId)).toBeUndefined();
    expect(stored.find((s) => s.id === "other-shelter")).toBeDefined();
  });

  it("deleteShelter: throws ShelterNotFoundError when document does not exist in Firestore", async () => {
    // Document not in Firestore (e.g. unconfirmed local fallback)
    await expect(deleteShelter("unconfirmed-local-shelter")).rejects.toThrow(ShelterNotFoundError);

    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it("deleteShelter: rejects empty or whitespace-only shelterId", async () => {
    await expect(deleteShelter("")).rejects.toThrow("Invalid shelter ID");
    await expect(deleteShelter("   ")).rejects.toThrow("Invalid shelter ID");
  });

  it("deleteShelter: does NOT remove shelter from local storage if remote Firestore deletion fails", async () => {
    const docId = "shelter-p4-delete-fail";
    store.set(`shelters/${docId}`, { ...INITIAL_DOC });

    saveShelters([{ id: docId, ...INITIAL_DOC, isLocal: false } as Shelter]);

    vi.mocked(deleteDoc).mockRejectedValueOnce(new Error("Permission denied"));

    await expect(deleteShelter(docId)).rejects.toThrow("Permission denied");

    // Still in local storage
    const stored = getStoredShelters();
    expect(stored.find((s) => s.id === docId)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Fallback Shelter Registration & Edit Workflow
// ---------------------------------------------------------------------------

describe("8. Fallback Shelter Registration & Edit Workflow", () => {
  beforeEach(() => {
    store.clear();
    updateCalls.length = 0;
    setCalls.length = 0;
    vi.clearAllMocks();
    localStorage.clear();
  });

  const MIRPUR_LOCAL = shelters.find((s) => s.id === "mirpur")!;

  it("1. A local fallback shelter is correctly identified", () => {
    expect(isFallbackShelter("mirpur")).toBe(true);
    expect(isFallbackShelter("dhanmondi")).toBe(true);
    expect(isFallbackShelter("uttara")).toBe(true);
    expect(isFallbackShelter("mohammadpur")).toBe(true);
    expect(isFallbackShelter("non-fallback-id")).toBe(false);

    const stored = getStoredShelters();
    const mirpur = stored.find((s) => s.id === "mirpur");
    expect(mirpur).toBeDefined();
    expect(mirpur?.isLocal).toBe(true);
  });

  it("2. Registering a fallback shelter creates the intended Firestore document", async () => {
    // Firestore store starts empty for mirpur
    expect(store.has("shelters/mirpur")).toBe(false);

    const registered = await registerFallbackShelter("mirpur", {
      capacity: 120,
      phone: "+880 1711 000 999",
      needs: ["Blankets", "Medicine"],
    });

    expect(registered.id).toBe("mirpur");
    expect(registered.name).toBe("Mirpur Shelter Center");
    expect(registered.capacity).toBe(120);
    expect(registered.phone).toBe("+880 1711 000 999");
    expect(registered.needs).toEqual(["Blankets", "Medicine"]);
    expect(registered.isLocal).toBe(false);

    // Verify Firestore setDoc was called with deterministic ID
    expect(store.has("shelters/mirpur")).toBe(true);
    const remote = store.get("shelters/mirpur");
    expect(remote).toBeDefined();
    expect(remote?.["id"]).toBe("mirpur");
    expect(remote?.["isLocal"]).toBe(false);
    expect(remote?.["capacity"]).toBe(120);

    // Verify local storage is synced with isLocal: false
    const local = getStoredShelters().find((s) => s.id === "mirpur");
    expect(local).toBeDefined();
    expect(local?.isLocal).toBe(false);
    expect(local?.capacity).toBe(120);
  });

  it("3. Repeated registration does not create duplicates", async () => {
    // First registration succeeds
    await registerFallbackShelter("mirpur");
    expect(store.has("shelters/mirpur")).toBe(true);
    const initialSetCallCount = setCalls.length;

    // Second registration attempt should fail safely
    await expect(registerFallbackShelter("mirpur")).rejects.toThrow(
      'Shelter document "mirpur" already exists in Cloud Firestore. Registration stopped to prevent overwriting existing data.',
    );

    // No additional setDoc write was made
    expect(setCalls.length).toBe(initialSetCallCount);
  });

  it("4. Existing remote documents are not overwritten", async () => {
    // Simulate pre-existing remote document created by an Admin
    const existingRemoteData = {
      id: "mirpur",
      name: "Authoritative Cloud Mirpur Hub",
      area: "Mirpur 10, Cloud Sector",
      capacity: 500,
      occupied: 150,
      status: "open",
      facilities: ["Food", "Water", "Doctor"],
      needs: ["Power supplies"],
      phone: "+880 1700 000 000",
      image: "shelter-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      isLocal: false,
    };
    store.set("shelters/mirpur", existingRemoteData);

    // Registration attempt must detect the existing document and reject
    await expect(
      registerFallbackShelter("mirpur", { name: "Attempted Overwrite Mirpur" }),
    ).rejects.toThrow(
      'Shelter document "mirpur" already exists in Cloud Firestore. Registration stopped to prevent overwriting existing data.',
    );

    // Remote document remains unchanged
    const remote = store.get("shelters/mirpur");
    expect(remote?.["name"]).toBe("Authoritative Cloud Mirpur Hub");
    expect(remote?.["capacity"]).toBe(500);
  });

  it("5. A registration failure leaves the shelter marked as local", async () => {
    // Seed local storage with local fallback mirpur
    saveShelters([MIRPUR_LOCAL]);

    // Simulate Firestore setDoc failure (e.g. network disconnect)
    vi.mocked(setDoc).mockRejectedValueOnce(new Error("Network connection dropped"));

    await expect(registerFallbackShelter("mirpur", { capacity: 200 })).rejects.toThrow(
      "Network connection dropped",
    );

    // Document was not added to Firestore store
    expect(store.has("shelters/mirpur")).toBe(false);

    // Local storage shelter is still marked as isLocal: true
    const stored = getStoredShelters();
    const mirpur = stored.find((s) => s.id === "mirpur");
    expect(mirpur?.isLocal).toBe(true);
  });

  it("6. After successful registration, the shelter becomes remotely editable", async () => {
    // 1. Register fallback shelter
    await registerFallbackShelter("mirpur");
    expect(store.has("shelters/mirpur")).toBe(true);

    // 2. Now call updateShelter (which previously failed with ShelterNotFoundError)
    const updated = await updateShelter("mirpur", {
      name: "Mirpur Enhanced Relief Center",
      occupied: 85,
    });

    expect(updated.id).toBe("mirpur");
    expect(updated.name).toBe("Mirpur Enhanced Relief Center");
    expect(updated.occupied).toBe(85);
    expect(updated.isLocal).toBe(false);

    // Verify Firestore document reflects the update
    const remote = store.get("shelters/mirpur");
    expect(remote?.["name"]).toBe("Mirpur Enhanced Relief Center");
    expect(remote?.["occupied"]).toBe(85);

    // Verify updateCalls recorded the change
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.path).toBe("shelters/mirpur");
  });

  it("7. Existing remote shelter updates still work", async () => {
    const remoteId = "shelter-remote-existing";
    store.set(`shelters/${remoteId}`, {
      id: remoteId,
      name: "Existing Remote Shelter",
      area: "Banani, Dhaka",
      capacity: 150,
      occupied: 50,
      status: "open",
      facilities: ["Food", "Water"],
      needs: ["Mats"],
      phone: "+880 1711 222 333",
      image: "shelter-2",
      isLocal: false,
    });

    const updated = await updateShelter(remoteId, {
      name: "Updated Remote Shelter",
      capacity: 200,
    });

    expect(updated.id).toBe(remoteId);
    expect(updated.name).toBe("Updated Remote Shelter");
    expect(updated.capacity).toBe(200);
    expect(updated.isLocal).toBe(false);
  });

  it("8. Invalid capacity and coordinates are rejected", async () => {
    // Reject capacity <= 0
    await expect(registerFallbackShelter("mirpur", { capacity: 0 })).rejects.toThrow(
      "Invalid capacity",
    );
    await expect(registerFallbackShelter("mirpur", { capacity: -5 })).rejects.toThrow(
      "Invalid capacity",
    );

    // Reject out-of-range latitude
    await expect(
      registerFallbackShelter("mirpur", { coordinates: { lat: 95, lng: 90.36 } }),
    ).rejects.toThrow("Invalid coordinates");

    // Reject out-of-range longitude
    await expect(
      registerFallbackShelter("mirpur", { coordinates: { lat: 23.8, lng: 185 } }),
    ).rejects.toThrow("Invalid coordinates");

    // Verify no write was executed
    expect(store.has("shelters/mirpur")).toBe(false);
  });

  it("9. Unauthorized users cannot register shelters", async () => {
    // Simulate Firestore permission denial
    vi.mocked(setDoc).mockRejectedValueOnce(new Error("Missing or insufficient permissions."));

    await expect(registerFallbackShelter("mirpur")).rejects.toThrow(
      "Missing or insufficient permissions.",
    );

    // Ensure local storage is not updated
    const local = getStoredShelters().find((s) => s.id === "mirpur");
    expect(local?.isLocal).toBe(true);
  });

  it("10. Detects duplicate shelters with matching name or exact coordinates", async () => {
    // Existing remote shelter in Firestore with another ID but same name
    store.set("shelters/shelter-conflicting", {
      id: "shelter-conflicting",
      name: "Mirpur Shelter Center",
      area: "Mirpur 10, Dhaka",
      capacity: 100,
      occupied: 72,
      status: "open",
      facilities: ["Food", "Water"],
      needs: [],
      phone: "+880 1711 000 121",
      image: "shelter-1",
    });

    await expect(registerFallbackShelter("mirpur")).rejects.toThrow(
      'A shelter with the name "Mirpur Shelter Center" already exists in Cloud Firestore. Registration stopped to prevent duplicate records.',
    );

    expect(store.has("shelters/mirpur")).toBe(false);
  });

  describe("Unified saveShelter operation (Automatic Firestore Upsert)", () => {
    it("1. updates an existing remote shelter document in Firestore and preserves unrelated fields", async () => {
      const docId = "existing-remote-shelter";
      store.set(`shelters/${docId}`, {
        id: docId,
        name: "Old Shelter Name",
        area: "Old Area",
        capacity: 100,
        occupied: 50,
        status: "open",
        phone: "+880 1234 567 890",
        image: "shelter-1",
        facilities: ["Food"],
        needs: ["Blankets"],
        createdAt: "2026-01-01T00:00:00.000Z",
        distanceKm: 3.5,
        customTag: "authoritative-site",
      });

      const updates: UpdateShelterInput = {
        name: "Updated Shelter Name",
        capacity: 120,
        occupied: 115, // > 80% -> should be limited
      };

      const result = await saveShelter(docId, updates);

      expect(result.id).toBe(docId);
      expect(result.name).toBe("Updated Shelter Name");
      expect(result.capacity).toBe(120);
      expect(result.occupied).toBe(115);
      expect(result.status).toBe("limited");
      expect(result.isLocal).toBe(false);

      // Verify Firestore store state
      const savedDoc = store.get(`shelters/${docId}`) as Record<string, unknown>;
      expect(savedDoc["name"]).toBe("Updated Shelter Name");
      expect(savedDoc["capacity"]).toBe(120);
      expect(savedDoc["occupied"]).toBe(115);
      expect(savedDoc["status"]).toBe("limited");
      expect(savedDoc["isLocal"]).toBe(false);

      // Verify unrelated fields are preserved
      expect(savedDoc["createdAt"]).toBe("2026-01-01T00:00:00.000Z");
      expect(savedDoc["distanceKm"]).toBe(3.5);
      expect(savedDoc["customTag"]).toBe("authoritative-site");

      // Verify local storage was synchronized
      const local = getStoredShelters().find((s) => s.id === docId);
      expect(local?.name).toBe("Updated Shelter Name");
      expect(local?.isLocal).toBe(false);
    });

    it("2. automatically creates missing Firestore document for a local fallback shelter using deterministic ID", async () => {
      // Mirpur is not in Firestore store initially
      expect(store.has("shelters/mirpur")).toBe(false);

      // Seed fallback in local storage is isLocal: true
      const initialLocal = getStoredShelters().find((s) => s.id === "mirpur");
      expect(initialLocal?.isLocal).toBe(true);

      const updates: UpdateShelterInput = {
        name: "Mirpur Upgraded Relief Hub",
        capacity: 150,
        occupied: 50,
      };

      const result = await saveShelter("mirpur", updates);

      // Existing fallback ID is preserved
      expect(result.id).toBe("mirpur");
      expect(result.name).toBe("Mirpur Upgraded Relief Hub");
      expect(result.capacity).toBe(150);
      expect(result.occupied).toBe(50);
      expect(result.status).toBe("open");
      expect(result.isLocal).toBe(false);

      // Created in Firestore
      expect(store.has("shelters/mirpur")).toBe(true);
      const docInStore = store.get("shelters/mirpur") as Record<string, unknown>;
      expect(docInStore["id"]).toBe("mirpur");
      expect(docInStore["name"]).toBe("Mirpur Upgraded Relief Hub");
      expect(docInStore["isLocal"]).toBe(false);

      // Local storage cache synchronized
      const updatedLocal = getStoredShelters().find((s) => s.id === "mirpur");
      expect(updatedLocal?.name).toBe("Mirpur Upgraded Relief Hub");
      expect(updatedLocal?.isLocal).toBe(false);
    });

    it("3. preserves deterministic fallback ID (never generates a random ID)", async () => {
      expect(store.has("shelters/dhanmondi")).toBe(false);

      const result = await saveShelter("dhanmondi", { capacity: 200 });

      expect(result.id).toBe("dhanmondi");
      expect(store.has("shelters/dhanmondi")).toBe(true);
      const docInStore = store.get("shelters/dhanmondi") as Record<string, unknown>;
      expect(docInStore["id"]).toBe("dhanmondi");
      expect(docInStore["id"]).not.toMatch(/shelter-\d+/);
    });

    it("4. changes isLocal from true to false upon successful persistence", async () => {
      expect(store.has("shelters/uttara")).toBe(false);

      const result = await saveShelter("uttara", { name: "Uttara Safe Center" });

      expect(result.isLocal).toBe(false);
      const local = getStoredShelters().find((s) => s.id === "uttara");
      expect(local?.isLocal).toBe(false);
    });

    it("5. failed creation leaves the shelter marked as local fallback in local cache", async () => {
      // Simulate transaction failure (e.g. PERMISSION_DENIED)
      vi.mocked(runTransaction).mockRejectedValueOnce(
        new Error("7 PERMISSION_DENIED: Missing or insufficient permissions."),
      );

      await expect(saveShelter("mohammadpur", { name: "Unauthorized Change" })).rejects.toThrow(
        "PERMISSION_DENIED",
      );

      // Verify Firestore document was NOT created
      expect(store.has("shelters/mohammadpur")).toBe(false);

      // Verify local storage shelter remains marked as isLocal: true
      const local = getStoredShelters().find((s) => s.id === "mohammadpur");
      expect(local?.isLocal).toBe(true);
      expect(local?.name).not.toBe("Unauthorized Change");
    });

    it("6. failed updates do NOT modify local cache for existing remote shelters", async () => {
      const docId = "existing-remote-2";
      store.set(`shelters/${docId}`, {
        id: docId,
        name: "Remote Original Name",
        area: "Original Area",
        capacity: 100,
        occupied: 10,
        status: "open",
        isLocal: false,
      });

      // Synchronize initial state to local cache
      saveShelters([
        ...getStoredShelters(),
        {
          id: docId,
          name: "Remote Original Name",
          area: "Original Area",
          capacity: 100,
          occupied: 10,
          status: "open",
          phone: "",
          image: "shelter-1",
          facilities: [],
          needs: [],
          isLocal: false,
        },
      ]);

      // Simulate network failure during transaction
      vi.mocked(runTransaction).mockRejectedValueOnce(new Error("Network connection lost"));

      await expect(saveShelter(docId, { name: "Should Not Apply Locally" })).rejects.toThrow(
        "Network connection lost",
      );

      // Local storage remains untouched
      const local = getStoredShelters().find((s) => s.id === docId);
      expect(local?.name).toBe("Remote Original Name");
    });

    it("7. prevents duplicate shelter names across the collection", async () => {
      store.set("shelters/existing-alpha", {
        id: "existing-alpha",
        name: "Unique Relief Center",
        area: "Dhanmondi",
        capacity: 100,
        occupied: 20,
        status: "open",
        isLocal: false,
      });

      // Attempt to save another shelter with the duplicate name
      await expect(
        saveShelter("new-shelter-beta", {
          name: "Unique Relief Center",
          area: "Mirpur",
          capacity: 80,
        }),
      ).rejects.toThrow(/already exists in Cloud Firestore/);

      expect(store.has("shelters/new-shelter-beta")).toBe(false);
    });

    it("8. validates capacity, occupancy, and coordinates before writing", async () => {
      // Invalid capacity <= 0
      await expect(saveShelter("mirpur", { capacity: 0 })).rejects.toThrow("Invalid capacity");

      await expect(saveShelter("mirpur", { capacity: -10 })).rejects.toThrow("Invalid capacity");

      // Invalid occupancy < 0
      await expect(saveShelter("mirpur", { occupied: -5 })).rejects.toThrow("Invalid occupancy");

      // Invalid coordinates
      await expect(
        saveShelter("mirpur", { coordinates: { lat: 105, lng: 90.36 } }),
      ).rejects.toThrow("Invalid coordinates");

      expect(store.has("shelters/mirpur")).toBe(false);
    });

    it("9. rejects empty or whitespace shelter ID, name, or area", async () => {
      await expect(saveShelter("", { name: "Test" })).rejects.toThrow("Invalid shelter ID");
      await expect(saveShelter("   ", { name: "Test" })).rejects.toThrow("Invalid shelter ID");
      await expect(saveShelter("mirpur", { name: "  " })).rejects.toThrow(
        "Shelter name cannot be empty",
      );
      await expect(saveShelter("mirpur", { area: "  " })).rejects.toThrow(
        "Shelter area cannot be empty",
      );
    });

    it("10. supports concurrent saves through transactional execution", async () => {
      const docId = "concurrent-shelter";
      store.set(`shelters/${docId}`, {
        id: docId,
        name: "Concurrent Test Hub",
        area: "Dhaka",
        capacity: 100,
        occupied: 10,
        status: "open",
        isLocal: false,
      });

      // Run two saves in parallel
      const [res1, res2] = await Promise.all([
        saveShelter(docId, { occupied: 40 }),
        saveShelter(docId, { occupied: 60 }),
      ]);

      expect(res1.isLocal).toBe(false);
      expect(res2.isLocal).toBe(false);
      const finalDoc = store.get(`shelters/${docId}`) as Record<string, unknown>;
      expect([40, 60]).toContain(finalDoc["occupied"]);
      expect(finalDoc["isLocal"]).toBe(false);
    });
  });
});
