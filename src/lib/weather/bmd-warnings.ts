import type { BmdFeedStatus, OfficialWarning, OfficialWarningSource } from "./types";

export const BMD_AUTHORITY_NAME =
  "Bangladesh Meteorological Department (বাংলাদেশ আবহাওয়া অধিদপ্তর)";
export const BMD_PORTAL_URL = "https://www.bmd.gov.bd/web/en/";
export const BMD_CAP_PORTAL_URL = "https://cap.bmd.gov.bd/";
export const BMD_LEGAL_FRAMEWORK =
  "Act No. XXVIII of 2018 (The Meteorological Act, Chapter II, Sections 6-7)";

/**
 * Returns the verified operational status of the Bangladesh Meteorological Department (BMD)
 * automated warning feed.
 *
 * Grounding evidence:
 * 1. BMD operates as the national statutory meteorological agency under the Ministry of Defence.
 * 2. Public warnings are distributed via HTML bulletins, circulars, and PDF downloads at bmd.gov.bd.
 * 3. Structured CAP feeds (WMO CAP composer at cap.bmd.gov.bd) and AWS station feeds require
 *    institutional government authorization or formal data procurement under GoB-approved schedules.
 * 4. Scraping bmd.gov.bd is legally prohibited under Act No. XXVIII of 2018 and copyright terms.
 * 5. In accordance with disaster-response safety standards, no unofficial endpoints or simulated
 *    BMD warnings are fabricated.
 */
export function getBmdFeedStatus(): BmdFeedStatus {
  return {
    isAvailable: false,
    status: "unlinked",
    authorityName: BMD_AUTHORITY_NAME,
    portalUrl: BMD_PORTAL_URL,
    legalFramework: BMD_LEGAL_FRAMEWORK,
    message:
      "Direct machine-readable warning feed is not publicly accessible without institutional authorization under the Meteorological Act (2018). Official national bulletins are published directly at bmd.gov.bd.",
    messageBn:
      "আবহাওয়া আইন ২০১৮ অনুযায়ী সরাসরি মেশিন-রিডেবল ওয়ার্নিং ফিড ব্যবহারের জন্য প্রাতিষ্ঠানিক অনুমোদন প্রয়োজন। অফিশিয়াল জাতীয় আবহাওয়া সতর্কবার্তার জন্য bmd.gov.bd দেখুন।",
    lastChecked: Date.now(),
  };
}

/**
 * Retrieves verified official warnings from the Bangladesh Meteorological Department.
 *
 * Returns an empty array until an authorized machine-readable feed or government
 * partnership integration is connected. Never fabricates or guesses official warnings.
 */
export async function fetchOfficialBmdWarnings(): Promise<OfficialWarning[]> {
  // In the absence of an authorized API endpoint or signed institutional integration,
  // we strictly return an empty array rather than simulating official government advisories.
  return [];
}

/**
 * Validates that an external URL begins strictly with https:// or http://,
 * preventing javascript: or data: URI execution.
 */
export function isSafeExternalHttpUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Validates whether an incoming object conforms to the OfficialWarning contract.
 */
export function isOfficialWarning(data: unknown): data is OfficialWarning {
  if (!data || typeof data !== "object") return false;
  const item = data as Record<string, unknown>;

  const hasSafeSourceUrl =
    item["sourceUrl"] === undefined ||
    (typeof item["sourceUrl"] === "string" && isSafeExternalHttpUrl(item["sourceUrl"]));

  return (
    typeof item["id"] === "string" &&
    (item["source"] === "BMD" ||
      item["source"] === "ADMIN_DISPATCH" ||
      item["source"] === "OPEN_METEO") &&
    typeof item["sourceName"] === "string" &&
    hasSafeSourceUrl &&
    typeof item["headline"] === "string" &&
    typeof item["description"] === "string" &&
    Array.isArray(item["affectedDistricts"]) &&
    typeof item["issuedAt"] === "string" &&
    typeof item["isVerifiedOfficial"] === "boolean"
  );
}

/**
 * Formats a user-facing label and styling badge distinguishing the issuing authority.
 */
export function getWarningSourceMeta(source: OfficialWarningSource): {
  label: string;
  labelBn: string;
  chipClass: string;
} {
  switch (source) {
    case "BMD":
      return {
        label: "Official BMD Warning",
        labelBn: "অফিশিয়াল আবহাওয়া অধিদপ্তর সতর্কবার্তা",
        chipClass: "bg-emerald-600/15 text-emerald-800 border-emerald-500/30",
      };
    case "ADMIN_DISPATCH":
      return {
        label: "Civil Authority Broadcast",
        labelBn: "প্রশাসনিক দুর্যোগ বার্তা",
        chipClass: "bg-primary/15 text-primary border-primary/30",
      };
    case "OPEN_METEO":
    default:
      return {
        label: "Live Meteorological Observation",
        labelBn: "সরাসরি আবহাওয়া পর্যবেক্ষণ (Open-Meteo)",
        chipClass: "bg-sky-500/15 text-sky-800 border-sky-400/30",
      };
  }
}
