export type PlaceCategory = "shelters" | "hospitals" | "police" | "fire" | "pharmacies";

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Validates that an object contains finite, real-world geographical coordinates.
 * Excludes (0,0) (Null Island) as well as NaN, infinite, or out-of-range values.
 */
export function isValidCoordinates(c: unknown): c is Coordinates {
  if (!c || typeof c !== "object") return false;
  const { lat, lng } = c as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6)
  );
}

export interface EmergencyPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  coordinates: Coordinates;
  address: string;
  phone?: string | undefined;
  dialablePhone?: string | undefined;
  phones?: { display: string; dialable: string }[] | undefined;
  distanceKm?: number | undefined;
  status?: string | undefined;
  open?: boolean | undefined;
  shelterId?: string | undefined;
  serviceId?: string | undefined;
  capacity?: number | undefined;
  occupied?: number | undefined;
  isVerified: boolean;
  source: "verified" | "osm";
}

export interface DisasterZone {
  id: string;
  title: string;
  type: "flood" | "waterlogging" | "cyclone";
  severity: "critical" | "warning";
  coordinates: Coordinates;
  radiusMeters: number;
  description: string;
}
