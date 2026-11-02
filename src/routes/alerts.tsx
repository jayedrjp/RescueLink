import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CloudRain,
  ExternalLink,
  Info,
  MapPin,
  PhoneCall,
  Wind,
} from "lucide-react";

import { Card, NotificationButton, Screen, TopBar } from "@/components/rl";
import { formatAlertTime, getStoredAlerts, type Alert } from "@/lib/data";
import { subscribeToAlerts } from "@/lib/firebase/firestore";
import { useWeather } from "@/lib/weather/use-weather";
import { getBmdFeedStatus, getWarningSourceMeta } from "@/lib/weather/bmd-warnings";
import {
  evaluateWeatherNotification,
  markAllWeatherNotificationsAsRead,
} from "@/lib/weather/weather-notifications";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Disaster Alerts & Warnings — RescueLink" },
      {
        name: "description",
        content:
          "Real-time flood, cyclone, rainfall and road closure alerts for your area, sorted by severity.",
      },
      { property: "og:title", content: "Disaster Alerts & Warnings — RescueLink" },
      {
        property: "og:description",
        content: "Critical, warning and information level disaster updates in one calm feed.",
      },
    ],
  }),
  component: AlertsScreen,
});

const tabs = ["All", "Critical", "Warning", "Information"] as const;

const severityMeta = {
  critical: {
    label: "Critical",
    icon: AlertTriangle,
    chip: "bg-primary text-primary-foreground",
    ring: "bg-primary/10 text-primary",
  },
  warning: {
    label: "Warning",
    icon: Wind,
    chip: "bg-warn text-warn-foreground",
    ring: "bg-warn/20 text-warn-foreground",
  },
  info: {
    label: "Information",
    icon: Info,
    chip: "bg-accent text-info",
    ring: "bg-accent text-info",
  },
} as const;

function AlertsScreen() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");
  const [allAlerts, setAllAlerts] = useState<Alert[]>(() => getStoredAlerts());
  const { weather } = useWeather();
  const bmdStatus = useMemo(() => getBmdFeedStatus(), []);

  useEffect(() => {
    const unsub = subscribeToAlerts((data) => setAllAlerts(data));
    return () => unsub();
  }, []);

  const weatherNotification = useMemo(() => {
    if (!weather) return null;
    return evaluateWeatherNotification(weather);
  }, [weather]);

  useEffect(() => {
    // When citizen opens Alerts, mark all notifications as viewed/read
    markAllWeatherNotificationsAsRead();
  }, [weatherNotification]);

  const weatherAlert: Alert | null = useMemo(() => {
    if (!weatherNotification) return null;
    return {
      id: weatherNotification.id,
      severity: weatherNotification.severity,
      title: weatherNotification.title,
      body: weatherNotification.body,
      location: weatherNotification.location,
      time: "Live Weather",
      createdAt: weatherNotification.timestamp,
      category:
        weatherNotification.category === "storm"
          ? "cyclone"
          : weatherNotification.category === "rainfall"
            ? "rainfall"
            : "general",
    };
  }, [weatherNotification]);

  const combinedAlerts = useMemo(
    () => (weatherAlert ? [weatherAlert, ...allAlerts] : allAlerts),
    [weatherAlert, allAlerts],
  );

  const list = combinedAlerts.filter((a) =>
    tab === "All" ? true : severityMeta[a.severity]?.label === tab,
  );

  return (
    <Screen>
      <TopBar
        title="Alerts"
        subtitle={weather?.locationName || "Dhaka, Bangladesh"}
        right={<NotificationButton hasUnread={false} />}
      />

      {/* Quick Emergency Actions (UX-4: secondary reachability) */}
      <div className="px-4 pt-3 pb-1">
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/shelters"
            className="press flex items-center justify-center gap-1.5 rounded-2xl border border-border/70 bg-card py-2.5 px-3 text-xs font-bold text-navy shadow-xs"
          >
            <Building2 className="h-4 w-4 text-info" />
            <span>Find Shelters</span>
          </Link>
          <Link
            to="/services"
            search={{ cat: "hospitals" }}
            className="press flex items-center justify-center gap-1.5 rounded-2xl border border-border/70 bg-card py-2.5 px-3 text-xs font-bold text-navy shadow-xs"
          >
            <PhoneCall className="h-4 w-4 text-primary" />
            <span>Emergency Helplines</span>
          </Link>
        </div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`press shrink-0 rounded-full px-4 py-2 text-[12.5px] font-bold transition-colors ${
              tab === t ? "bg-navy text-navy-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="stagger-children space-y-3 px-4">
        {/* Official BMD Advisory & Verification Notice */}
        <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <p className="text-[12.5px] font-bold text-navy">
                  Official Bangladesh Weather Warnings
                </p>
              </div>
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                Official cyclone and heavy rainfall bulletins are issued by the Bangladesh
                Meteorological Department (BMD). Automated machine-readable feeds require
                institutional authorization under the Meteorological Act (2018).
              </p>
            </div>
            <a
              href={bmdStatus.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex shrink-0 items-center gap-1 rounded-xl border border-border/80 bg-muted/70 px-2.5 py-1.5 text-[11px] font-bold text-navy hover:bg-muted"
            >
              <span>BMD Portal</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          </div>
        </div>

        {list.map((a) => {
          const meta = severityMeta[a.severity] || severityMeta.info;
          const isMeteo = a.id === "meteo-active-advisory" || a.id.startsWith("open-meteo:");
          const sourceMeta = getWarningSourceMeta(isMeteo ? "OPEN_METEO" : "ADMIN_DISPATCH");
          const Icon =
            a.category === "rainfall" || a.title.toLowerCase().includes("rainfall")
              ? CloudRain
              : a.category === "cyclone" || a.title.toLowerCase().includes("cyclone")
                ? Wind
                : meta.icon;
          return (
            <Card key={a.id} className={a.severity === "critical" ? "border-primary/25" : ""}>
              <div className="flex items-start gap-3">
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${meta.ring}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <p className="truncate text-[15px] font-bold text-navy">{a.title}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${meta.chip}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {a.body}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {a.location}
                      </span>
                      <span>· {formatAlertTime(a)}</span>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${sourceMeta.chipClass}`}
                    >
                      {sourceMeta.label}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {list.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[15px] font-bold text-navy">No alerts here</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              You're all clear for now. We'll notify you instantly.
            </p>
          </div>
        ) : null}
      </div>
    </Screen>
  );
}
