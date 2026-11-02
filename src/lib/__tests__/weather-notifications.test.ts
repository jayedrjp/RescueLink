// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  evaluateWeatherNotification,
  generateWeatherEventKey,
  getStoredWeatherNotifications,
  saveWeatherNotifications,
  markNotificationDelivered,
  markWeatherNotificationAsRead,
  markAllWeatherNotificationsAsRead,
  hasUnreadWeatherNotifications,
  clearWeatherNotifications,
  dispatchInAppWeatherNotification,
} from "../weather/weather-notifications";
import type { WeatherData } from "../weather/types";
import { getWmoCondition } from "../weather/wmo";

// Mock toast from sonner
const mockToast = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

function createMockWeather(overrides?: {
  code?: number;
  temperature?: number;
  apparentTemperature?: number;
  windSpeed?: number;
  precipitation?: number;
  timestamp?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
}): WeatherData {
  const code = overrides?.code ?? 0;
  const isDay = true;
  const condition = getWmoCondition(code, isDay);
  const temp = overrides?.temperature ?? 28;
  const apparent = overrides?.apparentTemperature ?? temp;

  return {
    current: {
      temperature: temp,
      apparentTemperature: apparent,
      relativeHumidity: 65,
      precipitation: overrides?.precipitation ?? 0,
      weatherCode: code,
      windSpeed: overrides?.windSpeed ?? 12,
      isDay,
      condition,
      timestamp: overrides?.timestamp ?? "2026-10-24T18:00:00Z",
    },
    hourly: [],
    daily: [],
    locationName: overrides?.locationName ?? "Dhaka, Bangladesh",
    isFallbackLocation: false,
    latitude: overrides?.latitude ?? 23.8103,
    longitude: overrides?.longitude ?? 90.4125,
    fetchedAt: Date.now(),
  };
}

