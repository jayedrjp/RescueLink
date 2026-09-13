import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Crosshair, Navigation, Layers, Phone } from "lucide-react";
import { toast } from "sonner";

import { Logo, Pill } from "@/components/rl";
import { services, shelters } from "@/lib/data";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Live Disaster Map — RescueLink" },
      {
        name: "description",
        content:
          "See shelters, hospitals, ambulances, safe routes and flood zones near you on the RescueLink live disaster map.",
      },
      { property: "og:title", content: "Live Disaster Map — RescueLink" },
      {
        property: "og:description",
        content: "Shelters, emergency services, safe routes and disaster zones around your location.",
      },
    ],
  }),
  component: MapScreen,
});

const filters = ["Shelters", "Hospitals", "Emergency", "Safe Routes"] as const;

type Marker = {
  id: string;
  label: string;
  emoji: string;
  top: string;
  left: string;
  tone: string;
  group: (typeof filters)[number];
  shelterId?: string;
  serviceId?: string;
};

const markers: Marker[] = [
  { id: "m1", label: "Mirpur Shelter", emoji: "🏠", top: "24%", left: "22%", tone: "bg-safe", group: "Shelters", shelterId: "mirpur" },
  { id: "m2", label: "Dhanmondi Hall", emoji: "🏠", top: "58%", left: "16%", tone: "bg-safe", group: "Shelters", shelterId: "dhanmondi" },
  { id: "m3", label: "Dhaka Medical", emoji: "🏥", top: "34%", left: "62%", tone: "bg-info", group: "Hospitals", serviceId: "s1" },
  { id: "m4", label: "Ambulance 04", emoji: "🚑", top: "48%", left: "44%", tone: "bg-info", group: "Emergency", serviceId: "s3" },
  { id: "m5", label: "Police Station", emoji: "🚓", top: "70%", left: "58%", tone: "bg-navy", group: "Emergency", serviceId: "s5" },
  { id: "m6", label: "Fire Station", emoji: "🚒", top: "18%", left: "70%", tone: "bg-primary", group: "Emergency", serviceId: "s6" },
  { id: "m7", label: "Lazz Pharma", emoji: "💊", top: "64%", left: "76%", tone: "bg-safe", group: "Emergency", serviceId: "s7" },
  { id: "m8", label: "Safe route", emoji: "🛣️", top: "42%", left: "80%", tone: "bg-safe", group: "Safe Routes" },
];

