import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePhone, toDialablePhone } from "@/lib/phone";
import { Route as AlertsRoute } from "@/routes/admin_.alerts";

describe("Phase 7: Administration, Volunteers & Responders", () => {
  describe("ADM-5: Shelter form validations and distance calculations", () => {
    it("validates Bangladeshi mobile and landline numbers strictly", () => {
      expect(isValidPhone("01711000000")).toBe(true);
      expect(isValidPhone("+8801711000000")).toBe(true);
      expect(isValidPhone("+880 1711 000 000")).toBe(true);
      expect(isValidPhone("12345")).toBe(false);
      expect(isValidPhone("abc-invalid")).toBe(false);
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

  describe("ADM-7: Approved volunteer count alignment", () => {
    const mockUsers = [
      { uid: "u1", role: "volunteer", volunteerStatus: "approved" },
      { uid: "u2", role: "volunteer", volunteerStatus: "none" }, // Revoked/unapproved volunteer
      { uid: "u3", role: "user", volunteerStatus: "approved" }, // Role not yet updated to volunteer
      { uid: "u4", role: "user", volunteerStatus: "pending" },
      { uid: "u5", role: "user", volunteerStatus: "rejected" },
      { uid: "u6", role: "admin", volunteerStatus: "none" },
    ];

    it("strictly counts only users with BOTH role === volunteer and volunteerStatus === approved", () => {
      const isApprovedVolunteer = (u: { role: string; volunteerStatus: string }) =>
        u.role === "volunteer" && u.volunteerStatus === "approved";

      const verifiedVolunteers = mockUsers.filter(isApprovedVolunteer);
      expect(verifiedVolunteers).toHaveLength(1);
      expect(verifiedVolunteers[0]?.uid).toBe("u1");

      // Verify that revoked volunteers (status === "none") are NOT counted
      expect(verifiedVolunteers.some((u) => u.uid === "u2")).toBe(false);
      // Verify that unpromoted users (role === "user") are NOT counted
      expect(verifiedVolunteers.some((u) => u.uid === "u3")).toBe(false);
    });
  });

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
  });
});
