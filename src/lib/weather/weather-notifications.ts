import { toast } from "sonner";
import type { WeatherData, WeatherNotification } from "./types";
import { quantizeWeatherCoords } from "./open-meteo";

export const NOTIFICATION_STORAGE_KEY = "rl_weather_notifications_v1";
export const NOTIFICATION_DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Documented meteorological advisory thresholds
export const WIND_WARNING_THRESHOLD_KMH = 50;
export const WIND_CRITICAL_THRESHOLD_KMH = 65;
export const RAIN_WARNING_THRESHOLD_MM = 15.0;
export const RAIN_CRITICAL_THRESHOLD_MM = 30.0;
export const HEAT_ADVISORY_THRESHOLD_C = 40;
export const HEAT_WARNING_THRESHOLD_C = 43;
export const COLD_ADVISORY_THRESHOLD_C = 10;

// In-memory set of delivered event keys for the active browser session
const sessionDeliveredKeys = new Set<string>();

/**
 * Builds a deterministic event key for deduplication.
 * Form: "open-meteo:<category>:<lat,lng>:<timeBucket>"
 */
export function generateWeatherEventKey(
  category: string,
  coordsStr: string,
  timestampIso: string,
): string {
  // Use a 2-hour observation time bucket to prevent duplicate notifications during repeated refreshes
  const dateStr = timestampIso.slice(0, 10);
  const hour = parseInt(timestampIso.slice(11, 13) || "0", 10);
  const bucketHour = Math.floor(hour / 2) * 2;
  const timeBucket = `${dateStr}T${bucketHour.toString().padStart(2, "0")}`;

  return `open-meteo:${category}:${coordsStr}:${timeBucket}`;
}

/**
 * Evaluates real Open-Meteo weather data against documented meteorological rules.
 * Returns a WeatherNotification if conditions meet advisory/warning thresholds, or null for routine weather.
 */
export function evaluateWeatherNotification(weather: WeatherData): WeatherNotification | null {
  if (!weather || !weather.current || !weather.current.condition) {
    return null;
  }

  const { current, locationName, latitude, longitude } = weather;
  const coordsKey = quantizeWeatherCoords(latitude, longitude);
  const obsTime = current.timestamp || new Date().toISOString();
  const expiresAt = new Date(Date.now() + NOTIFICATION_DEFAULT_TTL_MS).toISOString();

  const metrics = {
    temperature: current.temperature,
    apparentTemperature: current.apparentTemperature,
    precipitation: current.precipitation,
    windSpeed: current.windSpeed,
  };

  // Rule 1: Thunderstorms, Violent Showers, or Severe Convective Weather (WMO >= 95 or violent rain)
  if (current.condition.code >= 95 || (current.condition.code === 82 && current.windSpeed >= 40)) {
    const isCritical = current.condition.code >= 95 && current.windSpeed >= 50;
    const eventKey = generateWeatherEventKey("convective", coordsKey, obsTime);

    return {
      id: eventKey,
      eventKey,
      source: "OPEN_METEO",
      sourceLabel: "Live Meteorological Observation (Open-Meteo)",
      category: "storm",
      severity: isCritical ? "critical" : "warning",
      title: `Severe Weather: ${current.condition.label}`,
      body: `Live Open-Meteo observation in ${locationName}: ${current.condition.label} (${current.condition.labelBn}). Wind: ${current.windSpeed} km/h, Precipitation: ${current.precipitation} mm. Seek safe indoor shelter and exercise caution.`,
      location: locationName,
      timestamp: obsTime,
      expiresAt,
      isRead: false,
      conditionCode: current.condition.code,
      metrics,
    };
  }

  // Rule 2: High Wind Squall (sustained wind >= 50 km/h)
  if (current.windSpeed >= WIND_WARNING_THRESHOLD_KMH) {
    const isCritical = current.windSpeed >= WIND_CRITICAL_THRESHOLD_KMH;
    const eventKey = generateWeatherEventKey("high_wind", coordsKey, obsTime);

    return {
      id: eventKey,
      eventKey,
      source: "OPEN_METEO",
      sourceLabel: "Live Meteorological Observation (Open-Meteo)",
      category: "wind",
      severity: isCritical ? "critical" : "warning",
      title: `High Wind Advisory (${current.windSpeed} km/h)`,
      body: `Strong wind conditions observed in ${locationName} (${current.windSpeed} km/h). Loose objects and tree branches may be displaced. Avoid standing near unstable structures.`,
      location: locationName,
      timestamp: obsTime,
      expiresAt,
      isRead: false,
      conditionCode: current.condition.code,
      metrics,
    };
  }

  // Rule 3: Heavy Precipitation / Rapid Waterlogging (precipitation >= 15 mm/h or WMO heavy rain code 65)
  if (current.precipitation >= RAIN_WARNING_THRESHOLD_MM || current.condition.code === 65) {
    const isCritical = current.precipitation >= RAIN_CRITICAL_THRESHOLD_MM;
    const eventKey = generateWeatherEventKey("heavy_rain", coordsKey, obsTime);

    return {
      id: eventKey,
      eventKey,
      source: "OPEN_METEO",
      sourceLabel: "Live Meteorological Observation (Open-Meteo)",
      category: "rainfall",
      severity: isCritical ? "critical" : "warning",
      title: `Heavy Rainfall Advisory (${current.precipitation} mm/h)`,
      body: `Heavy rainfall detected in ${locationName} (${current.precipitation} mm recorded in the past hour). Low-lying streets and drainage corridors may experience sudden waterlogging.`,
      location: locationName,
      timestamp: obsTime,
      expiresAt,
      isRead: false,
      conditionCode: current.condition.code,
      metrics,
    };
  }

  // Rule 4: Extreme Heat Stress (Apparent Temperature >= 40°C)
  if (current.apparentTemperature >= HEAT_ADVISORY_THRESHOLD_C) {
    const isWarning = current.apparentTemperature >= HEAT_WARNING_THRESHOLD_C;
    const eventKey = generateWeatherEventKey("extreme_heat", coordsKey, obsTime);

    return {
      id: eventKey,
      eventKey,
      source: "OPEN_METEO",
      sourceLabel: "Live Meteorological Observation (Open-Meteo)",
      category: "heat",
      severity: isWarning ? "warning" : "info",
      title: `Extreme Heat Advisory (${current.apparentTemperature}°C Heat Index)`,
      body: `Very high heat index observed in ${locationName} (Feels like ${current.apparentTemperature}°C). Stay well hydrated, avoid prolonged direct sun exposure, and check on vulnerable individuals.`,
      location: locationName,
      timestamp: obsTime,
      expiresAt,
      isRead: false,
      conditionCode: current.condition.code,
      metrics,
    };
  }

  // Rule 5: Cold Wave / Cold Stress (Apparent Temperature <= 10°C in Bangladesh context)
  if (
    current.apparentTemperature <= COLD_ADVISORY_THRESHOLD_C &&
    current.apparentTemperature > -50
  ) {
    const eventKey = generateWeatherEventKey("cold_stress", coordsKey, obsTime);

    return {
      id: eventKey,
      eventKey,
      source: "OPEN_METEO",
      sourceLabel: "Live Meteorological Observation (Open-Meteo)",
      category: "cold",
      severity: "info",
      title: `Cold Weather Advisory (${current.apparentTemperature}°C)`,
      body: `Unusually cold conditions observed in ${locationName} (Feels like ${current.apparentTemperature}°C). Wear warm layers and protect elderly and young family members.`,
      location: locationName,
      timestamp: obsTime,
      expiresAt,
      isRead: false,
      conditionCode: current.condition.code,
      metrics,
    };
  }

  // Rule 6: Routine / Non-hazardous Weather -> Safe minimal behavior: no notification
  return null;
}

