import { describe, expect, it } from "vitest";
import { isValidCoordinates } from "@/lib/map/types";
import { VERIFIED_EMERGENCY_PLACES } from "@/lib/map/places";
import { buildDirectionsUrl, mapSearchFor, matchShelterPlace } from "@/lib/map-links";
import { DeviceLocationError } from "@/lib/location";
import type { Shelter } from "@/lib/data";
import type { EmergencyPlace } from "@/lib/map/types";

describe("Phase 3: Map, Shelter Markers & Directions Reliability", () => {
  // -------------------------------------------------------------------------
  // 1. Geographic Coordinate Validation
  // -------------------------------------------------------------------------
  describe("1. Coordinate Validation (isValidCoordinates)", () => {
    it("accepts valid, finite real-world coordinates", () => {
      expect(isValidCoordinates({ lat: 23.8068, lng: 90.3688 })).toBe(true);
      expect(isValidCoordinates({ lat: -33.8688, lng: 151.2093 })).toBe(true);
      expect(isValidCoordinates({ lat: 90, lng: 180 })).toBe(true);
      expect(isValidCoordinates({ lat: -90, lng: -180 })).toBe(true);
    });

    it("rejects Null Island (0,0) as an invalid or uncalibrated GPS fix", () => {
      expect(isValidCoordinates({ lat: 0, lng: 0 })).toBe(false);
      expect(isValidCoordinates({ lat: 0.00000001, lng: 0.00000001 })).toBe(false);
    });

    it("rejects out-of-range latitudes and longitudes", () => {
      expect(isValidCoordinates({ lat: 90.1, lng: 90 })).toBe(false);
      expect(isValidCoordinates({ lat: -90.1, lng: 90 })).toBe(false);
      expect(isValidCoordinates({ lat: 23.8, lng: 180.1 })).toBe(false);
      expect(isValidCoordinates({ lat: 23.8, lng: -180.1 })).toBe(false);
    });

    it("rejects non-numeric, NaN, Infinity, or missing values", () => {
      expect(isValidCoordinates(null)).toBe(false);
      expect(isValidCoordinates(undefined)).toBe(false);
      expect(isValidCoordinates({})).toBe(false);
      expect(isValidCoordinates({ lat: NaN, lng: 90.3 })).toBe(false);
      expect(isValidCoordinates({ lat: 23.8, lng: Infinity })).toBe(false);
      expect(isValidCoordinates({ lat: "23.8", lng: "90.3" })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Shelter Marker Identity Resolution & Matching
  // -------------------------------------------------------------------------
  describe("2. Shelter Marker Identity (matchShelterPlace)", () => {
    const staticMirpur = VERIFIED_EMERGENCY_PLACES.find((p) => p.id === "shelter-mirpur")!;
    const staticMohammadpur = VERIFIED_EMERGENCY_PLACES.find(
      (p) => p.id === "shelter-mohammadpur",
    )!;

    it("matches static shelter by authoritative shelter doc ID", () => {
      expect(matchShelterPlace(staticMirpur, "mirpur")).toBe(true);
      expect(matchShelterPlace(staticMohammadpur, "mohammadpur")).toBe(true);
    });

    it("matches static shelter by map place marker ID", () => {
      expect(matchShelterPlace(staticMirpur, "shelter-mirpur")).toBe(true);
      expect(matchShelterPlace(staticMohammadpur, "shelter-mohammadpur")).toBe(true);
    });

    it("matches dynamically created shelter by authoritative timestamp ID", () => {
      const dynPlace: EmergencyPlace = {
        id: "shelter-1750000000000",
        name: "Dynamic Relief Camp",
        category: "shelters",
        coordinates: { lat: 23.81, lng: 90.41 },
        address: "Mirpur 12",
        shelterId: "shelter-1750000000000",
        isVerified: true,
        source: "verified",
      };

      expect(matchShelterPlace(dynPlace, "shelter-1750000000000")).toBe(true);
    });

    it("matches dynamic shelter even if prefixed with legacy shelter-place-", () => {
      const legacyPlace: EmergencyPlace = {
        id: "shelter-place-shelter-1750000000000",
        name: "Dynamic Relief Camp",
        category: "shelters",
        coordinates: { lat: 23.81, lng: 90.41 },
        address: "Mirpur 12",
        shelterId: "shelter-1750000000000",
        isVerified: true,
        source: "verified",
      };

      expect(matchShelterPlace(legacyPlace, "shelter-1750000000000")).toBe(true);
      expect(matchShelterPlace(legacyPlace, "shelter-place-shelter-1750000000000")).toBe(true);
    });

    it("rejects mismatched shelter IDs", () => {
      expect(matchShelterPlace(staticMirpur, "dhanmondi")).toBe(false);
      expect(matchShelterPlace(staticMirpur, "shelter-dhanmondi")).toBe(false);
      expect(matchShelterPlace(staticMirpur, "")).toBe(false);
    });

    it("ensures verified places have valid shelterId fields", () => {
      expect(staticMirpur.shelterId).toBe("mirpur");
      expect(staticMohammadpur.shelterId).toBe("mohammadpur");
      const dhanmondi = VERIFIED_EMERGENCY_PLACES.find((p) => p.id === "shelter-dhanmondi")!;
      expect(dhanmondi.shelterId).toBe("dhanmondi");
      const uttara = VERIFIED_EMERGENCY_PLACES.find((p) => p.id === "shelter-uttara")!;
      expect(uttara.shelterId).toBe("uttara");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Directions URL Generation
  // -------------------------------------------------------------------------
  describe("3. Directions URL Builder (buildDirectionsUrl)", () => {
    const mirpurCoords = { lat: 23.8068, lng: 90.3688 };
    const userGps = { lat: 23.7531, lng: 90.3816 };

    it("generates destination-only directions when user location is absent", () => {
      const url = buildDirectionsUrl(mirpurCoords);
      expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=23.8068,90.3688");
    });

    it("generates directions with user GPS origin when user location is provided and valid", () => {
      const url = buildDirectionsUrl(mirpurCoords, userGps);
      expect(url).toBe(
        "https://www.google.com/maps/dir/?api=1&destination=23.8068,90.3688&origin=23.7531,90.3816",
      );
    });

    it("omits origin if user location has invalid coordinates (e.g. 0,0)", () => {
      const url = buildDirectionsUrl(mirpurCoords, { lat: 0, lng: 0 });
      expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=23.8068,90.3688");
    });

    it("returns null if destination coordinates are invalid or missing", () => {
      expect(buildDirectionsUrl({ lat: 0, lng: 0 })).toBeNull();
      expect(buildDirectionsUrl({ lat: NaN, lng: 90 })).toBeNull();
      expect(buildDirectionsUrl({ lat: 100, lng: 90 })).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Map Link Search Parameter Generation (mapSearchFor)
  // -------------------------------------------------------------------------
  describe("4. Directions Map Link Generator (mapSearchFor)", () => {
    it("returns verified place marker ID for static shelter (mirpur)", () => {
      const res = mapSearchFor({
        id: "mirpur",
        name: "Mirpur Shelter Center",
        kind: "shelter",
        coordinates: { lat: 23.8068, lng: 90.3688 },
      });
      expect(res).toEqual({ place: "shelter-mirpur" });
    });

    it("returns verified place marker ID for static shelter (mohammadpur)", () => {
      const res = mapSearchFor({
        id: "mohammadpur",
        name: "Mohammadpur Relief Center",
        kind: "shelter",
        coordinates: { lat: 23.7612, lng: 90.3621 },
      });
      expect(res).toEqual({ place: "shelter-mohammadpur" });
    });

    it("returns authoritative place ID for dynamic shelter with valid coordinates", () => {
      const dynId = "shelter-1750000000000";
      const res = mapSearchFor({
        id: dynId,
        name: "Dynamic Relief Camp",
        kind: "shelter",
        coordinates: { lat: 23.82, lng: 90.37 },
      });
      expect(res).toEqual({ place: dynId });
    });

    it("falls back to search query (q) when dynamic shelter has missing coordinates", () => {
      const res = mapSearchFor({
        id: "shelter-no-coords",
        name: "Tent City North",
        kind: "shelter",
        coordinates: null,
      });
      expect(res).toEqual({ q: "Tent City North" });
    });

    it("falls back to search query (q) when dynamic shelter has invalid coordinates (0,0)", () => {
      const res = mapSearchFor({
        id: "shelter-zero-coords",
        name: "Null Island Relief",
        kind: "shelter",
        coordinates: { lat: 0, lng: 0 },
      });
      expect(res).toEqual({ q: "Null Island Relief" });
    });

    it("resolves emergency service by name in verified places", () => {
      const res = mapSearchFor({
        name: "Dhaka Medical College Hospital",
        kind: "service",
      });
      expect(res).toEqual({ place: "hosp-dmch" });
    });

    it("falls back to name search query (q) when service is unknown", () => {
      const res = mapSearchFor({
        name: "Unknown Rural Clinic",
        kind: "service",
      });
      expect(res).toEqual({ q: "Unknown Rural Clinic" });
    });
  });

  // -------------------------------------------------------------------------
  // 5. Marker Deduplication & Integrity
  // -------------------------------------------------------------------------
  describe("5. Marker Deduplication & Integrity", () => {
    it("ensures live shelter sync updates existing verified shelters without duplicating them", () => {
      const liveShelters: Shelter[] = [
        {
          id: "mirpur",
          name: "Mirpur Shelter Center",
          area: "Section 10, Mirpur, Dhaka",
          capacity: 120,
          occupied: 90,
          phone: "+880 1711 000 121",
          image: "shelter-1",
          facilities: ["Food", "Water"],
          needs: [],
          status: "limited",
          coordinates: { lat: 23.8068, lng: 90.3688 },
          isLocal: true,
        },
        {
          id: "shelter-1750000000000",
          name: "Dynamic Relief Camp",
          area: "Mirpur 12, Dhaka",
          capacity: 100,
          occupied: 20,
          phone: "+880 1711 999 888",
          image: "shelter-2",
          facilities: ["Water"],
          needs: ["Blankets"],
          status: "open",
          coordinates: { lat: 23.82, lng: 90.37 },
          isLocal: false,
        },
      ];

      // Recreate coreVerifiedPlaces calculation logic
      const updatedVerified = VERIFIED_EMERGENCY_PLACES.map((place) => {
        if (place.category === "shelters") {
          const live = liveShelters.find((s) => matchShelterPlace(place, s.id));
          if (live) {
            return {
              ...place,
              capacity: live.capacity,
              occupied: live.occupied,
              status: live.status,
              open: live.status !== "full",
            };
          }
        }
        return place;
      });

      const extraShelters: EmergencyPlace[] = [];
      const seenShelterIds = new Set<string>();

      for (const s of liveShelters) {
        if (VERIFIED_EMERGENCY_PLACES.some((p) => matchShelterPlace(p, s.id))) {
          continue;
        }
        if (seenShelterIds.has(s.id)) {
          continue;
        }
        seenShelterIds.add(s.id);

        if (s.coordinates && isValidCoordinates(s.coordinates)) {
          extraShelters.push({
            id: s.id.startsWith("shelter-") ? s.id : `shelter-${s.id}`,
            name: s.name,
            category: "shelters",
            coordinates: s.coordinates,
            address: s.area,
            shelterId: s.id,
            isVerified: true,
            source: "verified",
          });
        }
      }

      // Mirpur must NOT be in extraShelters
      expect(extraShelters.some((e) => matchShelterPlace(e, "mirpur"))).toBe(false);
      // Mirpur in updatedVerified must reflect updated capacity
      const mirpurVerified = updatedVerified.find((p) => p.id === "shelter-mirpur")!;
      expect(mirpurVerified.capacity).toBe(120);
      expect(mirpurVerified.occupied).toBe(90);
      expect(mirpurVerified.status).toBe("limited");

      // Dynamic shelter must be present in extraShelters exactly once
      expect(extraShelters).toHaveLength(1);
      expect(extraShelters[0]!.id).toBe("shelter-1750000000000");
      expect(extraShelters[0]!.shelterId).toBe("shelter-1750000000000");
    });

    it("does not create a map marker for shelters with missing or invalid coordinates", () => {
      const shelterWithoutCoords: Shelter = {
        id: "shelter-no-coords",
        name: "Tent City 5",
        area: "Unknown Area",
        capacity: 50,
        occupied: 10,
        phone: "+880 1711 000 000",
        image: "shelter-1",
        facilities: [],
        needs: [],
        status: "open",
        isLocal: false,
      };

      const extraShelters: EmergencyPlace[] = [];
      if (
        shelterWithoutCoords.coordinates &&
        isValidCoordinates(shelterWithoutCoords.coordinates)
      ) {
        extraShelters.push({
          id: shelterWithoutCoords.id,
          name: shelterWithoutCoords.name,
          category: "shelters",
          coordinates: shelterWithoutCoords.coordinates,
          address: shelterWithoutCoords.area,
          shelterId: shelterWithoutCoords.id,
          isVerified: true,
          source: "verified",
        });
      }

      expect(extraShelters).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Geolocation Error Mapping
  // -------------------------------------------------------------------------
  describe("6. Geolocation Error Handling", () => {
    it("distinguishes permission denied from other location errors", () => {
      const permErr = new DeviceLocationError(
        DeviceLocationError.PERMISSION_DENIED,
        "User denied geolocation access.",
      );
      expect(permErr.code).toBe(1);
      expect(permErr.name).toBe("DeviceLocationError");

      const unavailErr = new DeviceLocationError(
        DeviceLocationError.POSITION_UNAVAILABLE,
        "Position unavailable.",
      );
      expect(unavailErr.code).toBe(2);

      const timeoutErr = new DeviceLocationError(
        DeviceLocationError.TIMEOUT,
        "Location request timed out.",
      );
      expect(timeoutErr.code).toBe(3);
    });
  });
});
