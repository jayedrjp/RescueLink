import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MapPin, Phone, Navigation, Clock, HandCoins } from "lucide-react";

import { Card, OccupancyBar, Pill, Screen, TopBar, shelterImages } from "@/components/rl";
import { shelters } from "@/lib/data";

export const Route = createFileRoute("/shelters/$shelterId")({
  loader: ({ params }) => {
    const shelter = shelters.find((s) => s.id === params.shelterId);
    if (!shelter) throw notFound();
    return { shelter };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Shelter not found — RescueLink" }, { name: "robots", content: "noindex" }],
      };
    }
    const { shelter } = loaderData;
    const description = `${shelter.name} in ${shelter.area} — ${shelter.occupied} of ${shelter.capacity} beds occupied, facilities: ${shelter.facilities.join(", ")}.`;
    return {
      meta: [
        { title: `${shelter.name} — RescueLink Shelter` },
        { name: "description", content: description },
        { property: "og:title", content: `${shelter.name} — RescueLink Shelter` },
        { property: "og:description", content: description },
      ],
    };
  },
  component: ShelterDetail,
});

function ShelterDetail() {
  const { shelter } = Route.useLoaderData();
  const pct = Math.round((shelter.occupied / shelter.capacity) * 100);

  return (
    <Screen>
      <TopBar title={shelter.name} subtitle={shelter.area} back="/shelters" />

      <div className="animate-fade-up px-4 pt-4">
        <img
          src={shelterImages[shelter.image]}
          alt={shelter.name}
          width={1024}
          height={640}
          className="h-52 w-full rounded-3xl object-cover shadow-[var(--shadow-card)]"
        />
      </div>

      <div className="space-y-4 px-4 pt-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] font-extrabold text-navy">{shelter.name}</h2>
            <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <MapPin className="h-4 w-4" /> {shelter.area} · {shelter.distanceKm} km
            </p>
          </div>
          <Pill tone={shelter.status}>{shelter.status}</Pill>
        </div>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-bold text-navy">Current capacity</p>
            <p className="text-[13px] font-bold text-navy">
              {shelter.occupied} / {shelter.capacity}
            </p>
          </div>
          <div className="mt-3">
            <OccupancyBar value={pct} tone={shelter.status} />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {pct}% occupied · {Math.max(0, shelter.capacity - shelter.occupied)} spaces available
          </p>
        </Card>

        <Card>
          <p className="text-[14px] font-bold text-navy">Available facilities</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {shelter.facilities.map((f: string) => (
              <span
                key={f}
                className="rounded-full bg-safe/10 px-3 py-1.5 text-[12px] font-semibold text-safe"
              >
                {f}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-[14px] font-bold text-navy">Current needs</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {shelter.needs.map((n: string) => (
              <span
                key={n}
                className="rounded-full bg-primary/8 px-3 py-1.5 text-[12px] font-semibold text-primary"
              >
                {n}
              </span>
            ))}
          </div>
          <Link
            to="/donate"
            className="press mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent text-[13.5px] font-bold text-info"
          >
            <HandCoins className="h-4 w-4" /> Donate to this shelter
          </Link>
        </Card>

        <Card className="space-y-3">
          <p className="text-[14px] font-bold text-navy">Emergency availability</p>
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0 text-safe" /> Open 24 hours during active warnings
          </div>
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Phone className="h-4 w-4 shrink-0 text-info" /> {shelter.phone}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <a
            href={`tel:${shelter.phone.replace(/\s/g, "")}`}
            className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-muted text-[14px] font-bold text-navy"
          >
            <Phone className="h-4 w-4" /> Contact
          </a>
          <Link
            to="/map"
            className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-navy text-[14px] font-bold text-navy-foreground"
          >
            <Navigation className="h-4 w-4" /> Directions
          </Link>
        </div>
      </div>
    </Screen>
  );
}
