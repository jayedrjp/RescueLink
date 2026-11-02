import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/BackButton";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search,
  Navigation,
  Phone,
  ShieldCheck,
  AlertCircle,
  MapPin,
  ExternalLink,
  X,
  Compass,
} from "lucide-react";
import { toast } from "sonner";

import { Logo, Pill } from "@/components/rl";
import { InteractiveMap, type InteractiveMapHandle } from "@/components/InteractiveMap";
import {
  VERIFIED_EMERGENCY_PLACES,
  DISASTER_ZONES,
  calculateDistanceKm,
  fetchNearbyOsmPlaces,
} from "@/lib/map/places";
import type { EmergencyPlace, PlaceCategory, Coordinates } from "@/lib/map/types";
import { isValidCoordinates } from "@/lib/map/types";
import { matchShelterPlace, buildDirectionsUrl } from "@/lib/map-links";
import { toDialablePhone, getPhoneOptions } from "@/lib/phone";
import { getStoredShelters, type Shelter } from "@/lib/data";
import { subscribeToShelters } from "@/lib/firebase/firestore";
import { getCurrentDevicePosition, watchDevicePosition, DeviceLocationError } from "@/lib/location";

export interface MapSearchParams {
  /** Select this place (id from the map's place list), e.g. from a "Directions" button. */
  place?: string;
  /** Pre-fill the search box (used when no exact map location is known for a place). */
  q?: string;
}

export const Route = createFileRoute("/map")({
  validateSearch: (search: Record<string, unknown>): MapSearchParams => {
    const result: MapSearchParams = {};
    if (typeof search["place"] === "string" && search["place"].trim()) {
      result.place = search["place"].trim();
    }
    if (typeof search["q"] === "string" && search["q"].trim()) {
      result.q = search["q"].trim().slice(0, 120);
    }
    return result;
  },
  head: () => ({
    meta: [
      { title: "Live Disaster Map — RescueLink" },
      {
        name: "description",
        content:
          "See real shelters, hospitals, police, fire stations, and emergency relief services near you on the RescueLink live map.",
      },
      { property: "og:title", content: "Live Disaster Map — RescueLink" },
      {
        property: "og:description",
        content:
          "Interactive map with verified emergency services, device GPS location, and real local OpenStreetMap geography in Bangladesh.",
      },
    ],
  }),
  component: MapScreen,
});

const CATEGORY_TABS: { label: string; value: PlaceCategory | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Shelters", value: "shelters" },
  { label: "Hospitals", value: "hospitals" },
  { label: "Police", value: "police" },
  { label: "Fire Service", value: "fire" },
  { label: "Pharmacies", value: "pharmacies" },
];

// Default center: Dhaka, Bangladesh
const DHAKA_DEFAULT: Coordinates = { lat: 23.7531, lng: 90.3816 };

function shelterToEmergencyPlace(s: Shelter): EmergencyPlace | null {
  if (!s.coordinates || !isValidCoordinates(s.coordinates)) {
    return null;
  }
  const placeId = s.id.startsWith("shelter-") ? s.id : `shelter-${s.id}`;
  const phone = s.phone ? s.phone.trim() : undefined;
  return {
    id: placeId,
    name: s.name,
    category: "shelters",
    coordinates: s.coordinates,
    address: s.area,
    phone,
    dialablePhone: phone ? toDialablePhone(phone) : undefined,
    phones: phone ? getPhoneOptions(phone) : undefined,
    status:
      s.status === "full"
        ? "At maximum capacity"
        : s.status === "limited"
          ? "Limited beds"
          : "Open for intake",
    open: s.status !== "full",
    shelterId: s.id,
    capacity: s.capacity,
    occupied: s.occupied,
    isVerified: true,
    source: "verified",
  };
}

