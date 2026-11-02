import { VERIFIED_EMERGENCY_PLACES } from "./map/places";
import type { Coordinates } from "./map/types";
import { isValidCoordinates } from "./map/types";
import { getStoredShelters } from "./data";

export interface MapSearch {
  /** id of a place on the map */
  place?: string;
  /** free-text fallback: pre-fills the map's search box */
  q?: string;
}

export interface MapSearchTarget {
  id?: string | undefined;
  name: string;
  kind?: "shelter" | "service" | undefined;
  coordinates?: Coordinates | null | undefined;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Authoritatively matches an emergency place against a target shelter ID or place ID.
 * Eliminates reliance on hardcoded prefixes while seamlessly supporting:
 * - Firestore authoritative doc IDs (e.g. "mirpur", "dhanmondi", "shelter-1750000000000")
 * - Map place marker IDs (e.g. "shelter-mirpur", "shelter-place-...")
 */
export function matchShelterPlace(
  place: { id: string; shelterId?: string | undefined },
  shelterIdOrPlaceId: string,
): boolean {
  if (!shelterIdOrPlaceId) return false;
  const target = shelterIdOrPlaceId.trim();
  if (!target) return false;

  // Exact match on authoritative shelterId or marker id
  if (place.shelterId && place.shelterId === target) return true;
  if (place.id === target) return true;

  // Normalised shelter- prefix variations
  if (place.id === `shelter-${target}`) return true;
  if (place.shelterId && `shelter-${place.shelterId}` === target) return true;

  // Stripped comparisons for resilient cross-prefix matching
  const strip = (id: string) => id.replace(/^shelter-place-|^shelter-/, "");
  const strippedTarget = strip(target);
  if (strippedTarget) {
    if (strip(place.id) === strippedTarget) return true;
    if (place.shelterId && strip(place.shelterId) === strippedTarget) return true;
  }

  return false;
}

/**
 * Builds a Google Maps Directions URL with optional GPS origin.
 * Returns null if destination coordinates are invalid or missing.
 */
export function buildDirectionsUrl(
  destination: Coordinates,
  origin?: Coordinates | null,
): string | null {
  if (!isValidCoordinates(destination)) return null;
  const destStr = `${destination.lat},${destination.lng}`;
  const originParam =
    origin && isValidCoordinates(origin) ? `&origin=${origin.lat},${origin.lng}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${destStr}${originParam}`;
}

/**
 * Builds the `/map` search params for a "Directions" button.
 *
 * Checks verified emergency places first, supports dynamic Firestore shelters with
 * valid coordinates, and falls back to honest text search queries (q) when coordinates
 * are missing or unverified.
 */
export function mapSearchFor(target: MapSearchTarget): MapSearch {
  if (target.kind === "shelter" && target.id) {
    // 1. Look up in verified emergency places by shelter identity
    const verified = VERIFIED_EMERGENCY_PLACES.find((p) => matchShelterPlace(p, target.id!));
    if (verified) {
      return { place: verified.id };
    }

    // 2. If coordinates are provided, check validity
    if (target.coordinates !== undefined) {
      if (!target.coordinates || !isValidCoordinates(target.coordinates)) {
        return { q: target.name };
      }
      return { place: target.id };
    }

    // 3. Dynamic shelter without coordinates passed - check local stored shelters cache
    const stored = getStoredShelters().find((s) => s.id === target.id);
    if (stored) {
      if (!stored.coordinates || !isValidCoordinates(stored.coordinates)) {
        return { q: target.name };
      }
      return { place: target.id };
    }

    // Fallback: pass target.id so map can resolve it from liveShelters if present
    return { place: target.id };
  }

  // 4. Emergency services or shelter name matching in verified emergency places
  const wanted = norm(target.name);
  if (wanted) {
    const byName = VERIFIED_EMERGENCY_PLACES.find((p) => {
      const n = norm(p.name);
      return n === wanted || n.startsWith(wanted) || wanted.startsWith(n);
    });
    if (byName) return { place: byName.id };
  }

  return { q: target.name };
}
