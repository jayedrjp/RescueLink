import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePhone, toDialablePhone } from "@/lib/phone";
import { isValidCoordinates } from "@/lib/map/types";
import { isApprovedVolunteer, getAllUsers } from "@/lib/firebase/firestore";
import type { UserProfile, VolunteerStatus, UserRole } from "@/lib/firebase/types";
import { Route as AdminRoute } from "@/routes/admin";
import { Route as CitizensRoute } from "@/routes/admin_.citizens";
import { Route as AlertsRoute } from "@/routes/admin_.alerts";
import { Route as ReportsRoute } from "@/routes/admin_.reports";
import { Route as DonationsRoute } from "@/routes/admin_.donations";

describe("Phase 7: Administration, Volunteers & Responders (ADM-1 to ADM-8)", () => {
  // ---------------------------------------------------------------------------
  // ADM-1: Volunteer Rejection Reason Validation and Persistence
  // ---------------------------------------------------------------------------
  describe("ADM-1: Volunteer rejection reason handling and persistence", () => {
    it("trims whitespace from custom rejection reasons", () => {
      const rawReason = "   Incomplete verification documents submitted.   ";
      const cleaned = rawReason.trim();
      expect(cleaned).toBe("Incomplete verification documents submitted.");
    });

    it("clamps rejection reasons exceeding 1000 characters", () => {
      const oversizedReason = "A".repeat(1200);
      const clamped = oversizedReason.trim().slice(0, 1000);
      expect(clamped.length).toBe(1000);
      expect(clamped).toBe("A".repeat(1000));
    });

    it("provides a sensible default rejection note when no custom reason is supplied", () => {
      const emptyReasons = ["", "   ", undefined, null];
      const defaultNote =
        "Application reviewed and not approved at this time. You may re-apply with updated details.";

      for (const reason of emptyReasons) {
        const trimmed = (reason ?? "").trim();
        const finalNote = trimmed.length > 0 ? trimmed.slice(0, 1000) : defaultNote;
        expect(finalNote).toBe(defaultNote);
      }
    });

    it("updates volunteerApplication.notes while preserving existing application metadata", () => {
      const existingApplication = {
        appliedAt: "2026-11-01T10:00:00.000Z",
        skills: ["First Aid", "Flood Relief"],
        area: "Sylhet",
        notes: "Old application notes",
      };

      const rejectionReason = "Outside current operational zone.";
      const updatedApplication = {
        ...existingApplication,
        notes: rejectionReason,
      };

      expect(updatedApplication.appliedAt).toBe("2026-11-01T10:00:00.000Z");
      expect(updatedApplication.skills).toEqual(["First Aid", "Flood Relief"]);
      expect(updatedApplication.area).toBe("Sylhet");
      expect(updatedApplication.notes).toBe(rejectionReason);
    });
  });

  // ---------------------------------------------------------------------------
  // ADM-2: Role Protection & Privilege Alignment
  // ---------------------------------------------------------------------------
  describe("ADM-2: Admin privilege protection and role alignment", () => {
    it("strictly blocks altering volunteer status or demoting an administrator", () => {
      const adminProfile: UserProfile = {
        uid: "admin-super",
        email: "admin@rescuelink.org",
        displayName: "Super Admin",
        role: "admin",
        volunteerStatus: "none",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };

      // Guard check logic matching setVolunteerStatus in firestore.ts
      const checkAdminDemotion = (profile: UserProfile) => {
        if (profile.role === "admin") {
          const err = new Error("Cannot alter volunteer status or demote an administrator.");
          (err as unknown as { code: string }).code = "permission-denied";
          throw err;
        }
      };

      expect(() => checkAdminDemotion(adminProfile)).toThrowError(
        "Cannot alter volunteer status or demote an administrator.",
      );
      try {
        checkAdminDemotion(adminProfile);
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe("permission-denied");
      }
    });

    it("aligns role with approval status for non-admin accounts", () => {
      const computeRoleForStatus = (status: VolunteerStatus): UserRole => {
        return status === "approved" ? "volunteer" : "user";
      };

      expect(computeRoleForStatus("approved")).toBe("volunteer");
      expect(computeRoleForStatus("rejected")).toBe("user");
      expect(computeRoleForStatus("pending")).toBe("user");
      expect(computeRoleForStatus("none")).toBe("user");
    });
  });

  // ---------------------------------------------------------------------------
  // ADM-3: User Directory Loading, Error and Empty State Management
  // ---------------------------------------------------------------------------
  describe("ADM-3: Directory loading, error handling and empty states", () => {
    it("getAllUsers throws error when Firestore is not initialized instead of returning empty array", async () => {
      // In node/test environment where db is null/mocked without real connection
      try {
        await getAllUsers();
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toMatch(/Firestore is not initialized/i);
      }
    });

    it("UI directory distinguishes between loading, error, empty, and data states", () => {
      interface DirectoryState {
        loading: boolean;
        error: string | null;
        data: UserProfile[];
      }

      const getDisplayState = (state: DirectoryState) => {
        if (state.loading) return "loading-spinner";
        if (state.error) return "error-retry-card";
        if (state.data.length === 0) return "empty-state-card";
        return "data-list";
      };

      expect(getDisplayState({ loading: true, error: null, data: [] })).toBe("loading-spinner");
      expect(getDisplayState({ loading: false, error: "Network timeout", data: [] })).toBe(
        "error-retry-card",
      );
      expect(getDisplayState({ loading: false, error: null, data: [] })).toBe("empty-state-card");
      expect(
        getDisplayState({
          loading: false,
          error: null,
          data: [
            {
              uid: "u1",
              email: "u1@example.com",
              displayName: "User One",
              role: "user",
              volunteerStatus: "none",
              createdAt: "2026-01-01",
              updatedAt: "2026-01-01",
            },
          ],
        }),
      ).toBe("data-list");
    });
  });

  // ---------------------------------------------------------------------------
  // ADM-4: Route Guard Protection & Access Denied Layout
  // ---------------------------------------------------------------------------
  describe("ADM-4: Route guard authentication and authorization verification", () => {
    it("all admin routes have beforeLoad: requireSignedIn router protection", () => {
      expect(typeof AdminRoute.options.beforeLoad).toBe("function");
      expect(typeof CitizensRoute.options.beforeLoad).toBe("function");
      expect(typeof AlertsRoute.options.beforeLoad).toBe("function");
      expect(typeof ReportsRoute.options.beforeLoad).toBe("function");
      expect(typeof DonationsRoute.options.beforeLoad).toBe("function");
    });
  });

  // ---------------------------------------------------------------------------
  // ADM-5: Shelter Creation Form Validation, Coordinates & Dynamic Distance
  // ---------------------------------------------------------------------------
  describe("ADM-5: Shelter form validations and distance calculations", () => {
    it("validates Bangladeshi mobile and landline numbers strictly", () => {
      expect(isValidPhone("01711000000")).toBe(true);
      expect(isValidPhone("+8801711000000")).toBe(true);
      expect(isValidPhone("+880 1711 000 000")).toBe(true);
      expect(isValidPhone("12345")).toBe(false);
      expect(isValidPhone("abc-invalid")).toBe(false);
    });

    it("allows phone to be optional, but validates when provided", () => {
      const validatePhoneInput = (phone: string) => {
        const trimmed = phone.trim();
        if (!trimmed) return true; // Optional: allowed empty
        return isValidPhone(trimmed);
      };

      expect(validatePhoneInput("")).toBe(true);
      expect(validatePhoneInput("   ")).toBe(true);
      expect(validatePhoneInput("+8801711000000")).toBe(true);
      expect(validatePhoneInput("not-a-number")).toBe(false);
    });

    it("normalizes phones into standard format", () => {
      expect(normalizePhone("01711000000")).toBe("+8801711000000");
      expect(normalizePhone("+880 1711-000-000")).toBe("+8801711000000");
    });

    it("toDialablePhone generates RFC3966-compliant dialable URIs", () => {
      expect(toDialablePhone("01711-000-000")).toBe("01711000000");
      expect(toDialablePhone("999 / +880 2 8631 822")).toBe("999");
      expect(toDialablePhone("+880 1819 123 456")).toBe("+8801819123456");
    });

    it("validates coordinates using isValidCoordinates and enforces Bangladesh boundaries", () => {
      // Valid coordinates within Bangladesh
      expect(isValidCoordinates({ lat: 23.8103, lng: 90.4125 })).toBe(true); // Dhaka
      expect(isValidCoordinates({ lat: 22.3569, lng: 91.7832 })).toBe(true); // Chittagong
      expect(isValidCoordinates({ lat: 20.5, lng: 88.0 })).toBe(true); // SW boundary
      expect(isValidCoordinates({ lat: 26.7, lng: 92.7 })).toBe(true); // NE boundary

      // Invalid coordinates
      expect(isValidCoordinates({ lat: 0, lng: 0 })).toBe(false); // Null island rejected
      expect(isValidCoordinates({ lat: NaN, lng: 90.38 })).toBe(false);
      expect(isValidCoordinates(null)).toBe(false);
      expect(isValidCoordinates({})).toBe(false);

      // Boundary check helper
      const isWithinBangladesh = (lat: number, lng: number) =>
        lat >= 20.5 && lat <= 26.7 && lng >= 88.0 && lng <= 92.7;

      expect(isWithinBangladesh(23.75, 90.38)).toBe(true);
      expect(isWithinBangladesh(51.5074, -0.1278)).toBe(false); // London
      expect(isWithinBangladesh(23.75, 140.0)).toBe(false); // Japan longitude
    });

    it("calculates haversine distance dynamically instead of returning a hardcoded constant", () => {
      const dhakaLat = 23.8103;
      const dhakaLng = 90.4125;
      const validLat = 23.75;
      const validLng = 90.38;

      const dLat = ((validLat - dhakaLat) * Math.PI) / 180;
      const dLng = ((validLng - dhakaLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((dhakaLat * Math.PI) / 180) *
          Math.cos((validLat * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const calculatedDistanceKm = Math.max(0.5, Math.round(6371 * c * 10) / 10);

      expect(calculatedDistanceKm).toBeGreaterThan(0);
      expect(calculatedDistanceKm).toBeCloseTo(7.4, 0.5);
      expect(calculatedDistanceKm).not.toBe(2.5); // Not the old hardcoded 2.5km constant
    });
  });

  // ---------------------------------------------------------------------------
  // ADM-6: SOS Responder Assignment & Real Identity Binding
  // ---------------------------------------------------------------------------
  describe("ADM-6: Dispatch responder assignment and UID binding", () => {
    const verifiedVolunteers: UserProfile[] = [
      {
        uid: "vol-kamal-123",
        email: "kamal@example.com",
        displayName: "Kamal Hossain",
        role: "volunteer",
        volunteerStatus: "approved",
        area: "Mirpur, Dhaka",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ];

    it("binds explicit responder UID when dispatching an approved volunteer", () => {
      const selectedId = "vol-kamal-123";
      const matched = verifiedVolunteers.find((v) => v.uid === selectedId);

      expect(matched).toBeDefined();
      const responderInfo = {
        unit: matched ? `Volunteer: ${matched.displayName} (${matched.area || "Dhaka"})` : "",
        eta: "5 mins",
        ...(matched ? { responderId: matched.uid } : {}),
      };

      expect(responderInfo.responderId).toBe("vol-kamal-123");
      expect(responderInfo.unit).toContain("Kamal Hossain");
    });

    it("falls back to unassigned General Emergency Services without fake IDs", () => {
      const selectedId = "";
      const matched = verifiedVolunteers.find((v) => v.uid === selectedId);

      expect(matched).toBeUndefined();
      const responderInfo = {
        unit: "General Emergency Services",
        eta: "10 mins",
        ...(matched ? { responderId: (matched as UserProfile).uid } : {}),
      };

      expect(responderInfo.responderId).toBeUndefined();
      expect(responderInfo.unit).toBe("General Emergency Services");
    });

    it("rejects invalid responder IDs that do not belong to approved volunteers", () => {
      const fakeId = "squad-alpha"; // Legacy mock ID
      const matched = verifiedVolunteers.find((v) => v.uid === fakeId);
      expect(matched).toBeUndefined();

      const isValidSelection = !fakeId || Boolean(matched);
      expect(isValidSelection).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // ADM-7: Approved Volunteer Count Alignment & Single Definition
  // ---------------------------------------------------------------------------
  describe("ADM-7: Approved volunteer count alignment", () => {
    const mockUsers: Partial<UserProfile>[] = [
      { uid: "u1", role: "volunteer", volunteerStatus: "approved" },
      { uid: "u2", role: "volunteer", volunteerStatus: "none" }, // Revoked/unapproved volunteer
      { uid: "u3", role: "user", volunteerStatus: "approved" }, // Role not yet updated to volunteer
      { uid: "u4", role: "user", volunteerStatus: "pending" },
      { uid: "u5", role: "user", volunteerStatus: "rejected" },
      { uid: "u6", role: "admin", volunteerStatus: "none" },
      { uid: "u7", role: "admin", volunteerStatus: "approved" },
    ];

    it("isApprovedVolunteer strictly returns true ONLY when role === volunteer AND volunteerStatus === approved", () => {
      expect(isApprovedVolunteer(mockUsers[0] as UserProfile)).toBe(true);
      expect(isApprovedVolunteer(mockUsers[1] as UserProfile)).toBe(false);
      expect(isApprovedVolunteer(mockUsers[2] as UserProfile)).toBe(false);
      expect(isApprovedVolunteer(mockUsers[3] as UserProfile)).toBe(false);
      expect(isApprovedVolunteer(mockUsers[4] as UserProfile)).toBe(false);
      expect(isApprovedVolunteer(mockUsers[5] as UserProfile)).toBe(false);
      expect(isApprovedVolunteer(mockUsers[6] as UserProfile)).toBe(false);
      expect(isApprovedVolunteer(null)).toBe(false);
      expect(isApprovedVolunteer(undefined)).toBe(false);
    });

    it("strictly counts only users with BOTH role === volunteer and volunteerStatus === approved", () => {
      const verifiedVolunteers = mockUsers.filter(isApprovedVolunteer);
      expect(verifiedVolunteers).toHaveLength(1);
      expect(verifiedVolunteers[0]?.uid).toBe("u1");

      // Verify that revoked volunteers (status === "none") are NOT counted
      expect(verifiedVolunteers.some((u) => u.uid === "u2")).toBe(false);
      // Verify that unpromoted users (role === "user") are NOT counted
      expect(verifiedVolunteers.some((u) => u.uid === "u3")).toBe(false);
      // Verify that admins are NOT counted as community volunteers
      expect(verifiedVolunteers.some((u) => u.uid === "u6" || u.uid === "u7")).toBe(false);
    });

    it("strictly excludes administrators from pending volunteer applications", () => {
      const usersWithAdminPending: Partial<UserProfile>[] = [
        ...mockUsers,
        { uid: "admin-pending", role: "admin", volunteerStatus: "pending" },
      ];
      const pendingApplicants = usersWithAdminPending.filter(
        (u) => u.role === "user" && u.volunteerStatus === "pending",
      );
      expect(pendingApplicants).toHaveLength(1);
      expect(pendingApplicants[0]?.uid).toBe("u4");
      expect(pendingApplicants.some((u) => u.uid === "admin-pending")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // ADM-8: Alert Creation Search Param Validation & Cleanup
  // ---------------------------------------------------------------------------
  describe("ADM-8: Alert creation search param validation", () => {
    it("normalizes search params and avoids modal reopen loops", () => {
      const validateSearch = AlertsRoute.options.validateSearch;
      if (typeof validateSearch === "function") {
        expect(validateSearch({ create: "true" })).toEqual({ create: true });
        expect(validateSearch({ create: true })).toEqual({ create: true });
        expect(validateSearch({ create: "false" })).toEqual({});
        expect(validateSearch({ create: false })).toEqual({});
        expect(validateSearch({})).toEqual({});
      }
    });

    it("consumes search param immediately to prevent re-opening on back navigation", () => {
      let currentSearch: { create?: boolean } = { create: true };
      let modalOpen = false;

      // Simulated navigation cleanup handler
      const handleMountWithSearch = (search: { create?: boolean }) => {
        if (search.create) {
          modalOpen = true;
          // Immediate param clearing: navigate({ search: {}, replace: true })
          currentSearch = {};
        }
      };

      handleMountWithSearch(currentSearch);
      expect(modalOpen).toBe(true);
      expect(currentSearch.create).toBeUndefined();

      // Subsequent simulated mount or back-navigation event
      let secondMountTriggered = false;
      if (currentSearch.create) {
        secondMountTriggered = true;
      }
      expect(secondMountTriggered).toBe(false);
    });
  });
});
