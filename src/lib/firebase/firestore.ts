import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  getDocFromServer,
} from "firebase/firestore";
import { db } from "./config";
import type {
  UserProfile,
  UserRole,
  VolunteerStatus,
  SosRequest,
  SosStatus,
  SosLocation,
  SosAssignedResponder,
} from "./types";
import { parseSosTimestamp } from "../date-utils";
import { isValidCoordinates } from "../map/types";
import {
  type Shelter,
  type ShelterStatus,
  shelters,
  type Alert,
  type DonationRecord,
  getStoredShelters,
  getStoredAlerts,
  getStoredDonations,
  saveShelters,
  saveAlerts,
  addStoredShelter,
  updateStoredShelter,
  addStoredAlert,
  deleteStoredAlert,
  addStoredDonation,
} from "../data";

/**
 * Writes a brand-new profile document only if none exists yet (inside a transaction, so two
 * concurrent initialisations can never overwrite each other or reset createdAt/role).
 * If the document already exists and `updateIfExists` is given, only those non-privileged
 * fields are updated, which is exactly what the Firestore rules allow an owner to do.
 */
async function provisionProfile(
  profile: UserProfile,
  options: { updateIfExists?: Partial<Pick<UserProfile, "displayName" | "phone" | "area">> } = {},
): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized.");
  const userRef = doc(db, "users", profile.uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) {
      tx.set(userRef, profile);
    } else if (options.updateIfExists && Object.keys(options.updateIfExists).length > 0) {
      tx.update(userRef, { ...options.updateIfExists, updatedAt: new Date().toISOString() });
    }
  });
}

/**
 * Creates the initial user profile in Firestore.
 * SECURITY CONSTRAINT: Always forces role to 'user' and volunteerStatus to 'none'.
 * Public registration can NEVER self-assign 'volunteer' or 'admin'.
 */
export async function createUserProfile(
  uid: string,
  data: {
    email: string;
    displayName: string;
    phone?: string;
    area?: string;
  },
): Promise<UserProfile> {
  if (!db) {
    throw new Error("Firestore is not initialized. Please verify Firebase configuration.");
  }

  const now = new Date().toISOString();
  const trimmedEmail = data.email.toLowerCase().trim();
  const emailPrefix = trimmedEmail.split("@")[0] || "RescueLink Citizen";
  const trimmedName = data.displayName?.trim() || emailPrefix;

  const profile: UserProfile = {
    uid,
    email: trimmedEmail,
    displayName: trimmedName,
    role: "user", // Strictly forced default role
    volunteerStatus: "none", // Strictly forced default status
    phone: data.phone?.trim() || "",
    area: data.area?.trim() || "Dhaka, Bangladesh",
    createdAt: now,
    updatedAt: now,
  };

  await provisionProfile(profile, {
    updateIfExists: {
      displayName: trimmedName,
      ...(data.phone?.trim() ? { phone: data.phone.trim() } : {}),
      ...(data.area?.trim() ? { area: data.area.trim() } : {}),
    },
  });
  return profile;
}

// In-flight deduplication map to prevent race conditions during concurrent auth events
const inFlightEnsurePromises = new Map<string, Promise<UserProfile>>();

/**
 * Ensures a valid Firestore profile document exists for an authenticated user.
 *
 * RBAC & INTEGRITY GUARANTEES:
 * 1. Returning Users:
 *    - Fetches the existing document at users/{uid}.
 *    - If found, returns the profile directly without modifying any fields or roles.
 *    - Existing Admin, Volunteer, or Citizen accounts are 100% preserved.
 * 2. New / Missing Profile Users (e.g. First-time Google Sign-In, or unprovisioned auth accounts):
 *    - Automatically provisions a standard Citizen profile in users/{uid}.
 *    - Strictly enforces role: 'user' and volunteerStatus: 'none'.
 *    - Never automatically grants admin privileges under any circumstances.
 * 3. Concurrency Protection:
 *    - In-flight deduplication ensures that concurrent calls (e.g. onAuthStateChanged + signInWithGoogle)
 *      share the same promise and do not cause race conditions or duplicate writes.
 */
export async function ensureUserProfile(user: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
}): Promise<UserProfile> {
  if (!db) {
    throw new Error("Firestore is not initialized. Please verify Firebase configuration.");
  }

  const uid = user.uid;
  if (!uid) {
    throw new Error("Cannot ensure user profile without a valid UID.");
  }

  // Deduplicate concurrent calls for the same UID
  const existingPromise = inFlightEnsurePromises.get(uid);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    // 1. Check if profile already exists in Firestore
    const existingProfile = await getUserProfile(uid);
    if (existingProfile) {
      // Returning user - preserve intact, do not overwrite!
      return existingProfile;
    }

    // 2. Profile does not exist - provision a new Citizen profile
    console.info(
      `[RescueLink Firestore] No profile document found for authenticated UID ${uid}. Provisioning default Citizen profile...`,
    );

    const email = (user.email || "").toLowerCase().trim();
    const emailPrefix = email.split("@")[0] || "RescueLink Citizen";
    const displayName = (user.displayName || "").trim() || emailPrefix;
    const phone = (user.phoneNumber || "").trim();

    const now = new Date().toISOString();
    const newProfile: UserProfile = {
      uid,
      email,
      displayName,
      role: "user", // Strictly forced default citizen role
      volunteerStatus: "none", // Strictly forced default status
      phone,
      area: "Dhaka, Bangladesh",
      createdAt: now,
      updatedAt: now,
    };

    await provisionProfile(newProfile);

    // Another tab/flow may have created the profile first: always return what is stored.
    const stored = await getUserProfile(uid);
    return stored ?? newProfile;
  })();

  inFlightEnsurePromises.set(uid, promise);

  try {
    return await promise;
  } finally {
    inFlightEnsurePromises.delete(uid);
  }
}

