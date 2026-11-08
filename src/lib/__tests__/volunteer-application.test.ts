import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  calculateAge,
  isAgeEligible,
  isValidNid,
  maskNid,
  computeNidHash,
  encryptNid,
  decryptNid,
  MIN_VOLUNTEER_AGE,
  MAX_VOLUNTEER_AGE,
} from "../volunteer/volunteer-verification";
import {
  createUserProfile,
  submitVolunteerApplication,
  setVolunteerStatus,
  setIdentityVerificationStatus,
  isApprovedVolunteer,
} from "../firebase/firestore";
import type { UserProfile } from "../firebase/types";

// Simulated Firestore Store for unit test isolation
interface MockDoc {
  data: Record<string, unknown>;
  path: string;
}

const mockStore = new Map<string, MockDoc>();

vi.mock("@/lib/firebase/config", () => ({
  db: { __mock: true },
  auth: { currentUser: { uid: "admin-1" } },
}));

vi.mock("firebase/firestore", () => {
  return {
    collection: (_db: unknown, name: string) => ({ path: name }),
    doc: (_db: unknown, ...parts: string[]) => ({
      path: parts.join("/"),
      id: parts[parts.length - 1],
    }),
    getDoc: async (ref: { path: string }) => {
      const existing = mockStore.get(ref.path);
      return {
        exists: () => Boolean(existing),
        data: () => existing?.data,
        id: ref.path.split("/").pop(),
      };
    },
    setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
      mockStore.set(ref.path, { data, path: ref.path });
    },
    updateDoc: async (ref: { path: string }, updates: Record<string, unknown>) => {
      const existing = mockStore.get(ref.path);
      if (!existing) throw new Error("Document does not exist");
      mockStore.set(ref.path, { data: { ...existing.data, ...updates }, path: ref.path });
    },
    runTransaction: async (
      _db: unknown,
      updateFunction: (tx: {
        get: (ref: { path: string }) => Promise<{
          exists: () => boolean;
          data: () => unknown;
          id: string | undefined;
        }>;
        set: (ref: { path: string }, data: Record<string, unknown>) => void;
        update: (ref: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>,
    ) => {
      const tx = {
        get: async (ref: { path: string }) => {
          const item = mockStore.get(ref.path);
          return {
            exists: () => Boolean(item),
            data: () => item?.data,
            id: ref.path.split("/").pop(),
          };
        },
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path.startsWith("volunteer_nids/") && mockStore.has(ref.path)) {
            const err = new Error("Document already exists: permission-denied");
            (err as unknown as { code: string }).code = "permission-denied";
            throw err;
          }
          mockStore.set(ref.path, { data, path: ref.path });
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          const item = mockStore.get(ref.path);
          if (!item) throw new Error("Document does not exist");
          mockStore.set(ref.path, { data: { ...item.data, ...data }, path: ref.path });
        },
      };
      return updateFunction(tx);
    },
  };
});

