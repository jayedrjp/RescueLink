import type {
  CurrentWeatherData,
  DailyForecastItem,
  HourlyForecastItem,
  OpenMeteoApiResponse,
  WeatherData,
} from "./types";
import { getWmoCondition } from "./wmo";

export const DEFAULT_WEATHER_COORDINATES = {
  latitude: 23.8103,
  longitude: 90.4125,
  name: "Dhaka, Bangladesh",
} as const;

export const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_WEATHER_CACHE_ENTRIES = 50;

interface CacheEntry {
  data: WeatherData;
  timestamp: number;
}

const weatherCache = new Map<string, CacheEntry>();
const inFlightWeatherPromises = new Map<string, Promise<WeatherData>>();

/** Quantizes coordinates to ~1km grid (~0.01 deg) to avoid redundant requests on micro-drifts */
export function quantizeWeatherCoords(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/** Clears all cached weather responses and in-flight tracking (useful for unit testing) */
export function clearWeatherCache(): void {
  weatherCache.clear();
  inFlightWeatherPromises.clear();
}

/** Returns the number of items in the weather cache (useful for testing) */
export function getWeatherCacheSize(): number {
  return weatherCache.size;
}

function formatHour(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return date.toLocaleTimeString([], { hour: "numeric", hour12: true });
  } catch {
    return isoString;
  }
}

function formatDayName(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return "Today";
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString([], { weekday: "short" });
  } catch {
    return dateString;
  }
}

export interface FetchWeatherOptions {
  latitude?: number | undefined;
  longitude?: number | undefined;
  locationName?: string | undefined;
  forceRefresh?: boolean | undefined;
}

/**
 * Validates and safely parses raw Open-Meteo API response into the application's WeatherData shape.
 */
