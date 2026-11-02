// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  urlBase64ToUint8Array,
  isPushNotificationSupported,
  getPushPreferences,
  savePushPreferences,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  deriveSubscriptionId,
} from "../weather/push-service";
import {
  isPushPayloadValid,
  isSafeInternalAppRoute,
  timingSafeEqualString,
  verifyCronAuthorization,
  executeScheduledWeatherCheck,
  clearDispatchedPushEventKeys,
  type PushNotificationPayload,
  type MonitoredLocation,
} from "../weather/push-dispatcher";
import type { WeatherData } from "../weather/types";
import { getWmoCondition } from "../weather/wmo";

function createMockWeather(overrides?: {
  code?: number;
  windSpeed?: number;
  precipitation?: number;
  apparentTemperature?: number;
  locationName?: string;
  latitude?: number;
  longitude?: number;
}): WeatherData {
  const code = overrides?.code ?? 0;
  const isDay = true;
  const condition = getWmoCondition(code, isDay);

  return {
    current: {
      temperature: 28,
      apparentTemperature: overrides?.apparentTemperature ?? 28,
      relativeHumidity: 70,
      precipitation: overrides?.precipitation ?? 0,
      weatherCode: code,
      windSpeed: overrides?.windSpeed ?? 15,
      isDay,
      condition,
      timestamp: "2026-10-25T00:00:00Z",
    },
    hourly: [],
    daily: [],
    locationName: overrides?.locationName ?? "Dhaka",
    isFallbackLocation: false,
    latitude: overrides?.latitude ?? 23.8103,
    longitude: overrides?.longitude ?? 90.4125,
    fetchedAt: Date.now(),
  };
}

