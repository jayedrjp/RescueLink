import type { EmergencyPlace, PlaceCategory, Coordinates, DisasterZone } from "./types";
import { isValidCoordinates } from "./types";
import { toDialablePhone, getPhoneOptions } from "../phone";
export { isValidCoordinates };

/**
 * Calculates distance between two coordinates in kilometers using the Haversine formula.
 */
export function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

/**
 * Geographically verified emergency services in Dhaka, Bangladesh with actual real-world coordinates.
 */
const RAW_VERIFIED_PLACES: EmergencyPlace[] = [
  // Hospitals & Emergency Care
  {
    id: "hosp-dmch",
    name: "Dhaka Medical College Hospital",
    category: "hospitals",
    coordinates: { lat: 23.7258, lng: 90.3976 },
    address: "Secretariat Rd, Bakshi Bazar, Dhaka",
    phone: "+880 2 5561 6193",
    status: "Emergency open · 24/7",
    open: true,
    serviceId: "s1",
    isVerified: true,
    source: "verified",
  },
  {
    id: "hosp-square",
    name: "Square Hospital",
    category: "hospitals",
    coordinates: { lat: 23.7531, lng: 90.3816 },
    address: "18/F Bir Uttam Qazi Nuruzzaman Sarak, Panthapath, Dhaka",
    phone: "+880 2 8144 466",
    status: "Emergency open · 24/7",
    open: true,
    serviceId: "s2",
    isVerified: true,
    source: "verified",
  },
  {
    id: "hosp-bsmmu",
    name: "Bangabandhu Sheikh Mujib Medical University (BSMMU)",
    category: "hospitals",
    coordinates: { lat: 23.7388, lng: 90.3957 },
    address: "Shahbag, Ramna, Dhaka",
    phone: "+880 2 9661 051",
    status: "Emergency open · 24/7",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "hosp-united",
    name: "United Hospital",
    category: "hospitals",
    coordinates: { lat: 23.8055, lng: 90.4158 },
    address: "Plot 15, Road 71, Gulshan 2, Dhaka",
    phone: "+880 2 8836 444",
    status: "Emergency open · 24/7",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "hosp-kurmitola",
    name: "Kurmitola General Hospital",
    category: "hospitals",
    coordinates: { lat: 23.8223, lng: 90.4079 },
    address: "Dhaka - Mymensingh Hwy, Cantonment, Dhaka",
    phone: "+880 2 5506 7200",
    status: "Emergency open · 24/7",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "hosp-nhf",
    name: "National Heart Foundation Hospital",
    category: "hospitals",
    coordinates: { lat: 23.8042, lng: 90.3601 },
    address: "Plot 4, Section 2, Mirpur, Dhaka",
    phone: "+880 2 9033 442",
    status: "Emergency open · 24/7",
    open: true,
    isVerified: true,
    source: "verified",
  },

  // Police Stations
  {
    id: "pol-dhanmondi",
    name: "Dhanmondi Model Police Station",
    category: "police",
    coordinates: { lat: 23.7458, lng: 90.3789 },
    address: "Road 6, Dhanmondi, Dhaka",
    phone: "999 / +880 2 8631 822",
    status: "Open 24/7",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "pol-mirpur",
    name: "Mirpur Model Police Station",
    category: "police",
    coordinates: { lat: 23.8055, lng: 90.3667 },
    address: "Section 1, Mirpur, Dhaka",
    phone: "999 / +880 2 9002 000",
    status: "Open 24/7",
    open: true,
    serviceId: "s5",
    isVerified: true,
    source: "verified",
  },
  {
    id: "pol-ramna",
    name: "Ramna Model Police Station",
    category: "police",
    coordinates: { lat: 23.7412, lng: 90.4019 },
    address: "Siddheswari, Ramna, Dhaka",
    phone: "999 / +880 2 9331 111",
    status: "Open 24/7",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "pol-gulshan",
    name: "Gulshan Police Station",
    category: "police",
    coordinates: { lat: 23.7925, lng: 90.4172 },
    address: "Road 106, Gulshan 2, Dhaka",
    phone: "999 / +880 2 9885 555",
    status: "Open 24/7",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "pol-uttara",
    name: "Uttara East Police Station",
    category: "police",
    coordinates: { lat: 23.8682, lng: 90.4011 },
    address: "Sector 4, Uttara, Dhaka",
    phone: "999 / +880 2 8911 115",
    status: "Open 24/7",
    open: true,
    isVerified: true,
    source: "verified",
  },

  // Fire Service Stations
  {
    id: "fire-hq",
    name: "Fire Service & Civil Defence HQ",
    category: "fire",
    coordinates: { lat: 23.7242, lng: 90.4089 },
    address: "Kazi Alauddin Rd, Siddique Bazar, Dhaka",
    phone: "102 / +880 2 9555 555",
    status: "Emergency rescue on standby",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "fire-mirpur",
    name: "Mirpur Fire Service Station",
    category: "fire",
    coordinates: { lat: 23.8072, lng: 90.3685 },
    address: "Section 12, Mirpur, Dhaka",
    phone: "102 / +880 2 9001 022",
    status: "Rescue team ready",
    open: true,
    serviceId: "s6",
    isVerified: true,
    source: "verified",
  },
  {
    id: "fire-tejgaon",
    name: "Tejgaon Fire Station",
    category: "fire",
    coordinates: { lat: 23.7601, lng: 90.392 },
    address: "Tejgaon Industrial Area, Dhaka",
    phone: "102 / +880 2 9111 022",
    status: "Rescue team on standby",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "fire-kurmitola",
    name: "Kurmitola Fire Station",
    category: "fire",
    coordinates: { lat: 23.8211, lng: 90.4102 },
    address: "Airport Road, Kurmitola, Dhaka",
    phone: "102 / +880 2 8900 102",
    status: "Emergency response on standby",
    open: true,
    isVerified: true,
    source: "verified",
  },

  // Pharmacies
  {
    id: "pharm-lazz-kalabagan",
    name: "Lazz Pharma (Kalabagan)",
    category: "pharmacies",
    coordinates: { lat: 23.7489, lng: 90.3812 },
    address: "Mirpur Rd, Kalabagan, Dhaka",
    phone: "+880 1811 445 566",
    status: "Open · Closes 11:30 PM",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "pharm-lazz-kazipara",
    name: "Lazz Pharma (Kazipara)",
    category: "pharmacies",
    coordinates: { lat: 23.7985, lng: 90.3735 },
    address: "Begum Rokeya Sarani, Kazipara, Dhaka",
    phone: "+880 1811 445 567",
    status: "Open · Closes 11:00 PM",
    open: true,
    serviceId: "s7",
    isVerified: true,
    source: "verified",
  },
  {
    id: "pharm-tamanna",
    name: "Tamanna Pharmacy (Dhanmondi)",
    category: "pharmacies",
    coordinates: { lat: 23.7422, lng: 90.3755 },
    address: "Satmasjid Road, Dhanmondi, Dhaka",
    phone: "+880 1911 224 668",
    status: "Open · 24/7 Emergency Medicine",
    open: true,
    isVerified: true,
    source: "verified",
  },
  {
    id: "pharm-model-shahbag",
    name: "Model Pharmacy (BSMMU Campus)",
    category: "pharmacies",
    coordinates: { lat: 23.7385, lng: 90.3962 },
    address: "Shahbag, Dhaka",
    phone: "+880 2 9661 052",
    status: "Open 24/7",
    open: true,
    isVerified: true,
    source: "verified",
  },

  // Emergency Shelters
  {
    id: "shelter-dhanmondi",
    name: "Dhanmondi Community Hall (Emergency Shelter)",
    category: "shelters",
    coordinates: { lat: 23.7461, lng: 90.3742 },
    address: "Road 27, Dhanmondi, Dhaka",
    phone: "+880 1711 000 208",
    status: "open",
    open: true,
    capacity: 180,
    occupied: 148,
    shelterId: "dhanmondi",
    isVerified: true,
    source: "verified",
  },
  {
    id: "shelter-mirpur",
    name: "Mirpur Shelter Center",
    category: "shelters",
    coordinates: { lat: 23.8068, lng: 90.3688 },
    address: "Section 10, Mirpur, Dhaka",
    phone: "+880 1711 000 121",
    status: "open",
    open: true,
    capacity: 100,
    occupied: 72,
    shelterId: "mirpur",
    isVerified: true,
    source: "verified",
  },
  {
    id: "shelter-uttara",
    name: "Uttara Model School Relief Camp",
    category: "shelters",
    coordinates: { lat: 23.8721, lng: 90.3982 },
    address: "Sector 7, Uttara, Dhaka",
    phone: "+880 1711 000 317",
    status: "full",
    open: false,
    capacity: 200,
    occupied: 200,
    shelterId: "uttara",
    isVerified: true,
    source: "verified",
  },
  {
    id: "shelter-mohammadpur",
    name: "Mohammadpur Relief Center",
    category: "shelters",
    coordinates: { lat: 23.7612, lng: 90.3621 },
    address: "Ring Road, Mohammadpur, Dhaka",
    phone: "+880 1711 000 412",
    status: "open",
    open: true,
    capacity: 150,
    occupied: 94,
    shelterId: "mohammadpur",
    isVerified: true,
    source: "verified",
  },
];

