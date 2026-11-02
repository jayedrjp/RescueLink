import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWeather,
  parseOpenMeteoResponse,
  quantizeWeatherCoords,
  clearWeatherCache,
  getWeatherCacheSize,
  DEFAULT_WEATHER_COORDINATES,
} from "../weather/open-meteo";
import { getWmoCondition } from "../weather/wmo";
import type { OpenMeteoApiResponse } from "../weather/types";

describe("Open-Meteo Real Weather Service Integration", () => {
  beforeEach(() => {
    clearWeatherCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearWeatherCache();
  });

  describe("WMO Code Mapping & Interpretation", () => {
    it("maps clear sky (code 0) to day and night icons correctly", () => {
      const day = getWmoCondition(0, true);
      expect(day.label).toBe("Clear sky");
      expect(day.labelBn).toBe("পরিষ্কার আকাশ");
      expect(day.iconName).toBe("sun");
      expect(day.isSevere).toBe(false);

      const night = getWmoCondition(0, false);
      expect(night.iconName).toBe("moon");
    });

    it("maps severe rain (code 65, 82) and flags isSevere", () => {
      const heavyRain = getWmoCondition(65);
      expect(heavyRain.label).toBe("Heavy rain");
      expect(heavyRain.isSevere).toBe(true);
      expect(heavyRain.iconName).toBe("cloud-rain");

      const violentShowers = getWmoCondition(82);
      expect(violentShowers.isSevere).toBe(true);
    });

    it("maps thunderstorms (code 95, 96, 99) and flags isSevere with cloud-lightning icon", () => {
      const thunderstorm = getWmoCondition(95);
      expect(thunderstorm.label).toBe("Thunderstorm");
      expect(thunderstorm.iconName).toBe("cloud-lightning");
      expect(thunderstorm.isSevere).toBe(true);
    });

    it("falls back gracefully for unknown weather codes", () => {
      const unknown = getWmoCondition(999);
      expect(unknown.code).toBe(999);
      expect(unknown.iconName).toBeDefined();
    });
  });

  describe("API Response Parsing", () => {
    const sampleRaw: OpenMeteoApiResponse = {
      latitude: 23.8103,
      longitude: 90.4125,
      current: {
        time: "2026-10-24T23:00",
        temperature_2m: 28.4,
        apparent_temperature: 31.2,
        relative_humidity_2m: 76,
        precipitation: 1.5,
        weather_code: 61,
        wind_speed_10m: 14.8,
        is_day: 1,
      },
      hourly: {
        time: [
          "2026-10-24T23:00",
          "2026-10-25T00:00",
          "2026-10-25T01:00",
          "2026-10-25T02:00",
          "2026-10-25T03:00",
          "2026-10-25T04:00",
        ],
        temperature_2m: [28.4, 27.9, 27.2, 26.8, 26.5, 26.1],
        precipitation_probability: [40, 50, 30, 20, 10, 0],
        weather_code: [61, 61, 2, 2, 1, 0],
      },
      daily: {
        time: ["2026-10-24", "2026-10-25", "2026-10-26"],
        weather_code: [61, 2, 0],
        temperature_2m_max: [33.1, 32.5, 31.8],
        temperature_2m_min: [25.0, 24.8, 24.2],
        precipitation_sum: [4.2, 0.5, 0.0],
      },
    };

    it("correctly parses valid Open-Meteo response", () => {
      const parsed = parseOpenMeteoResponse(sampleRaw, {
        locationName: "Dhaka North",
        isFallbackLocation: false,
      });

      expect(parsed.locationName).toBe("Dhaka North");
      expect(parsed.isFallbackLocation).toBe(false);
      expect(parsed.current.temperature).toBe(28);
      expect(parsed.current.apparentTemperature).toBe(31);
      expect(parsed.current.relativeHumidity).toBe(76);
      expect(parsed.current.precipitation).toBe(1.5);
      expect(parsed.current.windSpeed).toBe(15);
      expect(parsed.current.condition.label).toBe("Slight rain");
      expect(parsed.hourly.length).toBe(6);
      expect(parsed.daily.length).toBe(3);
      expect(parsed.daily[0]?.maxTemp).toBe(33);
    });

    it("handles missing or null fields gracefully without crashing", () => {
      const emptyRaw: OpenMeteoApiResponse = {
        latitude: 23.81,
        longitude: 90.41,
        current: {
          time: "2026-10-24T23:00",
          temperature_2m: undefined,
          apparent_temperature: undefined,
        },
      };

      const parsed = parseOpenMeteoResponse(emptyRaw);
      expect(parsed.current.temperature).toBe(0);
      expect(parsed.current.apparentTemperature).toBe(0);
      expect(parsed.current.relativeHumidity).toBe(0);
      expect(parsed.hourly).toEqual([]);
      expect(parsed.daily).toEqual([]);
    });

    it("throws error if response is not an object", () => {
      expect(() => parseOpenMeteoResponse(null as unknown as OpenMeteoApiResponse)).toThrow();
    });
  });

  describe("Spatial Quantization & Fallback Location Handling", () => {
    it("quantizes nearby coordinates into identical spatial keys", () => {
      expect(quantizeWeatherCoords(23.8103, 90.4125)).toBe("23.81,90.41");
      expect(quantizeWeatherCoords(23.8149, 90.4131)).toBe("23.81,90.41");
    });

    it("uses default Dhaka coordinates when invalid coordinates are passed", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          latitude: 23.81,
          longitude: 90.41,
          current: { temperature_2m: 29 },
        }),
      });
      global.fetch = mockFetch;

      const data = await fetchWeather({ latitude: NaN, longitude: Infinity });
      expect(data.isFallbackLocation).toBe(true);
      expect(data.locationName).toBe(DEFAULT_WEATHER_COORDINATES.name);
      expect(data.latitude).toBe(DEFAULT_WEATHER_COORDINATES.latitude);
    });
  });

  describe("Caching & In-Flight Deduplication", () => {
    it("serves repeated requests from cache within TTL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          latitude: 23.81,
          longitude: 90.41,
          current: { temperature_2m: 30, weather_code: 1 },
        }),
      });
      global.fetch = mockFetch;

      const res1 = await fetchWeather({ latitude: 23.81, longitude: 90.41 });
      expect(res1.current.temperature).toBe(30);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(getWeatherCacheSize()).toBe(1);

      // Second call for same area
      const res2 = await fetchWeather({ latitude: 23.812, longitude: 90.411 });
      expect(res2.current.temperature).toBe(30);
      // No extra network fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("deduplicates concurrent in-flight requests for the same coordinates", async () => {
      let resolvePromise: (val: unknown) => void;
      const fetchPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const mockFetch = vi.fn().mockImplementation(() => fetchPromise);
      global.fetch = mockFetch;

      const p1 = fetchWeather({ latitude: 24.89, longitude: 91.86 });
      const p2 = fetchWeather({ latitude: 24.89, longitude: 91.86 });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      resolvePromise!({
        ok: true,
        json: async () => ({
          latitude: 24.89,
          longitude: 91.86,
          current: { temperature_2m: 27 },
        }),
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.current.temperature).toBe(27);
      expect(res2.current.temperature).toBe(27);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling & Stale Cache Fallback", () => {
    it("throws clear error on HTTP 500 when no cache exists", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      global.fetch = mockFetch;

      await expect(fetchWeather({ latitude: 22.35, longitude: 91.78 })).rejects.toThrow(
        "Open-Meteo weather service error: HTTP 500",
      );
    });

    it("returns stale cached data if network throws subsequent error", async () => {
      // 1. Initial success
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          latitude: 23.81,
          longitude: 90.41,
          current: { temperature_2m: 29 },
        }),
      });

      await fetchWeather({ latitude: 23.81, longitude: 90.41 });

      // 2. Force network failure on refresh
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network connection dropped"));

      const fallbackData = await fetchWeather({
        latitude: 23.81,
        longitude: 90.41,
        forceRefresh: true,
      });

      expect(fallbackData.current.temperature).toBe(29);
    });
  });
});
