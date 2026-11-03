import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Siren,
  HomeIcon,
  Hospital,
  Map as MapIcon,
  Ambulance,
  Shield,
  Flame,
  Pill as PillIcon,
  AlertTriangle,
  ChevronRight,
  HeartHandshake,
  HandCoins,
  ShieldCheck,
  BookOpen,
  LifeBuoy,
} from "lucide-react";

import {
  BrandRow,
  Card,
  NotificationButton,
  OccupancyBar,
  Pill,
  Screen,
  SectionHeader,
  shelterImages,
} from "@/components/rl";
import {
  getStoredAlerts,
  getStoredShelters,
  safeOccupancyPercent,
  type Alert,
  type Shelter,
} from "@/lib/data";
import { subscribeToAlerts, subscribeToShelters } from "@/lib/firebase/firestore";
import { calculateDistanceKm } from "@/lib/map/places";
import { mapSearchFor } from "@/lib/map-links";
import { useAuth } from "@/context/AuthContext";
import { useWeather } from "@/lib/weather/use-weather";
import { WeatherWidget } from "@/components/WeatherWidget";
import { getAuthSnapshot } from "@/lib/auth-store";
import {
  evaluateWeatherNotification,
  dispatchInAppWeatherNotification,
  hasUnreadWeatherNotifications,
} from "@/lib/weather/weather-notifications";
import { getCurrentDevicePosition } from "@/lib/location";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;

    // Controlled dev reset: ?reset_intro=1 clears onboarding state for testing
    try {
      if (window.location.search.includes("reset_intro=1")) {
        localStorage.removeItem("rescuelink_intro_completed");
      }
    } catch {
      // ignore
    }

    let completedIntro = false;
    try {
      completedIntro = localStorage.getItem("rescuelink_intro_completed") === "true";
    } catch {
      completedIntro = false;
    }

    // Never redirect authenticated users to onboarding
    const snapshot = getAuthSnapshot();
    if (snapshot.isAuthenticated) {
      return;
    }

    // First app launch: if onboarding is not completed, redirect immediately to /onboarding
    if (!completedIntro) {
      throw redirect({ to: "/onboarding", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "RescueLink — Emergency Help, Shelters & Disaster Alerts" },
      {
        name: "description",
        content:
          "RescueLink helps you send an SOS, find nearby shelters and emergency services, and get live flood, cyclone and storm alerts.",
      },
      { property: "og:title", content: "RescueLink — Emergency Help & Disaster Alerts" },
      {
        property: "og:description",
        content:
          "Send an SOS with your live location, find shelters and emergency services, and stay ahead of floods and cyclones.",
      },
    ],
  }),
  component: HomeScreen,
});

const quickActions = [
  { to: "/sos", icon: Siren, title: "Send SOS", desc: "Get emergency help", tone: "primary" },
  {
    to: "/shelters",
    icon: HomeIcon,
    title: "Find Shelter",
    desc: "Find nearby safe places",
    tone: "safe",
  },
  {
    to: "/services",
    icon: Hospital,
    title: "Emergency Services",
    desc: "Hospitals, ambulance, police & fire",
    tone: "info",
  },
  { to: "/map", icon: MapIcon, title: "Live Map", desc: "View disaster map", tone: "navy" },
] as const;

const serviceShortcuts = [
  { icon: Hospital, label: "Hospitals", cat: "hospitals" },
  { icon: Ambulance, label: "Ambulance", cat: "ambulances" },
  { icon: Shield, label: "Police", cat: "police" },
  { icon: Flame, label: "Fire", cat: "fire" },
  { icon: PillIcon, label: "Pharmacy", cat: "pharmacies" },
] as const;

const toneRing: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  safe: "bg-safe/12 text-safe",
  info: "bg-accent text-info",
  navy: "bg-navy/8 text-navy",
};

function HomeScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, user, profile, loading, isAdmin } = useAuth();

  const [liveShelters, setLiveShelters] = useState<Shelter[]>(() => getStoredShelters());
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>(() => getStoredAlerts());
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const {
    weather,
    loading: weatherLoading,
    error: weatherError,
    isRefreshing: weatherRefreshing,
    refetch: refetchWeather,
  } = useWeather({
    coords: userCoords,
    locationName: userCoords ? "Current Location" : "Dhaka, Bangladesh",
  });

  useEffect(() => {
    const unsubShelters = subscribeToShelters((data) => setLiveShelters(data));
    const unsubAlerts = subscribeToAlerts((data) => setLiveAlerts(data));
    getCurrentDevicePosition({ timeout: 5000, maximumAge: 60000 })
      .then((pos) => setUserCoords({ lat: pos.lat, lng: pos.lng }))
      .catch(() => {});
    return () => {
      unsubShelters();
      unsubAlerts();
    };
  }, []);

  useEffect(() => {
    if (weather) {
      const notif = evaluateWeatherNotification(weather);
      if (notif) {
        dispatchInAppWeatherNotification(notif);
      }
    }
  }, [weather]);

  const hasUnread = useMemo(() => {
    return liveAlerts.length > 0 || hasUnreadWeatherNotifications();
  }, [liveAlerts]);

  const topAlert = useMemo(() => {
    return (
      liveAlerts.find((a) => a.severity === "critical") ||
      liveAlerts.find((a) => a.severity === "warning") ||
      liveAlerts[0]
    );
  }, [liveAlerts]);

  const nearbyShelters = useMemo(() => {
    return liveShelters.map((s) => {
      let distanceKm = s.distanceKm;
      if (userCoords && s.coordinates) {
        distanceKm = calculateDistanceKm(userCoords, s.coordinates);
      }
      return { ...s, distanceKm };
    });
  }, [liveShelters, userCoords]);

  const dynamicUpdates = useMemo(() => {
    const list: Array<{
      id: string;
      tone: "critical" | "warning" | "safe" | "info";
      text: string;
      time: string;
    }> = [];

    if (topAlert) {
      list.push({
        id: `alert-${topAlert.id}`,
        tone:
          topAlert.severity === "critical"
            ? "critical"
            : topAlert.severity === "warning"
              ? "warning"
              : "info",
        text: `${topAlert.title}: ${topAlert.body}`,
        time: topAlert.time || "Active",
      });
    }

    if (weather) {
      const isSevere = weather.current.condition.isSevere;
      list.push({
        id: "weather-cond",
        tone: isSevere ? "warning" : "info",
        text: `Live Weather: ${weather.current.condition.label} (${weather.current.temperature}°C). Wind speed: ${weather.current.windSpeed} km/h.`,
        time: "Now",
      });

      const rain = weather.current.precipitation;
      list.push({
        id: "weather-precip",
        tone: rain > 5 ? "warning" : rain > 0 ? "info" : "safe",
        text:
          rain > 0
            ? `Rainfall recorded: ${rain} mm in the last hour.`
            : "Precipitation clear: no significant rainfall recorded.",
        time: "1 hr",
      });

      if (weather.daily[0]) {
        list.push({
          id: "weather-daily",
          tone: "info",
          text: `Today's temperature range: High ${weather.daily[0].maxTemp}°C / Low ${weather.daily[0].minTemp}°C.`,
          time: "Today",
        });
      }
    }

    const fallbackUpdates = [
      {
        id: "op-1",
        tone: "safe" as const,
        text: "Emergency response network operational · Weather monitoring active.",
        time: "Active",
      },
      {
        id: "op-2",
        tone: "info" as const,
        text: "Dial 999 for national emergency response services.",
        time: "Emergency",
      },
    ];

    return list.length > 0 ? list : fallbackUpdates;
  }, [topAlert, weather]);

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      let completedIntro = false;
      try {
        if (typeof window !== "undefined") {
          completedIntro = localStorage.getItem("rescuelink_intro_completed") === "true";
        }
      } catch {
        completedIntro = false;
      }

      if (!completedIntro) {
        navigate({ to: "/onboarding", replace: true });
      } else {
        navigate({ to: "/welcome", replace: true });
      }
    } else if (isAdmin || profile?.role === "admin") {
      navigate({ to: "/admin", replace: true });
    }
  }, [isAuthenticated, isAdmin, profile, loading, navigate]);

  if (loading || !isAuthenticated || isAdmin || profile?.role === "admin") {
    return null;
  }

  const displayName = profile?.displayName || user?.displayName || "Citizen";

  return (
    <Screen>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 pt-5">
        <BrandRow />
        <NotificationButton hasUnread={hasUnread} />
      </header>

      <div className="px-4 pt-4">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <span>📍 {weather?.locationName || "Dhaka, Bangladesh"}</span>
          {weather && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${
                weather.isFallbackLocation
                  ? "bg-muted text-muted-foreground"
                  : "bg-safe/12 text-safe"
              }`}
            >
              {weather.isFallbackLocation ? "Default Area" : "GPS"}
            </span>
          )}
        </p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-tight text-navy">
          Stay Safe, {displayName} 👋
        </h1>
      </div>

      <section className="px-4 pt-4">
        {topAlert ? (
          <div
            className={`animate-fade-up rounded-3xl p-4 ${
              topAlert.severity === "critical"
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-sos)]"
                : topAlert.severity === "warning"
                  ? "bg-warn text-warn-foreground"
                  : "bg-navy text-white"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/20">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold">{topAlert.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed opacity-90">{topAlert.body}</p>
              </div>
            </div>
            <Link
              to="/alerts"
              className="press mt-4 flex h-11 items-center justify-center rounded-2xl bg-white text-[13px] font-bold text-navy"
            >
              View All Alerts
            </Link>
          </div>
        ) : (
          <div className="animate-fade-up rounded-3xl bg-safe/12 p-4 text-safe border border-safe/20">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 shrink-0" />
              <div>
                <p className="text-[14px] font-bold text-navy">All Clear in Your Area</p>
                <p className="text-xs text-muted-foreground">
                  No active emergency warnings currently active for Dhaka.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Real-time Weather Observations & Forecast (Open-Meteo) */}
      <section className="px-4 pt-4">
        <WeatherWidget
          weather={weather}
          loading={weatherLoading}
          error={weatherError}
          isRefreshing={weatherRefreshing}
          onRefresh={refetchWeather}
        />
      </section>

      <section className="px-4 pt-7">
        <SectionHeader title="Quick Actions" />
        <div className="stagger-children grid grid-cols-2 gap-3">
          {quickActions.map(({ to, icon: Icon, title, desc, tone }) => (
            <Link
              key={to}
              to={to}
              className="press rounded-3xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)]"
            >
              <span className={`grid h-11 w-11 place-items-center rounded-2xl ${toneRing[tone]}`}>
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <p className="mt-3 text-[14px] font-bold text-navy">{title}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-4 pt-7">
        <SectionHeader title="Nearby Shelters" actionLabel="See all" to="/shelters" />
        <div className="stagger-children space-y-3">
          {nearbyShelters.slice(0, 3).map((s) => {
            const pct = safeOccupancyPercent(s.occupied, s.capacity);
            const imageSrc = shelterImages[s.image] || shelterImages["shelter-1"];
            return (
              <Card key={s.id} className="p-0">
                <img
                  src={imageSrc}
                  alt={s.name}
                  loading="lazy"
                  width={1024}
                  height={640}
                  className="h-32 w-full rounded-t-3xl object-cover"
                />
                <div className="p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold text-navy">{s.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.distanceKm !== undefined
                          ? `${s.distanceKm} km away`
                          : "Distance approximate"}{" "}
                        · {s.occupied} / {s.capacity} occupied
                      </p>
                    </div>
                    <Pill tone={s.status}>{s.status}</Pill>
                  </div>
                  <div className="mt-3">
                    <OccupancyBar value={pct} tone={s.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.facilities.map((f) => (
                      <span
                        key={f}
                        className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link
                      to="/shelters/$shelterId"
                      params={{ shelterId: s.id }}
                      className="press flex h-11 items-center justify-center rounded-2xl bg-muted text-[13px] font-bold text-navy"
                    >
                      View Details
                    </Link>
                    <Link
                      to="/map"
                      search={mapSearchFor({
                        id: s.id,
                        name: s.name,
                        kind: "shelter",
                        coordinates: s.coordinates,
                      })}
                      className="press flex h-11 items-center justify-center rounded-2xl bg-navy text-[13px] font-bold text-navy-foreground"
                    >
                      Get Directions
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="pt-7">
        <div className="px-4">
          <SectionHeader title="Emergency Services" actionLabel="See all" to="/services" />
        </div>
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
          {serviceShortcuts.map(({ icon: Icon, label, cat }) => (
            <Link
              key={label}
              to="/services"
              search={{ cat }}
              className="press flex w-[84px] shrink-0 flex-col items-center gap-2 rounded-3xl border border-border/70 bg-card px-2 py-3 shadow-[var(--shadow-soft)]"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-info">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold text-navy">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-4 pt-7">
        <SectionHeader title="Get Involved" />
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/volunteer"
            className="press rounded-3xl bg-safe/10 p-4 shadow-[var(--shadow-soft)]"
          >
            <HeartHandshake className="h-6 w-6 text-safe" />
            <p className="mt-3 text-[14px] font-bold text-navy">Volunteer</p>
            <p className="text-[11.5px] text-muted-foreground">Join relief tasks</p>
          </Link>
          <Link
            to="/donate"
            className="press rounded-3xl bg-accent p-4 shadow-[var(--shadow-soft)]"
          >
            <HandCoins className="h-6 w-6 text-info" />
            <p className="mt-3 text-[14px] font-bold text-navy">Donate</p>
            <p className="text-[11.5px] text-muted-foreground">Support shelters</p>
          </Link>
        </div>
      </section>

      <section className="px-4 pt-7">
        <SectionHeader title="Preparedness & Support" />
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/instructions"
            className="press rounded-3xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-warn/15 text-warn-foreground">
              <BookOpen className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[14px] font-bold text-navy">Safety Guides</p>
            <p className="text-[11.5px] text-muted-foreground">Emergency procedures</p>
          </Link>
          <Link
            to="/support"
            className="press rounded-3xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-navy/10 text-navy">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[14px] font-bold text-navy">Help & Support</p>
            <p className="text-[11.5px] text-muted-foreground">24/7 disaster contacts</p>
          </Link>
        </div>
      </section>

      <section className="px-4 pt-7">
        <SectionHeader title="Live Updates" actionLabel="All alerts" to="/alerts" />
        <Card className="divide-y divide-border/70 p-0">
          {dynamicUpdates.map((u) => (
            <Link
              key={u.id}
              to="/alerts"
              className="press flex items-center gap-3 px-4 py-3.5 first:rounded-t-3xl last:rounded-b-3xl"
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  u.tone === "critical"
                    ? "bg-primary"
                    : u.tone === "warning"
                      ? "bg-warn"
                      : u.tone === "safe"
                        ? "bg-safe"
                        : "bg-info"
                }`}
              />
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">{u.text}</p>
              <span className="shrink-0 text-[11px] text-muted-foreground">{u.time}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      </section>
    </Screen>
  );
}
