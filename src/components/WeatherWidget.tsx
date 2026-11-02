import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  Wind,
  Droplets,
  RefreshCw,
  AlertTriangle,
  MapPin,
  CloudOff,
} from "lucide-react";
import { Card } from "@/components/rl";
import type { WeatherData, WeatherIconName } from "@/lib/weather/types";

interface WeatherWidgetProps {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  className?: string;
}

export function WeatherIcon({
  name,
  className = "h-5 w-5",
}: {
  name: WeatherIconName;
  className?: string;
}) {
  switch (name) {
    case "sun":
      return <Sun className={`text-amber-500 ${className}`} />;
    case "moon":
      return <Moon className={`text-indigo-400 ${className}`} />;
    case "cloud-sun":
      return <CloudSun className={`text-amber-500 ${className}`} />;
    case "cloud-moon":
      return <CloudMoon className={`text-indigo-400 ${className}`} />;
    case "cloud":
      return <Cloud className={`text-slate-400 ${className}`} />;
    case "cloud-drizzle":
      return <CloudDrizzle className={`text-sky-400 ${className}`} />;
    case "cloud-rain":
      return <CloudRain className={`text-blue-500 ${className}`} />;
    case "cloud-lightning":
      return <CloudLightning className={`text-amber-600 ${className}`} />;
    case "wind":
      return <Wind className={`text-teal-500 ${className}`} />;
    case "cloud-fog":
    default:
      return <Cloud className={`text-slate-400 ${className}`} />;
  }
}

export function WeatherWidget({
  weather,
  loading,
  error,
  isRefreshing = false,
  onRefresh,
  className = "",
}: WeatherWidgetProps) {
  // 1. Loading Skeleton
  if (loading && !weather) {
    return (
      <Card className={`p-4 animate-pulse ${className}`}>
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
        </div>
        <div className="flex items-center gap-4 py-4">
          <div className="h-12 w-12 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-6 w-20 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
          <div className="h-8 rounded bg-muted" />
          <div className="h-8 rounded bg-muted" />
          <div className="h-8 rounded bg-muted" />
        </div>
      </Card>
    );
  }

  // 2. Error State
  if (error && !weather) {
    return (
      <Card className={`p-4 border-warn/30 bg-warn/5 ${className}`}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn">
            <CloudOff className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold text-navy">Live Weather Unavailable</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              Could not retrieve meteorological observations. Check your internet connection.
            </p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="press mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-navy shadow-xs border border-border/60"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry Weather Check
              </button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (!weather) return null;

  const { current, hourly, locationName, isFallbackLocation, fetchedAt } = weather;
  const isSevere = current.condition.isSevere;
  const formattedTime = new Date(fetchedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card
      className={`p-4 shadow-[var(--shadow-soft)] ${isSevere ? "border-amber-300 bg-amber-500/5" : ""} ${className}`}
    >
      {/* Header with location and refresh */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs font-bold text-navy">{locationName}</span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${
              isFallbackLocation ? "bg-muted text-muted-foreground" : "bg-safe/12 text-safe"
            }`}
          >
            {isFallbackLocation ? "Default Area" : "Live GPS"}
          </span>
        </div>

        {onRefresh && (
          <button
            type="button"
            aria-label="Refresh live weather"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="press grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-navy transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Severe Weather Indicator if applicable */}
      {isSevere && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-500/15 px-3 py-2 text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs font-bold">
            Severe meteorological condition: {current.condition.label}
          </p>
        </div>
      )}

      {/* Main Temperature and Condition Row */}
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-muted/80">
            <WeatherIcon name={current.condition.iconName} className="h-7 w-7" />
          </span>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold tracking-tight text-navy leading-none">
                {current.temperature}°C
              </span>
              <span className="text-xs text-muted-foreground">
                Feels like {current.apparentTemperature}°C
              </span>
            </div>
            <p className="mt-1 text-[12.5px] font-semibold text-navy">
              {current.condition.label} ·{" "}
              <span className="font-normal text-muted-foreground">{current.condition.labelBn}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Bar */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/60 p-2.5 text-center">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Droplets className="h-3.5 w-3.5 text-sky-500" /> Humidity
          </div>
          <p className="mt-0.5 text-xs font-bold text-navy">{current.relativeHumidity}%</p>
        </div>
        <div className="flex flex-col items-center border-x border-border/50">
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Wind className="h-3.5 w-3.5 text-teal-600" /> Wind
          </div>
          <p className="mt-0.5 text-xs font-bold text-navy">{current.windSpeed} km/h</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <CloudRain className="h-3.5 w-3.5 text-blue-500" /> Rain
          </div>
          <p className="mt-0.5 text-xs font-bold text-navy">
            {current.precipitation > 0 ? `${current.precipitation} mm` : "0.0 mm"}
          </p>
        </div>
      </div>

      {/* Hourly Mini Forecast (Next 5 hours) */}
      {hourly && hourly.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Hourly Outlook
          </p>
          <div className="grid grid-cols-5 gap-1 text-center">
            {hourly.slice(0, 5).map((item, idx) => (
              <div key={item.time || idx} className="flex flex-col items-center py-1">
                <span className="text-[10.5px] text-muted-foreground font-medium">
                  {item.formattedHour}
                </span>
                <span className="my-1">
                  <WeatherIcon name={item.condition.iconName} className="h-4 w-4" />
                </span>
                <span className="text-xs font-bold text-navy">{item.temperature}°</span>
                {item.precipitationProbability > 10 ? (
                  <span className="text-[9.5px] font-semibold text-blue-600">
                    {item.precipitationProbability}%
                  </span>
                ) : (
                  <span className="text-[9.5px] text-muted-foreground/60">-</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attribution footer compliant with Open-Meteo licensing */}
      <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline text-navy/70 hover:text-navy"
        >
          Weather data by Open-Meteo
        </a>
        <span>Observed {formattedTime}</span>
      </div>
    </Card>
  );
}
