import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import { Card, OccupancyBar, Pill, Screen, SectionHeader, TopBar, shelterImages } from "@/components/rl";
import { shelters } from "@/lib/data";

export const Route = createFileRoute("/shelters/")({
  head: () => ({
    meta: [
      { title: "Nearby Shelters & Safe Places — RescueLink" },
      {
        name: "description",
        content:
          "Browse nearby emergency shelters with live occupancy, availability, facilities and directions.",
      },
      { property: "og:title", content: "Nearby Shelters & Safe Places — RescueLink" },
      {
        property: "og:description",
        content: "Live occupancy, facilities and directions for shelters around you.",
      },
    ],
  }),
  component: SheltersScreen,
});

function SheltersScreen() {
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const filtered = shelters
    .filter((s) => (openOnly ? s.status === "open" : true))
    .filter((s) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q);
    });

  return (
    <Screen>
      <TopBar
        title="Find Shelter"
        subtitle={`${filtered.length} shelter${filtered.length === 1 ? "" : "s"} near Dhaka`}
      />

      <div className="flex items-center gap-2 px-4 pt-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shelters"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
          />
        </div>
        <button
          aria-label="Filter by open shelters"
          aria-pressed={openOnly}
          onClick={() => setOpenOnly((v) => !v)}
          className={`press grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors ${
            openOnly ? "bg-safe text-safe-foreground" : "bg-navy text-navy-foreground"
          }`}
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 pt-6">
        <SectionHeader title={openOnly ? "Open shelters · by distance" : "Sorted by distance"} />
        <div className="stagger-children space-y-3">
          {filtered.map((s) => (
            <Card key={s.id} className="p-0">
              <div className="relative">
                <img
                  src={shelterImages[s.image]}
                  alt={s.name}
                  loading="lazy"
                  width={1024}
                  height={640}
                  className="h-36 w-full rounded-t-3xl object-cover"
                />
                <div className="absolute right-3 top-3">
                  <Pill tone={s.status} className="bg-surface/95">
                    {s.status}
                  </Pill>
                </div>
              </div>
              <div className="p-4">
                <p className="text-[15.5px] font-bold text-navy">{s.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.area} · {s.distanceKm} km away
                </p>
                <div className="mt-3 flex items-center justify-between text-[11.5px] font-semibold text-muted-foreground">
                  <span>
                    {s.occupied} / {s.capacity} occupied
                  </span>
                  <span>{Math.round((s.occupied / s.capacity) * 100)}%</span>
                </div>
                <div className="mt-1.5">
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
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[15px] font-bold text-navy">No shelters found</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Try a different search term or clear the open-only filter.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Screen>
  );
}