function MapScreen() {
  const [active, setActive] = useState<string[]>(["Shelters", "Hospitals", "Emergency", "Safe Routes"]);
  const [query, setQuery] = useState("");
  const [showZones, setShowZones] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("m1");
  const toggle = (f: string) =>
    setActive((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const visibleMarkers = markers.filter(
    (m) => active.includes(m.group) && m.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selected =
    visibleMarkers.find((m) => m.id === selectedId) ?? visibleMarkers[0] ?? markers[0]!;
  const selectedShelter = selected.shelterId
    ? shelters.find((s) => s.id === selected.shelterId)
    : undefined;
  const selectedService = selected.serviceId
    ? services.find((s) => s.id === selected.serviceId)
    : undefined;

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn't available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => toast.success("Location updated", { description: "Showing places near you." }),
      () => toast.error("Couldn't access your location", { description: "Check location permissions and try again." }),
    );
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-accent">
      <div className="relative h-screen overflow-hidden">
        {/* map canvas */}
        <div className="absolute inset-0 bg-accent">
          <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(oklch(0.88_0.03_248)_1px,transparent_1px),linear-gradient(90deg,oklch(0.88_0.03_248)_1px,transparent_1px)] [background-size:34px_34px]" />
          {/* disaster zone */}
          {showZones ? (
            <>
              <div className="absolute left-[8%] top-[68%] h-40 w-56 rounded-[48%] bg-primary/15 ring-2 ring-primary/30" />
              <span className="absolute left-[16%] top-[80%] rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase text-primary-foreground shadow-[var(--shadow-soft)]">
                ⚠️ Flood zone
              </span>
            </>
          ) : null}
          {/* safe route */}
          {active.includes("Safe Routes") ? (
            <svg className="absolute inset-0 h-full w-full" aria-hidden>
              <path
                d="M60 520 C 140 420, 120 300, 230 250 S 330 150, 360 90"
                fill="none"
                stroke="oklch(0.606 0.157 148.5)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="14 12"
                opacity="0.75"
              />
            </svg>
          ) : null}

          {visibleMarkers.map((m, i) => (
            <button
              key={m.id}
              aria-label={m.label}
              onClick={() => setSelectedId(m.id)}
              className="absolute animate-marker-in press"
              style={{ top: m.top, left: m.left, animationDelay: `${i * 60}ms` }}
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-full border-[3px] text-[15px] shadow-[var(--shadow-card)] ${m.tone} ${
                  m.id === selected.id ? "border-navy" : "border-surface"
                }`}
              >
                {m.emoji}
              </span>
            </button>
          ))}

          {/* user location */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="absolute -inset-7 rounded-full bg-info/25 animate-ripple" />
            <span className="relative block h-6 w-6 rounded-full border-4 border-surface bg-info shadow-[var(--shadow-card)]" />
          </div>
        </div>

        {/* top overlay */}
        <div className="absolute inset-x-0 top-0 px-4 pt-4">
          <div className="flex items-center gap-2 rounded-3xl bg-surface/95 px-3 py-2.5 shadow-[var(--shadow-card)] backdrop-blur-xl">
            <Logo className="h-8 w-8" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search this area"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Link
              to="/alerts"
              className="press shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase text-primary"
            >
              Live
            </Link>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {filters.map((f) => {
              const on = active.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => toggle(f)}
                  className={`press shrink-0 rounded-full px-4 py-2 text-[12.5px] font-bold shadow-[var(--shadow-soft)] transition-colors ${
                    on ? "bg-navy text-navy-foreground" : "bg-surface text-muted-foreground"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {/* side controls */}
        <div className="absolute right-4 top-[42%] space-y-2">
          <button
            aria-label="Use my location"
            onClick={useMyLocation}
            className="press grid h-12 w-12 place-items-center rounded-2xl bg-surface shadow-[var(--shadow-card)]"
          >
            <Crosshair className="h-5 w-5 text-info" />
          </button>
          <button
            aria-label="Toggle disaster zones"
            aria-pressed={showZones}
            onClick={() => setShowZones((v) => !v)}
            className={`press grid h-12 w-12 place-items-center rounded-2xl shadow-[var(--shadow-card)] ${
              showZones ? "bg-primary/10" : "bg-surface"
            }`}
          >
            <Layers className={`h-5 w-5 ${showZones ? "text-primary" : "text-navy"}`} />
          </button>
        </div>

        {/* bottom sheet */}
        <div className="absolute inset-x-0 bottom-[112px] px-4">
          <div key={selected.id} className="animate-fade-up rounded-3xl bg-surface p-4 shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-navy">
                  {selectedShelter?.name ?? selectedService?.name ?? selected.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedShelter
                    ? `${selectedShelter.distanceKm} km away · ${selectedShelter.occupied} / ${selectedShelter.capacity} occupied`
                    : selectedService
                      ? `${selectedService.area} · ${selectedService.distanceKm} km · ${selectedService.status}`
                      : "Recommended evacuation route"}
                </p>
              </div>
              {selectedShelter ? (
                <Pill tone={selectedShelter.status}>{selectedShelter.status}</Pill>
              ) : selectedService ? (
                <Pill tone={selectedService.open ? "open" : "full"}>
                  {selectedService.open ? "Open" : "Closed"}
                </Pill>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {selectedShelter ? (
                <Link
                  to="/shelters/$shelterId"
                  params={{ shelterId: selectedShelter.id }}
                  className="press flex h-11 items-center justify-center rounded-2xl bg-muted text-[13px] font-bold text-navy"
                >
                  View Details
                </Link>
              ) : selectedService ? (
                <a
                  href={`tel:${selectedService.phone.replace(/\s/g, "")}`}
                  className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-muted text-[13px] font-bold text-navy"
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
              ) : (
                <span className="press flex h-11 items-center justify-center rounded-2xl bg-muted text-[13px] font-bold text-navy">
                  Follow route
                </span>
              )}
              <button
                onClick={() =>
                  toast.message("Calculating route…", {
                    description: `Directions to ${selectedShelter?.name ?? selectedService?.name ?? selected.label}.`,
                  })
                }
                className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-navy text-[13px] font-bold text-navy-foreground"
              >
                <Navigation className="h-4 w-4" /> View route
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