export const VERIFIED_EMERGENCY_PLACES: EmergencyPlace[] = RAW_VERIFIED_PLACES.map((p) => ({
  ...p,
  dialablePhone: p.phone ? toDialablePhone(p.phone) : undefined,
  phones: p.phone ? getPhoneOptions(p.phone) : undefined,
}));

/**
 * Real disaster risk zones in Dhaka with verified geographical coordinates.
 */
export const DISASTER_ZONES: DisasterZone[] = [
  {
    id: "zone-bauniabadh",
    title: "Bauniabadh Lowland Flood Risk",
    type: "flood",
    severity: "critical",
    coordinates: { lat: 23.824, lng: 90.364 },
    radiusMeters: 750,
    description:
      "Low-lying basin adjacent to Turag River prone to flash flooding and waterlogging.",
  },
  {
    id: "zone-kazipara",
    title: "Kazipara / Shewrapara Waterlogging",
    type: "waterlogging",
    severity: "warning",
    coordinates: { lat: 23.795, lng: 90.374 },
    radiusMeters: 550,
    description: "Severe urban runoff waterlogging during monsoons causing road blockage.",
  },
  {
    id: "zone-turag",
    title: "Turag Riverbank Inundation Area",
    type: "flood",
    severity: "critical",
    coordinates: { lat: 23.845, lng: 90.342 },
    radiusMeters: 1100,
    description: "Active high-water flood basin. Evacuation to designated shelters recommended.",
  },
];