/**
 * Retrieves stored weather notifications from localStorage, automatically pruning expired entries.
 */
export function getStoredWeatherNotifications(): WeatherNotification[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    const active = parsed.filter((item: WeatherNotification) => {
      const exp = Date.parse(item.expiresAt);
      return !Number.isNaN(exp) && exp > now;
    });

    // If any items expired, prune the storage cleanly
    if (active.length !== parsed.length) {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(active));
    }

    return active;
  } catch {
    return [];
  }
}

/**
 * Persists weather notifications list to localStorage safely.
 */
export function saveWeatherNotifications(list: WeatherNotification[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota or disabled errors
  }
}

/**
 * Checks if an event key has already been delivered in this session or in storage.
 */
export function hasNotificationBeenDelivered(eventKey: string): boolean {
  if (sessionDeliveredKeys.has(eventKey)) return true;

  const stored = getStoredWeatherNotifications();
  return stored.some((n) => n.eventKey === eventKey);
}

/**
 * Marks an event key as delivered in session memory and persistent storage.
 */
export function markNotificationDelivered(notification: WeatherNotification): void {
  sessionDeliveredKeys.add(notification.eventKey);

  const stored = getStoredWeatherNotifications();
  const existingIdx = stored.findIndex((n) => n.eventKey === notification.eventKey);

  if (existingIdx >= 0) {
    stored[existingIdx] = { ...stored[existingIdx]!, ...notification };
  } else {
    stored.unshift(notification);
  }

  saveWeatherNotifications(stored);
}

/**
 * Marks a specific notification as read by ID.
 */
export function markWeatherNotificationAsRead(id: string): void {
  const stored = getStoredWeatherNotifications();
  let updated = false;

  const next = stored.map((n) => {
    if (n.id === id || n.eventKey === id) {
      updated = true;
      return { ...n, isRead: true };
    }
    return n;
  });

  if (updated) {
    saveWeatherNotifications(next);
  }
}

/**
 * Marks all active weather notifications as read.
 */
export function markAllWeatherNotificationsAsRead(): void {
  const stored = getStoredWeatherNotifications();
  if (stored.length === 0) return;

  const next = stored.map((n) => ({ ...n, isRead: true }));
  saveWeatherNotifications(next);
}

/**
 * Returns true if there are active unread weather notifications.
 */
export function hasUnreadWeatherNotifications(): boolean {
  const stored = getStoredWeatherNotifications();
  return stored.some((n) => !n.isRead);
}

/**
 * Clears all stored weather notifications and session delivery tracking.
 * Useful for automated unit testing.
 */
export function clearWeatherNotifications(): void {
  sessionDeliveredKeys.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Dispatches an in-app Sonner toast notification for an evaluated weather notification
 * if it has not already been delivered in the current validity window.
 *
 * Returns true if the notification was delivered, or false if it was already delivered or suppressed.
 */
export function dispatchInAppWeatherNotification(notification: WeatherNotification): boolean {
  if (!notification || !notification.eventKey) return false;

  // Deduplication check: prevent duplicate popups across polling cycles and re-renders
  if (hasNotificationBeenDelivered(notification.eventKey)) {
    return false;
  }

  // Register delivery immediately before rendering toast
  markNotificationDelivered(notification);

  // Deliver via Sonner in browser environments
  if (typeof window !== "undefined") {
    const toastOptions = {
      description: notification.body,
      duration: notification.severity === "critical" ? 8000 : 5000,
    };

    if (notification.severity === "critical") {
      toast.error(notification.title, toastOptions);
    } else if (notification.severity === "warning") {
      toast.warning(notification.title, toastOptions);
    } else {
      toast.info(notification.title, toastOptions);
    }
  }

  return true;
}