export function parseOpenMeteoResponse(
  raw: OpenMeteoApiResponse,
  options: {
    locationName?: string | undefined;
    isFallbackLocation?: boolean | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
  } = {},
): WeatherData {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid or empty response from weather service.");
  }

  const currentRaw = raw.current;
  const isDay = currentRaw?.is_day !== 0;
  const rawCode = currentRaw?.weather_code;
  const weatherCode = typeof rawCode === "number" && Number.isFinite(rawCode) ? rawCode : 0;
  const condition = getWmoCondition(weatherCode, isDay);

  const rawTemp = currentRaw?.temperature_2m;
  const rawApparent = currentRaw?.apparent_temperature;
  const rawHumidity = currentRaw?.relative_humidity_2m;
  const rawPrecip = currentRaw?.precipitation;
  const rawWind = currentRaw?.wind_speed_10m;

  const current: CurrentWeatherData = {
    temperature: typeof rawTemp === "number" && Number.isFinite(rawTemp) ? Math.round(rawTemp) : 0,
    apparentTemperature:
      typeof rawApparent === "number" && Number.isFinite(rawApparent)
        ? Math.round(rawApparent)
        : typeof rawTemp === "number" && Number.isFinite(rawTemp)
          ? Math.round(rawTemp)
          : 0,
    relativeHumidity:
      typeof rawHumidity === "number" && Number.isFinite(rawHumidity) ? Math.round(rawHumidity) : 0,
    precipitation:
      typeof rawPrecip === "number" && Number.isFinite(rawPrecip)
        ? Number(rawPrecip.toFixed(1))
        : 0,
    weatherCode,
    windSpeed: typeof rawWind === "number" && Number.isFinite(rawWind) ? Math.round(rawWind) : 0,
    isDay,
    condition,
    timestamp: currentRaw?.time || new Date().toISOString(),
  };

  // Parse next 6 available hourly forecast items
  const hourly: HourlyForecastItem[] = [];
  if (raw.hourly?.time && Array.isArray(raw.hourly.time)) {
    const times = raw.hourly.time;
    const temps = raw.hourly.temperature_2m || [];
    const probs = raw.hourly.precipitation_probability || [];
    const codes = raw.hourly.weather_code || [];

    const nowIso = current.timestamp || new Date().toISOString();
    let startIndex = times.findIndex((t) => t >= nowIso.slice(0, 13));
    if (startIndex < 0) startIndex = 0;

    for (let i = startIndex; i < Math.min(startIndex + 6, times.length); i++) {
      const timeStr = times[i] ?? "";
      const tempVal = temps[i];
      const probVal = probs[i];
      const codeVal = codes[i];

      const itemCode = Number.isFinite(codeVal) ? Number(codeVal) : 0;
      hourly.push({
        time: timeStr,
        formattedHour: formatHour(timeStr),
        temperature: Number.isFinite(tempVal) ? Math.round(Number(tempVal)) : current.temperature,
        precipitationProbability: Number.isFinite(probVal) ? Math.round(Number(probVal)) : 0,
        weatherCode: itemCode,
        condition: getWmoCondition(itemCode, true),
      });
    }
  }

  // Parse next 3 available daily forecast items
  const daily: DailyForecastItem[] = [];
  if (raw.daily?.time && Array.isArray(raw.daily.time)) {
    const dates = raw.daily.time;
    const codes = raw.daily.weather_code || [];
    const maxTemps = raw.daily.temperature_2m_max || [];
    const minTemps = raw.daily.temperature_2m_min || [];
    const rainSums = raw.daily.precipitation_sum || [];

    for (let i = 0; i < Math.min(3, dates.length); i++) {
      const dateStr = dates[i] ?? "";
      const codeVal = codes[i];
      const maxVal = maxTemps[i];
      const minVal = minTemps[i];
      const sumVal = rainSums[i];

      const itemCode = Number.isFinite(codeVal) ? Number(codeVal) : 0;
      daily.push({
        date: dateStr,
        formattedDay: formatDayName(dateStr),
        maxTemp: Number.isFinite(maxVal) ? Math.round(Number(maxVal)) : current.temperature,
        minTemp: Number.isFinite(minVal) ? Math.round(Number(minVal)) : current.temperature,
        precipitationSum: Number.isFinite(sumVal) ? Number(Number(sumVal).toFixed(1)) : 0,
        weatherCode: itemCode,
        condition: getWmoCondition(itemCode, true),
      });
    }
  }

  const lat = options.latitude ?? raw.latitude ?? DEFAULT_WEATHER_COORDINATES.latitude;
  const lng = options.longitude ?? raw.longitude ?? DEFAULT_WEATHER_COORDINATES.longitude;

  return {
    current,
    hourly,
    daily,
    locationName: options.locationName || DEFAULT_WEATHER_COORDINATES.name,
    isFallbackLocation: Boolean(options.isFallbackLocation),
    latitude: lat,
    longitude: lng,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetches real weather observations and forecasts from the official Open-Meteo API.
 * Uses spatial coordinate quantization, in-memory caching with 15-minute TTL,
 * and concurrent in-flight deduplication.
 */
export async function fetchWeather(options?: FetchWeatherOptions): Promise<WeatherData> {
  const isFallback =
    !options ||
    !Number.isFinite(options.latitude) ||
    !Number.isFinite(options.longitude) ||
    options.latitude! < -90 ||
    options.latitude! > 90 ||
    options.longitude! < -180 ||
    options.longitude! > 180;

  const lat = isFallback ? DEFAULT_WEATHER_COORDINATES.latitude : options!.latitude!;
  const lng = isFallback ? DEFAULT_WEATHER_COORDINATES.longitude : options!.longitude!;
  const locationName =
    options?.locationName || (isFallback ? DEFAULT_WEATHER_COORDINATES.name : "Your Location");

  const cacheKey = quantizeWeatherCoords(lat, lng);

  // 1. Check in-memory cache if forceRefresh is not requested
  if (!options?.forceRefresh) {
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < WEATHER_CACHE_TTL_MS) {
      return {
        ...cached.data,
        locationName, // preserve latest display location
        isFallbackLocation: isFallback,
      };
    }
  }

  // 2. Check in-flight promise deduplication
  const existingInFlight = inFlightWeatherPromises.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  // 3. Dispatch network fetch
  const fetchPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
      hourly: "temperature_2m,precipitation_probability,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
      timezone: "auto",
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Open-Meteo weather service error: HTTP ${response.status}`);
      }

      const raw = (await response.json()) as OpenMeteoApiResponse;
      const parsed = parseOpenMeteoResponse(raw, {
        locationName,
        isFallbackLocation: isFallback,
        latitude: lat,
        longitude: lng,
      });

      // Manage cache size limit
      if (weatherCache.size >= MAX_WEATHER_CACHE_ENTRIES) {
        const oldestKey = weatherCache.keys().next().value;
        if (oldestKey) weatherCache.delete(oldestKey);
      }

      weatherCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
      return parsed;
    } catch (err) {
      clearTimeout(timeoutId);
      // If cached data exists (even expired), return stale cache rather than failing entirely
      const staleCached = weatherCache.get(cacheKey);
      if (staleCached) {
        console.warn("[RescueLink Weather] Network error; returning stale cached weather:", err);
        return {
          ...staleCached.data,
          locationName,
          isFallbackLocation: isFallback,
        };
      }
      throw err;
    }
  })();

  inFlightWeatherPromises.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    inFlightWeatherPromises.delete(cacheKey);
  }
}