function MapScreen() {
  const mapHandleRef = useRef<InteractiveMapHandle | null>(null);
  const search = Route.useSearch();

  // Live shelters subscription (MAP-3: authoritative Firestore data)
  const [liveShelters, setLiveShelters] = useState<Shelter[]>(() => getStoredShelters());

  useEffect(() => {
    const unsub = subscribeToShelters((data) => {
      if (Array.isArray(data)) {
        setLiveShelters(data);
      }
    });
    return () => unsub();
  }, []);

  const coreVerifiedPlaces = useMemo(() => {
    // 1. Sync live bed capacity, occupancy, edited coordinates, and contacts onto verified shelters (MAP-3)
    const updatedVerified = VERIFIED_EMERGENCY_PLACES.map((place) => {
      if (place.category === "shelters") {
        const live = liveShelters.find((s) => matchShelterPlace(place, s.id));
        if (live) {
          const coords =
            live.coordinates && isValidCoordinates(live.coordinates)
              ? live.coordinates
              : place.coordinates;
          const livePhone = live.phone || place.phone;
          return {
            ...place,
            name: live.name || place.name,
            address: live.area || place.address,
            phone: livePhone,
            dialablePhone: livePhone ? toDialablePhone(livePhone) : place.dialablePhone,
            phones: livePhone ? getPhoneOptions(livePhone) : place.phones,
            coordinates: coords,
            capacity: live.capacity,
            occupied: live.occupied,
            status:
              live.status === "full"
                ? "At maximum capacity"
                : live.status === "limited"
                  ? "Limited beds"
                  : "Open for intake",
            open: live.status !== "full",
          };
        }
      }
      return place;
    });

    // 2. Extra dynamic / admin-created shelters from Firestore with valid coordinates (MAP-3)
    const extraShelters: EmergencyPlace[] = [];
    const seenShelterIds = new Set<string>();

    for (const s of liveShelters) {
      // Skip if already represented in verified emergency places (by identity or matching coordinates)
      const alreadyRepresented = VERIFIED_EMERGENCY_PLACES.some(
        (p) =>
          matchShelterPlace(p, s.id) ||
          (s.coordinates &&
            isValidCoordinates(s.coordinates) &&
            Math.abs(p.coordinates.lat - s.coordinates.lat) < 0.0001 &&
            Math.abs(p.coordinates.lng - s.coordinates.lng) < 0.0001),
      );
      if (alreadyRepresented) {
        continue;
      }
      if (seenShelterIds.has(s.id)) {
        continue;
      }
      seenShelterIds.add(s.id);

      const place = shelterToEmergencyPlace(s);
      if (place) {
        extraShelters.push(place);
      }
    }

    return [...updatedVerified, ...extraShelters];
  }, [liveShelters]);

  // A place requested by a "Directions" link.
  const requestedPlace = useMemo(() => {
    if (!search.place) return undefined;
    const target = search.place;
    return (
      coreVerifiedPlaces.find((p) => matchShelterPlace(p, target)) ??
      VERIFIED_EMERGENCY_PLACES.find((p) => matchShelterPlace(p, target))
    );
  }, [search.place, coreVerifiedPlaces]);

  const [activeCategory, setActiveCategory] = useState<PlaceCategory | "all">("all");
  const [query, setQuery] = useState(search.q ?? "");
  const [showZones, setShowZones] = useState(true);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);

  // Geographic & tracking state (MAP-7)
  const [center, setCenter] = useState<Coordinates>(requestedPlace?.coordinates ?? DHAKA_DEFAULT);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | undefined>(undefined);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const watcherCleanupRef = useRef<(() => void) | null>(null);
  const initialGeoDoneRef = useRef(false);
  const lastOsmCenterRef = useRef<Coordinates | null>(null);

  // Dynamic OSM emergency places (MAP-4 & MAP-5: deduplicated & bounded)
  const [osmPlaces, setOsmPlaces] = useState<EmergencyPlace[]>([]);
  const [isLoadingOsm, setIsLoadingOsm] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>(
    requestedPlace?.id ?? coreVerifiedPlaces[0]?.id ?? VERIFIED_EMERGENCY_PLACES[0]!.id,
  );

  // Say plainly when a Directions link could not be resolved to a place with coordinates.
  const placeWithoutCoordinates = useMemo(() => {
    if (!search.place || requestedPlace) return null;
    const target = search.place;
    return (
      liveShelters.find(
        (s) =>
          matchShelterPlace({ id: s.id, shelterId: s.id }, target) &&
          (!s.coordinates || !isValidCoordinates(s.coordinates)),
      ) ?? null
    );
  }, [search.place, requestedPlace, liveShelters]);

  const notice = placeWithoutCoordinates
    ? `No exact map location is available for "${placeWithoutCoordinates.name}". Showing matching search results instead.`
    : search.place && !requestedPlace
      ? "That place could not be found on the map."
      : !search.place && search.q
        ? `No exact map location is available for "${search.q}". Showing matching search results instead.`
        : null;

  useEffect(() => {
    if (placeWithoutCoordinates && !query) {
      setQuery(placeWithoutCoordinates.name);
    }
  }, [placeWithoutCoordinates, query]);

  // If the requested place changes while the map is open (Back/Forward between links), follow it.
  const lastPlaceRef = useRef(search.place);
  useEffect(() => {
    if (lastPlaceRef.current === search.place) return;
    lastPlaceRef.current = search.place;
    if (requestedPlace) {
      setActiveCategory("all");
      setSelectedPlaceId(requestedPlace.id);
      setCenter(requestedPlace.coordinates);
      mapHandleRef.current?.flyTo(requestedPlace.coordinates, 16);
    }
  }, [search.place, requestedPlace]);

  // Track My Location handler (explicit user action / recenter)
  const handleRecenter = useCallback(async () => {
    setLocationLoading(true);
    setLocationDenied(false);

    try {
      const pos = await getCurrentDevicePosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
      const coords: Coordinates = { lat: pos.lat, lng: pos.lng };
      if (!isValidCoordinates(coords)) {
        setLocationLoading(false);
        toast.error("Location unavailable", {
          description: "Received invalid GPS coordinates from your device.",
        });
        return;
      }
      setUserLocation(coords);
      setUserAccuracy(pos.accuracy);
      setCenter(coords);
      setLocationLoading(false);
      setLocationDenied(false);

      // Move map viewport directly to user's fresh GPS coordinates at zoom 16
      mapHandleRef.current?.flyTo(coords, 16);
    } catch (error: unknown) {
      setLocationLoading(false);
      console.warn("Geolocation tracking error:", error);

      const code = (error as { code?: number })?.code;
      if (code === DeviceLocationError.PERMISSION_DENIED) {
        setLocationDenied(true);
        toast.error("Location permission denied", {
          description:
            "Please allow location access in your device or browser settings to track your location.",
        });
      } else if (code === DeviceLocationError.POSITION_UNAVAILABLE) {
        toast.error("Location unavailable", {
          description: "Unable to retrieve GPS coordinates from your device.",
        });
      } else if (code === DeviceLocationError.TIMEOUT) {
        toast.error("Location request timed out", {
          description: "Please check your network and GPS connection.",
        });
      } else {
        toast.error("Could not obtain current location.");
      }
    }
  }, []);

  // Continuous tracking toggle (MAP-7)
  const stopTracking = useCallback(() => {
    if (watcherCleanupRef.current) {
      watcherCleanupRef.current();
      watcherCleanupRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const startTracking = useCallback(() => {
    if (watcherCleanupRef.current) {
      watcherCleanupRef.current();
      watcherCleanupRef.current = null;
    }

    setIsTracking(true);
    setLocationDenied(false);

    const cleanup = watchDevicePosition(
      (pos) => {
        const coords: Coordinates = { lat: pos.lat, lng: pos.lng };
        if (!isValidCoordinates(coords)) return;
        setUserLocation(coords);
        setUserAccuracy(pos.accuracy);
        setLocationDenied(false);
      },
      (err) => {
        console.warn("Live GPS watch error:", err);
        setIsTracking(false);
        if (err.code === DeviceLocationError.PERMISSION_DENIED) {
          setLocationDenied(true);
          toast.error("Location permission denied", {
            description: "Please allow location access to enable live continuous tracking.",
          });
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );

    watcherCleanupRef.current = cleanup;
  }, []);

  const toggleTracking = useCallback(() => {
    if (isTracking) {
      stopTracking();
      toast.info("Continuous location tracking paused.");
    } else {
      startTracking();
      toast.success("Continuous GPS tracking enabled", {
        description: "Your live position will update dynamically as you move.",
      });
    }
  }, [isTracking, startTracking, stopTracking]);

  // Clean up watcher on unmount (MAP-7)
  useEffect(() => {
    return () => {
      if (watcherCleanupRef.current) {
        watcherCleanupRef.current();
        watcherCleanupRef.current = null;
      }
    };
  }, []);

  const openedForPlaceRef = useRef(Boolean(requestedPlace));

  // Initial silent location acquisition on mount (MAP-7: prevent duplicate requests on mount)
  useEffect(() => {
    if (typeof window === "undefined" || initialGeoDoneRef.current) return;
    initialGeoDoneRef.current = true;

    if (!openedForPlaceRef.current) {
      setLocationLoading(true);
    }

    getCurrentDevicePosition({
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000,
    })
      .then((pos) => {
        const coords: Coordinates = { lat: pos.lat, lng: pos.lng };
        if (!isValidCoordinates(coords)) {
          setLocationLoading(false);
          return;
        }
        setUserLocation(coords);
        setUserAccuracy(pos.accuracy);
        setLocationLoading(false);
        setLocationDenied(false);
        if (!openedForPlaceRef.current) {
          setCenter(coords);
          mapHandleRef.current?.flyTo(coords, 15);
        }
      })
      .catch((err) => {
        setLocationLoading(false);
        const code = (err as { code?: number })?.code;
        if (code === DeviceLocationError.PERMISSION_DENIED) {
          setLocationDenied(true);
        }
        console.warn("Initial location permission not granted:", err);
      });
  }, []);

  // Fetch real OSM emergency services around center (MAP-4 & MAP-5: spatial threshold & deduplication)
  useEffect(() => {
    if (lastOsmCenterRef.current) {
      const dist = calculateDistanceKm(lastOsmCenterRef.current, center);
      if (dist < 0.5) return;
    }
    lastOsmCenterRef.current = center;

    let isMounted = true;
    const timer = setTimeout(() => {
      setIsLoadingOsm(true);
      fetchNearbyOsmPlaces(center, 3500).then((newOsm) => {
        if (!isMounted) return;
        setIsLoadingOsm(false);

        if (newOsm.length > 0) {
          setOsmPlaces((prev) => {
            // Deduplicate against verified emergency places and shelters (MAP-5)
            const validNew = newOsm.filter((osmP) => {
              const isDupe = coreVerifiedPlaces.some(
                (vp) =>
                  calculateDistanceKm(vp.coordinates, osmP.coordinates) < 0.05 ||
                  vp.name.toLowerCase().trim() === osmP.name.toLowerCase().trim(),
              );
              return !isDupe;
            });

            // Reconcile and bound collection to maximum 40 items near current center (MAP-5)
            const map = new Map<string, EmergencyPlace>();
            for (const p of validNew) map.set(p.id, p);
            for (const p of prev) {
              if (!map.has(p.id) && map.size < 40) {
                if (calculateDistanceKm(center, p.coordinates) < 5.0) {
                  map.set(p.id, p);
                }
              }
            }
            return Array.from(map.values());
          });
        }
      });
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [center, coreVerifiedPlaces]);

  // Combined places list
  const allPlaces = useMemo(() => {
    return [...coreVerifiedPlaces, ...osmPlaces];
  }, [coreVerifiedPlaces, osmPlaces]);

  // Calculate live distances relative to user location (if GPS available)
  const placesWithDistance = useMemo(() => {
    return allPlaces.map((place) => {
      if (userLocation) {
        return {
          ...place,
          distanceKm: calculateDistanceKm(userLocation, place.coordinates),
        };
      }
      return place;
    });
  }, [allPlaces, userLocation]);

  // Filter places by category and search query
  const filteredPlaces = useMemo(() => {
    return placesWithDistance
      .filter((place) => {
        if (activeCategory === "all") return true;
        return place.category === activeCategory;
      })
      .filter((place) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          place.name.toLowerCase().includes(q) ||
          place.address.toLowerCase().includes(q) ||
          place.category.toLowerCase().includes(q)
        );
      });
  }, [placesWithDistance, activeCategory, query]);

  // Synchronize selection when filteredPlaces changes (MAP-6: never leave dangling selection)
  useEffect(() => {
    if (filteredPlaces.length === 0) {
      if (selectedPlaceId) {
        setSelectedPlaceId("");
      }
      return;
    }
    const stillVisible = filteredPlaces.some((p) => p.id === selectedPlaceId);
    if (!stillVisible) {
      setSelectedPlaceId(filteredPlaces[0]!.id);
    }
  }, [filteredPlaces, selectedPlaceId]);

  const selectedPlace = useMemo(() => {
    if (!selectedPlaceId) return null;
    return filteredPlaces.find((p) => p.id === selectedPlaceId) ?? null;
  }, [filteredPlaces, selectedPlaceId]);

  // Map markers strictly display filtered places (MAP-6)
  const mapPlaces = filteredPlaces;

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-accent">
      <div className="relative h-[100dvh] overflow-hidden">
        {/* Real Interactive OpenStreetMap Component */}
        <InteractiveMap
          ref={mapHandleRef}
          places={mapPlaces}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={(place) => setSelectedPlaceId(place.id)}
          userLocation={userLocation}
          userAccuracy={userAccuracy}
          center={center}
          onRecenter={handleRecenter}
          showZones={showZones}
          onToggleZones={() => setShowZones((v) => !v)}
          disasterZones={DISASTER_ZONES}
          isLoading={locationLoading || isLoadingOsm}
          isTracking={isTracking}
          onToggleTracking={toggleTracking}
        />

        {/* Top Header Overlay */}
        <div className="absolute inset-x-0 top-0 z-[400] px-4 pt-4">
          <div className="flex items-center gap-2 rounded-3xl bg-surface/95 px-3 py-2.5 shadow-[var(--shadow-card)] backdrop-blur-xl">
            <BackButton fallback="/" className="h-9 w-9" />
            <Logo className="h-8 w-8" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search emergency services…"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Link
              to="/alerts"
              className="press shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase text-primary"
            >
              Alerts
            </Link>
          </div>

          {notice && dismissedNotice !== notice && (
            <div
              role="status"
              className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-[11px] text-amber-900 shadow-sm backdrop-blur-md"
            >
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>{notice}</span>
              </div>
              <button
                type="button"
                onClick={() => setDismissedNotice(notice)}
                className="press shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Location Denied Banner */}
          {locationDenied && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-[11px] text-amber-900 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>Location denied. Viewing default Dhaka map.</span>
              </div>
              <button
                type="button"
                onClick={handleRecenter}
                className="font-bold underline hover:text-amber-950"
              >
                Enable
              </button>
            </div>
          )}

          {/* Category Filter Pills */}
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {CATEGORY_TABS.map((tab) => {
              const on = activeCategory === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveCategory(tab.value)}
                  className={`press shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold shadow-[var(--shadow-soft)] transition-colors ${
                    on
                      ? "bg-navy text-navy-foreground"
                      : "bg-surface/90 text-muted-foreground backdrop-blur-md"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Empty State Overlay when no places match active filter (MAP-6) */}
        {filteredPlaces.length === 0 && (
          <div className="absolute inset-x-0 bottom-[max(104px,calc(92px+env(safe-area-inset-bottom)))] z-[400] px-4">
            <div className="rounded-3xl border border-border/60 bg-surface/95 p-4 text-center shadow-[var(--shadow-card)] backdrop-blur-md">
              <p className="text-[14px] font-bold text-navy">No emergency places found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No matching {activeCategory === "all" ? "facilities" : activeCategory} found in this
                area.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory("all");
                  setQuery("");
                }}
                className="press mt-3 inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 text-xs font-semibold text-navy-foreground"
              >
                Reset filters
              </button>
            </div>
          </div>
        )}

        {/* Bottom Facility Card (Positioned safely above BottomNav with safe-area support) */}
        {selectedPlace && (
          <div className="absolute inset-x-0 bottom-[max(104px,calc(92px+env(safe-area-inset-bottom)))] z-[400] px-4">
            <div
              key={selectedPlace.id}
              className="animate-fade-up rounded-3xl border border-border/60 bg-surface p-4 shadow-[var(--shadow-card)]"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[15px] font-bold text-navy">{selectedPlace.name}</p>
                    {selectedPlace.isVerified ? (
                      <span title="Geographically Verified">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-safe" />
                      </span>
                    ) : (
                      <span
                        className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                        title="OpenStreetMap Community Sourced"
                      >
                        OSM
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0 text-primary" />
                    <span className="truncate">{selectedPlace.address}</span>
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-navy/80">
                    {selectedPlace.distanceKm !== undefined
                      ? `📍 ${selectedPlace.distanceKm} km from you`
                      : "📍 Verified local location"}
                    {selectedPlace.capacity && (
                      <span>
                        {" "}
                        · {selectedPlace.occupied ?? 0}/{selectedPlace.capacity} occupied
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <Pill
                    tone={
                      selectedPlace.open === false
                        ? "full"
                        : selectedPlace.status === "limited" || selectedPlace.open === undefined
                          ? "limited"
                          : "open"
                    }
                  >
                    {selectedPlace.status ||
                      (selectedPlace.open === true
                        ? "Open"
                        : selectedPlace.open === false
                          ? "Closed"
                          : "Hours unverified")}
                  </Pill>
                  <button
                    type="button"
                    aria-label="Dismiss details"
                    onClick={() => setSelectedPlaceId("")}
                    className="press grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80 hover:text-navy"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Action Buttons (MAP-1: clean telephone URIs with composite handling) */}
              <div className="mt-3.5 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {selectedPlace.shelterId ? (
                    <Link
                      to="/shelters/$shelterId"
                      params={{ shelterId: selectedPlace.shelterId }}
                      className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-muted text-[13px] font-bold text-navy"
                    >
                      <span>View Shelter</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : selectedPlace.dialablePhone || selectedPlace.phone ? (
                    <a
                      href={`tel:${selectedPlace.dialablePhone || toDialablePhone(selectedPlace.phone || "")}`}
                      className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-muted text-[13px] font-bold text-navy"
                    >
                      <Phone className="h-4 w-4" />
                      <span>
                        Call{" "}
                        {selectedPlace.phones && selectedPlace.phones.length > 1
                          ? (selectedPlace.phones[0]?.display ?? "Helpline")
                          : "Helpline"}
                      </span>
                    </a>
                  ) : (
                    <span className="flex h-11 items-center justify-center rounded-2xl bg-muted text-[12.5px] font-semibold text-muted-foreground">
                      Emergency Unit
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const dirUrl = buildDirectionsUrl(selectedPlace.coordinates, userLocation);
                      if (!dirUrl) {
                        toast.error("Directions unavailable", {
                          description:
                            "This location does not have valid geographical coordinates.",
                        });
                        return;
                      }
                      window.open(dirUrl, "_blank", "noopener,noreferrer");
                    }}
                    className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-navy text-[13px] font-bold text-navy-foreground shadow-xs"
                  >
                    <Navigation className="h-4 w-4" />
                    <span>Get Directions</span>
                  </button>
                </div>

                {/* Multiple phone numbers support (MAP-1) */}
                {selectedPlace.phones &&
                  selectedPlace.phones.length > 1 &&
                  selectedPlace.phones[1] && (
                    <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                      <span className="truncate">
                        Alt:{" "}
                        {selectedPlace.phones
                          .slice(1)
                          .map((p) => p.display)
                          .join(", ")}
                      </span>
                      <a
                        href={`tel:${selectedPlace.phones[1].dialable}`}
                        className="ml-2 font-bold text-navy underline hover:text-primary"
                      >
                        Call Alt
                      </a>
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