/**
 * Retrieves a user's profile from Firestore by UID.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;

  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();
      // Single authoritative role model: ONLY users/{uid}.role is honoured. Legacy fields such as
      // isAdmin / admin / Role / userRole are ignored so a user can never open the admin UI by
      // writing a flag onto their own document (and the UI always agrees with the Firestore rules).
      const rawRole = String(data["role"] ?? "")
        .toLowerCase()
        .trim();
      const role: UserRole =
        rawRole === "admin" ? "admin" : rawRole === "volunteer" ? "volunteer" : "user";

      const rawStatus = String(data["volunteerStatus"] ?? "none")
        .toLowerCase()
        .trim();
      const volunteerStatus: VolunteerStatus =
        rawStatus === "pending" || rawStatus === "approved" || rawStatus === "rejected"
          ? rawStatus
          : "none";

      const profile: UserProfile = {
        uid: snap.id,
        email: (data["email"] || "").toString().toLowerCase().trim(),
        displayName:
          data["displayName"] ||
          data["name"] ||
          (data["email"] ? data["email"].split("@")[0] : "RescueLink User"),
        role,
        volunteerStatus,
        phone: data["phone"] || "",
        area: data["area"] || "Dhaka, Bangladesh",
        createdAt: data["createdAt"] || new Date().toISOString(),
        updatedAt: data["updatedAt"] || new Date().toISOString(),
      };

      if (data["volunteerApplication"]) {
        profile.volunteerApplication = data["volunteerApplication"];
      }

      return profile;
    }

    console.warn(`[RescueLink Firestore] Document users/${uid} does not exist in Firestore.`);
    return null;
  } catch (error) {
    console.error(`[RescueLink Firestore] Error fetching user profile for UID [${uid}]:`, error);
    throw error;
  }
}

/**
 * Updates non-privileged profile information.
 * Notice: 'role' and 'volunteerStatus' are intentionally stripped to prevent self-elevation.
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, "displayName" | "phone" | "area">>,
): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized.");

  const userRef = doc(db, "users", uid);
  const safeData = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await updateDoc(userRef, safeData);
}

/**
 * Allows a user to submit a volunteer application.
 * Changes volunteerStatus to 'pending'. This DOES NOT grant volunteer privileges
 * until approved by an administrator.
 */
export async function submitVolunteerApplication(
  uid: string,
  applicationDetails?: {
    skills?: string[];
    area?: string;
    notes?: string;
  },
): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized.");

  const userRef = doc(db, "users", uid);
  const now = new Date().toISOString();

  await updateDoc(userRef, {
    volunteerStatus: "pending" as VolunteerStatus,
    volunteerApplication: {
      appliedAt: now,
      skills: applicationDetails?.skills || ["General Relief"],
      area: applicationDetails?.area || "Dhaka",
      notes: applicationDetails?.notes || "",
    },
    updatedAt: now,
  });
}

/**
 * Updates volunteer approval status (intended for trusted Admin / privileged process).
 * ADM-1: Stores rejection reason in volunteerApplication.notes.
 * ADM-2: Prevents role corruption / demotion of administrators.
 */
export async function setVolunteerStatus(
  targetUid: string,
  status: VolunteerStatus,
  rejectionReason?: string,
): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized.");

  const userRef = doc(db, "users", targetUid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    throw new Error("Target user profile does not exist.");
  }
  const cur = snap.data() as UserProfile;
  if (cur.role === "admin") {
    const err = new Error("Cannot alter volunteer status of an administrator.");
    (err as unknown as { code: string }).code = "permission-denied";
    throw err;
  }

  const now = new Date().toISOString();
  const role = status === "approved" ? "volunteer" : "user";
  const updateData: Record<string, unknown> = {
    volunteerStatus: status,
    role,
    updatedAt: now,
  };

  if (status === "rejected" && rejectionReason) {
    const existingApp = cur.volunteerApplication || {
      appliedAt: now,
      skills: ["General Relief"],
      area: cur.area || "Dhaka",
      notes: "",
    };
    updateData["volunteerApplication"] = {
      ...existingApp,
      notes: rejectionReason.slice(0, 1000),
    };
  }

  await updateDoc(userRef, updateData);
}

// ---------------------------------------------------------------------------
// SOS requests
// ---------------------------------------------------------------------------

export type SosErrorCode =
  | "invalid-input"
  | "invalid-location"
  | "invalid-transition"
  | "not-found"
  | "not-authorized"
  | "timeout";

/** Error raised by the SOS service layer so the UI can react to specific failures. */
export class SosError extends Error {
  readonly code: SosErrorCode;
  constructor(code: SosErrorCode, message: string) {
    super(message);
    this.name = "SosError";
    this.code = code;
  }
}

/** Valid SOS status transitions. Resolved and cancelled requests are terminal. */
const SOS_ALLOWED_TRANSITIONS: Record<SosStatus, SosStatus[]> = {
  active: ["assigned", "resolved", "cancelled"],
  assigned: ["assigned", "resolved", "cancelled"],
  resolved: [],
  cancelled: [],
};

/** Actor performing a transition; used for client-side ownership checks (rules remain authoritative). */
export interface SosActor {
  uid: string;
  isAdmin?: boolean;
}

const isFiniteNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Reserves a Firestore document id for a new SOS request. Re-using the same id when retrying a
 * failed or timed-out submission makes the write idempotent (no duplicate requests).
 */
export function newSosRequestId(): string {
  if (!db) throw new Error("Firestore is not initialized.");
  return doc(collection(db, "sos_requests")).id;
}

