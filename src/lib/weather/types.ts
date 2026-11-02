export type WeatherIconName =
  | "sun"
  | "moon"
  | "cloud-sun"
  | "cloud-moon"
  | "cloud"
  | "cloud-fog"
  | "cloud-drizzle"
  | "cloud-rain"
  | "cloud-lightning"
  | "wind";

export interface WeatherCondition {
  code: number;
  label: string;
  labelBn: string;
  iconName: WeatherIconName;
  isSevere: boolean;
}

export interface CurrentWeatherData {
  temperature: number;
  apparentTemperature: number;
  relativeHumidity: number;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  isDay: boolean;
  condition: WeatherCondition;
  timestamp: string;
}

export interface HourlyForecastItem {
  time: string;
  formattedHour: string;
  temperature: number;
  precipitationProbability: number;
  weatherCode: number;
  condition: WeatherCondition;
}

export interface DailyForecastItem {
  date: string;
  formattedDay: string;
  maxTemp: number;
  minTemp: number;
  precipitationSum: number;
  weatherCode: number;
  condition: WeatherCondition;
}

export interface WeatherData {
  current: CurrentWeatherData;
  hourly: HourlyForecastItem[];
  daily: DailyForecastItem[];
  locationName: string;
  isFallbackLocation: boolean;
  latitude: number;
  longitude: number;
  fetchedAt: number;
}

/** Raw response structure from Open-Meteo forecast API */
export interface OpenMeteoApiResponse {
  latitude: number;
  longitude: number;
  utc_offset_seconds?: number | undefined;
  timezone?: string | undefined;
  current?:
    | {
        time: string;
        interval?: number | undefined;
        temperature_2m?: number | undefined;
        relative_humidity_2m?: number | undefined;
        apparent_temperature?: number | undefined;
        precipitation?: number | undefined;
        weather_code?: number | undefined;
        wind_speed_10m?: number | undefined;
        is_day?: number | undefined;
      }
    | undefined;
  hourly?:
    | {
        time: string[];
        temperature_2m?: (number | null)[] | undefined;
        precipitation_probability?: (number | null)[] | undefined;
        weather_code?: (number | null)[] | undefined;
      }
    | undefined;
  daily?:
    | {
        time: string[];
        weather_code?: (number | null)[] | undefined;
        temperature_2m_max?: (number | null)[] | undefined;
        temperature_2m_min?: (number | null)[] | undefined;
        precipitation_sum?: (number | null)[] | undefined;
      }
    | undefined;
}

export type OfficialWarningSource = "BMD" | "ADMIN_DISPATCH" | "OPEN_METEO";

export interface OfficialWarning {
  id: string;
  source: OfficialWarningSource;
  sourceName: string;
  sourceUrl?: string | undefined;
  category: "cyclone" | "rainfall" | "flood" | "storm" | "general";
  severity: "critical" | "warning" | "advisory";
  headline: string;
  headlineBn?: string | undefined;
  description: string;
  affectedDistricts: string[];
  issuedAt: string;
  expiresAt?: string | undefined;
  isVerifiedOfficial: boolean;
}

export interface BmdFeedStatus {
  isAvailable: boolean;
  status: "unlinked" | "authorized_only" | "available" | "error";
  authorityName: string;
  portalUrl: string;
  legalFramework: string;
  message: string;
  messageBn: string;
  lastChecked: number;
}

export interface WeatherNotificationMetrics {
  temperature: number;
  apparentTemperature: number;
  precipitation: number;
  windSpeed: number;
}

export interface WeatherNotification {
  id: string; // deterministic deduplication key
  eventKey: string;
  source: OfficialWarningSource;
  sourceLabel: string;
  category: "storm" | "rainfall" | "wind" | "heat" | "cold" | "general";
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  location: string;
  timestamp: string; // ISO string
  expiresAt: string; // ISO string
  isRead: boolean;
  conditionCode: number;
  metrics: WeatherNotificationMetrics;
}
