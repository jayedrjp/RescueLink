/**
 * RescueLink Volunteer Eligibility and Identity Verification Utilities
 *
 * Implements:
 * - Age calculation and strict 18–30 age range eligibility validation.
 * - 10-digit numeric National ID (NID) format validation.
 * - Privacy-preserving NID masking (default presentation in UI and logs).
 * - Keyed cryptographic HMAC / SHA-256 digest computation for atomic database uniqueness.
 * - Secure AES-256-GCM encryption/decryption for backend-persisted NID payloads.
 */

export const MIN_VOLUNTEER_AGE = 18;
export const MAX_VOLUNTEER_AGE = 30;

/**
 * Calculates an applicant's whole age in years from their Date of Birth string (YYYY-MM-DD).
 * Accurately accounts for leap years, birth month, and birth day relative to a reference date.
 */
export function calculateAge(dobString: string, referenceDate: Date = new Date()): number | null {
  if (!dobString || typeof dobString !== "string") return null;

  const parts = dobString.trim().split("-");
  if (parts.length !== 3) return null;

  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const dob = new Date(year, month - 1, day);
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) {
    return null; // Invalid date (e.g. Feb 31)
  }

  // Future birthdates are invalid
  if (dob.getTime() > referenceDate.getTime()) {
    return null;
  }

  let age = referenceDate.getFullYear() - dob.getFullYear();
  const m = referenceDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && referenceDate.getDate() < dob.getDate())) {
    age--;
  }

  return age >= 0 ? age : null;
}

/**
 * Checks whether an applicant's age is within the eligible volunteer range:
 * 18 to 30 years inclusive.
 */
export function isAgeEligible(age: number | null): boolean {
  if (age === null || typeof age !== "number") return false;
  return age >= MIN_VOLUNTEER_AGE && age <= MAX_VOLUNTEER_AGE;
}

/**
 * Validates that an NID string consists of exactly 10 numeric digits.
 * Rejects letters, symbols, whitespace, and invalid lengths.
 */
export function isValidNid(nid: string): boolean {
  if (!nid || typeof nid !== "string") return false;
  return /^\d{10}$/.test(nid.trim());
}

/**
 * Masks an NID number for safe display in UI, admin views, and logs.
 * Example: "1234567890" -> "******7890" (only last 4 digits exposed).
 */
export function maskNid(nid: string): string {
  if (!nid || typeof nid !== "string") return "******";
  const clean = nid.trim();
  if (clean.length < 4) return "******";
  const visible = clean.slice(-4);
  return `${"*".repeat(Math.max(6, clean.length - 4))}${visible}`;
}

/**
 * Computes a keyed cryptographic HMAC-SHA256 digest of an NID.
 * Used as the document key in the `volunteer_nids` collection for atomic uniqueness checks.
 * Uses Web Crypto API natively available across modern browsers, Capacitor, Node 18+, and Workers.
 */
export async function computeNidHash(nid: string, secretKey?: string): Promise<string> {
  const cleanNid = nid.trim();
  const keyStr =
    secretKey ||
    (typeof process !== "undefined" && process.env?.["NID_HMAC_SECRET"]) ||
    "rescuelink-prod-nid-pepper-v1";

  const enc = new TextEncoder();
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is not available in the current environment.");
  }

  const key = await subtle.importKey(
    "raw",
    enc.encode(keyStr),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", key, enc.encode(cleanNid));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Encrypts an NID using AES-GCM-256 for secure server-side or encrypted Firestore storage.
 */
export async function encryptNid(nid: string, secretKey?: string): Promise<string> {
  const cleanNid = nid.trim();
  const keyStr =
    secretKey ||
    (typeof process !== "undefined" && process.env?.["NID_ENCRYPTION_KEY"]) ||
    "rescuelink-prod-nid-aes-key-v1-32chars!";

  const enc = new TextEncoder();
  const keyMaterial = enc.encode(keyStr.padEnd(32, "0").slice(0, 32));
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is not available in the current environment.");
  }

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, enc.encode(cleanNid));

  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const ctHex = Array.from(new Uint8Array(ciphertext))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${ivHex}:${ctHex}`;
}

/**
 * Decrypts an encrypted NID payload (accessible only to authorized administrative actions).
 */
export async function decryptNid(payload: string, secretKey?: string): Promise<string> {
  if (!payload || !payload.includes(":")) throw new Error("Invalid encrypted NID payload");

  const keyStr =
    secretKey ||
    (typeof process !== "undefined" && process.env?.["NID_ENCRYPTION_KEY"]) ||
    "rescuelink-prod-nid-aes-key-v1-32chars!";

  const enc = new TextEncoder();
  const keyMaterial = enc.encode(keyStr.padEnd(32, "0").slice(0, 32));
  const parts = payload.split(":");
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is not available in the current environment.");
  }

  const [ivHex, ctHex] = parts;
  if (!ivHex || !ctHex) throw new Error("Malformed payload");
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  const ct = new Uint8Array(ctHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

  const cryptoKey = await subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
  const decrypted = await subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ct);
  return new TextDecoder().decode(decrypted);
}
