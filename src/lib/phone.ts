/**
 * Phone helpers for the SOS callback number.
 *
 * Accepts:
 *  - Bangladesh local format:      01712345678
 *  - Bangladesh with country code: 8801712345678 / +8801712345678 / +880 1712-345678
 *  - Other international numbers:  +<country code><number>, 8-15 digits total (E.164)
 *
 * Returns a normalized E.164 string ("+8801712345678") or null when invalid.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Only digits, spaces, dashes, dots, parentheses and one leading "+" are allowed.
  if (!/^\+?[\d\s\-().]+$/.test(raw)) return null;

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Bangladesh local mobile: 01[3-9]XXXXXXXX (11 digits)
  if (!hasPlus && /^01[3-9]\d{8}$/.test(digits)) {
    return `+880${digits.slice(1)}`;
  }

  // Bangladesh with country code but without "+": 8801[3-9]XXXXXXXX
  if (!hasPlus && /^8801[3-9]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  if (hasPlus) {
    // Bangladesh numbers must be a valid mobile if they claim +880 and look like a mobile.
    if (digits.startsWith("8801")) {
      return /^8801[3-9]\d{8}$/.test(digits) ? `+${digits}` : null;
    }
    // Generic E.164: first digit 1-9, 8-15 digits total.
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }

  return null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/** Human-readable form for display ("+880 1712-345678"). Falls back to the raw value. */
export function formatPhoneForDisplay(value: string | undefined | null): string {
  if (!value) return "";
  const normalized = normalizePhone(value);
  if (!normalized) return value;
  if (normalized.startsWith("+880") && normalized.length === 14) {
    return `+880 ${normalized.slice(4, 8)}-${normalized.slice(8)}`;
  }
  return normalized;
}

export const PHONE_HELP_TEXT =
  "Use 01XXXXXXXXX, +8801XXXXXXXXX, or an international number starting with +.";

/**
 * Recognized Bangladesh emergency short codes that must be dialed directly without +880 prefix.
 */
export const BD_EMERGENCY_SHORT_CODES = new Set([
  "999", // National Emergency (Police, Ambulance, Fire)
  "102", // Fire Service direct
  "100", // Police direct
  "101", // Rapid Action Battalion (RAB)
  "109", // Women & Children Helpline
  "1090", // Flood & Disaster Early Warning
  "106", // Anti-Corruption
  "333", // Govt Services & Relief Information
  "16163", // Fire Service Headquarters direct
  "16263", // National Health Helpline (Shastho Batayan)
]);

/**
 * Splits composite phone strings separated by `/`, `,`, `;`, `|`, ` or `, or newlines.
 * Preserves the human-readable string for each individual phone number.
 */
export function splitPhoneNumbers(input: string | undefined | null): string[] {
  if (!input) return [];
  const raw = String(input).trim();
  if (!raw || /^(n\/a|none|null|undefined)$/i.test(raw)) return [];

  return raw
    .split(/\s*(?:\/|;|,|\||\n|\bor\b)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^(n\/a|none)$/i.test(p));
}

/**
 * Normalizes an individual phone string into a valid, dialable telephone URI target.
 * Returns null if the string cannot be converted into a valid dialable number.
 */
export function parseDialablePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /^(n\/a|none|null|undefined)$/i.test(trimmed)) return null;

  const hasPlus = trimmed.startsWith("+");
  const cleanDigits = trimmed.replace(/\D/g, "");
  if (!cleanDigits) return null;

  // Short codes (3-5 digits) - never prefixed with +
  if (
    BD_EMERGENCY_SHORT_CODES.has(cleanDigits) ||
    (cleanDigits.length >= 3 && cleanDigits.length <= 5 && !hasPlus)
  ) {
    return cleanDigits;
  }

  // International numbers with explicit '+'
  if (hasPlus) {
    return `+${cleanDigits}`;
  }

  // Clean local digits (e.g. '01711000000' or '028144466')
  return cleanDigits;
}

/**
 * Produces a clean, dialable string for a tel: URI.
 * Resolves MAP-1: handles compound strings like "999 / +880 2 8631 822" or "999, +880 2 8631 822"
 * by selecting the primary dialable number without mangling digits together.
 */
export function toDialablePhone(input: string | undefined | null): string {
  const parts = splitPhoneNumbers(input);
  if (parts.length === 0) return "";
  for (const part of parts) {
    const dialable = parseDialablePhone(part);
    if (dialable) return dialable;
  }
  return "";
}

/**
 * Returns structured phone options for emergency places with multiple numbers.
 * Allows UI to display multiple call options or clearly identified primary numbers.
 */
export function getPhoneOptions(
  input: string | undefined | null,
): { display: string; dialable: string }[] {
  const parts = splitPhoneNumbers(input);
  const options: { display: string; dialable: string }[] = [];
  const seenDialable = new Set<string>();

  for (const part of parts) {
    const dialable = parseDialablePhone(part);
    if (dialable && !seenDialable.has(dialable)) {
      seenDialable.add(dialable);
      options.push({ display: part, dialable });
    }
  }

  return options;
}
