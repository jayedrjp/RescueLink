import { describe, expect, it } from "vitest";
import {
  getBmdFeedStatus,
  fetchOfficialBmdWarnings,
  isOfficialWarning,
  isSafeExternalHttpUrl,
  getWarningSourceMeta,
  BMD_AUTHORITY_NAME,
  BMD_PORTAL_URL,
  BMD_LEGAL_FRAMEWORK,
} from "../weather/bmd-warnings";
import type { OfficialWarning } from "../weather/types";

describe("BMD Official Weather Warning Service & Status", () => {
  describe("getBmdFeedStatus", () => {
    it("returns transparent unavailable status without fabricating live connection", () => {
      const status = getBmdFeedStatus();

      expect(status.isAvailable).toBe(false);
      expect(status.status).toBe("unlinked");
      expect(status.authorityName).toBe(BMD_AUTHORITY_NAME);
      expect(status.portalUrl).toBe(BMD_PORTAL_URL);
      expect(status.legalFramework).toBe(BMD_LEGAL_FRAMEWORK);
      expect(status.message).toContain("Meteorological Act (2018)");
      expect(status.messageBn).toContain("আবহাওয়া আইন ২০১৮");
      expect(status.lastChecked).toBeGreaterThan(0);
    });
  });

  describe("fetchOfficialBmdWarnings", () => {
    it("safely resolves to an empty array and never hallucinates simulated official warnings", async () => {
      const warnings = await fetchOfficialBmdWarnings();
      expect(Array.isArray(warnings)).toBe(true);
      expect(warnings.length).toBe(0);
    });
  });

  describe("isOfficialWarning validator", () => {
    it("accepts a fully compliant official warning object", () => {
      const validWarning: OfficialWarning = {
        id: "bmd-warn-2026-001",
        source: "BMD",
        sourceName: "Bangladesh Meteorological Department",
        sourceUrl: "https://www.bmd.gov.bd/web/en/",
        category: "cyclone",
        severity: "critical",
        headline: "Maritime Warning Signal 4 Issued for Chittagong & Cox's Bazar",
        headlineBn: "চট্টগ্রাম ও কক্সবাজার সমুদ্রবন্দরে ৪ নম্বর স্থানীয় হুঁশিয়ারি সংকেত",
        description: "Deep depression over North Bay intensified into a cyclonic storm.",
        affectedDistricts: ["Chittagong", "Cox's Bazar"],
        issuedAt: new Date().toISOString(),
        isVerifiedOfficial: true,
      };

      expect(isOfficialWarning(validWarning)).toBe(true);
    });

    it("rejects non-objects, null, or undefined", () => {
      expect(isOfficialWarning(null)).toBe(false);
      expect(isOfficialWarning(undefined)).toBe(false);
      expect(isOfficialWarning("string")).toBe(false);
      expect(isOfficialWarning(123)).toBe(false);
    });

    it("rejects objects missing mandatory fields", () => {
      const incomplete = {
        id: "warn-1",
        source: "BMD",
        // missing headline and description
      };
      expect(isOfficialWarning(incomplete)).toBe(false);
    });

    it("rejects objects with invalid source", () => {
      const invalidSource = {
        id: "warn-1",
        source: "UNVERIFIED_THIRD_PARTY",
        sourceName: "Random Blog",
        headline: "Cyclone approaching",
        description: "Be careful",
        affectedDistricts: ["Dhaka"],
        issuedAt: new Date().toISOString(),
        isVerifiedOfficial: false,
      };
      expect(isOfficialWarning(invalidSource)).toBe(false);
    });

    it("rejects objects with malicious or non-http sourceUrl", () => {
      const maliciousWarning = {
        id: "warn-bad-url",
        source: "BMD",
        sourceName: "Bangladesh Meteorological Department",
        sourceUrl: "javascript:alert(1)",
        headline: "Test alert",
        description: "Test description",
        affectedDistricts: ["Dhaka"],
        issuedAt: new Date().toISOString(),
        isVerifiedOfficial: true,
      };
      expect(isOfficialWarning(maliciousWarning)).toBe(false);
    });
  });

  describe("isSafeExternalHttpUrl validator", () => {
    it("accepts valid https and http URLs", () => {
      expect(isSafeExternalHttpUrl("https://www.bmd.gov.bd/web/en/")).toBe(true);
      expect(isSafeExternalHttpUrl("http://example.com/alerts")).toBe(true);
    });

    it("rejects javascript:, data:, file:, protocol-relative, and invalid URLs", () => {
      expect(isSafeExternalHttpUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeExternalHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
      expect(isSafeExternalHttpUrl("file:///etc/passwd")).toBe(false);
      expect(isSafeExternalHttpUrl("not-a-url")).toBe(false);
      expect(isSafeExternalHttpUrl("")).toBe(false);
      expect(isSafeExternalHttpUrl(null)).toBe(false);
      expect(isSafeExternalHttpUrl(undefined)).toBe(false);
    });
  });

  describe("getWarningSourceMeta", () => {
    it("returns appropriate badge metadata for BMD source", () => {
      const meta = getWarningSourceMeta("BMD");
      expect(meta.label).toBe("Official BMD Warning");
      expect(meta.labelBn).toContain("আবহাওয়া অধিদপ্তর");
      expect(meta.chipClass).toContain("emerald");
    });

    it("returns appropriate badge metadata for ADMIN_DISPATCH source", () => {
      const meta = getWarningSourceMeta("ADMIN_DISPATCH");
      expect(meta.label).toBe("Civil Authority Broadcast");
      expect(meta.chipClass).toContain("primary");
    });

    it("returns appropriate badge metadata for OPEN_METEO source", () => {
      const meta = getWarningSourceMeta("OPEN_METEO");
      expect(meta.label).toBe("Live Meteorological Observation");
      expect(meta.chipClass).toContain("sky");
    });
  });
});
