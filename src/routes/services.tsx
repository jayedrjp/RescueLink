import { createFileRoute, Link } from "@tanstack/react-router";
import { Ambulance, Flame, Hospital, MapPin, Navigation, Phone, Pill as PillIcon, Shield } from "lucide-react";

import { Card, Screen, TopBar } from "@/components/rl";
import { services } from "@/lib/data";

type Cat = "hospitals" | "ambulances" | "police" | "fire" | "pharmacies";

const cats: { id: Cat; label: string; icon: typeof Hospital }[] = [
  { id: "hospitals", label: "Hospitals", icon: Hospital },
  { id: "ambulances", label: "Ambulances", icon: Ambulance },
  { id: "police", label: "Police", icon: Shield },
  { id: "fire", label: "Fire Stations", icon: Flame },
  { id: "pharmacies", label: "Pharmacies", icon: PillIcon },
];

export const Route = createFileRoute("/services")({
  validateSearch: (search: Record<string, unknown>): { cat: Cat } => {
    const cat = search["cat"] as Cat;
    return { cat: cats.some((c) => c.id === cat) ? cat : "hospitals" };
  },
  head: () => ({
    meta: [
      { title: "Emergency Services Near You — RescueLink" },
      {
        name: "description",
        content:
          "Call or get directions to nearby hospitals, ambulances, police stations, fire services and pharmacies.",
      },
      { property: "og:title", content: "Emergency Services Near You — RescueLink" },
      {
        property: "og:description",
        content: "Nearby hospitals, ambulances, police, fire stations and pharmacies with one-tap calling.",
      },
    ],
  }),
  component: ServicesScreen,
});

function ServicesScreen() {
  const { cat } = Route.useSearch();
  const navigate = Route.useNavigate();
  const list = services.filter((s) => s.category === cat);

  return (
    <Screen>
      <TopBar title="Emergency Services" subtitle="Nearest first · Dhaka" />

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4">
        {cats.map(({ id, label, icon: Icon }) => {
          const on = id === cat;
          return (
            <button
              key={id}
              onClick={() => navigate({ search: { cat: id } })}
              className={`press inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-[12.5px] font-bold transition-colors ${
                on ? "bg-navy text-navy-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          );
        })}
      </div>

      <div className="stagger-children space-y-3 px-4">
        {list.map((s) => (
          <Card key={s.id}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-navy">{s.name}</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {s.area} · {s.distanceKm} km
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase ${
                  s.open ? "bg-safe/12 text-safe" : "bg-muted text-muted-foreground"
                }`}
              >
                {s.open ? "Open" : "Closed"}
              </span>
            </div>
            <p className="mt-2 text-[12.5px] font-semibold text-info">{s.status}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a
                href={`tel:${s.phone.replace(/\s/g, "")}`}
                className="press flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[13px] font-bold text-primary-foreground"
              >
                <Phone className="h-4 w-4" /> Call
              </a>
              <Link
                to="/map"
                className="press flex h-12 items-center justify-center gap-2 rounded-2xl bg-muted text-[13px] font-bold text-navy"
              >
                <Navigation className="h-4 w-4" /> Directions
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  );
}
