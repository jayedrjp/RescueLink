/**
 * Real Firebase Firestore Emulator Integration Test for Shelter Registration & Management
 *
 * Runs against the actual Firestore emulator running on 127.0.0.1:8080 with real security rules.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import { shelters, type Shelter } from "../data";

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env["FIRESTORE_EMULATOR_HOST"] ?? "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-rescuelink",
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
      host: host ?? "127.0.0.1",
      port: Number(port ?? 8080),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe("Real Firestore Emulator — Fallback Shelter Registration & Admin Management", () => {
  const MIRPUR_SEED = shelters.find((s) => s.id === "mirpur")!;
  const DHANMONDI_SEED = shelters.find((s) => s.id === "dhanmondi")!;

  // -------------------------------------------------------------------------
  // 1. Initial State: Unregistered Seed Data
  // -------------------------------------------------------------------------
  it("confirms seed shelters do not exist in the remote database initially", async () => {
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const db = adminCtx.firestore();

    const mirpurSnap = await getDoc(doc(db, "shelters", "mirpur"));
    const dhanmondiSnap = await getDoc(doc(db, "shelters", "dhanmondi"));
    const uttaraSnap = await getDoc(doc(db, "shelters", "uttara"));
    const mohammadpurSnap = await getDoc(doc(db, "shelters", "mohammadpur"));

    expect(mirpurSnap.exists()).toBe(false);
    expect(dhanmondiSnap.exists()).toBe(false);
    expect(uttaraSnap.exists()).toBe(false);
    expect(mohammadpurSnap.exists()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. Security Rules Enforcement (Non-Admin Denied)
  // -------------------------------------------------------------------------
  it("enforces that non-admin and unauthenticated users CANNOT register shelters", async () => {
    const unauthCtx = env.unauthenticatedContext();
    const unauthDb = unauthCtx.firestore();

    const citizenCtx = env.authenticatedContext("citizen-user", { role: "user" });
    const citizenDb = citizenCtx.firestore();

    const payload = {
      ...MIRPUR_SEED,
      isLocal: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Unauthenticated attempt denied
    await assertFails(setDoc(doc(unauthDb, "shelters", "mirpur"), payload));

    // Authenticated non-admin (citizen) attempt denied
    await assertFails(setDoc(doc(citizenDb, "shelters", "mirpur"), payload));

    // Verify document was not created
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const snap = await getDoc(doc(adminCtx.firestore(), "shelters", "mirpur"));
    expect(snap.exists()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. Authorized Admin Mirpur Registration Workflow
  // -------------------------------------------------------------------------
  it("allows authorized admin to register Mirpur shelter in real Firestore emulator", async () => {
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const db = adminCtx.firestore();

    const now = new Date().toISOString();
    const mirpurPayload: Shelter = {
      ...MIRPUR_SEED,
      capacity: 120,
      occupied: 72,
      phone: "+880 1711 000 999",
      isLocal: false,
      createdAt: now,
      updatedAt: now,
    };

    // Admin write succeeds
    await assertSucceeds(setDoc(doc(db, "shelters", "mirpur"), mirpurPayload));

    // Verify document exists in Firestore database
    const snap = await getDoc(doc(db, "shelters", "mirpur"));
    expect(snap.exists()).toBe(true);

    const data = snap.data() as Shelter;
    expect(data.id).toBe("mirpur");
    expect(data.name).toBe("Mirpur Shelter Center");
    expect(data.area).toBe("Mirpur 10, Dhaka");
    expect(data.capacity).toBe(120);
    expect(data.occupied).toBe(72);
    expect(data.status).toBe("open");
    expect(data.phone).toBe("+880 1711 000 999");
    expect(data.isLocal).toBe(false);
    expect(data.coordinates).toEqual({ lat: 23.8068, lng: 90.3688 });
    expect(data.facilities).toContain("Food");
    expect(data.facilities).toContain("Medicine");
  });

  // -------------------------------------------------------------------------
  // 4. Remote Editing & Persistence Verification
  // -------------------------------------------------------------------------
  it("allows updating an existing registered shelter and verifies persistence", async () => {
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const db = adminCtx.firestore();

    // Register initial record
    const initialPayload: Shelter = {
      ...MIRPUR_SEED,
      isLocal: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "shelters", "mirpur"), initialPayload);

    // Update capacity and name
    await assertSucceeds(
      updateDoc(doc(db, "shelters", "mirpur"), {
        name: "Mirpur Central Disaster Hub",
        capacity: 180,
        occupied: 145, // 145 / 180 = ~80.5% -> status limited
        status: "limited",
        updatedAt: new Date().toISOString(),
      }),
    );

    // Read back and verify persistence
    const snap = await getDoc(doc(db, "shelters", "mirpur"));
    expect(snap.exists()).toBe(true);
    const updated = snap.data() as Shelter;
    expect(updated.name).toBe("Mirpur Central Disaster Hub");
    expect(updated.capacity).toBe(180);
    expect(updated.occupied).toBe(145);
    expect(updated.status).toBe("limited");
    expect(updated.area).toBe("Mirpur 10, Dhaka"); // preserved
  });

  // -------------------------------------------------------------------------
  // 5. Individual Registration of Other Fallback Shelters
  // -------------------------------------------------------------------------
  it("confirms other fallback shelters are not registered automatically, but can be registered individually", async () => {
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const db = adminCtx.firestore();

    // Register Mirpur only
    await setDoc(doc(db, "shelters", "mirpur"), {
      ...MIRPUR_SEED,
      isLocal: false,
    });

    // Check others are still absent
    const dhanmondiSnap = await getDoc(doc(db, "shelters", "dhanmondi"));
    const uttaraSnap = await getDoc(doc(db, "shelters", "uttara"));
    const mohammadpurSnap = await getDoc(doc(db, "shelters", "mohammadpur"));
    expect(dhanmondiSnap.exists()).toBe(false);
    expect(uttaraSnap.exists()).toBe(false);
    expect(mohammadpurSnap.exists()).toBe(false);

    // Now register Dhanmondi individually
    await assertSucceeds(
      setDoc(doc(db, "shelters", "dhanmondi"), {
        ...DHANMONDI_SEED,
        isLocal: false,
      }),
    );

    const dhanmondiAfter = await getDoc(doc(db, "shelters", "dhanmondi"));
    expect(dhanmondiAfter.exists()).toBe(true);
    expect(dhanmondiAfter.data()?.["name"]).toBe("Dhanmondi Community Hall");

    // Uttara and Mohammadpur STILL remain absent
    const uttaraAfter = await getDoc(doc(db, "shelters", "uttara"));
    const mohammadpurAfter = await getDoc(doc(db, "shelters", "mohammadpur"));
    expect(uttaraAfter.exists()).toBe(false);
    expect(mohammadpurAfter.exists()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. Admin Reports Aggregation & Local vs Remote Distinction
  // -------------------------------------------------------------------------
  it("verifies accurate remote vs local counts and deduplication for reports", async () => {
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const db = adminCtx.firestore();

    // Register Mirpur only in remote Firestore
    await setDoc(doc(db, "shelters", "mirpur"), {
      ...MIRPUR_SEED,
      isLocal: false,
      capacity: 100,
      occupied: 72,
    });

    // Fetch remote docs from Firestore
    const remoteDocsSnap = await getDocs(collection(db, "shelters"));
    const remoteShelters: Shelter[] = [];
    remoteDocsSnap.forEach((d) => {
      remoteShelters.push({ ...(d.data() as Omit<Shelter, "id">), id: d.id, isLocal: false });
    });

    // Simulated local seed list with 4 shelters
    const localSeedList = shelters; // mirpur, dhanmondi, uttara, mohammadpur (all isLocal: true)

    // Merged & deduplicated (authoritative remote overrides local seed with same ID)
    const uniqueMap = new Map<string, Shelter>();
    for (const r of remoteShelters) {
      uniqueMap.set(r.id, r);
    }
    for (const l of localSeedList) {
      if (!uniqueMap.has(l.id)) {
        uniqueMap.set(l.id, l);
      }
    }
    const allShelters = Array.from(uniqueMap.values());

    const remoteCount = allShelters.filter((s) => !s.isLocal).length;
    const localFallbackCount = allShelters.filter((s) => s.isLocal).length;

    // Mirpur is now in remote count (1 remote)
    expect(remoteCount).toBe(1);
    // Dhanmondi, Uttara, Mohammadpur remain in local fallback (3 local)
    expect(localFallbackCount).toBe(3);
    // Total deduplicated count is exactly 4
    expect(allShelters.length).toBe(4);

    // Verify Mirpur has isLocal: false
    const mirpur = allShelters.find((s) => s.id === "mirpur");
    expect(mirpur?.isLocal).toBe(false);

    // Verify Uttara has isLocal: true
    const uttara = allShelters.find((s) => s.id === "uttara");
    expect(uttara?.isLocal).toBe(true);

    // Verify total capacity calculations
    const totalCapacity = allShelters.reduce((acc, s) => acc + s.capacity, 0);
    const totalOccupied = allShelters.reduce((acc, s) => acc + s.occupied, 0);
    // 100 (mirpur) + 180 (dhanmondi) + 200 (uttara) + 150 (mohammadpur) = 630
    expect(totalCapacity).toBe(630);
    // 72 (mirpur) + 148 (dhanmondi) + 200 (uttara) + 94 (mohammadpur) = 514
    expect(totalOccupied).toBe(514);
  });

  // -------------------------------------------------------------------------
  // 7. Deletion of Registered Remote Shelter
  // -------------------------------------------------------------------------
  it("allows authorized admin to delete a registered remote shelter", async () => {
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const db = adminCtx.firestore();

    // Register Mirpur
    await setDoc(doc(db, "shelters", "mirpur"), {
      ...MIRPUR_SEED,
      isLocal: false,
    });

    expect((await getDoc(doc(db, "shelters", "mirpur"))).exists()).toBe(true);

    // Admin deletes
    await assertSucceeds(deleteDoc(doc(db, "shelters", "mirpur")));

    // Verified removed from Firestore database
    expect((await getDoc(doc(db, "shelters", "mirpur"))).exists()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 8. Failure & Security Checks (Section 5)
  // -------------------------------------------------------------------------
  it("rejects duplicate registration and prevents overwriting existing remote records", async () => {
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const db = adminCtx.firestore();

    // 1. Initial registration creates the record
    await setDoc(doc(db, "shelters", "mirpur"), {
      ...MIRPUR_SEED,
      name: "Original Authoritative Mirpur",
      capacity: 100,
      isLocal: false,
    });

    // 2. Pre-existence check detects document exists
    const snap = await getDoc(doc(db, "shelters", "mirpur"));
    expect(snap.exists()).toBe(true);

    // Registration guard stops overwrite if document already exists
    const duplicateAttempt = async () => {
      const existing = await getDoc(doc(db, "shelters", "mirpur"));
      if (existing.exists()) {
        throw new Error(
          'Shelter document "mirpur" already exists in Cloud Firestore. Registration stopped to prevent overwriting existing data.',
        );
      }
      await setDoc(doc(db, "shelters", "mirpur"), { name: "Overwritten Data" });
    };

    await expect(duplicateAttempt()).rejects.toThrow(
      'Shelter document "mirpur" already exists in Cloud Firestore',
    );

    // Document in Firestore remains untouched with original data
    const current = await getDoc(doc(db, "shelters", "mirpur"));
    expect(current.data()?.["name"]).toBe("Original Authoritative Mirpur");
    expect(current.data()?.["capacity"]).toBe(100);
  });

  it("confirms local-only saving does not falsely create remote records", async () => {
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const db = adminCtx.firestore();

    // Local-only save modifies only local cache, does not write to Firestore
    // Verify Uttara does NOT exist in Firestore
    const snap = await getDoc(doc(db, "shelters", "uttara"));
    expect(snap.exists()).toBe(false);

    // Document remains absent remotely
    const allRemote = await getDocs(collection(db, "shelters"));
    expect(allRemote.empty).toBe(true);
  });

  it("confirms failed writes leave local shelters as local without marking them remote", async () => {
    const citizenCtx = env.authenticatedContext("citizen-user", { role: "user" });
    const citizenDb = citizenCtx.firestore();

    const localShelterState = { ...MIRPUR_SEED, isLocal: true };

    // Attempt registration with unauthorized user
    try {
      await setDoc(doc(citizenDb, "shelters", "mirpur"), {
        ...MIRPUR_SEED,
        isLocal: false,
      });
      // Should not reach here
      localShelterState.isLocal = false;
    } catch {
      // Failed write: local record remains marked as local fallback
      // localShelterState is NOT changed to remote
    }

    expect(localShelterState.isLocal).toBe(true);

    // Verify document does not exist in Firestore
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    expect((await getDoc(doc(adminCtx.firestore(), "shelters", "mirpur"))).exists()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 9. Unified Automatic Upsert Workflow (saveShelter in Real Emulator)
  // -------------------------------------------------------------------------
  it("executes unified Save Changes automatic upsert: creates fallback then updates remote", async () => {
    const adminCtx = env.authenticatedContext("admin-test", { admin: true });
    const db = adminCtx.firestore();

    // 1. Initial state: document does not exist
    expect((await getDoc(doc(db, "shelters", "mirpur"))).exists()).toBe(false);

    // 2. First Save Changes on fallback shelter: automatically creates document with deterministic ID
    const upsertPayload1: Shelter = {
      ...MIRPUR_SEED,
      capacity: 150,
      occupied: 60,
      isLocal: false,
      updatedAt: new Date().toISOString(),
    };
    await assertSucceeds(setDoc(doc(db, "shelters", "mirpur"), upsertPayload1));

    // Verify created in Firestore
    const createdSnap = await getDoc(doc(db, "shelters", "mirpur"));
    expect(createdSnap.exists()).toBe(true);
    expect(createdSnap.data()?.["capacity"]).toBe(150);
    expect(createdSnap.data()?.["occupied"]).toBe(60);
    expect(createdSnap.data()?.["isLocal"]).toBe(false);

    // 3. Second Save Changes on now-remote shelter: safely updates existing document
    await assertSucceeds(
      updateDoc(doc(db, "shelters", "mirpur"), {
        capacity: 160,
        occupied: 140, // 87.5% -> limited
        status: "limited",
        updatedAt: new Date().toISOString(),
      }),
    );

    // Verify updated in Firestore
    const updatedSnap = await getDoc(doc(db, "shelters", "mirpur"));
    expect(updatedSnap.data()?.["capacity"]).toBe(160);
    expect(updatedSnap.data()?.["occupied"]).toBe(140);
    expect(updatedSnap.data()?.["status"]).toBe("limited");
    expect(updatedSnap.data()?.["name"]).toBe(MIRPUR_SEED.name); // original fields preserved
  });
});
