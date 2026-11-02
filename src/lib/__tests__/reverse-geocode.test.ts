import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reverseGeocode,
  quantizeCoordinates,
  clearReverseGeocodeCache,
  getReverseGeocodeCacheSize,
} from "../map/places";

describe("Nominatim Reverse Geocoding Cache & Rate-Limiter", () => {
  beforeEach(() => {
    clearReverseGeocodeCache();
    vi.restoreAllMocks();
  });

  it("quantizes nearby coordinates into identical spatial keys", () => {
    const p1 = { lat: 23.75001, lng: 90.39002 };
    const p2 = { lat: 23.75004, lng: 90.39003 };
    expect(quantizeCoordinates(p1)).toBe("23.7500,90.3900");
    expect(quantizeCoordinates(p2)).toBe("23.7500,90.3900");
  });

  it("fetches address on first call and caches the result", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: "Road 5, Dhanmondi, Dhaka, Bangladesh",
        address: {
          road: "Road 5",
          suburb: "Dhanmondi",
          city: "Dhaka",
        },
      }),
    });
    global.fetch = mockFetch;

    const coords = { lat: 23.75, lng: 90.39 };
    const addr1 = await reverseGeocode(coords);
    expect(addr1).toBe("Road 5, Dhanmondi, Dhaka");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getReverseGeocodeCacheSize()).toBe(1);

    // Call again with same coordinates
    const addr2 = await reverseGeocode(coords);
    expect(addr2).toBe("Road 5, Dhanmondi, Dhaka");
    // Should NOT call fetch again; served from cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent in-flight requests for the same coordinates", async () => {
    let resolveResponse: (val: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveResponse = resolve;
    });

    const mockFetch = vi.fn().mockImplementation(() => fetchPromise);
    global.fetch = mockFetch;

    const coords = { lat: 23.8103, lng: 90.4125 };

    // Fire two concurrent calls
    const p1 = reverseGeocode(coords);
    const p2 = reverseGeocode(coords);

    resolveResponse!({
      ok: true,
      json: async () => ({
        display_name: "Gulshan 2, Dhaka, Bangladesh",
        address: { road: "Gulshan Ave", suburb: "Gulshan 2", city: "Dhaka" },
      }),
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toBe("Gulshan Ave, Gulshan 2, Dhaka");
    expect(res2).toBe("Gulshan Ave, Gulshan 2, Dhaka");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("gracefully falls back to coordinate label on 429 or network errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });
    global.fetch = mockFetch;

    const coords = { lat: 23.7258, lng: 90.3976 };
    const result = await reverseGeocode(coords);
    expect(result).toBe("Location (23.7258°N, 90.3976°E)");
  });

  it("clears cache and allows fresh fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: "Mirpur 10, Dhaka",
        address: { suburb: "Mirpur", city: "Dhaka" },
      }),
    });
    global.fetch = mockFetch;

    const coords = { lat: 23.8055, lng: 90.3667 };
    await reverseGeocode(coords);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    clearReverseGeocodeCache();
    expect(getReverseGeocodeCacheSize()).toBe(0);

    await reverseGeocode(coords);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
