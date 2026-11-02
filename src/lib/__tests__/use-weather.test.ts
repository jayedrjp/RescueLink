// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWeather } from "../weather/use-weather";
import * as openMeteo from "../weather/open-meteo";
import type { WeatherData } from "../weather/types";

const mockWeatherData: WeatherData = {
  current: {
    temperature: 28,
    apparentTemperature: 31,
    relativeHumidity: 70,
    precipitation: 0,
    windSpeed: 12,
    weatherCode: 0,
    isDay: true,
    condition: {
      code: 0,
      label: "Clear sky",
      labelBn: "পরিষ্কার আকাশ",
      iconName: "sun",
      isSevere: false,
    },
    timestamp: "2026-10-25T01:00:00Z",
  },
  hourly: [],
  daily: [],
  locationName: "Dhaka, Bangladesh",
  isFallbackLocation: false,
  latitude: 23.8103,
  longitude: 90.4125,
  fetchedAt: Date.now(),
};

describe("useWeather Hook Stability & Loop Prevention", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    openMeteo.clearWeatherCache();
  });

  afterEach(() => {
    openMeteo.clearWeatherCache();
  });

  it("loads weather data on mount without triggering an infinite re-render loop", async () => {
    const fetchSpy = vi.spyOn(openMeteo, "fetchWeather").mockResolvedValue(mockWeatherData);

    const { result } = renderHook(() =>
      useWeather({
        coords: { lat: 23.81, lng: 90.41 },
        locationName: "Dhaka",
      }),
    );

    // Initial state
    expect(result.current.loading).toBe(true);

    // Wait for resolution
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.weather).toEqual(mockWeatherData);
    expect(result.current.error).toBeNull();
    expect(result.current.isRefreshing).toBe(false);

    // Give it a moment to ensure no background re-fetch loop is running
    await new Promise((r) => setTimeout(r, 50));

    // Must be called exactly once, NOT in an infinite loop
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("handles force refresh via refetch() without unbounded calls", async () => {
    const fetchSpy = vi.spyOn(openMeteo, "fetchWeather").mockResolvedValue(mockWeatherData);

    const { result } = renderHook(() =>
      useWeather({
        coords: { lat: 23.81, lng: 90.41 },
        locationName: "Dhaka",
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
