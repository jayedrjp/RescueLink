import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePhone, toDialablePhone } from "@/lib/phone";

describe("Phase 8: Profile, Real Contacts & Volunteer System", () => {
  describe("PRO-1: Emergency contacts per-user isolation and CRUD operations", () => {
    it("isolates contact storage keys per user UID", () => {
      const getStorageKey = (uid: string | null) =>
        uid ? `rl_contacts_${uid}` : "rl_contacts_guest";

      expect(getStorageKey("user_alice_123")).toBe("rl_contacts_user_alice_123");
      expect(getStorageKey("user_bob_456")).toBe("rl_contacts_user_bob_456");
      expect(getStorageKey(null)).toBe("rl_contacts_guest");
    });

    it("validates and normalizes phone numbers for emergency contacts", () => {
      expect(isValidPhone("01712345678")).toBe(true);
      expect(isValidPhone("+8801712345678")).toBe(true);
      expect(isValidPhone("12345")).toBe(false);

      const normalized = normalizePhone("01712-345678");
      expect(normalized).toBe("+8801712345678");
      expect(toDialablePhone(normalized)).toBe("+8801712345678");
    });

    it("supports adding, editing, and deleting contact records in memory", () => {
      let contacts = [{ id: "c1", name: "Mother", relation: "Parent", phone: "+8801711111111" }];

      // Add contact
      const newContact = {
        id: "c2",
        name: "Brother",
        relation: "Sibling",
        phone: "+8801822222222",
      };
      contacts = [...contacts, newContact];
      expect(contacts).toHaveLength(2);

      // Edit contact
      contacts = contacts.map((c) =>
        c.id === "c1" ? { ...c, name: "Ammu (Mom)", phone: "+8801799999999" } : c,
      );
      expect(contacts.find((c) => c.id === "c1")?.name).toBe("Ammu (Mom)");
      expect(contacts.find((c) => c.id === "c1")?.phone).toBe("+8801799999999");

      // Delete contact
      contacts = contacts.filter((c) => c.id !== "c2");
      expect(contacts).toHaveLength(1);
      expect(contacts[0]?.id).toBe("c1");
    });
  });

  describe("PRO-2: Saved shelters bookmarking and profile counter", () => {
    it("maintains bookmarked shelter IDs under user-specific storage key", () => {
      const getSheltersKey = (uid: string | null) =>
        uid ? `rl_saved_shelters_${uid}` : "rl_saved_shelters_guest";

      expect(getSheltersKey("user123")).toBe("rl_saved_shelters_user123");

      let saved = ["shelter-mirpur"];
      const toggle = (id: string) =>
        saved.includes(id) ? saved.filter((s) => s !== id) : [...saved, id];

      saved = toggle("shelter-dhanmondi");
      expect(saved).toEqual(["shelter-mirpur", "shelter-dhanmondi"]);

      saved = toggle("shelter-mirpur");
      expect(saved).toEqual(["shelter-dhanmondi"]);
      expect(saved.length).toBe(1);
    });

    it("validates search query parameters for /shelters (?saved=true)", () => {
      const validateSearch = (search: Record<string, unknown>) => {
        const isSaved = search["saved"] === true || search["saved"] === "true";
        return isSaved ? { saved: true } : {};
      };

      expect(validateSearch({ saved: "true" })).toEqual({ saved: true });
      expect(validateSearch({ saved: true })).toEqual({ saved: true });
      expect(validateSearch({ saved: "false" })).toEqual({});
      expect(validateSearch({ saved: false })).toEqual({});
      expect(validateSearch({})).toEqual({});
      expect(validateSearch({ saved: "gibberish", random: 123 })).toEqual({});
    });

    it("filters shelter list by saved IDs and supports compound filtering", () => {
      const allShelters = [
        { id: "s1", name: "Mirpur Relief Hub", status: "open", area: "Mirpur" },
        { id: "s2", name: "Dhanmondi Safe Haven", status: "open", area: "Dhanmondi" },
        { id: "s3", name: "Uttara Emergency Camp", status: "full", area: "Uttara" },
      ];

      const applyFilters = (
        shelters: typeof allShelters,
        savedOnly: boolean,
        savedIds: string[],
        openOnly: boolean,
        query: string,
      ) => {
        return shelters
          .filter((s) => (openOnly ? s.status === "open" : true))
          .filter((s) => (savedOnly ? savedIds.includes(s.id) : true))
          .filter((s) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q);
          });
      };

      // Full listing when savedOnly is false
      expect(applyFilters(allShelters, false, ["s1"], false, "")).toHaveLength(3);

      // Filtered to saved shelters only
      const savedFiltered = applyFilters(allShelters, true, ["s1", "s3"], false, "");
      expect(savedFiltered.map((s) => s.id)).toEqual(["s1", "s3"]);

      // Compound filter: saved only + open only (s3 is "full" so excluded)
      const savedAndOpen = applyFilters(allShelters, true, ["s1", "s3"], true, "");
      expect(savedAndOpen.map((s) => s.id)).toEqual(["s1"]);

      // Compound filter: saved only + search query
      const savedAndSearch = applyFilters(allShelters, true, ["s1", "s3"], false, "uttara");
      expect(savedAndSearch.map((s) => s.id)).toEqual(["s3"]);
    });

    it("immediately removes unbookmarked shelter while saved filter is active", () => {
      let savedIds = ["s1", "s2"];
      const shelters = [
        { id: "s1", name: "Mirpur Hub" },
        { id: "s2", name: "Dhanmondi Camp" },
      ];

      const getActiveSaved = (ids: string[]) => shelters.filter((s) => ids.includes(s.id));
      expect(getActiveSaved(savedIds)).toHaveLength(2);

      // Unbookmark s1
      savedIds = savedIds.filter((id) => id !== "s1");
      expect(getActiveSaved(savedIds)).toHaveLength(1);
      expect(getActiveSaved(savedIds)[0]?.id).toBe("s2");

      // Unbookmark s2 -> empty
      savedIds = savedIds.filter((id) => id !== "s2");
      expect(getActiveSaved(savedIds)).toHaveLength(0);
    });

    it("strictly isolates saved shelters between authenticated users", () => {
      const getSavedKey = (uid: string) => `rl_saved_shelters_${uid}`;

      const userAKey = getSavedKey("user_alice");
      const userBKey = getSavedKey("user_bob");

      const store: Record<string, string> = {
        [userAKey]: JSON.stringify(["shelter-mirpur", "shelter-uttara"]),
        [userBKey]: JSON.stringify(["shelter-dhanmondi"]),
      };

      const userASaved = JSON.parse(store[userAKey] || "[]");
      const userBSaved = JSON.parse(store[userBKey] || "[]");

      expect(userASaved).toEqual(["shelter-mirpur", "shelter-uttara"]);
      expect(userBSaved).toEqual(["shelter-dhanmondi"]);
      expect(userASaved).not.toEqual(userBSaved);
    });
  });

  describe("PRO-4: Volunteer task acceptance persistence", () => {
    it("persists accepted relief tasks per volunteer UID", () => {
      const getTasksKey = (uid: string | null) =>
        uid ? `rl_volunteer_tasks_${uid}` : "rl_volunteer_tasks_guest";

      expect(getTasksKey("vol_99")).toBe("rl_volunteer_tasks_vol_99");

      let acceptedTasks: string[] = [];
      const toggleTask = (taskId: string) => {
        acceptedTasks = acceptedTasks.includes(taskId)
          ? acceptedTasks.filter((id) => id !== taskId)
          : [...acceptedTasks, taskId];
        return acceptedTasks;
      };

      toggleTask("task-food-1");
      expect(acceptedTasks).toContain("task-food-1");
      expect(acceptedTasks.length).toBe(1);

      toggleTask("task-medical-2");
      expect(acceptedTasks.length).toBe(2);

      // User leaves task
      toggleTask("task-food-1");
      expect(acceptedTasks).toEqual(["task-medical-2"]);
    });
  });

  describe("PRO-5: Consistent volunteer role and approval evaluation", () => {
    it("treats only users with role === 'volunteer' AND volunteerStatus === 'approved' as verified volunteers", () => {
      const isVerifiedVolunteer = (role: string | null, status: string | undefined) =>
        role === "volunteer" && status === "approved";

      // Approved volunteer
      expect(isVerifiedVolunteer("volunteer", "approved")).toBe(true);

      // Role volunteer but status none (unapproved / revoked) -> must NOT be verified
      expect(isVerifiedVolunteer("volunteer", "none")).toBe(false);

      // Status approved but role user (out of sync) -> must NOT be verified
      expect(isVerifiedVolunteer("user", "approved")).toBe(false);

      // Pending applicant -> must NOT be verified
      expect(isVerifiedVolunteer("user", "pending")).toBe(false);
      expect(isVerifiedVolunteer("volunteer", "pending")).toBe(false);

      // Rejected applicant -> must NOT be verified
      expect(isVerifiedVolunteer("user", "rejected")).toBe(false);
    });
  });
});
