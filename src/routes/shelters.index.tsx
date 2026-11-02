import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  OccupancyBar,
  Pill,
  Screen,
  SectionHeader,
  TopBar,
  shelterImages,
} from "@/components/rl";
import { useAuth } from "@/context/AuthContext";
import { getStoredShelters, safeOccupancyPercent, type Shelter } from "@/lib/data";
import { subscribeToShelters } from "@/lib/firebase/firestore";
import { calculateDistanceKm } from "@/lib/map/places";
import { mapSearchFor } from "@/lib/map-links";
import { getCurrentDevicePosition } from "@/lib/location";

export interface SheltersSearchParams {
  saved?: boolean;
}

export const Route = createFileRoute("/shelters/")({
  validateSearch: (search: Record<string, unknown>): SheltersSearchParams => {
    const isSaved = search["saved"] === true || search["saved"] === "true";
    return isSaved ? { saved: true } : {};
  },
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
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const savedOnly = Boolean(search.saved);

  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [liveShelters, setLiveShelters] = useState<Shelter[]>(() => getStoredShelters());
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const { user } = useAuth();
  const savedKey = user ? `rl_saved_shelters_${user.uid}` : "rl_saved_shelters_guest";
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const arr = JSON.parse(localStorage.getItem(savedKey) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });

  // Re-sync savedIds whenever savedKey changes (e.g. login/logout)
  useEffect(() => {
    try {
      const arr = JSON.parse(localStorage.getItem(savedKey) || "[]");
      setSavedIds(Array.isArray(arr) ? arr : []);
    } catch {
      setSavedIds([]);
    }
  }, [savedKey]);

  const setSavedOnly = (active: boolean) => {
    navigate({
      search: (prev: SheltersSearchParams) => {
        const next: SheltersSearchParams = { ...prev };
        if (active) {
          next.saved = true;
        } else {
          delete next.saved;
        }
        return next;
      },
      replace: true,
    });
  };

  const toggleBookmark = (id: string, name: string) => {
    const isCurrentlySaved = savedIds.includes(id);
    const next = isCurrentlySaved ? savedIds.filter((item) => item !== id) : [...savedIds, id];
    setSavedIds(next);
    try {
      localStorage.setItem(savedKey, JSON.stringify(next));
      if (isCurrentlySaved) {
        toast.info(`Removed ${name} from saved shelters`);
      } else {
        toast.success(`Saved ${name} to your profile`);
      }
    } catch {
      toast.error("Could not update saved shelter.");
    }
  };

  useEffect(() => {
    const unsub = subscribeToShelters((data) => setLiveShelters(data));
    getCurrentDevicePosition({ timeout: 5000, maximumAge: 60000 })
      .then((pos) => setUserCoords({ lat: pos.lat, lng: pos.lng }))
      .catch(() => {});
    return () => unsub();
  }, []);

  const sheltersWithDistance = useMemo(() => {
    return liveShelters.map((s) => {
      let distanceKm = s.distanceKm;
      if (userCoords && s.coordinates) {
        distanceKm = calculateDistanceKm(userCoords, s.coordinates);
      }
      return { ...s, distanceKm };
    });
  }, [liveShelters, userCoords]);

  const filtered = useMemo(() => {
    return sheltersWithDistance
      .filter((s) => (openOnly ? s.status === "open" : true))
      .filter((s) => (savedOnly ? savedIds.includes(s.id) : true))
      .filter((s) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q);
      });
  }, [sheltersWithDistance, openOnly, savedOnly, savedIds, query]);

  return (
    <Screen>
      <TopBar
        title={savedOnly ? "Saved Shelters" : "Find Shelter"}
        subtitle={
          savedOnly
            ? `${filtered.length} saved shelter${filtered.length === 1 ? "" : "s"}`
            : `${filtered.length} shelter${filtered.length === 1 ? "" : "s"} near Dhaka`
        }
      />

      <div className="flex items-center gap-2 px-4 pt-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={savedOnly ? "Search saved shelters" : "Search shelters"}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
          />
        </div>
        <button
          type="button"
          aria-label="Filter by open shelters"
          aria-pressed={openOnly}
          onClick={() => setOpenOnly((v) => !v)}
          className={`press grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors ${
            openOnly ? "bg-safe text-safe-foreground" : "bg-navy text-navy-foreground"
          }`}
          title={openOnly ? "Showing open shelters only" : "Filter open shelters"}
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Filter by saved shelters"
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly(!savedOnly)}
          className={`press grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors ${
            savedOnly
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-navy text-navy-foreground"
          }`}
          title={savedOnly ? "Showing saved shelters only" : "Filter saved shelters"}
        >
          <Bookmark className={`h-5 w-5 ${savedOnly ? "fill-primary-foreground" : ""}`} />
        </button>
      </div>

      {/* Quick filter chips */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <button
          type="button"
          aria-pressed={!savedOnly}
          onClick={() => setSavedOnly(false)}
          className={`press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            !savedOnly
              ? "bg-navy text-navy-foreground shadow-xs"
              : "bg-card border border-border/80 text-muted-foreground hover:text-navy"
          }`}
        >
          All Shelters
        </button>
        <button
          type="button"
          aria-label="Filter saved shelters only"
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly(!savedOnly)}
          className={`press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            savedOnly
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-card border border-border/80 text-muted-foreground hover:text-navy"
          }`}
        >
          <Bookmark className={`h-3 w-3 ${savedOnly ? "fill-primary-foreground" : ""}`} />
          <span>Saved</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-bold ${
              savedOnly ? "bg-white/20 text-white" : "bg-muted text-foreground"
            }`}
          >
            {savedIds.length}
          </span>
        </button>
        {openOnly && (
          <button
            type="button"
            onClick={() => setOpenOnly(false)}
            aria-label="Clear open only filter"
            className="press inline-flex items-center gap-1 rounded-full bg-safe/15 border border-safe/30 px-2.5 py-1 text-xs font-semibold text-safe"
          >
            <span>Open only</span>
            <span className="text-[11px] font-bold">×</span>
          </button>
        )}
      </div>

      <div className="px-4 pt-6">
        <SectionHeader
          title={
            savedOnly
              ? openOnly
                ? "Saved open shelters · by distance"
                : "Saved shelters · by distance"
              : openOnly
                ? "Open shelters · by distance"
                : "Sorted by distance"
          }
        />
        <div className="stagger-children space-y-3">
          {filtered.map((s) => {
            const pct = safeOccupancyPercent(s.occupied, s.capacity);
            const imageSrc = shelterImages[s.image] || shelterImages["shelter-1"];
            return (
              <Card key={s.id} className="p-0">
                <div className="relative">
                  <img
                    src={imageSrc}
                    alt={s.name}
                    loading="lazy"
                    width={1024}
                    height={640}
                    className="h-36 w-full rounded-t-3xl object-cover"
                  />
                  <div className="absolute right-3 top-3 flex items-center gap-1.5">
                    <Pill tone={s.status} className="bg-surface/95">
                      {s.status}
                    </Pill>
                    <button
                      type="button"
                      aria-label={
                        savedIds.includes(s.id) ? `Remove ${s.name} from saved` : `Save ${s.name}`
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleBookmark(s.id, s.name);
                      }}
                      className={`press grid h-7 w-7 place-items-center rounded-xl backdrop-blur-xs transition-colors ${
                        savedIds.includes(s.id)
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "bg-surface/90 text-navy hover:bg-surface"
                      }`}
                    >
                      <Bookmark
                        className={`h-3.5 w-3.5 ${savedIds.includes(s.id) ? "fill-primary-foreground" : ""}`}
                      />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[15.5px] font-bold text-navy">{s.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.area} ·{" "}
                    {s.distanceKm !== undefined
                      ? `${s.distanceKm} km away`
                      : "Distance approximate"}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11.5px] font-semibold text-muted-foreground">
                    <span>
                      {s.occupied} / {s.capacity} occupied
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1.5">
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
          {filtered.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Bookmark className="h-6 w-6" />
              </div>
              <p className="text-[15px] font-bold text-navy">
                {savedOnly && savedIds.length === 0 ? "No saved shelters yet" : "No shelters found"}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground max-w-xs mx-auto">
                {savedOnly && savedIds.length === 0
                  ? "Bookmark shelters with the bookmark icon to quickly access them here."
                  : savedOnly
                    ? "No saved shelters match your current search or open-only filter."
                    : "Try a different search term or clear the open-only filter."}
              </p>
              {(savedOnly || openOnly || query) && (
                <button
                  type="button"
                  onClick={() => {
                    if (savedOnly) setSavedOnly(false);
                    if (openOnly) setOpenOnly(false);
                    if (query) setQuery("");
                  }}
                  className="press mt-4 inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 text-xs font-semibold text-navy-foreground"
                >
                  {savedOnly && savedIds.length === 0 ? "View all shelters" : "Clear filters"}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Screen>
  );
}