describe("Volunteer Eligibility & NID Identity Verification", () => {
  beforeEach(() => {
    mockStore.clear();
  });

  // ---------------------------------------------------------------------------
  // 1. Age Calculation & Eligibility (Cases 4, 5, 6, 7)
  // ---------------------------------------------------------------------------
  describe("Age Calculation & Bounds (18–30 inclusive)", () => {
    const refDate = new Date("2026-11-04T00:00:00.000Z");

    it("calculates exact age from date of birth string", () => {
      // 20 years old
      expect(calculateAge("2006-11-04", refDate)).toBe(20);
      // Birthday hasn't occurred yet this year: 19 years old
      expect(calculateAge("2006-11-05", refDate)).toBe(19);
      // Birthday occurred yesterday: 20 years old
      expect(calculateAge("2006-11-03", refDate)).toBe(20);
      // 28 years old
      expect(calculateAge("1998-05-15", refDate)).toBe(28);
    });

    it("returns null for malformed or future dates", () => {
      expect(calculateAge("")).toBeNull();
      expect(calculateAge("invalid-date")).toBeNull();
      expect(calculateAge("2030-01-01", refDate)).toBeNull(); // Future date
      expect(calculateAge("2000-02-31", refDate)).toBeNull(); // Invalid calendar day
    });

    it("case 5: rejects applicants aged 17 or below", () => {
      // 17 years old
      const age17 = calculateAge("2009-11-04", refDate);
      expect(age17).toBe(17);
      expect(isAgeEligible(age17)).toBe(false);

      // 10 years old
      const age10 = calculateAge("2016-01-01", refDate);
      expect(isAgeEligible(age10)).toBe(false);
    });

    it("case 6: rejects applicants aged 31 or above", () => {
      // 31 years old
      const age31 = calculateAge("1995-11-03", refDate);
      expect(age31).toBe(31);
      expect(isAgeEligible(age31)).toBe(false);

      // 45 years old
      const age45 = calculateAge("1981-01-01", refDate);
      expect(isAgeEligible(age45)).toBe(false);
    });

    it("case 7: accepts applicants aged 18 to 30 inclusive", () => {
      // Exactly 18 years old (lower bound)
      const age18 = calculateAge("2008-11-04", refDate);
      expect(age18).toBe(18);
      expect(isAgeEligible(age18)).toBe(true);

      // Mid-range: 24 years old
      const age24 = calculateAge("2002-06-15", refDate);
      expect(isAgeEligible(age24)).toBe(true);

      // Exactly 30 years old (upper bound)
      const age30 = calculateAge("1996-11-04", refDate);
      expect(age30).toBe(30);
      expect(isAgeEligible(age30)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. NID Validation & Privacy Masking (Cases 8, 9)
  // ---------------------------------------------------------------------------
  describe("NID Validation & Privacy Masking", () => {
    it("case 8: accepts exactly 10 numeric digits", () => {
      expect(isValidNid("1234567890")).toBe(true);
      expect(isValidNid("9876543210")).toBe(true);
      expect(isValidNid("0123456789")).toBe(true);
    });

    it("case 9: rejects invalid NID formats (length != 10, characters, symbols)", () => {
      expect(isValidNid("123456789")).toBe(false); // 9 digits
      expect(isValidNid("12345678901")).toBe(false); // 11 digits
      expect(isValidNid("12345abc90")).toBe(false); // contains letters
      expect(isValidNid("12345-6789")).toBe(false); // contains hyphen
      expect(isValidNid("1234 56789")).toBe(false); // contains space
      expect(isValidNid("")).toBe(false);
    });

    it("masks NID for safe presentation showing only last 4 digits", () => {
      expect(maskNid("1234567890")).toBe("******7890");
      expect(maskNid("9876543210")).toBe("******3210");
      expect(maskNid("")).toBe("******");
    });

    it("computes deterministic keyed HMAC digest for uniqueness check", async () => {
      const hash1 = await computeNidHash("1234567890", "test-secret");
      const hash2 = await computeNidHash("1234567890", "test-secret");
      const hashDiff = await computeNidHash("9876543210", "test-secret");

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hashDiff);
      expect(hash1.length).toBe(64); // SHA-256 hex
    });

    it("encrypts and decrypts NID securely using AES-256-GCM", async () => {
      const nid = "1234567890";
      const key = "super-secret-key-for-testing-32b";
      const encrypted = await encryptNid(nid, key);

      expect(encrypted).not.toContain(nid); // Ciphertext does not expose plaintext
      const decrypted = await decryptNid(encrypted, key);
      expect(decrypted).toBe(nid);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Application Submission, Uniqueness & Workflow (Cases 1, 10, 11, 12, 13, 14, 15, 16)
  // ---------------------------------------------------------------------------
  describe("Submission & Verification Workflow", () => {
    it("case 1: general user registration works without DOB or NID", async () => {
      const profile = await createUserProfile("citizen-100", {
        email: "citizen@example.com",
        displayName: "Citizen Test",
        area: "Dhanmondi, Dhaka",
      });

      expect(profile.uid).toBe("citizen-100");
      expect(profile.role).toBe("user");
      expect(profile.volunteerStatus).toBe("none");
      expect(profile.volunteerApplication).toBeUndefined();
    });

    it("case 10: duplicate NID submissions are rejected with the exact specified error message", async () => {
      // Setup existing citizen
      mockStore.set("users/applicant-1", {
        path: "users/applicant-1",
        data: {
          uid: "applicant-1",
          email: "app1@example.com",
          displayName: "App One",
          role: "user",
          volunteerStatus: "none",
        },
      });
      mockStore.set("users/applicant-2", {
        path: "users/applicant-2",
        data: {
          uid: "applicant-2",
          email: "app2@example.com",
          displayName: "App Two",
          role: "user",
          volunteerStatus: "none",
        },
      });

      // First applicant applies with NID 1234567890 (DOB: 2000-01-01, age 26)
      await submitVolunteerApplication("applicant-1", {
        dateOfBirth: "2000-01-01",
        nid: "1234567890",
        area: "Dhaka",
        skills: ["First Aid & Medical Support"],
      });

      // Second applicant attempts to apply with the same NID
      await expect(
        submitVolunteerApplication("applicant-2", {
          dateOfBirth: "1998-05-10",
          nid: "1234567890",
          area: "Chittagong",
          skills: ["Shelter Operations"],
        }),
      ).rejects.toThrowError("This NID number is already registered.");
    });

    it("case 11: concurrent submissions cannot register the same NID twice (atomic transaction guarantee)", async () => {
      mockStore.set("users/applicant-a", {
        path: "users/applicant-a",
        data: { uid: "applicant-a", role: "user", volunteerStatus: "none" },
      });
      mockStore.set("users/applicant-b", {
        path: "users/applicant-b",
        data: { uid: "applicant-b", role: "user", volunteerStatus: "none" },
      });

      const sharedNid = "5555566666";
      const submitA = submitVolunteerApplication("applicant-a", {
        dateOfBirth: "2002-02-02",
        nid: sharedNid,
      });
      const submitB = submitVolunteerApplication("applicant-b", {
        dateOfBirth: "2002-02-02",
        nid: sharedNid,
      });

      // Run concurrently
      const results = await Promise.allSettled([submitA, submitB]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      if (rejected[0]?.status === "rejected") {
        expect((rejected[0].reason as Error).message).toBe(
          "This NID number is already registered.",
        );
      }
    });

    it("case 12 & 13: new applications remain pending identity verification; unverified applicants cannot receive volunteer permissions", async () => {
      mockStore.set("users/applicant-pending", {
        path: "users/applicant-pending",
        data: { uid: "applicant-pending", role: "user", volunteerStatus: "none" },
      });

      await submitVolunteerApplication("applicant-pending", {
        dateOfBirth: "1999-03-20",
        nid: "9988776655",
        area: "Mirpur",
      });

      const userDoc = mockStore.get("users/applicant-pending")?.data as unknown as UserProfile;
      expect(userDoc.volunteerStatus).toBe("pending");
      expect(userDoc.role).toBe("user"); // NOT volunteer
      expect(userDoc.volunteerApplication?.identityVerificationStatus).toBe("pending");
      expect(userDoc.volunteerApplication?.nidMasked).toBe("******6655");
      // Plain NID is NOT stored in the user profile document
      expect(JSON.stringify(userDoc)).not.toContain("9988776655");

      // Verify unverified applicants cannot receive volunteer permissions
      expect(isApprovedVolunteer(userDoc)).toBe(false);
    });

    it("case 14: admins can manually verify or reject identity", async () => {
      mockStore.set("users/applicant-review", {
        path: "users/applicant-review",
        data: {
          uid: "applicant-review",
          role: "user",
          volunteerStatus: "pending",
          volunteerApplication: {
            appliedAt: new Date().toISOString(),
            dateOfBirth: "1998-01-01",
            identityVerificationStatus: "pending",
          },
        },
      });

      // Admin verifies identity
      await setIdentityVerificationStatus("applicant-review", "verified", "admin-uid-123");
      let updatedDoc = mockStore.get("users/applicant-review")?.data as unknown as UserProfile;
      expect(updatedDoc.volunteerApplication?.identityVerificationStatus).toBe("verified");
      expect(updatedDoc.volunteerApplication?.identityVerifiedBy).toBe("admin-uid-123");
      expect(updatedDoc.volunteerApplication?.identityVerifiedAt).toBeDefined();

      // Admin rejects identity with reason
      await setIdentityVerificationStatus(
        "applicant-review",
        "rejected",
        "admin-uid-123",
        "NID name mismatch",
      );
      updatedDoc = mockStore.get("users/applicant-review")?.data as unknown as UserProfile;
      expect(updatedDoc.volunteerApplication?.identityVerificationStatus).toBe("rejected");
      expect(updatedDoc.volunteerApplication?.identityRejectionReason).toBe("NID name mismatch");
    });

    it("case 15: volunteer approval is possible only after identity verification", async () => {
      mockStore.set("users/applicant-gate", {
        path: "users/applicant-gate",
        data: {
          uid: "applicant-gate",
          role: "user",
          volunteerStatus: "pending",
          volunteerApplication: {
            appliedAt: new Date().toISOString(),
            identityVerificationStatus: "pending",
          },
        },
      });

      // Attempting to approve while identity is still "pending" must be refused
      await expect(setVolunteerStatus("applicant-gate", "approved")).rejects.toThrowError(
        "Cannot approve volunteer application until identity verification has been completed.",
      );

      // Identity is rejected: approving still refused
      await setIdentityVerificationStatus(
        "applicant-gate",
        "rejected",
        "admin-1",
        "Invalid document",
      );
      await expect(setVolunteerStatus("applicant-gate", "approved")).rejects.toThrowError(
        "Cannot approve volunteer application until identity verification has been completed.",
      );

      // Identity is verified: now approval succeeds
      await setIdentityVerificationStatus("applicant-gate", "verified", "admin-1");
      await setVolunteerStatus("applicant-gate", "approved", undefined, "admin-1");

      const approvedDoc = mockStore.get("users/applicant-gate")?.data as unknown as UserProfile;
      expect(approvedDoc.role).toBe("volunteer");
      expect(approvedDoc.volunteerStatus).toBe("approved");
      expect(isApprovedVolunteer(approvedDoc)).toBe(true);
      expect(approvedDoc.volunteerApplication?.reviewedBy).toBe("admin-1");
      expect(approvedDoc.volunteerApplication?.reviewedAt).toBeDefined();
    });

    it("case 16: existing approved volunteers retain their current permissions", async () => {
      // Legacy approved volunteer profile from Phase 7 without DOB or NID
      const legacyVolunteer: UserProfile = {
        uid: "legacy-volunteer-42",
        email: "legacy@rescuelink.org",
        displayName: "Veteran Responder",
        role: "volunteer",
        volunteerStatus: "approved",
        volunteerApplication: {
          appliedAt: "2025-06-01T00:00:00.000Z",
          skills: ["Search & Rescue", "First Aid"],
          area: "Sylhet",
        },
        createdAt: "2025-06-01T00:00:00.000Z",
        updatedAt: "2025-06-01T00:00:00.000Z",
      };

      expect(isApprovedVolunteer(legacyVolunteer)).toBe(true);

      mockStore.set("users/legacy-volunteer-42", {
        path: "users/legacy-volunteer-42",
        data: legacyVolunteer as unknown as Record<string, unknown>,
      });

      // Legacy volunteers can be updated or approved without requiring new NID fields
      await setVolunteerStatus("legacy-volunteer-42", "approved", undefined, "admin-1");
      const doc = mockStore.get("users/legacy-volunteer-42")?.data as unknown as UserProfile;
      expect(doc.role).toBe("volunteer");
      expect(doc.volunteerStatus).toBe("approved");
    });

    it("case 17: same applicant can resubmit with their own previously registered NID", async () => {
      mockStore.set("users/applicant-resubmit", {
        path: "users/applicant-resubmit",
        data: {
          uid: "applicant-resubmit",
          email: "resubmit@example.com",
          displayName: "Resubmit Test",
          role: "user",
          volunteerStatus: "none",
        },
      });

      const myNid = "1234512345";
      // First submission
      await submitVolunteerApplication("applicant-resubmit", {
        dateOfBirth: "2000-01-01",
        nid: myNid,
        area: "Dhaka",
        skills: ["First Aid & Medical Support"],
        notes: "First try",
      });

      // Same user resubmits / updates application with same NID
      await expect(
        submitVolunteerApplication("applicant-resubmit", {
          dateOfBirth: "2000-01-01",
          nid: myNid,
          area: "Dhaka North",
          skills: ["First Aid & Medical Support", "Shelter Operations"],
          notes: "Updated application details",
        }),
      ).resolves.not.toThrow();

      const userDoc = mockStore.get("users/applicant-resubmit")?.data as unknown as UserProfile;
      expect(userDoc.volunteerApplication?.area).toBe("Dhaka North");
      expect(userDoc.volunteerApplication?.notes).toBe("Updated application details");
      expect(userDoc.volunteerApplication?.skills).toContain("Shelter Operations");
    });

    it("case 18: approved volunteer cannot re-apply or demote themselves", async () => {
      mockStore.set("users/approved-user", {
        path: "users/approved-user",
        data: {
          uid: "approved-user",
          email: "approved@example.com",
          displayName: "Approved Volunteer",
          role: "volunteer",
          volunteerStatus: "approved",
        },
      });

      await expect(
        submitVolunteerApplication("approved-user", {
          dateOfBirth: "2001-01-01",
          nid: "7778889990",
        }),
      ).rejects.toThrowError("You are already an approved volunteer.");
    });
  });
});
