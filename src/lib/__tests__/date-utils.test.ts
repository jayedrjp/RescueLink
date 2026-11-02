import { describe, expect, it } from "vitest";
import {
  formatSosAbsolute,
  formatSosFull,
  formatSosTimeAgo,
  parseSosTimestamp,
} from "../date-utils";

describe("date-utils for SOS timestamps", () => {
  const fixedIso = "2026-10-24T00:00:00.000Z";
  const fixedMs = new Date(fixedIso).getTime();

  describe("parseSosTimestamp", () => {
    it("handles ISO strings properly", () => {
      expect(parseSosTimestamp(fixedIso)).toBe(fixedIso);
    });

    it("handles Date objects", () => {
      const d = new Date(fixedIso);
      expect(parseSosTimestamp(d)).toBe(fixedIso);
    });

    it("handles Firestore Timestamp objects with toDate()", () => {
      const fakeTimestamp = {
        toDate: () => new Date(fixedIso),
      };
      expect(parseSosTimestamp(fakeTimestamp)).toBe(fixedIso);
    });

    it("handles object with numeric seconds", () => {
      const fakeTimestamp = { seconds: fixedMs / 1000 };
      expect(parseSosTimestamp(fakeTimestamp)).toBe(fixedIso);
    });

    it("handles object with _seconds", () => {
      const fakeTimestamp = { _seconds: fixedMs / 1000 };
      expect(parseSosTimestamp(fakeTimestamp)).toBe(fixedIso);
    });

    it("returns empty string on null, undefined, or empty values", () => {
      expect(parseSosTimestamp(null)).toBe("");
      expect(parseSosTimestamp(undefined)).toBe("");
      expect(parseSosTimestamp("")).toBe("");
      expect(parseSosTimestamp("   ")).toBe("");
    });
  });

  describe("formatSosTimeAgo", () => {
    it("formats 'just now' for events under a minute old", () => {
      const now = fixedMs + 30 * 1000;
      expect(formatSosTimeAgo(fixedIso, now)).toBe("just now");
    });

    it("formats minutes ago correctly", () => {
      const now = fixedMs + 15 * 60 * 1000;
      expect(formatSosTimeAgo(fixedIso, now)).toBe("15m ago");
    });

    it("formats hours and minutes ago correctly", () => {
      const now = fixedMs + (2 * 3600 + 45 * 60) * 1000;
      expect(formatSosTimeAgo(fixedIso, now)).toBe("2h 45m ago");
    });

    it("handles future timestamp within 2 minutes as 'just now'", () => {
      const slightlyAhead = fixedMs + 30 * 1000;
      expect(formatSosTimeAgo(new Date(slightlyAhead).toISOString(), fixedMs)).toBe("just now");
    });

    it("handles missing timestamp gracefully", () => {
      expect(formatSosTimeAgo(null)).toBe("Time not recorded");
      expect(formatSosTimeAgo(undefined)).toBe("Time not recorded");
    });

    it("handles invalid date strings gracefully", () => {
      expect(formatSosTimeAgo("not-a-date")).toBe("Time unavailable");
    });
  });

  describe("formatSosAbsolute and formatSosFull", () => {
    it("formats absolute time without throwing", () => {
      const formatted = formatSosAbsolute(fixedIso);
      expect(typeof formatted).toBe("string");
      expect(formatted.length).toBeGreaterThan(0);
    });

    it("formats full date-time without throwing", () => {
      const formatted = formatSosFull(fixedIso);
      expect(typeof formatted).toBe("string");
      expect(formatted.length).toBeGreaterThan(0);
    });

    it("returns 'Time unavailable' for empty/invalid inputs", () => {
      expect(formatSosAbsolute(null)).toBe("Time unavailable");
      expect(formatSosFull(null)).toBe("Time unavailable");
      expect(formatSosAbsolute("invalid")).toBe("Time unavailable");
      expect(formatSosFull("invalid")).toBe("Time unavailable");
    });
  });
});