describe("Weather In-App Notifications Service", () => {
  beforeEach(() => {
    clearWeatherNotifications();
    mockToast.error.mockReset();
    mockToast.warning.mockReset();
    mockToast.info.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    clearWeatherNotifications();
  });

  describe("Rule 1: Convective & Severe Storms (WMO >= 95 or violent rain)", () => {
    it("evaluates WMO code 95 (Thunderstorm) as warning notification", () => {
      const weather = createMockWeather({ code: 95, windSpeed: 35, precipitation: 15 });
      const notif = evaluateWeatherNotification(weather);

      expect(notif).not.toBeNull();
      expect(notif?.category).toBe("storm");
      expect(notif?.severity).toBe("warning");
      expect(notif?.title).toContain("Thunderstorm");
      expect(notif?.body).toContain("Dhaka, Bangladesh");
      expect(notif?.source).toBe("OPEN_METEO");
      expect(notif?.isRead).toBe(false);
    });

    it("evaluates WMO code 99 (Thunderstorm with heavy hail + high wind) as critical notification", () => {
      const weather = createMockWeather({ code: 99, windSpeed: 55, precipitation: 25 });
      const notif = evaluateWeatherNotification(weather);

      expect(notif).not.toBeNull();
      expect(notif?.category).toBe("storm");
      expect(notif?.severity).toBe("critical");
      expect(notif?.title).toMatch(/thunderstorm with heavy hail/i);
    });
  });

  describe("Rule 2: High Wind Squall", () => {
    it("evaluates wind >= 50 km/h as high wind advisory warning", () => {
      const weather = createMockWeather({ code: 2, windSpeed: 55, precipitation: 0 });
      const notif = evaluateWeatherNotification(weather);

      expect(notif).not.toBeNull();
      expect(notif?.category).toBe("wind");
      expect(notif?.severity).toBe("warning");
      expect(notif?.title).toBe("High Wind Advisory (55 km/h)");
    });

    it("evaluates violent gale >= 65 km/h as critical notification", () => {
      const weather = createMockWeather({ code: 2, windSpeed: 70, precipitation: 0 });
      const notif = evaluateWeatherNotification(weather);

      expect(notif).not.toBeNull();
      expect(notif?.category).toBe("wind");
      expect(notif?.severity).toBe("critical");
    });
  });

  describe("Rule 3: Heavy Precipitation / Waterlogging", () => {
    it("evaluates precipitation >= 15 mm/h as heavy rainfall advisory", () => {
      const weather = createMockWeather({ code: 63, windSpeed: 15, precipitation: 18.5 });
      const notif = evaluateWeatherNotification(weather);

      expect(notif).not.toBeNull();
      expect(notif?.category).toBe("rainfall");
      expect(notif?.severity).toBe("warning");
      expect(notif?.title).toBe("Heavy Rainfall Advisory (18.5 mm/h)");
      expect(notif?.body).toContain("waterlogging");
    });

    it("evaluates extreme precipitation >= 30 mm/h as critical advisory", () => {
      const weather = createMockWeather({ code: 65, windSpeed: 20, precipitation: 35.0 });
      const notif = evaluateWeatherNotification(weather);

      expect(notif).not.toBeNull();
      expect(notif?.category).toBe("rainfall");
      expect(notif?.severity).toBe("critical");
    });
  });

  describe("Rule 4 & 5: Temperature Stress (Heat / Cold)", () => {
    it("evaluates heat index >= 40°C as extreme heat advisory", () => {
      const weather = createMockWeather({
        temperature: 36,
        apparentTemperature: 41,
        windSpeed: 10,
        precipitation: 0,
      });
      const notif = evaluateWeatherNotification(weather);

      expect(notif).not.toBeNull();
      expect(notif?.category).toBe("heat");
      expect(notif?.severity).toBe("info");
      expect(notif?.title).toContain("Extreme Heat Advisory (41°C Heat Index)");
    });

    it("evaluates heat index >= 43°C as warning level heat stress", () => {
      const weather = createMockWeather({
        temperature: 38,
        apparentTemperature: 44,
        windSpeed: 8,
        precipitation: 0,
      });
      const notif = evaluateWeatherNotification(weather);

      expect(notif?.severity).toBe("warning");
    });

    it("evaluates apparent temperature <= 10°C as cold advisory", () => {
      const weather = createMockWeather({
        temperature: 11,
        apparentTemperature: 9,
        windSpeed: 15,
        precipitation: 0,
      });
      const notif = evaluateWeatherNotification(weather);

      expect(notif).not.toBeNull();
      expect(notif?.category).toBe("cold");
      expect(notif?.title).toContain("Cold Weather Advisory (9°C)");
    });
  });

  describe("Rule 6: Routine / Calm Weather", () => {
    it("returns null for calm, safe weather without spamming notifications", () => {
      const weather = createMockWeather({
        code: 1, // Mainly clear
        temperature: 26,
        apparentTemperature: 27,
        windSpeed: 12,
        precipitation: 0,
      });
      const notif = evaluateWeatherNotification(weather);

      expect(notif).toBeNull();
    });

    it("returns null gracefully if weather or condition is undefined", () => {
      expect(evaluateWeatherNotification(null as unknown as WeatherData)).toBeNull();
      expect(evaluateWeatherNotification({} as unknown as WeatherData)).toBeNull();
    });
  });

  describe("Deterministic Event Key & Deduplication", () => {
    it("generates identical event keys for the same 2-hour observation window and location", () => {
      const key1 = generateWeatherEventKey("convective", "23.81,90.41", "2026-10-24T18:15:00Z");
      const key2 = generateWeatherEventKey("convective", "23.81,90.41", "2026-10-24T18:45:00Z");
      const keyDifferentWindow = generateWeatherEventKey(
        "convective",
        "23.81,90.41",
        "2026-10-24T20:15:00Z",
      );

      expect(key1).toBe(key2);
      expect(key1).not.toBe(keyDifferentWindow);
    });

    it("tracks delivered keys and prevents duplicate in-app toast delivery", () => {
      const weather = createMockWeather({ code: 95, windSpeed: 35, precipitation: 15 });
      const notif = evaluateWeatherNotification(weather);
      expect(notif).not.toBeNull();

      // First delivery: succeeds and triggers toast
      const firstResult = dispatchInAppWeatherNotification(notif!);
      expect(firstResult).toBe(true);
      expect(mockToast.warning).toHaveBeenCalledTimes(1);

      // Second delivery with identical eventKey: suppressed as duplicate
      const secondResult = dispatchInAppWeatherNotification(notif!);
      expect(secondResult).toBe(false);
      expect(mockToast.warning).toHaveBeenCalledTimes(1);
    });

    it("simulates repeated component re-renders: does not duplicate records in storage", () => {
      const weather = createMockWeather({ code: 95, windSpeed: 35, precipitation: 15 });
      const notif = evaluateWeatherNotification(weather)!;

      markNotificationDelivered(notif);
      markNotificationDelivered(notif);
      markNotificationDelivered(notif);

      const stored = getStoredWeatherNotifications();
      expect(stored.length).toBe(1);
      expect(stored[0]?.eventKey).toBe(notif.eventKey);
    });
  });

  describe("Read / Unread and Storage Lifecycle", () => {
    it("manages read status accurately", () => {
      const weather = createMockWeather({ code: 95, windSpeed: 35, precipitation: 15 });
      const notif = evaluateWeatherNotification(weather)!;

      markNotificationDelivered(notif);
      expect(hasUnreadWeatherNotifications()).toBe(true);

      markWeatherNotificationAsRead(notif.id);
      expect(hasUnreadWeatherNotifications()).toBe(false);
    });

    it("marks all notifications as read when markAllWeatherNotificationsAsRead is called", () => {
      const weather1 = createMockWeather({ code: 95, windSpeed: 35, precipitation: 15 });
      const notif1 = evaluateWeatherNotification(weather1)!;

      markNotificationDelivered(notif1);
      expect(hasUnreadWeatherNotifications()).toBe(true);

      markAllWeatherNotificationsAsRead();
      expect(hasUnreadWeatherNotifications()).toBe(false);

      const stored = getStoredWeatherNotifications();
      expect(stored.every((n) => n.isRead)).toBe(true);
    });

    it("prunes expired notifications automatically on retrieval", () => {
      const expiredNotif = {
        id: "expired-notif",
        eventKey: "expired-notif",
        source: "OPEN_METEO" as const,
        sourceLabel: "Test",
        category: "rainfall" as const,
        severity: "warning" as const,
        title: "Old Rain",
        body: "Rain from 3 days ago",
        location: "Dhaka",
        timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
        expiresAt: new Date(Date.now() - 86400000).toISOString(), // expired yesterday
        isRead: false,
        conditionCode: 65,
        metrics: { temperature: 25, apparentTemperature: 25, precipitation: 20, windSpeed: 10 },
      };

      const freshNotif = {
        id: "fresh-notif",
        eventKey: "fresh-notif",
        source: "OPEN_METEO" as const,
        sourceLabel: "Test",
        category: "storm" as const,
        severity: "warning" as const,
        title: "Active Storm",
        body: "Storm now",
        location: "Dhaka",
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // expires in 1h
        isRead: false,
        conditionCode: 95,
        metrics: { temperature: 25, apparentTemperature: 25, precipitation: 20, windSpeed: 10 },
      };

      saveWeatherNotifications([expiredNotif, freshNotif]);

      const retrieved = getStoredWeatherNotifications();
      expect(retrieved.length).toBe(1);
      expect(retrieved[0]?.id).toBe("fresh-notif");
    });
  });
});
