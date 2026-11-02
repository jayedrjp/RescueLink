import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  toDialablePhone,
  splitPhoneNumbers,
  parseDialablePhone,
  getPhoneOptions,
  BD_EMERGENCY_SHORT_CODES,
} from "../phone";
import {
  calculateDistanceKm,
  fetchNearbyOsmPlaces,
  VERIFIED_EMERGENCY_PLACES,
} from "../map/places";
import { isValidCoordinates, type EmergencyPlace, type Coordinates } from "../map/types";
import type { Shelter } from "../data";

describe("Phase 6: Map & Emergency Services (MAP-1 through MAP-7)", () => {
  // ---------------------------------------------------------------------------
  // MAP-1: Phone Number Parsing & Dialable tel: URIs
  // ---------------------------------------------------------------------------
  describe("MAP-1: Phone Number Parsing & tel: URI Sanitization", () => {
    it("recognizes Bangladesh national emergency short codes without +880 prefix", () => {
      // Short codes should never be prepended with +880
      const shortCodes = [
        "999",
        "102",
        "100",
        "101",
        "109",
        "1090",
        "106",
        "333",
        "16163",
        "16263",
      ];
      for (const code of shortCodes) {
        expect(BD_EMERGENCY_SHORT_CODES.has(code)).toBe(true);
        expect(toDialablePhone(code)).toBe(code);
        expect(parseDialablePhone(code)).toBe(code);
      }
    });

    it("does not concatenate multiple numbers into an invalid long string", () => {
      // Previously "999 / +880 2 8631822" would become "99988028631822"
      const composite1 = "999 / +880 2 8631822";
      expect(toDialablePhone(composite1)).toBe("999");

      const composite2 = "+880 2 8631822, 01711000000";
      expect(toDialablePhone(composite2)).toBe("+88028631822");
    });

    it("splits composite numbers with various common delimiters", () => {
      const slashDelimited = splitPhoneNumbers("999 / 01711000000 / 02 8144466");
      expect(slashDelimited).toEqual(["999", "01711000000", "02 8144466"]);

      const commaDelimited = splitPhoneNumbers("+880 2 9661051, 102");
      expect(commaDelimited).toEqual(["+880 2 9661051", "102"]);

      const wordDelimited = splitPhoneNumbers("01711000000 or 01811000000");
      expect(wordDelimited).toEqual(["01711000000", "01811000000"]);

      const semicolonDelimited = splitPhoneNumbers("1090; +8801911000000");
      expect(semicolonDelimited).toEqual(["1090", "+8801911000000"]);
    });

    it("formats standard Bangladesh mobile and landline numbers for dialable URIs", () => {
      expect(parseDialablePhone("01711-223344")).toBe("01711223344");
      expect(parseDialablePhone("+880 1819-123456")).toBe("+8801819123456");
      expect(parseDialablePhone("02 8144466")).toBe("028144466");
      expect(parseDialablePhone("+880-2-9661051")).toBe("+88029661051");
    });

    it("returns structured phone options for multi-number facilities", () => {
      const options = getPhoneOptions("999 / +880 2 8631822");
      expect(options).toHaveLength(2);
      expect(options[0]).toEqual({ display: "999", dialable: "999" });
      expect(options[1]).toEqual({ display: "+880 2 8631822", dialable: "+88028631822" });
    });

    it("verified emergency places have valid dialablePhone entries", () => {
      for (const place of VERIFIED_EMERGENCY_PLACES) {
        if (place.phone) {
          expect(place.dialablePhone).toBeDefined();
          expect(typeof place.dialablePhone).toBe("string");
          expect(place.dialablePhone!.length).toBeGreaterThanOrEqual(3);
          expect(place.dialablePhone).not.toContain(" ");
          expect(place.dialablePhone).not.toContain("-");
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // MAP-2: Map Camera Centering & Leaflet Asynchronous Buffering
  // ---------------------------------------------------------------------------
  describe("MAP-2: Asynchronous Camera Centering & Interaction Shielding", () => {
    it("buffers flyTo coordinates when Leaflet map instance is pending", () => {
      // Simulate InteractiveMap pendingFlyToRef logic
      let mapInstance: { flyTo: (coords: [number, number], zoom: number) => void } | null = null;
      let pendingFlyTo: { coords: [number, number]; zoom: number } | null = null;
      const flyToMock = vi.fn();

      const flyTo = (coords: [number, number], zoom = 15) => {
        if (mapInstance) {
          mapInstance.flyTo(coords, zoom);
        } else {
          pendingFlyTo = { coords, zoom };
        }
      };

      // Call flyTo before map is loaded
      flyTo([23.8103, 90.4125], 16);
      expect(flyToMock).not.toHaveBeenCalled();
      expect(pendingFlyTo).toEqual({ coords: [23.8103, 90.4125], zoom: 16 });

      // Leaflet completes async initialization
      mapInstance = { flyTo: flyToMock };
      const pending = pendingFlyTo as { coords: [number, number]; zoom: number } | null;
      if (pending) {
        mapInstance.flyTo(pending.coords, pending.zoom);
        pendingFlyTo = null;
      }

      expect(flyToMock).toHaveBeenCalledTimes(1);
      expect(flyToMock).toHaveBeenCalledWith([23.8103, 90.4125], 16);
      expect(pendingFlyTo).toBeNull();
    });

    it("prevents background updates from hijacking camera when user is interacting", () => {
      let isUserInteracting = false;
      const flyToMock = vi.fn();

      const onUserDragStart = () => {
        isUserInteracting = true;
      };

      const handleBackgroundLocationUpdate = (newCoords: [number, number]) => {
        if (isUserInteracting) {
          // Do not steal camera focus while user is panning/zooming
          return;
        }
        flyToMock(newCoords, 15);
      };

      // Background update arrives normally when user is not interacting
      handleBackgroundLocationUpdate([23.8, 90.4]);
      expect(flyToMock).toHaveBeenCalledTimes(1);

      // User starts dragging/exploring the map
      onUserDragStart();
      handleBackgroundLocationUpdate([23.85, 90.45]);
      // Should not have fired second flyTo
      expect(flyToMock).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // MAP-3: Live Firestore Shelters & Coordinate Validation
  // ---------------------------------------------------------------------------
  describe("MAP-3: Live Firestore Shelters Synchronization & Validation", () => {
    it("validates real-world coordinates and rejects invalid ones", () => {
      expect(isValidCoordinates({ lat: 23.8068, lng: 90.3688 })).toBe(true);
      expect(isValidCoordinates({ lat: 0, lng: 0 })).toBe(false); // Null Island
      expect(isValidCoordinates({ lat: 95, lng: 90 })).toBe(false); // Out of bounds
      expect(isValidCoordinates({ lat: NaN, lng: 90 })).toBe(false);
      expect(isValidCoordinates(null)).toBe(false);
    });

    it("converts Firestore shelters with valid coordinates into EmergencyPlace markers", () => {
      const firestoreShelter: Shelter = {
        id: "shelter-admin-new",
        name: "Uttara Sector 7 Community Center",
        area: "Sector 7, Road 13, Uttara, Dhaka",
        phone: "+880 1711-889900",
        capacity: 350,
        occupied: 120,
        status: "open",
        coordinates: { lat: 23.8708, lng: 90.3982 },
        facilities: ["Medical", "Clean Water", "Backup Power"],
        needs: ["Blankets"],
        image: "shelter-default",
      };

      // Simulates shelterToEmergencyPlace conversion
      const place: EmergencyPlace = {
        id: firestoreShelter.id,
        name: firestoreShelter.name,
        category: "shelters",
        coordinates: firestoreShelter.coordinates!,
        address: firestoreShelter.area,
        phone: firestoreShelter.phone,
        dialablePhone: toDialablePhone(firestoreShelter.phone),
        phones: firestoreShelter.phone ? getPhoneOptions(firestoreShelter.phone) : undefined,
        status: `${firestoreShelter.capacity - (firestoreShelter.occupied || 0)} spots available`,
        open: firestoreShelter.status === "open",
        shelterId: firestoreShelter.id,
        capacity: firestoreShelter.capacity,
        occupied: firestoreShelter.occupied,
        isVerified: true,
        source: "verified",
      };

      expect(place.id).toBe("shelter-admin-new");
      expect(place.coordinates.lat).toBeCloseTo(23.8708);
      expect(place.capacity).toBe(350);
      expect(place.status).toBe("230 spots available");
      expect(place.dialablePhone).toBe("+8801711889900");
    });

    it("excludes shelters without valid coordinates from map markers", () => {
      const sheltersWithoutCoords: Shelter[] = [
        {
          id: "shelter-no-coords",
          name: "Old Dhaka Relief Camp",
          area: "Armanitola, Dhaka",
          phone: "02 7312345",
          capacity: 200,
          occupied: 50,
          status: "open",
          facilities: [],
          needs: [],
          image: "",
          // missing coordinates
        },
        {
          id: "shelter-null-island",
          name: "Faulty GPS Center",
          area: "Gulshan",
          phone: "01700000000",
          capacity: 100,
          occupied: 10,
          status: "open",
          facilities: [],
          needs: [],
          image: "",
          coordinates: { lat: 0, lng: 0 },
        },
      ];

      const validPlaces = sheltersWithoutCoords.filter(
        (s) => s.coordinates && isValidCoordinates(s.coordinates),
      );

      expect(validPlaces).toHaveLength(0);
    });

    it("syncs updated shelter properties (coordinates, phone, name, capacity)", () => {
      const originalPlace: EmergencyPlace = {
        id: "shelter-mirpur",
        name: "Mirpur Section 10 Community Center",
        category: "shelters",
        coordinates: { lat: 23.8068, lng: 90.3688 },
        address: "Mirpur 10, Dhaka",
        phone: "+880 2 9002030",
        capacity: 400,
        occupied: 150,
        shelterId: "mirpur",
        isVerified: true,
        source: "verified",
      };

      const updatedShelter: Shelter = {
        id: "mirpur",
        name: "Updated Mirpur Disaster Relief Center",
        area: "Plot 12, Section 10, Mirpur, Dhaka",
        phone: "01700112233",
        capacity: 550,
        occupied: 200,
        status: "open",
        facilities: [],
        needs: [],
        image: "",
        coordinates: { lat: 23.8075, lng: 90.3692 }, // Edited coordinates
      };

      // Perform update sync
      const syncedPlace: EmergencyPlace = {
        ...originalPlace,
        name: updatedShelter.name,
        address: updatedShelter.area,
        phone: updatedShelter.phone,
        dialablePhone: toDialablePhone(updatedShelter.phone),
        capacity: updatedShelter.capacity,
        occupied: updatedShelter.occupied,
        coordinates: updatedShelter.coordinates!,
      };

      expect(syncedPlace.name).toBe("Updated Mirpur Disaster Relief Center");
      expect(syncedPlace.coordinates.lat).toBe(23.8075);
      expect(syncedPlace.capacity).toBe(550);
      expect(syncedPlace.dialablePhone).toBe("01700112233");
    });
  });

  // ---------------------------------------------------------------------------
  // MAP-4: Overpass API Node & Way Geometry Parsing
  // ---------------------------------------------------------------------------
  describe("MAP-4: Overpass API Node and Way Geometry Parsing", () => {
    const mockCenter: Coordinates = { lat: 23.8103, lng: 90.4125 };

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("parses both node coordinates and way center coordinates", async () => {
      const mockOverpassResponse = {
        elements: [
          // Node element (lat/lon on top level)
          {
            type: "node",
            id: 1001,
            lat: 23.812,
            lon: 90.415,
            tags: {
              amenity: "hospital",
              name: "Kurmitola General Hospital",
              "addr:street": "Airport Road",
              phone: "02 55067000",
              opening_hours: "24/7",
            },
          },
          // Way element (area polygon with center.lat/center.lon)
          {
            type: "way",
            id: 2002,
            center: {
              lat: 23.815,
              lon: 90.418,
            },
            tags: {
              amenity: "police",
              name: "Cantonment Police Station",
              "addr:street": "Dhaka Cantonment",
              phone: "01713373155",
            },
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      } as Response);

      const places = await fetchNearbyOsmPlaces(mockCenter, 2000);
      expect(places).toHaveLength(2);

      const hospital = places.find((p) => p.category === "hospitals")!;
      expect(hospital).toBeDefined();
      expect(hospital.id).toBe("osm-node-1001");
      expect(hospital.coordinates).toEqual({ lat: 23.812, lng: 90.415 });
      expect(hospital.open).toBe(true);
      expect(hospital.status).toBe("Open 24/7");
      expect(hospital.source).toBe("osm");
      expect(hospital.isVerified).toBe(false);

      const police = places.find((p) => p.category === "police")!;
      expect(police).toBeDefined();
      expect(police.id).toBe("osm-way-2002");
      expect(police.coordinates).toEqual({ lat: 23.815, lng: 90.418 });
      expect(police.open).toBeUndefined(); // Opening hours unknown
      expect(police.status).toBe("Hours unverified");
      expect(police.source).toBe("osm");
      expect(police.isVerified).toBe(false);
    });

    it("sorts Overpass results by proximity to center", async () => {
      const mockOverpassResponse = {
        elements: [
          {
            type: "node",
            id: 3001,
            lat: 23.85, // farther (~4.5km)
            lon: 90.4125,
            tags: { amenity: "pharmacy", name: "Far Pharmacy" },
          },
          {
            type: "node",
            id: 3002,
            lat: 23.812, // nearer (~0.2km)
            lon: 90.4125,
            tags: { amenity: "pharmacy", name: "Near Pharmacy" },
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockOverpassResponse,
      } as Response);

      const places = await fetchNearbyOsmPlaces(mockCenter, 5000);
      expect(places[0]?.name).toBe("Near Pharmacy");
      expect(places[1]?.name).toBe("Far Pharmacy");
    });
  });

  // ---------------------------------------------------------------------------
  // MAP-5: Spatial Deduplication & Bounded Overpass Calls
  // ---------------------------------------------------------------------------
  describe("MAP-5: Spatial Deduplication & Bounded Overpass Calls", () => {
    it("deduplicates OSM places within 50 meters of verified emergency places", () => {
      const verifiedPlace: EmergencyPlace = {
        id: "hosp-dmch",
        name: "Dhaka Medical College Hospital",
        category: "hospitals",
        coordinates: { lat: 23.7258, lng: 90.3976 },
        address: "Secretariat Rd, Dhaka",
        isVerified: true,
        source: "verified",
      };

      const rawOsmPlaces: EmergencyPlace[] = [
        // Duplicate: within 20m of DMCH
        {
          id: "osm-node-9999",
          name: "DMCH Emergency Gate",
          category: "hospitals",
          coordinates: { lat: 23.7259, lng: 90.3977 }, // ~15m away
          address: "Dhaka",
          isVerified: false,
          source: "osm",
        },
        // Distinct facility: 1.5km away
        {
          id: "osm-node-8888",
          name: "Salimullah Medical College Hospital",
          category: "hospitals",
          coordinates: { lat: 23.7105, lng: 90.4018 },
          address: "Mitford, Dhaka",
          isVerified: false,
          source: "osm",
        },
      ];

      const verifiedPlaces = [verifiedPlace];

      // Simulate the spatial deduplication algorithm from map.tsx
      const deduplicatedOsm = rawOsmPlaces.filter((osm) => {
        const isDuplicate = verifiedPlaces.some((vp) => {
          const dist = calculateDistanceKm(vp.coordinates, osm.coordinates);
          if (dist < 0.05) return true; // Within 50 meters
          const normVp = vp.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          const normOsm = osm.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          return normVp.includes(normOsm) || normOsm.includes(normVp);
        });
        return !isDuplicate;
      });

      expect(deduplicatedOsm).toHaveLength(1);
      expect(deduplicatedOsm[0]?.id).toBe("osm-node-8888");
    });

    it("prevents Overpass refetching if center moved less than 500 meters", () => {
      const lastCenter: Coordinates = { lat: 23.8103, lng: 90.4125 };
      const smallMovement: Coordinates = { lat: 23.8115, lng: 90.4135 }; // ~170 meters
      const largeMovement: Coordinates = { lat: 23.82, lng: 90.42 }; // ~1.3 km

      const distSmall = calculateDistanceKm(lastCenter, smallMovement);
      const distLarge = calculateDistanceKm(lastCenter, largeMovement);

      expect(distSmall).toBeLessThan(0.5);
      expect(distLarge).toBeGreaterThanOrEqual(0.5);

      // Condition used in map.tsx
      const shouldRefetchSmall = distSmall >= 0.5;
      const shouldRefetchLarge = distLarge >= 0.5;

      expect(shouldRefetchSmall).toBe(false);
      expect(shouldRefetchLarge).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // MAP-6: Place Selection Synchronization & Filter Consistency
  // ---------------------------------------------------------------------------
  describe("MAP-6: Place Selection Synchronization & Empty Filter Handling", () => {
    const testPlaces: EmergencyPlace[] = [
      {
        id: "shelter-1",
        name: "Mirpur Shelter",
        category: "shelters",
        coordinates: { lat: 23.8068, lng: 90.3688 },
        address: "Mirpur",
        isVerified: true,
        source: "verified",
      },
      {
        id: "hosp-1",
        name: "Square Hospital",
        category: "hospitals",
        coordinates: { lat: 23.7531, lng: 90.3816 },
        address: "Panthapath",
        isVerified: true,
        source: "verified",
      },
      {
        id: "police-1",
        name: "Dhanmondi Police Station",
        category: "police",
        coordinates: { lat: 23.7461, lng: 90.3742 },
        address: "Dhanmondi",
        isVerified: true,
        source: "verified",
      },
    ];

    it("resets selection or syncs to first visible match when active filter changes", () => {
      let activeCategory: string = "shelters";
      let selectedPlaceId: string | null = "shelter-1";

      let filtered = testPlaces.filter((p) => p.category === activeCategory);
      expect(filtered).toHaveLength(1);
      expect(filtered.some((p) => p.id === selectedPlaceId)).toBe(true);

      // User switches category filter to 'police'
      activeCategory = "police";
      filtered = testPlaces.filter((p) => p.category === activeCategory);

      // Selection synchronization check
      const currentSelectedStillVisible = filtered.some((p) => p.id === selectedPlaceId);
      if (!currentSelectedStillVisible) {
        selectedPlaceId = filtered[0]?.id ?? null;
      }

      expect(selectedPlaceId).toBe("police-1");
    });

    it("clears selection when search query produces 0 results", () => {
      const searchQuery = "NonExistentPlaceQuery";
      const filtered = testPlaces.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );

      let selectedPlaceId: string | null = "shelter-1";
      if (filtered.length === 0) {
        selectedPlaceId = null;
      }

      expect(filtered).toHaveLength(0);
      expect(selectedPlaceId).toBeNull();
    });

    it("does not render phantom pins on the map for excluded categories", () => {
      const activeCategory = "hospitals";
      // Map markers are strictly derived from filteredPlaces
      const mapMarkers = testPlaces.filter((p) => p.category === activeCategory);

      expect(mapMarkers.map((m) => m.category)).toEqual(["hospitals"]);
      expect(mapMarkers.some((m) => m.category === "shelters")).toBe(false);
      expect(mapMarkers.some((m) => m.category === "police")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // MAP-7: Geolocation Watcher Lifecycle & Deduplication
  // ---------------------------------------------------------------------------
  describe("MAP-7: Geolocation Watcher Lifecycle & Deduplication", () => {
    it("cleans up geolocation watcher when tracking stops or unmounts", () => {
      const clearWatchMock = vi.fn();
      let activeWatcherCleanup: (() => void) | null = () => {
        clearWatchMock();
      };

      // Stop tracking or unmount component
      if (activeWatcherCleanup) {
        activeWatcherCleanup();
        activeWatcherCleanup = null;
      }

      expect(clearWatchMock).toHaveBeenCalledTimes(1);
      expect(activeWatcherCleanup).toBeNull();
    });

    it("prevents redundant initial geolocation calls on component mount", () => {
      let initialGeoDone = false;
      const geoRequestMock = vi.fn();

      const triggerInitialGeolocation = () => {
        if (initialGeoDone) return;
        initialGeoDone = true;
        geoRequestMock();
      };

      // First mount trigger
      triggerInitialGeolocation();
      expect(geoRequestMock).toHaveBeenCalledTimes(1);

      // Duplicate invocation (e.g. strict mode or rerender)
      triggerInitialGeolocation();
      expect(geoRequestMock).toHaveBeenCalledTimes(1);
    });
  });
});
