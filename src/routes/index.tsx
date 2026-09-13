import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";

import { BrandRow, Card, NotificationButton, OccupancyBar, Pill, Screen, SectionHeader, shelterImages } from "@/components/rl";
import { liveUpdates, shelters } from "@/lib/data";

export const Route = createFileRoute("/")({
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
  { to: "/shelters", icon: HomeIcon, title: "Find Shelter", desc: "Find nearby safe places", tone: "safe" },
  { to: "/services", icon: Hospital, title: "Emergency Services", desc: "Hospitals, ambulance, police & fire", tone: "info" },
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
  return (
    <Screen>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 pt-5">
        <BrandRow />
        <NotificationButton />
      </header>

      <div className="px-4 pt-4">
        <p className="text-xs font-semibold text-muted-foreground">📍 Dhaka, Bangladesh</p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-tight text-navy">
          Stay Safe, Jayed 👋
        </h1>
      </div>

      <section className="px-4 pt-4">
        <div className="animate-fade-up rounded-3xl bg-primary p-4 text-primary-foreground shadow-[var(--shadow-sos)]">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary-foreground/15">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold">⚠️ Flash Flood Warning</p>
              <p className="mt-1 text-[13px] leading-relaxed text-primary-foreground/85">
                Heavy rainfall is expected in your area. Stay alert and stay safe.
              </p>
            </div>
          </div>
          <Link
            to="/alerts"
            className="press mt-4 flex h-11 items-center justify-center rounded-2xl bg-primary-foreground text-[13px] font-bold text-primary"
          >
            View Details
          </Link>
        </div>
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
          {shelters.slice(0, 3).map((s) => (
            <Card key={s.id} className="p-0">
              <img
                src={shelterImages[s.image]}
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
                      {s.distanceKm} km away · {s.occupied} / {s.capacity} occupied
                    </p>
                  </div>
                  <Pill tone={s.status}>{s.status}</Pill>
                </div>
                <div className="mt-3">
                  <OccupancyBar value={(s.occupied / s.capacity) * 100} tone={s.status} />
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
                    className="press flex h-11 items-center justify-center rounded-2xl bg-navy text-[13px] font-bold text-navy-foreground"
                  >
                    Get Directions
                  </Link>
                </div>
              </div>
            </Card>
          ))}
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
          <Link to="/donate" className="press rounded-3xl bg-accent p-4 shadow-[var(--shadow-soft)]">
            <HandCoins className="h-6 w-6 text-info" />
            <p className="mt-3 text-[14px] font-bold text-navy">Donate</p>
            <p className="text-[11.5px] text-muted-foreground">Support shelters</p>
          </Link>
        </div>
      </section>

      <section className="px-4 pt-7">
        <SectionHeader title="Live Updates" actionLabel="All alerts" to="/alerts" />
        <Card className="divide-y divide-border/70 p-0">
          {liveUpdates.map((u) => (
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