describe("Background Push Notifications & Dispatcher", () => {
  beforeEach(() => {
    localStorage.clear();
    clearDispatchedPushEventKeys();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearDispatchedPushEventKeys();
  });

  describe("Push Service Utilities & Support", () => {
    it("converts URL-safe Base64 VAPID public key to Uint8Array correctly", () => {
      // Standard base64 test string "ABCD"
      const base64 = "ABCD";
      const u8 = urlBase64ToUint8Array(base64);

      expect(u8 instanceof Uint8Array).toBe(true);
      expect(u8.length).toBe(3);
    });

    it("evaluates push support accurately based on window APIs", () => {
      // In default jsdom, serviceWorker and PushManager may be undefined unless polyfilled
      const isSupported = isPushNotificationSupported();
      expect(typeof isSupported).toBe("boolean");
    });

    it("manages push preferences in localStorage", () => {
      const defaultPrefs = getPushPreferences();
      expect(defaultPrefs.enabled).toBe(false);
      expect(defaultPrefs.weatherAlerts).toBe(true);

      const updated = savePushPreferences({
        enabled: true,
        severeWeatherOnly: false,
      });

      expect(updated.enabled).toBe(true);
      expect(updated.severeWeatherOnly).toBe(false);

      const reloaded = getPushPreferences();
      expect(reloaded.enabled).toBe(true);
      expect(reloaded.severeWeatherOnly).toBe(false);
    });

    it("handles unsupported push subscription gracefully", async () => {
      // Temporarily remove PushManager if present
      const originalPushManager = (window as unknown as { PushManager?: unknown }).PushManager;
      delete (window as unknown as { PushManager?: unknown }).PushManager;

      const result = await subscribeToPushNotifications();
      expect(result.success).toBe(false);
      expect(result.reason).toBe("unsupported");

      if (originalPushManager) {
        (window as unknown as { PushManager?: unknown }).PushManager = originalPushManager;
      }
    });

    it("handles permission denial safely without throwing", async () => {
      // Mock navigator.serviceWorker and window.PushManager
      Object.defineProperty(navigator, "serviceWorker", {
        value: { register: vi.fn(), ready: Promise.resolve({}) },
        configurable: true,
      });
      Object.defineProperty(window, "PushManager", {
        value: class {},
        configurable: true,
      });
      Object.defineProperty(window, "Notification", {
        value: {
          permission: "denied",
          requestPermission: vi.fn().mockResolvedValue("denied"),
        },
        configurable: true,
      });

      const result = await subscribeToPushNotifications();
      expect(result.success).toBe(false);
      expect(result.reason).toBe("permission_denied");
      expect(getPushPreferences().enabled).toBe(false);
    });

    it("handles missing VAPID key gracefully when permission is granted", async () => {
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          register: vi.fn().mockResolvedValue({}),
          ready: Promise.resolve({}),
        },
        configurable: true,
      });
      Object.defineProperty(window, "PushManager", {
        value: class {},
        configurable: true,
      });
      Object.defineProperty(window, "Notification", {
        value: {
          permission: "granted",
          requestPermission: vi.fn().mockResolvedValue("granted"),
        },
        configurable: true,
      });

      const result = await subscribeToPushNotifications();
      expect(result.success).toBe(false);
      expect(result.reason).toBe("vapid_key_missing");
      expect(result.message).toContain("VITE_VAPID_PUBLIC_KEY");
    });

    it("unsubscribes from push notifications cleanly", async () => {
      savePushPreferences({ enabled: true });
      expect(getPushPreferences().enabled).toBe(true);

      const unsubResult = await unsubscribeFromPushNotifications();
      expect(unsubResult).toBe(true);
      expect(getPushPreferences().enabled).toBe(false);
    });

    it("derives deterministic, collision-resistant subscription IDs", () => {
      const ep1 = "https://fcm.googleapis.com/fcm/send/token-alpha-12345";
      const ep2 = "https://fcm.googleapis.com/fcm/send/token-beta-67890";

      const id1 = deriveSubscriptionId(ep1);
      const id2 = deriveSubscriptionId(ep2);

      expect(typeof id1).toBe("string");
      expect(id1.startsWith("sub_")).toBe(true);
      expect(id1.length).toBeLessThanOrEqual(48);
      // Deterministic: repeated calls yield identical ID
      expect(deriveSubscriptionId(ep1)).toBe(id1);
      // Distinct endpoints yield distinct IDs
      expect(id1).not.toBe(id2);
      // Edge cases
      expect(deriveSubscriptionId("")).toBe("sub_invalid");
    });
  });

  describe("URL Sanitization & Route Safety", () => {
    it("allows valid internal routes and rejects external origins or protocol-relative paths", () => {
      expect(isSafeInternalAppRoute("/alerts")).toBe(true);
      expect(isSafeInternalAppRoute("/")).toBe(true);
      expect(isSafeInternalAppRoute("/weather/details")).toBe(true);

      // Attack vectors
      expect(isSafeInternalAppRoute("//evil.com")).toBe(false);
      expect(isSafeInternalAppRoute("/\\evil.com")).toBe(false);
      expect(isSafeInternalAppRoute("https://evil.com")).toBe(false);
      expect(isSafeInternalAppRoute("http://evil.com")).toBe(false);
      expect(isSafeInternalAppRoute("javascript:alert(1)")).toBe(false);
      expect(isSafeInternalAppRoute("data:text/html,bad")).toBe(false);
      expect(isSafeInternalAppRoute("")).toBe(false);
      expect(isSafeInternalAppRoute(null)).toBe(false);
    });
  });

  describe("Cron Authentication & Constant-Time Security", () => {
    it("safely verifies valid Bearer tokens and direct secret strings", () => {
      const secret = "rescuelink-super-secret-cron-token-2026";
      expect(verifyCronAuthorization(`Bearer ${secret}`, secret)).toBe(true);
      expect(verifyCronAuthorization(secret, secret)).toBe(true);
    });

    it("rejects invalid tokens, missing headers, or empty secrets", () => {
      const secret = "rescuelink-super-secret-cron-token-2026";
      expect(verifyCronAuthorization("Bearer wrong-token", secret)).toBe(false);
      expect(verifyCronAuthorization(null, secret)).toBe(false);
      expect(verifyCronAuthorization("", secret)).toBe(false);
      expect(verifyCronAuthorization(`Bearer ${secret}`, "")).toBe(false);
      expect(verifyCronAuthorization(`Bearer ${secret}`, null)).toBe(false);
    });

    it("evaluates strings in constant-time with timingSafeEqualString", () => {
      expect(timingSafeEqualString("token123", "token123")).toBe(true);
      expect(timingSafeEqualString("token123", "token124")).toBe(false);
      expect(timingSafeEqualString("token123", "short")).toBe(false);
    });
  });

  describe("Push Payload Validation", () => {
    it("validates a compliant push notification payload", () => {
      const payload: PushNotificationPayload = {
        title: "Severe Weather: Thunderstorm",
        body: "Severe thunderstorm with wind gusts up to 55 km/h in Dhaka.",
        icon: "/favicon.png",
        badge: "/favicon.png",
        tag: "open-meteo:storm:23.81,90.41:2026-10-25T00",
        eventKey: "open-meteo:storm:23.81,90.41:2026-10-25T00",
        url: "/alerts",
        severity: "critical",
        timestamp: Date.now(),
      };

      expect(isPushPayloadValid(payload)).toBe(true);
    });

    it("rejects payloads with unsafe destination URLs or excessive length", () => {
      const basePayload: PushNotificationPayload = {
        title: "Weather alert",
        body: "Alert body",
        eventKey: "ev-1",
        url: "/alerts",
        severity: "info",
        timestamp: Date.now(),
      };

      // Protocol-relative URL
      expect(isPushPayloadValid({ ...basePayload, url: "//malicious.com" })).toBe(false);
      // External URL
      expect(isPushPayloadValid({ ...basePayload, url: "https://evil.com" })).toBe(false);
      // JavaScript URI
      expect(isPushPayloadValid({ ...basePayload, url: "javascript:alert(1)" })).toBe(false);
      // Oversized title (>150 chars)
      expect(isPushPayloadValid({ ...basePayload, title: "A".repeat(151) })).toBe(false);
      // Oversized body (>500 chars)
      expect(isPushPayloadValid({ ...basePayload, body: "B".repeat(501) })).toBe(false);
    });

    it("rejects non-objects, empty titles, or missing event keys", () => {
      expect(isPushPayloadValid(null)).toBe(false);
      expect(isPushPayloadValid({})).toBe(false);
      expect(
        isPushPayloadValid({
          title: "",
          body: "body",
          eventKey: "k",
          url: "/",
          severity: "info",
          timestamp: 123,
        }),
      ).toBe(false);
      expect(
        isPushPayloadValid({
          title: "title",
          body: "",
          eventKey: "k",
          url: "/",
          severity: "info",
          timestamp: 123,
        }),
      ).toBe(false);
      expect(
        isPushPayloadValid({
          title: "title",
          body: "body",
          eventKey: "k",
          url: "/",
          severity: "unknown",
          timestamp: 123,
        }),
      ).toBe(false);
    });
  });

  describe("Scheduled Weather Check & Background Dispatcher", () => {
    const testLocations: MonitoredLocation[] = [
      { name: "Dhaka", latitude: 23.8103, longitude: 90.4125 },
      { name: "Chittagong", latitude: 22.3569, longitude: 91.7832 },
    ];

    it("dispatches push when severe conditions are detected in monitored locations", async () => {
      const mockPushSender = vi.fn().mockResolvedValue(true);

      // Dhaka has thunderstorm (code 95), Chittagong has calm weather
      const mockFetcher = vi.fn().mockImplementation(async (loc: MonitoredLocation) => {
        if (loc.name === "Dhaka") {
          return createMockWeather({
            code: 95,
            windSpeed: 45,
            precipitation: 20,
            locationName: "Dhaka",
            latitude: loc.latitude,
            longitude: loc.longitude,
          });
        }
        return createMockWeather({
          code: 0,
          locationName: "Chittagong",
          latitude: loc.latitude,
          longitude: loc.longitude,
        });
      });

      const result = await executeScheduledWeatherCheck({
        locations: testLocations,
        weatherFetcher: mockFetcher,
        pushSender: mockPushSender,
      });

      expect(result.locationsChecked).toBe(2);
      expect(result.eventsDetected).toBe(1);
      expect(result.notificationsDispatched).toBe(1);
      expect(result.duplicatesSkipped).toBe(0);
      expect(mockPushSender).toHaveBeenCalledTimes(1);
      expect(mockPushSender).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Thunderstorm"),
          severity: "warning",
          url: "/alerts",
        }),
      );
    });

    it("deduplicates events across repeated scheduled executions within the same window", async () => {
      const mockPushSender = vi.fn().mockResolvedValue(true);
      const mockFetcher = vi.fn().mockImplementation(async (loc: MonitoredLocation) => {
        return createMockWeather({
          code: 95,
          locationName: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
        });
      });

      // First run: dispatches push
      const firstRun = await executeScheduledWeatherCheck({
        locations: [testLocations[0]!],
        weatherFetcher: mockFetcher,
        pushSender: mockPushSender,
      });
      expect(firstRun.notificationsDispatched).toBe(1);
      expect(firstRun.duplicatesSkipped).toBe(0);

      // Immediate second run (same eventKey): skipped as duplicate
      const secondRun = await executeScheduledWeatherCheck({
        locations: [testLocations[0]!],
        weatherFetcher: mockFetcher,
        pushSender: mockPushSender,
      });
      expect(secondRun.notificationsDispatched).toBe(0);
      expect(secondRun.duplicatesSkipped).toBe(1);
      expect(mockPushSender).toHaveBeenCalledTimes(1); // not called again
    });

    it("produces zero push dispatches when all monitored locations have calm weather", async () => {
      const mockPushSender = vi.fn().mockResolvedValue(true);
      const mockFetcher = vi.fn().mockResolvedValue(createMockWeather({ code: 0 }));

      const result = await executeScheduledWeatherCheck({
        locations: testLocations,
        weatherFetcher: mockFetcher,
        pushSender: mockPushSender,
      });

      expect(result.eventsDetected).toBe(0);
      expect(result.notificationsDispatched).toBe(0);
      expect(mockPushSender).not.toHaveBeenCalled();
    });

    it("handles weather fetcher failures for individual locations without crashing the scheduler", async () => {
      const mockPushSender = vi.fn().mockResolvedValue(true);
      const mockFetcher = vi.fn().mockImplementation(async (loc: MonitoredLocation) => {
        if (loc.name === "Dhaka") {
          throw new Error("HTTP 503 Service Unavailable");
        }
        return createMockWeather({ code: 0 });
      });

      const result = await executeScheduledWeatherCheck({
        locations: testLocations,
        weatherFetcher: mockFetcher,
        pushSender: mockPushSender,
      });

      expect(result.locationsChecked).toBe(2);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain("HTTP 503");
    });
  });
});