/** Validates and builds a Firestore-safe location object (no undefined values, no fabricated data). */
function buildSosLocation(location: SosLocation): SosLocation {
  const address = (location.address || "").trim();
  const source = location.source ?? (isFiniteNumber(location.lat) ? "gps" : "manual");

  if (source === "gps") {
    const { lat, lng } = location;
    if (
      !isFiniteNumber(lat) ||
      !isFiniteNumber(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new SosError("invalid-location", "A valid GPS position is required to send this SOS.");
    }
    const out: SosLocation = {
      source: "gps",
      address: address || `Coordinates ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng,
      updatedAt: new Date().toISOString(),
    };
    if (isFiniteNumber(location.accuracyMeters) && location.accuracyMeters >= 0) {
      out.accuracyMeters = Math.round(location.accuracyMeters);
    }
    return out;
  }

  if (address.length < 5) {
    throw new SosError(
      "invalid-location",
      "Please enter an address or landmark (at least 5 characters) so responders can find you.",
    );
  }
  return { source: "manual", address };
}

/**
 * Creates an emergency SOS request in Firestore.
 *
 * - Never invents a location, accuracy, address or message-less defaults.
 * - Resolves only after the server has acknowledged the write; rejects with a SosError("timeout")
 *   if no acknowledgement arrives in time (the write may still be delivered later, so callers should
 *   retry with the SAME requestId and then verify with getSosRequestOnce()).
 */
export async function createSosRequest(
  data: {
    requestId: string;
    userId: string;
    userName: string;
    userPhone?: string;
    userEmail?: string;
    message?: string;
    location: SosLocation;
  },
  options: { timeoutMs?: number } = {},
): Promise<SosRequest> {
  if (!db) {
    throw new Error("Firestore is not initialized.");
  }
  if (!data.userId) {
    throw new SosError("invalid-input", "You must be signed in to send an SOS request.");
  }
  if (!data.requestId) {
    throw new SosError("invalid-input", "Missing request id.");
  }

  const location = buildSosLocation(data.location);
  const now = new Date().toISOString();

  const sosData: Omit<SosRequest, "id"> = {
    userId: data.userId,
    userName: data.userName?.trim() || "Citizen",
    userPhone: data.userPhone?.trim() || "",
    userEmail: data.userEmail?.trim() || "",
    message: data.message?.trim() || "",
    location,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  const ref = doc(db, "sos_requests", data.requestId);
  const timeoutMs = options.timeoutMs ?? 15000;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = setDoc(ref, sosData);
  // If we time out first, the write may still settle later; never leave it unhandled.
  write.catch(() => {});
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new SosError(
            "timeout",
            "The server did not confirm your request in time. Check your connection.",
          ),
        ),
      timeoutMs,
    );
  });

  try {
    await Promise.race([write, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  return { id: data.requestId, ...sosData };
}

function normalizeSosDoc(id: string, raw: Record<string, unknown>): SosRequest {
  const rawCreated = raw["createdAt"];
  const rawUpdated = raw["updatedAt"];
  const createdAt =
    parseSosTimestamp(rawCreated) ||
    (typeof rawCreated === "string" ? rawCreated : new Date().toISOString());
  const updatedAt =
    parseSosTimestamp(rawUpdated) || (typeof rawUpdated === "string" ? rawUpdated : createdAt);
  return {
    id,
    ...(raw as Omit<SosRequest, "id">),
    createdAt,
    updatedAt,
  };
}

function sortSosRequestsDescending(list: SosRequest[]): void {
  list.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    const validA = !Number.isNaN(timeA);
    const validB = !Number.isNaN(timeB);
    if (validA && validB) return timeB - timeA;
    if (validA) return -1;
    if (validB) return 1;
    return 0;
  });
}

/** Reads a request straight from the server (bypasses cache). Returns null if it does not exist. */
export async function getSosRequestOnce(requestId: string): Promise<SosRequest | null> {
  if (!db) throw new Error("Firestore is not initialized.");
  const snap = await getDocFromServer(doc(db, "sos_requests", requestId));
  if (!snap.exists()) return null;
  return normalizeSosDoc(snap.id, snap.data() as Record<string, unknown>);
}

/**
 * Applies a status transition inside a transaction so it is validated against the CURRENT server
 * state (no re-cancelling resolved requests, no resolving cancelled ones, etc.).
 */
async function transitionSosRequest(
  requestId: string,
  next: SosStatus,
  options: {
    actor?: SosActor | undefined;
    assignedResponder?: SosAssignedResponder | undefined;
    authorize?: ((current: SosRequest, actor: SosActor) => string | null) | undefined;
  } = {},
): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized.");
  const database = db;
  const sosRef = doc(database, "sos_requests", requestId);

  await runTransaction(database, async (tx) => {
    const snap = await tx.get(sosRef);
    if (!snap.exists()) {
      throw new SosError("not-found", "This SOS request no longer exists.");
    }
    const current = { id: snap.id, ...(snap.data() as Omit<SosRequest, "id">) } as SosRequest;

    if (!SOS_ALLOWED_TRANSITIONS[current.status]?.includes(next)) {
      throw new SosError(
        "invalid-transition",
        `This request is already ${current.status} and cannot be changed to ${next}.`,
      );
    }

    if (options.actor && options.authorize) {
      const denial = options.authorize(current, options.actor);
      if (denial) throw new SosError("not-authorized", denial);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status: next, updatedAt: now };
    if (next === "resolved") updates["resolvedAt"] = now;
    if (next === "cancelled") updates["cancelledAt"] = now;
    if (options.assignedResponder) updates["assignedResponder"] = options.assignedResponder;
    tx.update(sosRef, updates);
  });
}

/**
 * Generic status update (used by the admin dispatch screen). Transition rules are enforced.
 */
export async function updateSosStatus(
  requestId: string,
  status: SosStatus,
  assignedResponder?: {
    unit: string;
    eta: string;
    responderId?: string;
  },
): Promise<void> {
  let responder: SosAssignedResponder | undefined;
  if (assignedResponder) {
    responder = {
      unit: assignedResponder.unit,
      eta: assignedResponder.eta,
      assignedAt: new Date().toISOString(),
    };
    if (assignedResponder.responderId) responder.responderId = assignedResponder.responderId;
  }
  await transitionSosRequest(requestId, status, { assignedResponder: responder });
}

/** Cancels an active or assigned SOS request. Only the owner (or an admin) may cancel. */
export async function cancelSosRequest(requestId: string, actor?: SosActor): Promise<void> {
  await transitionSosRequest(requestId, "cancelled", {
    actor,
    authorize: (current, a) =>
      a.isAdmin || current.userId === a.uid
        ? null
        : "Only the person who sent this SOS can cancel it.",
  });
}

/**
 * Marks an SOS request as resolved (a real, distinct outcome from cancellation).
 * Allowed for the owner, the assigned responder, or an admin.
 */
export async function resolveSosRequest(requestId: string, actor?: SosActor): Promise<void> {
  await transitionSosRequest(requestId, "resolved", {
    actor,
    authorize: (current, a) =>
      a.isAdmin || current.userId === a.uid || current.assignedResponder?.responderId === a.uid
        ? null
        : "Only the requester, the assigned responder or an admin can resolve this request.",
  });
}

/**
 * A volunteer accepts an active SOS request. The ETA is entered by the responder (never invented).
 */
export async function claimSosRequest(
  requestId: string,
  actor: SosActor,
  responder: { unit: string; etaMinutes: number },
): Promise<void> {
  const minutes = Math.round(responder.etaMinutes);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) {
    throw new SosError("invalid-input", "Enter your estimated arrival time in minutes (1-600).");
  }
  const unit = responder.unit.trim();
  if (!unit) {
    throw new SosError("invalid-input", "Responder name is required.");
  }

  await transitionSosRequest(requestId, "assigned", {
    actor,
    assignedResponder: {
      unit,
      eta: `${minutes} min`,
      responderId: actor.uid,
      assignedAt: new Date().toISOString(),
    },
    authorize: (current, a) => {
      const owner = current.assignedResponder?.responderId;
      if (current.status === "assigned" && owner && owner !== a.uid && !a.isAdmin) {
        return "Another responder has already accepted this request.";
      }
      return null;
    },
  });
}

/**
 * Persists a real GPS update for an active request (throttled by the caller).
 */
export async function updateSosLocation(
  requestId: string,
  position: { lat: number; lng: number; accuracyMeters?: number },
): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!isFiniteNumber(position.lat) || !isFiniteNumber(position.lng)) {
    throw new SosError("invalid-location", "Invalid GPS position.");
  }
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    "location.lat": position.lat,
    "location.lng": position.lng,
    "location.updatedAt": now,
    updatedAt: now,
  };
  if (isFiniteNumber(position.accuracyMeters)) {
    updates["location.accuracyMeters"] = Math.round(position.accuracyMeters);
  }
  await updateDoc(doc(db, "sos_requests", requestId), updates);
}

/**
 * Subscribes to real-time updates of a specific SOS request. Listener errors are reported through
 * onError so the UI can show them instead of silently freezing.
 */
export function subscribeToSosRequest(
  requestId: string,
  callback: (sos: SosRequest | null) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!db) {
    onError?.(new Error("Firestore is not initialized."));
    return () => {};
  }

  const sosRef = doc(db, "sos_requests", requestId);
  return onSnapshot(
    sosRef,
    (snap) => {
      if (snap.exists()) {
        callback(normalizeSosDoc(snap.id, snap.data() as Record<string, unknown>));
      } else {
        callback(null);
      }
    },
    (err) => {
      console.error("Error subscribing to SOS request:", err);
      onError?.(err);
    },
  );
}

/**
 * Subscribes to all active emergency SOS requests for Admins and Volunteers.
 */
export function subscribeToActiveSosRequests(
  callback: (requests: SosRequest[]) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!db) {
    onError?.(new Error("Firestore is not initialized."));
    return () => {};
  }

  const colRef = collection(db, "sos_requests");
  const q = query(colRef, where("status", "in", ["active", "assigned"]));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SosRequest[] = [];
      snapshot.forEach((d) => {
        list.push(normalizeSosDoc(d.id, d.data() as Record<string, unknown>));
      });
      sortSosRequestsDescending(list);
      callback(list);
    },
    (err) => {
      console.error("Error subscribing to active SOS requests:", err);
      onError?.(err);
    },
  );
}

/**
 * Fetches all SOS requests created by a specific user.
 */
export async function getUserSosRequests(userId: string): Promise<SosRequest[]> {
  if (!db || !userId) return [];
  try {
    const colRef = collection(db, "sos_requests");
    const q = query(colRef, where("userId", "==", userId));
    const snapshot = await getDocs(q);
    const list: SosRequest[] = [];
    snapshot.forEach((d) => {
      list.push(normalizeSosDoc(d.id, d.data() as Record<string, unknown>));
    });
    sortSosRequestsDescending(list);
    return list;
  } catch (err) {
    console.warn("Error fetching user SOS requests:", err);
    return [];
  }
}

/**
 * Fetches all users from Firestore (Admins only).
 * ADM-3: Does not swallow permission/network errors so UI catch blocks and toasts fire.
 */
export async function getAllUsers(): Promise<UserProfile[]> {
  if (!db) return [];
  const colRef = collection(db, "users");
  const snapshot = await getDocs(colRef);
  const list: UserProfile[] = [];
  snapshot.forEach((d) => {
    list.push(d.data() as UserProfile);
  });
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return list;
}

/**
 * Subscribes to all SOS requests (all statuses) for Admin oversight.
 */
export function subscribeToAllSosRequests(
  callback: (requests: SosRequest[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!db) {
    onError?.(new Error("Firestore is not initialized."));
    callback([]);
    return () => {};
  }

  const colRef = collection(db, "sos_requests");

  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: SosRequest[] = [];
      snapshot.forEach((d) => {
        list.push(normalizeSosDoc(d.id, d.data() as Record<string, unknown>));
      });
      sortSosRequestsDescending(list);
      callback(list);
    },
    (err) => {
      console.error("Error subscribing to all SOS requests:", err);
      onError?.(err);
    },
  );
}

// ---------------------------------------------------------------------------
// Shelters (Phase 5 - DATA-1 / DATA-2)
// ---------------------------------------------------------------------------

export class ShelterNotFoundError extends Error {
  readonly code = "not-found";
  readonly shelterId: string;

  constructor(shelterId: string, message?: string) {
    super(
      message ||
        `Shelter document "${shelterId}" does not exist in Cloud Firestore. This record is currently loaded from local fallback/seed data and cannot be updated remotely until registered in the database.`,
    );
    this.name = "ShelterNotFoundError";
    this.shelterId = shelterId;
  }
}

/**
 * Possible outcomes of a single-document shelter lookup.
 *
 * - remote  : document was found in Firestore → authoritative, isLocal: false
 * - local   : Firestore offline / unavailable but local cache has the record
 * - missing : Firestore is reachable and confirmed the document does not exist
 * - error   : Firestore threw an unexpected error (network, permission, …)
 */
export type ShelterLookupResult =
  | { status: "remote"; shelter: Shelter }
  | { status: "local"; shelter: Shelter }
  | { status: "missing" }
  | { status: "error"; error: Error };

/**
 * Looks up a single shelter by Firestore document ID.
 *
 * Priority order:
 *  1. Live Firestore read via `getDoc` — authoritative result.
 *  2. If Firestore is unavailable (db null / network error that is not a
 *     confirmed "not-found"), falls back to localStorage / static seed data
 *     so the user still sees something meaningful.
 *  3. If Firestore is reachable and the document genuinely does not exist,
 *     returns `{ status: "missing" }` so callers can show a proper 404.
 *
 * Never silently converts a transient network error into a "shelter does
 * not exist" verdict.
 */
export async function getShelterByIdFromFirestore(shelterId: string): Promise<ShelterLookupResult> {
  const trimmedId = (shelterId || "").trim();
  if (!trimmedId) {
    return { status: "missing" };
  }

  // --- No Firestore connection: use local cache / static seed ---
  if (!db) {
    const stored = getStoredShelters().find((s) => s.id === trimmedId);
    if (stored) return { status: "local", shelter: stored };
    return { status: "missing" };
  }

  try {
    const shelterRef = doc(db, "shelters", trimmedId);
    const snap = await getDoc(shelterRef);

    if (snap.exists()) {
      const data = snap.data() as Omit<Shelter, "id">;
      const shelter: Shelter = {
        ...data,
        id: snap.id, // Firestore document ID is authoritative
        isLocal: false,
      };
      return { status: "remote", shelter };
    }

    // Firestore is reachable and confirmed the document does not exist.
    // Before returning "missing", check the local cache: it may contain a
    // locally-created record that Firestore does not (e.g. a static fallback
    // that was never seeded). We surface it as "local" so the UI can
    // distinguish it from a truly unknown ID.
    const localFallback = getStoredShelters().find((s) => s.id === trimmedId);
    if (localFallback) {
      return { status: "local", shelter: localFallback };
    }

    return { status: "missing" };
  } catch (err: unknown) {
    // Distinguish genuine "not-found" errors from transient failures.
    const isFirestoreNotFound =
      err &&
      typeof err === "object" &&
      "code" in err &&
      ((err as { code: string }).code === "not-found" ||
        (err as { code: string }).code === "firestore/not-found");

    if (isFirestoreNotFound) {
      // Document confirmed absent — same logic as snap.exists() === false
      const localFallback = getStoredShelters().find((s) => s.id === trimmedId);
      if (localFallback) {
        return { status: "local", shelter: localFallback };
      }
      return { status: "missing" };
    }

    // Any other error (network, permission, quota, …) is a genuine read
    // failure. Return "error" so callers can show a retryable state instead
    // of incorrectly reporting that the shelter does not exist.
    const error = err instanceof Error ? err : new Error(String(err));
    console.warn(
      `[RescueLink Firestore] getShelterByIdFromFirestore("${trimmedId}") error:`,
      error,
    );
    return { status: "error", error };
  }
}

export async function getSheltersOnce(): Promise<Shelter[]> {
  if (!db) return getStoredShelters();
  try {
    const colRef = collection(db, "shelters");
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) {
      return getStoredShelters();
    }
    const list: Shelter[] = [];
    snapshot.forEach((d) => {
      const data = d.data() as Omit<Shelter, "id">;
      list.push({
        ...data,
        id: d.id,
        isLocal: false,
      });
    });
    saveShelters(list);
    return list;
  } catch (err) {
    console.warn("Falling back to local shelters:", err);
    return getStoredShelters();
  }
}

export function subscribeToShelters(
  callback: (shelters: Shelter[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!db) {
    callback(getStoredShelters());
    return () => {};
  }
  const colRef = collection(db, "shelters");
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        callback(getStoredShelters());
        return;
      }
      const list: Shelter[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as Omit<Shelter, "id">;
        list.push({
          ...data,
          id: d.id,
          isLocal: false,
        });
      });
      saveShelters(list);
      callback(list);
    },
    (err) => {
      console.warn("Shelters subscription error, using local fallback:", err);
      onError?.(err);
      callback(getStoredShelters());
    },
  );
}

export async function createShelter(
  newShelter: Omit<Shelter, "id" | "status"> & { id?: string; status?: ShelterStatus },
): Promise<Shelter> {
  const shelterId = newShelter.id || `shelter-${Date.now()}`;
  const now = new Date().toISOString();
  const cap = Number(newShelter.capacity) > 0 ? Number(newShelter.capacity) : 1;
  const occ = Math.max(0, Math.min(Number(newShelter.occupied) || 0, cap));
  const normalized: Shelter = {
    ...newShelter,
    id: shelterId,
    capacity: cap,
    occupied: occ,
    status: occ >= cap ? "full" : occ >= cap * 0.8 ? "limited" : "open",
    createdAt: newShelter.createdAt || now,
    updatedAt: now,
    isLocal: false,
  };

  if (db) {
    const shelterRef = doc(db, "shelters", shelterId);
    if (newShelter.id) {
      const snap = await getDoc(shelterRef);
      if (snap.exists()) {
        throw new Error(
          `Shelter document "${newShelter.id}" already exists in Cloud Firestore. Cannot overwrite existing shelter.`,
        );
      }
    }
    await setDoc(shelterRef, normalized);
  }
  addStoredShelter(normalized);
  return normalized;
}

export type UpdateShelterInput = Partial<Omit<Shelter, "id" | "createdAt" | "isLocal">>;

/**
 * Registers a local fallback/seed shelter as an authoritative document in Cloud Firestore.
 *
 * Safety & Data Integrity Guarantees:
 * 1. Checks that the local fallback shelter exists in cached or seed data.
 * 2. Validates all required fields, coordinates, capacity, and occupancy before any write.
 * 3. Enforces that Firestore document ID is deterministic (matches the fallback ID).
 * 4. Verifies via getDoc that no document with that ID already exists in Cloud Firestore (no silent overwrite).
 * 5. Checks for duplicate shelters across the remote collection (by normalized name or coordinates).
 * 6. Uses setDoc without merge to establish the authoritative remote record.
 * 7. Updates local cache ONLY after the remote operation successfully commits.
 * 8. Returns the newly registered remote shelter with `isLocal: false`.
 */
export async function registerFallbackShelter(
  fallbackShelterId: string,
  overrides?: UpdateShelterInput,
): Promise<Shelter> {
  const trimmedId = (fallbackShelterId || "").trim();
  if (!trimmedId) {
    throw new Error("Invalid shelter ID: document ID is required to register fallback shelter.");
  }

  const localRecord =
    getStoredShelters().find((s) => s.id === trimmedId) || shelters.find((s) => s.id === trimmedId);

  if (!localRecord) {
    throw new Error(
      `Local fallback shelter "${trimmedId}" does not exist in local seed or cached data.`,
    );
  }

  // Capacity & Occupancy validation
  if (
    overrides?.capacity !== undefined &&
    (typeof overrides.capacity !== "number" || Number(overrides.capacity) <= 0)
  ) {
    throw new Error("Invalid capacity: shelter capacity must be greater than zero.");
  }
  const cap =
    overrides?.capacity !== undefined
      ? Number(overrides.capacity)
      : localRecord.capacity > 0
        ? localRecord.capacity
        : 1;

  if (
    overrides?.occupied !== undefined &&
    (typeof overrides.occupied !== "number" || Number(overrides.occupied) < 0)
  ) {
    throw new Error("Invalid occupancy: occupied beds cannot be negative.");
  }
  const occ =
    overrides?.occupied !== undefined
      ? Math.max(0, Math.min(Number(overrides.occupied) || 0, cap))
      : Math.max(0, Math.min(localRecord.occupied, cap));

  const status: ShelterStatus =
    overrides?.status !== undefined && ["open", "limited", "full"].includes(overrides.status)
      ? overrides.status
      : occ >= cap
        ? "full"
        : occ >= cap * 0.8
          ? "limited"
          : "open";

  // Coordinates validation
  let coordinates = localRecord.coordinates;
  if (overrides?.coordinates !== undefined) {
    if (overrides.coordinates === null) {
      coordinates = undefined;
    } else if (isValidCoordinates(overrides.coordinates)) {
      coordinates = { lat: overrides.coordinates.lat, lng: overrides.coordinates.lng };
    } else {
      throw new Error(
        "Invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180.",
      );
    }
  }

  // Name & Area validation
  const name = (overrides?.name !== undefined ? overrides.name.trim() : localRecord.name).trim();
  const area = (overrides?.area !== undefined ? overrides.area.trim() : localRecord.area).trim();
  if (!name) {
    throw new Error("Shelter name is required for registration.");
  }
  if (!area) {
    throw new Error("Shelter area is required for registration.");
  }

  const now = new Date().toISOString();
  const normalized: Shelter = {
    id: trimmedId,
    name,
    area,
    capacity: cap,
    occupied: occ,
    status,
    phone: overrides?.phone !== undefined ? overrides.phone.trim() : localRecord.phone,
    image: overrides?.image || localRecord.image || "shelter-1",
    facilities: Array.isArray(overrides?.facilities)
      ? overrides.facilities
      : localRecord.facilities,
    needs: Array.isArray(overrides?.needs) ? overrides.needs : localRecord.needs,
    ...(coordinates ? { coordinates } : {}),
    ...(localRecord.distanceKm !== undefined ? { distanceKm: localRecord.distanceKm } : {}),
    createdAt: localRecord.createdAt || now,
    updatedAt: now,
    isLocal: false,
  };

  if (!db) {
    throw new Error("Cloud Firestore is not initialized. Cannot register shelter remotely.");
  }

  // 1. Verify that no document with this ID already exists in Firestore (prevents silent overwrite)
  const shelterRef = doc(db, "shelters", trimmedId);
  const snap = await getDoc(shelterRef);
  if (snap.exists()) {
    throw new Error(
      `Shelter document "${trimmedId}" already exists in Cloud Firestore. Registration stopped to prevent overwriting existing data.`,
    );
  }

  // 2. Check for duplicate shelters across the remote collection
  const colRef = collection(db, "shelters");
  const existingDocs = await getDocs(colRef);
  const targetName = name.toLowerCase();

  existingDocs.forEach((d) => {
    if (d.id === trimmedId) return;
    const dData = d.data() as Record<string, unknown>;
    const existingName = String(dData["name"] || "")
      .trim()
      .toLowerCase();
    if (existingName === targetName) {
      throw new Error(
        `A shelter with the name "${String(dData["name"])}" already exists in Cloud Firestore. Registration stopped to prevent duplicate records.`,
      );
    }
    if (coordinates && dData["coordinates"]) {
      const c = dData["coordinates"] as { lat?: number; lng?: number };
      if (
        typeof c.lat === "number" &&
        typeof c.lng === "number" &&
        Math.abs(c.lat - coordinates.lat) < 0.0001 &&
        Math.abs(c.lng - coordinates.lng) < 0.0001
      ) {
        throw new Error(
          `A shelter with matching coordinates already exists in Cloud Firestore ("${String(dData["name"] || d.id)}"). Registration stopped to prevent duplicate records.`,
        );
      }
    }
  });

  // 3. Write to Firestore using setDoc without merge
  await setDoc(shelterRef, normalized);

  // 4. Update local cache ONLY after remote write succeeds
  updateStoredShelter(trimmedId, normalized);

  return normalized;
}

/**
 * Updates an existing shelter in Firestore and syncs local storage.
 * Preserves all existing fields not targeted by the update.
 * Enforces that the remote document exists in Firestore (via getDoc) and throws
 * ShelterNotFoundError if the document is missing, preventing silent overwrites
 * or treating unconfirmed local fallback records as remote documents.
 */
export async function updateShelter(
  shelterId: string,
  updates: UpdateShelterInput,
): Promise<Shelter> {
  const trimmedId = (shelterId || "").trim();
  if (!trimmedId) {
    throw new Error("Invalid shelter ID: document ID is required to update shelter.");
  }

  let existing: Shelter | undefined;
  if (db) {
    const shelterRef = doc(db, "shelters", trimmedId);
    try {
      const snap = await getDoc(shelterRef);
      if (!snap.exists()) {
        throw new ShelterNotFoundError(trimmedId);
      }
      const snapData = snap.data() as Omit<Shelter, "id">;
      existing = { ...snapData, id: snap.id, isLocal: false };
    } catch (err: unknown) {
      if (err instanceof ShelterNotFoundError) throw err;
      const isNotFound =
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "not-found";
      if (isNotFound) {
        throw new ShelterNotFoundError(trimmedId);
      }
      throw err;
    }
  } else {
    existing = getStoredShelters().find((s) => s.id === trimmedId);
    if (!existing) {
      throw new ShelterNotFoundError(trimmedId);
    }
  }

  // Capacity & Occupancy validation
  const cap =
    updates.capacity !== undefined
      ? Number(updates.capacity) > 0
        ? Number(updates.capacity)
        : 1
      : existing.capacity;

  const occ =
    updates.occupied !== undefined
      ? Math.max(0, Math.min(Number(updates.occupied) || 0, cap))
      : Math.min(existing.occupied, cap);

  const status =
    updates.status !== undefined && ["open", "limited", "full"].includes(updates.status)
      ? updates.status
      : occ >= cap
        ? "full"
        : occ >= cap * 0.8
          ? "limited"
          : "open";

  // Coordinates validation if provided
  let coordinates = existing.coordinates;
  if (updates.coordinates !== undefined) {
    if (updates.coordinates === null) {
      coordinates = undefined;
    } else if (isValidCoordinates(updates.coordinates)) {
      coordinates = { lat: updates.coordinates.lat, lng: updates.coordinates.lng };
    } else {
      throw new Error(
        "Invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180.",
      );
    }
  }

  const now = new Date().toISOString();

  const mergedPayload: Omit<Shelter, "id"> = {
    name: updates.name !== undefined ? updates.name.trim() || existing.name : existing.name,
    area: updates.area !== undefined ? updates.area.trim() || existing.area : existing.area,
    capacity: cap,
    occupied: occ,
    status,
    phone: updates.phone !== undefined ? updates.phone.trim() : existing.phone,
    image: updates.image || existing.image || "shelter-1",
    facilities: Array.isArray(updates.facilities) ? updates.facilities : existing.facilities,
    needs: Array.isArray(updates.needs) ? updates.needs : existing.needs,
    ...(coordinates ? { coordinates } : {}),
    ...(existing.distanceKm !== undefined ? { distanceKm: existing.distanceKm } : {}),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    isLocal: false,
  };

  if (db) {
    const shelterRef = doc(db, "shelters", trimmedId);
    try {
      await updateDoc(shelterRef, mergedPayload);
    } catch (err: unknown) {
      const isNotFound =
        (err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: string }).code === "not-found") ||
        (err instanceof Error &&
          (err.message.includes("No document to update") ||
            err.message.includes("NOT_FOUND") ||
            err.message.includes("not-found")));

      if (isNotFound) {
        throw new ShelterNotFoundError(trimmedId);
      }
      throw err;
    }
  }

  const updatedShelter: Shelter = {
    ...mergedPayload,
    id: trimmedId,
    isLocal: false,
  };

  updateStoredShelter(trimmedId, updatedShelter);
  return updatedShelter;
}

/**
 * Unified Shelter Save Operation (Automatic Firestore Upsert).
 *
 * Guarantees:
 * 1. Uses the existing deterministic shelter ID as the Firestore document ID (never random).
 * 2. Checks if the document exists in Firestore atomically within a transaction.
 * 3. If it exists: updates it, preserving all unrelated fields and updating only targeted fields.
 * 4. If it does NOT exist: creates the document in Firestore using local fallback/seed data as base.
 * 5. Prevents duplicate shelters by verifying names across the collection.
 * 6. Prevents race conditions or accidental overwrites through transactional isolation.
 * 7. Synchronizes local cache (isLocal: false) ONLY after remote transaction succeeds.
 * 8. On permission failure or network error, leaves local state untouched and throws a clear error.
 */
export async function saveShelter(
  shelterId: string,
  updates: UpdateShelterInput,
): Promise<Shelter> {
  const trimmedId = (shelterId || "").trim();
  if (!trimmedId) {
    throw new Error("Invalid shelter ID: document ID is required to save shelter.");
  }

  // 1. Validate fields if provided
  if (updates.name !== undefined && !updates.name.trim()) {
    throw new Error("Shelter name cannot be empty.");
  }
  if (updates.area !== undefined && !updates.area.trim()) {
    throw new Error("Shelter area cannot be empty.");
  }

  if (
    updates.capacity !== undefined &&
    (typeof updates.capacity !== "number" ||
      Number(updates.capacity) <= 0 ||
      isNaN(updates.capacity))
  ) {
    throw new Error("Invalid capacity: shelter capacity must be greater than zero.");
  }

  if (
    updates.occupied !== undefined &&
    (typeof updates.occupied !== "number" ||
      Number(updates.occupied) < 0 ||
      isNaN(updates.occupied))
  ) {
    throw new Error("Invalid occupancy: occupied beds cannot be negative.");
  }

  if (updates.coordinates !== undefined && updates.coordinates !== null) {
    if (!isValidCoordinates(updates.coordinates)) {
      throw new Error(
        "Invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180.",
      );
    }
  }

  // 2. Offline / No DB fallback
  if (!db) {
    const localRecord =
      getStoredShelters().find((s) => s.id === trimmedId) ||
      shelters.find((s) => s.id === trimmedId);
    if (!localRecord) {
      throw new ShelterNotFoundError(trimmedId);
    }

    const cap =
      updates.capacity !== undefined
        ? Number(updates.capacity)
        : localRecord.capacity > 0
          ? localRecord.capacity
          : 1;

    const occ =
      updates.occupied !== undefined
        ? Math.max(0, Math.min(Number(updates.occupied), cap))
        : Math.min(localRecord.occupied, cap);

    const status: ShelterStatus =
      updates.status !== undefined && ["open", "limited", "full"].includes(updates.status)
        ? updates.status
        : occ >= cap
          ? "full"
          : occ >= cap * 0.8
            ? "limited"
            : "open";

    const updatedLocally: Shelter = {
      ...localRecord,
      name: updates.name !== undefined ? updates.name.trim() || localRecord.name : localRecord.name,
      area: updates.area !== undefined ? updates.area.trim() || localRecord.area : localRecord.area,
      capacity: cap,
      occupied: occ,
      status,
      phone: updates.phone !== undefined ? updates.phone.trim() : localRecord.phone,
      image: updates.image || localRecord.image || "shelter-1",
      facilities: Array.isArray(updates.facilities) ? updates.facilities : localRecord.facilities,
      needs: Array.isArray(updates.needs) ? updates.needs : localRecord.needs,
      ...(updates.coordinates !== undefined
        ? updates.coordinates === null
          ? {}
          : { coordinates: updates.coordinates }
        : localRecord.coordinates
          ? { coordinates: localRecord.coordinates }
          : {}),
      updatedAt: new Date().toISOString(),
      isLocal: localRecord.isLocal ?? true,
    };

    updateStoredShelter(trimmedId, updatedLocally);
    return updatedLocally;
  }

  // 3. Duplicate checks across the collection
  const targetName = updates.name ? updates.name.trim().toLowerCase() : undefined;
  const targetCoords = updates.coordinates;
  const colRef = collection(db, "shelters");
  const existingDocs = await getDocs(colRef);

  existingDocs.forEach((d) => {
    if (d.id === trimmedId) return; // Ignore self
    const dData = d.data() as Record<string, unknown>;
    if (targetName) {
      const existingName = String(dData["name"] || "")
        .trim()
        .toLowerCase();
      if (existingName === targetName) {
        throw new Error(
          `A shelter with the name "${String(dData["name"])}" already exists in Cloud Firestore. Cannot save duplicate shelter.`,
        );
      }
    }
    if (targetCoords && dData["coordinates"]) {
      const c = dData["coordinates"] as { lat?: number; lng?: number };
      if (
        typeof c.lat === "number" &&
        typeof c.lng === "number" &&
        Math.abs(c.lat - targetCoords.lat) < 0.0001 &&
        Math.abs(c.lng - targetCoords.lng) < 0.0001
      ) {
        throw new Error(
          `A shelter with matching coordinates already exists in Cloud Firestore ("${String(dData["name"] || d.id)}"). Cannot save duplicate shelter.`,
        );
      }
    }
  });

  // 4. Transactional Atomic Upsert
  const shelterRef = doc(db, "shelters", trimmedId);
  const now = new Date().toISOString();
  let finalShelter: Shelter | null = null;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(shelterRef);

    if (snap.exists()) {
      // Document exists: update preserving all existing document fields
      const existingData = snap.data() as Record<string, unknown>;

      const cap =
        updates.capacity !== undefined
          ? Number(updates.capacity)
          : Number(existingData["capacity"]) > 0
            ? Number(existingData["capacity"])
            : 1;

      const occ =
        updates.occupied !== undefined
          ? Math.max(0, Math.min(Number(updates.occupied), cap))
          : Math.min(Number(existingData["occupied"] || 0), cap);

      const status: ShelterStatus =
        updates.status !== undefined && ["open", "limited", "full"].includes(updates.status)
          ? updates.status
          : occ >= cap
            ? "full"
            : occ >= cap * 0.8
              ? "limited"
              : "open";

      let coordinates = existingData["coordinates"] as { lat: number; lng: number } | undefined;
      if (updates.coordinates !== undefined) {
        coordinates = updates.coordinates === null ? undefined : updates.coordinates;
      }

      const mergedPayload: Record<string, unknown> = {
        ...existingData,
        name: updates.name !== undefined ? updates.name.trim() : (existingData["name"] ?? ""),
        area: updates.area !== undefined ? updates.area.trim() : (existingData["area"] ?? ""),
        capacity: cap,
        occupied: occ,
        status,
        phone: updates.phone !== undefined ? updates.phone.trim() : (existingData["phone"] ?? ""),
        image: updates.image || existingData["image"] || "shelter-1",
        facilities: Array.isArray(updates.facilities)
          ? updates.facilities
          : Array.isArray(existingData["facilities"])
            ? existingData["facilities"]
            : [],
        needs: Array.isArray(updates.needs)
          ? updates.needs
          : Array.isArray(existingData["needs"])
            ? existingData["needs"]
            : [],
        updatedAt: now,
        isLocal: false,
      };

      if (coordinates) {
        mergedPayload["coordinates"] = coordinates;
      } else {
        delete mergedPayload["coordinates"];
      }

      transaction.set(shelterRef, mergedPayload);

      finalShelter = {
        ...(mergedPayload as unknown as Shelter),
        id: trimmedId,
        isLocal: false,
      };
    } else {
      // Document does NOT exist: create document using local fallback/seed data as base
      const localRecord =
        getStoredShelters().find((s) => s.id === trimmedId) ||
        shelters.find((s) => s.id === trimmedId);

      const name = (
        updates.name !== undefined ? updates.name.trim() : localRecord?.name || ""
      ).trim();
      const area = (
        updates.area !== undefined ? updates.area.trim() : localRecord?.area || ""
      ).trim();

      if (!name) {
        throw new Error("Shelter name is required to save shelter.");
      }
      if (!area) {
        throw new Error("Shelter area is required to save shelter.");
      }

      const cap =
        updates.capacity !== undefined
          ? Number(updates.capacity)
          : localRecord?.capacity && localRecord.capacity > 0
            ? localRecord.capacity
            : 1;

      const occ =
        updates.occupied !== undefined
          ? Math.max(0, Math.min(Number(updates.occupied), cap))
          : Math.max(0, Math.min(localRecord?.occupied || 0, cap));

      const status: ShelterStatus =
        updates.status !== undefined && ["open", "limited", "full"].includes(updates.status)
          ? updates.status
          : occ >= cap
            ? "full"
            : occ >= cap * 0.8
              ? "limited"
              : "open";

      let coordinates = localRecord?.coordinates;
      if (updates.coordinates !== undefined) {
        coordinates = updates.coordinates === null ? undefined : updates.coordinates;
      }

      const createdDoc: Shelter = {
        id: trimmedId,
        name,
        area,
        capacity: cap,
        occupied: occ,
        status,
        phone: updates.phone !== undefined ? updates.phone.trim() : localRecord?.phone || "",
        image: updates.image || localRecord?.image || "shelter-1",
        facilities: Array.isArray(updates.facilities)
          ? updates.facilities
          : localRecord?.facilities || [],
        needs: Array.isArray(updates.needs) ? updates.needs : localRecord?.needs || [],
        ...(coordinates ? { coordinates } : {}),
        ...(localRecord?.distanceKm !== undefined ? { distanceKm: localRecord.distanceKm } : {}),
        createdAt: localRecord?.createdAt || now,
        updatedAt: now,
        isLocal: false,
      };

      transaction.set(shelterRef, createdDoc);
      finalShelter = createdDoc;
    }
  });

  if (!finalShelter) {
    throw new Error("Failed to save shelter: transaction completed without output.");
  }

  // 5. Synchronize local cache ONLY after successful Firestore persistence
  updateStoredShelter(trimmedId, finalShelter);

  return finalShelter;
}

export async function updateShelterCapacity(
  shelterId: string,
  capacity: number,
  occupied: number,
): Promise<void> {
  await updateShelter(shelterId, { capacity, occupied });
}

export async function deleteShelter(shelterId: string): Promise<void> {
  const trimmedId = (shelterId || "").trim();
  if (!trimmedId) {
    throw new Error("Invalid shelter ID: document ID is required to delete shelter.");
  }

  if (db) {
    const shelterRef = doc(db, "shelters", trimmedId);
    try {
      const snap = await getDoc(shelterRef);
      if (!snap.exists()) {
        throw new ShelterNotFoundError(trimmedId);
      }
      await deleteDoc(shelterRef);
    } catch (err: unknown) {
      if (err instanceof ShelterNotFoundError) throw err;
      const isNotFound =
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "not-found";
      if (isNotFound) {
        throw new ShelterNotFoundError(trimmedId);
      }
      throw err;
    }
  }

  const current = getStoredShelters();
  saveShelters(current.filter((s) => s.id !== trimmedId));
}

// ---------------------------------------------------------------------------
// Alerts (Phase 5 - DATA-1 / DATA-4)
// ---------------------------------------------------------------------------

export async function getAlertsOnce(): Promise<Alert[]> {
  if (!db) return getStoredAlerts();
  try {
    const colRef = collection(db, "alerts");
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) {
      return getStoredAlerts();
    }
    const list: Alert[] = [];
    snapshot.forEach((d) => {
      list.push({ id: d.id, ...(d.data() as Omit<Alert, "id">) });
    });
    list.sort((a, b) => {
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      return tb - ta;
    });
    saveAlerts(list);
    return list;
  } catch (err) {
    console.warn("Falling back to local alerts:", err);
    return getStoredAlerts();
  }
}

export function subscribeToAlerts(
  callback: (alerts: Alert[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!db) {
    callback(getStoredAlerts());
    return () => {};
  }
  const colRef = collection(db, "alerts");
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        callback(getStoredAlerts());
        return;
      }
      const list: Alert[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Alert, "id">) });
      });
      list.sort((a, b) => {
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        return tb - ta;
      });
      saveAlerts(list);
      callback(list);
    },
    (err) => {
      console.warn("Alerts subscription error, using local fallback:", err);
      onError?.(err);
      callback(getStoredAlerts());
    },
  );
}

export async function createAlert(newAlert: Omit<Alert, "id"> & { id?: string }): Promise<Alert> {
  const alertId = newAlert.id || `alert-${Date.now()}`;
  const now = new Date().toISOString();
  const normalized: Alert = {
    ...newAlert,
    id: alertId,
    createdAt: newAlert.createdAt || now,
    updatedAt: now,
  };

  if (db) {
    const alertRef = doc(db, "alerts", alertId);
    await setDoc(alertRef, normalized);
  }
  addStoredAlert(normalized);
  return normalized;
}

export async function deleteAlert(alertId: string): Promise<void> {
  if (db) {
    const alertRef = doc(db, "alerts", alertId);
    await deleteDoc(alertRef);
  }
  deleteStoredAlert(alertId);
}

// ---------------------------------------------------------------------------
// Donations (Phase 5 - DATA-1 / DATA-3)
// ---------------------------------------------------------------------------

export async function recordDonation(
  record: Omit<DonationRecord, "id"> & { id?: string },
): Promise<DonationRecord> {
  const donationId = record.id || `don-${Date.now()}`;
  const now = new Date().toISOString();
  const normalized: DonationRecord = {
    ...record,
    id: donationId,
    date: record.date || now,
    status: record.status || (record.type === "money" ? "completed" : "pledged"),
  };

  if (db) {
    const donRef = doc(db, "donations", donationId);
    await setDoc(donRef, normalized);
  }
  addStoredDonation(normalized);
  return normalized;
}

export async function getDonationsOnce(): Promise<DonationRecord[]> {
  if (!db) return getStoredDonations();
  try {
    const colRef = collection(db, "donations");
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) {
      return getStoredDonations();
    }
    const list: DonationRecord[] = [];
    snapshot.forEach((d) => {
      list.push({ id: d.id, ...(d.data() as Omit<DonationRecord, "id">) });
    });
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  } catch (err) {
    console.warn("Falling back to local donations:", err);
    return getStoredDonations();
  }
}

export function subscribeToDonations(
  callback: (donations: DonationRecord[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!db) {
    callback(getStoredDonations());
    return () => {};
  }
  const colRef = collection(db, "donations");
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        callback(getStoredDonations());
        return;
      }
      const list: DonationRecord[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<DonationRecord, "id">) });
      });
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      callback(list);
    },
    (err) => {
      console.warn("Donations subscription error:", err);
      onError?.(err);
      callback(getStoredDonations());
    },
  );
}
