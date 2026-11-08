/**
 * Client <-> rules compatibility: runs the app's REAL service functions against a fake Firestore
 * that evaluates every get/create/update/delete with the REAL firestore.rules (via the local
 * evaluator). Catches schema drift between the client code and the security rules.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluate, parseRules, type Doc } from "./rules/rules-eval";
import { actors, seed, type ScenarioActor } from "./rules/rules.scenarios";

const rules = parseRules(readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"));
const store = new Map<string, Doc>();
let actor: ScenarioActor | null = null;

const denied = () =>
  Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function check(
  op: "get" | "create" | "update" | "delete",
  path: string,
  before: Doc | undefined,
  after?: Doc,
) {
  const d = evaluate(rules, { op, path, actor, before, after, db: store });
  if (!d.allowed) throw denied();
}

function mergeDotted(base: Doc, patch: Record<string, unknown>): Doc {
  const out = clone(base);
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split(".");
    let cur = out as Record<string, unknown>;
    for (const p of parts.slice(0, -1)) {
      cur[p] = { ...((cur[p] as Doc) ?? {}) };
      cur = cur[p] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]!] = clone(v);
  }
  return out;
}

function writeDoc(path: string, data: Doc, replace: boolean) {
  const before = store.get(path);
  if (replace) {
    if (before) check("update", path, before, data);
    else check("create", path, undefined, data);
    store.set(path, clone(data));
  } else {
    if (!before) throw Object.assign(new Error("not-found"), { code: "not-found" });
    const after = mergeDotted(before, data);
    check("update", path, before, after);
    store.set(path, after);
  }
}

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
    doc: (_d: unknown, ...segs: string[]) =>
      segs.length ? ref(segs.join("/")) : ref(`sos_requests/auto${store.size}`),
    getDoc: async (r: { path: string }) => {
      check("get", r.path, store.get(r.path));
      return snap(r.path);
    },
    getDocFromServer: async (r: { path: string }) => {
      check("get", r.path, store.get(r.path));
      return snap(r.path);
    },
    getDocs: vi.fn(),
    addDoc: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    onSnapshot: vi.fn(),
    setDoc: async (r: { path: string }, data: Doc) => writeDoc(r.path, data, true),
    updateDoc: async (r: { path: string }, data: Doc) => writeDoc(r.path, data, false),
    runTransaction: async (
      _d: unknown,
      fn: (tx: {
        get: (r: { path: string }) => Promise<unknown>;
        set: (r: { path: string }, d: Doc) => void;
        update: (r: { path: string }, d: Doc) => void;
      }) => Promise<void>,
    ) => {
      const pending: Array<() => void> = [];
      await fn({
        get: async (r) => {
          check("get", r.path, store.get(r.path));
          return snap(r.path);
        },
        set: (r, d) => pending.push(() => writeDoc(r.path, d, true)),
        update: (r, d) => pending.push(() => writeDoc(r.path, d, false)),
      });
      pending.forEach((f) => f());
    },
  };
});

import {
  cancelSosRequest,
  claimSosRequest,
  createSosRequest,
  createUserProfile,
  ensureUserProfile,
  resolveSosRequest,
  setVolunteerStatus,
  submitVolunteerApplication,
  updateSosLocation,
  updateSosStatus,
  updateUserProfile,
} from "@/lib/firebase/firestore";

const gps = {
  source: "gps" as const,
  address: "Road 5",
  lat: 23.75,
  lng: 90.39,
  accuracyMeters: 12,
};
const asUser = (a: ScenarioActor | null) => (actor = a);
const newSos = (id: string, userId = "citizen1") =>
  createSosRequest({
    requestId: id,
    userId,
    userName: "Citizen",
    userPhone: "+8801712345678",
    userEmail: "c@example.com",
    message: "help",
    location: gps,
  });

beforeEach(() => {
  store.clear();
  for (const [p, d] of Object.entries(seed)) store.set(p, clone(d));
  actor = null;
});

describe("SOS service writes are accepted by the real rules (and abuse is not)", () => {
  it("citizen: create (GPS) -> share location -> close as resolved", async () => {
    asUser(actors.citizen1);
    await newSos("n1");
    expect(store.get("sos_requests/n1")).toMatchObject({ status: "active", userId: "citizen1" });
    await updateSosLocation("n1", { lat: 23.76, lng: 90.4, accuracyMeters: 7.6 });
    expect(store.get("sos_requests/n1")!["location"]).toMatchObject({
      lat: 23.76,
      accuracyMeters: 8,
    });
    await resolveSosRequest("n1", { uid: "citizen1" });
    expect(store.get("sos_requests/n1")).toMatchObject({ status: "resolved" });
  });

  it("citizen: manual-address request is accepted; cancel works", async () => {
    asUser(actors.citizen1);
    await createSosRequest({
      requestId: "m1",
      userId: "citizen1",
      userName: "C",
      location: { source: "manual", address: "House 12, Road 5" },
    });
    await cancelSosRequest("m1", { uid: "citizen1" });
    expect(store.get("sos_requests/m1")).toMatchObject({ status: "cancelled" });
  });

  it("citizen cannot create a request for another user (rules, not just client)", async () => {
    asUser(actors.citizen2);
    await expect(newSos("x1", "citizen1")).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("citizen location writes are refused once the request is closed", async () => {
    asUser(actors.citizen1);
    await expect(updateSosLocation("s-resolved", { lat: 23.9, lng: 90.5 })).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("approved volunteer: accept an active request, then resolve it", async () => {
    asUser(actors.vol1);
    await claimSosRequest("s-active", { uid: "vol1" }, { unit: "Karim", etaMinutes: 12 });
    expect(store.get("sos_requests/s-active")).toMatchObject({ status: "assigned" });
    expect((store.get("sos_requests/s-active")!["assignedResponder"] as Doc)["responderId"]).toBe(
      "vol1",
    );
    await resolveSosRequest("s-active", { uid: "vol1" });
    expect(store.get("sos_requests/s-active")).toMatchObject({ status: "resolved" });
  });

  it("unapproved volunteer (role without approval / pending) is refused by the rules", async () => {
    asUser(actors.volNoStatus);
    await expect(
      claimSosRequest("s-active", { uid: "volNoStatus" }, { unit: "X", etaMinutes: 5 }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    asUser(actors.pending1);
    await expect(
      claimSosRequest("s-active", { uid: "pending1" }, { unit: "X", etaMinutes: 5 }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(store.get("sos_requests/s-active")).toMatchObject({ status: "active" });
  });

  it("admin dispatch screen: assign (unit + ETA, no responder id), resolve, cancel", async () => {
    asUser(actors.admin1);
    await updateSosStatus("s-active", "assigned", { unit: "Unit 04", eta: "7 min" });
    expect(store.get("sos_requests/s-active")).toMatchObject({ status: "assigned" });
    await updateSosStatus("s-active", "resolved");
    await cancelSosRequest("s-manual", { uid: "admin1", isAdmin: true });
    expect(store.get("sos_requests/s-manual")).toMatchObject({ status: "cancelled" });
  });

  it("a volunteer cannot cancel someone else's request via the service", async () => {
    asUser(actors.vol1);
    await expect(cancelSosRequest("s-active", { uid: "vol1" })).rejects.toMatchObject({
      code: "not-authorized",
    });
  });
});

describe("profile service writes are accepted by the real rules (and abuse is not)", () => {
  const newbie = { uid: "newbie", token: { email: "newbie@example.com" } };

  it("registration: createUserProfile creates a valid citizen profile", async () => {
    asUser(newbie);
    await createUserProfile("newbie", {
      email: "Newbie@Example.com",
      displayName: "Newbie",
      phone: "+8801712345678",
      area: "Mirpur",
    });
    expect(store.get("users/newbie")).toMatchObject({
      role: "user",
      volunteerStatus: "none",
      displayName: "Newbie",
    });
  });

  it("registration race: the profile already exists (created by sign-in) -> name is updated, role untouched", async () => {
    asUser(newbie);
    await ensureUserProfile({ uid: "newbie", email: "newbie@example.com", displayName: null });
    expect(store.get("users/newbie")).toMatchObject({ displayName: "newbie" });
    await createUserProfile("newbie", { email: "newbie@example.com", displayName: "Real Name" });
    expect(store.get("users/newbie")).toMatchObject({
      displayName: "Real Name",
      role: "user",
      volunteerStatus: "none",
    });
  });

  it("Google/first sign-in: ensureUserProfile provisions a citizen profile", async () => {
    asUser({ uid: "guser", token: { email: "g@example.com" } });
    const p = await ensureUserProfile({
      uid: "guser",
      email: "g@example.com",
      displayName: "G User",
    });
    expect(p).toMatchObject({ role: "user", volunteerStatus: "none" });
    expect(store.get("users/guser")).toBeTruthy();
  });

  it("existing admin signing in is left untouched", async () => {
    asUser(actors.admin1);
    const before = clone(store.get("users/admin1")!);
    const p = await ensureUserProfile({ uid: "admin1", email: "admin1@example.com" });
    expect(p.role).toBe("admin");
    expect(store.get("users/admin1")).toEqual(before);
  });

  it("profile page: callback phone update is accepted", async () => {
    asUser(actors.citizen1);
    await updateUserProfile("citizen1", { phone: "+8801712345678" });
    expect(store.get("users/citizen1")).toMatchObject({ phone: "+8801712345678" });
  });

  it("volunteer application: none -> pending ok; pending applicant can update application details", async () => {
    asUser(actors.citizen1);
    await submitVolunteerApplication("citizen1", { skills: ["First Aid"], notes: "ready" });
    expect(store.get("users/citizen1")).toMatchObject({ volunteerStatus: "pending", role: "user" });
    await submitVolunteerApplication("citizen1", {
      skills: ["Search & Rescue"],
      notes: "updated note",
    });
    expect(store.get("users/citizen1")).toMatchObject({
      volunteerStatus: "pending",
      role: "user",
      volunteerApplication: expect.objectContaining({ notes: "updated note" }),
    });
  });

  it("volunteer application with defaults (no details) is accepted", async () => {
    asUser(actors.citizen2);
    await submitVolunteerApplication("citizen2");
    expect(store.get("users/citizen2")).toMatchObject({ volunteerStatus: "pending" });
  });

  it("admin panel: approve and reject volunteers", async () => {
    asUser(actors.admin1);
    await setVolunteerStatus("pending1", "approved");
    expect(store.get("users/pending1")).toMatchObject({
      role: "volunteer",
      volunteerStatus: "approved",
    });
    await setVolunteerStatus("vol2", "rejected");
    expect(store.get("users/vol2")).toMatchObject({ role: "user", volunteerStatus: "rejected" });
  });

  it("admin panel cannot demote an administrator through setVolunteerStatus (ADM-2 safety net)", async () => {
    asUser(actors.admin1);
    await expect(setVolunteerStatus("admin2", "rejected")).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(store.get("users/admin2")).toMatchObject({ role: "admin" });
  });

  it("a citizen cannot approve anybody, including themselves", async () => {
    asUser(actors.citizen1);
    await expect(setVolunteerStatus("citizen1", "approved")).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(setVolunteerStatus("pending1", "approved")).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(store.get("users/citizen1")).toMatchObject({ role: "user", volunteerStatus: "none" });
  });

  it("legacy isAdmin flag gives no write power", async () => {
    asUser(actors.legacyFlag);
    await expect(setVolunteerStatus("pending1", "approved")).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});