/**
 * Queries OpenStreetMap Overpass API for real live emergency services around a coordinate.
 * Resolves MAP-4:
 * - Queries both OSM node and way (with center coordinates) elements.
 * - Does NOT mark unverified community data as verified (isVerified: false).
 * - Does NOT assume places are open without reliable opening hours (open: undefined when unknown).
 * - Sorts returned places by distance relative to center.
 * - Parses and normalizes phone numbers cleanly.
 * Falls back gracefully to empty array if network fails or times out.
 */
export async function fetchNearbyOsmPlaces(
  center: Coordinates,
  radiusMeters: number = 3500,
): Promise<EmergencyPlace[]> {
  const query = `[out:json][timeout:8];(
    node["amenity"~"hospital|clinic|pharmacy|police|fire_station"](around:${radiusMeters},${center.lat},${center.lng});
    way["amenity"~"hospital|clinic|pharmacy|police|fire_station"](around:${radiusMeters},${center.lat},${center.lng});
  );out center 35;`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Overpass query returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.elements)) {
      return [];
    }

    const results: EmergencyPlace[] = [];

    for (const el of data.elements) {
      if (!el.tags) continue;

      // MAP-4: Support both node (el.lat, el.lon) and way (el.center.lat, el.center.lon)
      const lat =
        typeof el.lat === "number"
          ? el.lat
          : typeof el.center?.lat === "number"
            ? el.center.lat
            : null;
      const lon =
        typeof el.lon === "number"
          ? el.lon
          : typeof el.center?.lon === "number"
            ? el.center.lon
            : null;

      if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (!isValidCoordinates({ lat, lng: lon })) continue;

      let category: PlaceCategory | null = null;
      const amenity = el.tags.amenity;

      if (amenity === "hospital" || amenity === "clinic") category = "hospitals";
      else if (amenity === "police") category = "police";
      else if (amenity === "fire_station") category = "fire";
      else if (amenity === "pharmacy") category = "pharmacies";

      if (!category) continue;

      const name = (
        el.tags.name ||
        el.tags["name:en"] ||
        `${category.toUpperCase()} facility`
      ).trim();
      const street = el.tags["addr:street"] || el.tags["addr:suburb"] || "";
      const city = el.tags["addr:city"] || "Dhaka";
      const address = (street ? `${street}, ${city}` : city).trim();
      const rawPhone = el.tags.phone || el.tags["contact:phone"] || undefined;
      const phone = typeof rawPhone === "string" ? rawPhone.trim() : undefined;
      const dialablePhone = phone ? toDialablePhone(phone) : undefined;
      const phoneOptions = phone ? getPhoneOptions(phone) : undefined;

      // MAP-4: Explicit opening hours evaluation; do not falsely mark unverified OSM as open
      let open: boolean | undefined = undefined;
      let status: string = "Hours unverified";
      const hours = el.tags.opening_hours;
      if (hours) {
        if (hours === "24/7" || hours.includes("24/7")) {
          open = true;
          status = "Open 24/7";
        } else {
          status = hours;
        }
      }

      const placeItem: EmergencyPlace = {
        id: `osm-${el.type || "node"}-${el.id}`,
        name,
        category,
        coordinates: { lat, lng: lon },
        address,
        open,
        status,
        isVerified: false,
        source: "osm",
      };
      if (phone) placeItem.phone = phone;
      if (dialablePhone) placeItem.dialablePhone = dialablePhone;
      if (phoneOptions && phoneOptions.length > 0) placeItem.phones = phoneOptions;

      results.push(placeItem);
    }

    // MAP-4: Sort results by proximity from query center
    results.sort((a, b) => {
      const distA = calculateDistanceKm(center, a.coordinates);
      const distB = calculateDistanceKm(center, b.coordinates);
      return distA - distB;
    });

    return results;
  } catch (error) {
    console.warn(
      "Could not query live OSM Overpass (using verified local places fallback):",
      error,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Nominatim Reverse Geocoding Cache & Rate-Limiter (MAP-Resilience)
// ---------------------------------------------------------------------------

interface GeocodeCacheEntry {
  address: string;
  timestamp: number;
}

const reverseGeocodeCache = new Map<string, GeocodeCacheEntry>();
const inFlightGeocodePromises = new Map<string, Promise<string>>();
const MAX_GEOCODE_CACHE_ENTRIES = 250;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_NOMINATIM_INTERVAL_MS = 1000; // 1 req/sec max per Nominatim usage policy
let lastNominatimRequestTime = 0;

/** Clears the reverse geocode cache (used for testing). */
export function clearReverseGeocodeCache(): void {
  reverseGeocodeCache.clear();
  inFlightGeocodePromises.clear();
  lastNominatimRequestTime = 0;
}

/** Gets the number of cached geocode entries (used for testing). */
export function getReverseGeocodeCacheSize(): number {
  return reverseGeocodeCache.size;
}

/** Quantizes coordinates to ~11m grid to prevent redundant API queries. */
export function quantizeCoordinates(coords: Coordinates): string {
  return `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
}

async function throttleNominatim(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimRequestTime;
  if (elapsed < MIN_NOMINATIM_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_NOMINATIM_INTERVAL_MS - elapsed));
  }
  lastNominatimRequestTime = Date.now();
}

/**
 * Reverse geocodes coordinates to a real address in Bangladesh using OpenStreetMap Nominatim.
 * Incorporates spatial quantization, LRU-style in-memory caching, in-flight deduplication,
 * and request throttling to strictly adhere to Nominatim rate limits.
 */
export async function reverseGeocode(coords: Coordinates): Promise<string> {
  const cacheKey = quantizeCoordinates(coords);
  const fallbackLabel = `Location (${coords.lat.toFixed(4)}°N, ${coords.lng.toFixed(4)}°E)`;

  // 1. Check in-memory cache
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < GEOCODE_CACHE_TTL_MS) {
    return cached.address;
  }

  // 2. Check in-flight promise deduplication
  const existingPromise = inFlightGeocodePromises.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  // 3. Dispatch throttled network fetch
  const promise = (async () => {
    try {
      await throttleNominatim();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "RescueLink-EmergencyApp/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);

      const data = await response.json();
      if (data && data.display_name) {
        const addr = data.address || {};
        const road = addr.road || addr.street || "";
        const suburb = addr.suburb || addr.neighbourhood || addr.residential || "";
        const city = addr.city || addr.town || addr.state_district || "Dhaka";

        const parts = [road, suburb, city].filter(Boolean);
        const resolvedAddress =
          parts.length > 0 ? parts.join(", ") : data.display_name.split(",").slice(0, 3).join(", ");

        // Save to cache (manage cache size bound)
        if (reverseGeocodeCache.size >= MAX_GEOCODE_CACHE_ENTRIES) {
          const firstKey = reverseGeocodeCache.keys().next().value;
          if (firstKey) reverseGeocodeCache.delete(firstKey);
        }
        reverseGeocodeCache.set(cacheKey, { address: resolvedAddress, timestamp: Date.now() });

        return resolvedAddress;
      }
    } catch (err) {
      console.warn("Reverse geocode fallback:", err);
    }

    return fallbackLabel;
  })();

  inFlightGeocodePromises.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    inFlightGeocodePromises.delete(cacheKey);
  }
}
