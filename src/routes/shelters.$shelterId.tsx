import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  MapPin,
  Phone,
  Navigation,
  Clock,
  HandCoins,
  Bookmark,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Card, OccupancyBar, Pill, Screen, TopBar, shelterImages } from "@/components/rl";
import { safeOccupancyPercent } from "@/lib/data";
import { getShelterByIdFromFirestore } from "@/lib/firebase/firestore";
import { toDialablePhone } from "@/lib/phone";
import { mapSearchFor } from "@/lib/map-links";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/shelters/$shelterId")({
  /**
   * Async loader — queries Firestore first, falls back to localStorage/static
   * seed data, and raises notFound() only when the shelter genuinely cannot be
   * resolved from any source.
   *
   * A transient Firestore error (network, permission, …) is surfaced via the
   * route's errorComponent rather than incorrectly being treated as a 404.
   */
  loader: async ({ params }) => {
    const result = await getShelterByIdFromFirestore(params.shelterId);

    if (result.status === "missing") {
      throw notFound();
    }

    if (result.status === "error") {
      // Propagate the real error so the errorComponent (retry UI) is shown
      // instead of a misleading "shelter not found" page.
      throw result.error;
    }

    // result.status is "remote" | "local" — both carry a shelter object.
    return { shelter: result.shelter, source: result.status };
  },

  pendingComponent: ShelterDetailPending,

  errorComponent: ShelterDetailError,

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

/** Skeleton shown while the async loader is resolving. */
function ShelterDetailPending() {
  return (
    <Screen>
      <TopBar title="Loading shelter…" back="/shelters" />
      <div className="animate-pulse space-y-4 px-4 pt-4">
        <div className="h-52 w-full rounded-3xl bg-muted" />
        <div className="h-6 w-2/3 rounded-xl bg-muted" />
        <div className="h-4 w-1/2 rounded-xl bg-muted" />
        <div className="h-20 w-full rounded-3xl bg-muted" />
        <div className="h-24 w-full rounded-3xl bg-muted" />
      </div>
    </Screen>
  );
}

/** Error boundary shown when the loader throws a non-notFound error. */
function ShelterDetailError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <Screen>
      <TopBar title="Could not load shelter" back="/shelters" />
      <div className="flex flex-col items-center gap-4 px-6 pt-16 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10">
          <AlertTriangle className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-[17px] font-bold text-navy">Shelter unavailable</h2>
        <p className="text-[13px] text-muted-foreground">
          We couldn't retrieve this shelter's information right now. This may be a temporary network
          issue. Please try again.
        </p>
        {process.env["NODE_ENV"] === "development" && (
          <p className="rounded-xl bg-muted px-3 py-2 text-left font-mono text-[11px] text-muted-foreground">
            {error.message}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="press mt-2 flex h-12 items-center justify-center gap-2 rounded-2xl bg-navy px-6 text-[14px] font-bold text-navy-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
        <Link to="/shelters" className="text-[13px] font-semibold text-info">
          Back to shelter list
        </Link>
      </div>
    </Screen>
  );
}

function ShelterDetail() {
  const { shelter, source } = Route.useLoaderData();
  const isLocalFallback = source === "local";
  const { user } = useAuth();
  const pct = safeOccupancyPercent(shelter.occupied, shelter.capacity);
  const imageSrc = shelterImages[shelter.image] || shelterImages["shelter-1"];
  const dialable = toDialablePhone(shelter.phone);

  const savedKey = user ? `rl_saved_shelters_${user.uid}` : "rl_saved_shelters_guest";
  const [isSaved, setIsSaved] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const arr = JSON.parse(localStorage.getItem(savedKey) || "[]");
      return Array.isArray(arr) && arr.includes(shelter.id);
    } catch {
      return false;
    }
  });

  const toggleBookmark = () => {
    try {
      const arr = JSON.parse(localStorage.getItem(savedKey) || "[]");
      const list = Array.isArray(arr) ? arr : [];
      let next: string[];
      if (list.includes(shelter.id)) {
        next = list.filter((id: string) => id !== shelter.id);
        setIsSaved(false);
        toast.success("Removed from saved shelters");
      } else {
        next = [...list, shelter.id];
        setIsSaved(true);
        toast.success("Shelter saved to your profile");
      }
      localStorage.setItem(savedKey, JSON.stringify(next));
    } catch {
      toast.error("Could not update bookmark.");
    }
  };

  return (
    <Screen>
      <TopBar title={shelter.name} subtitle={shelter.area} back="/shelters" />

      {isLocalFallback && (
        <div
          role="status"
          aria-label="Local fallback data"
          className="mx-4 mt-3 flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Local Fallback Data
          </span>
          <span className="text-[12px] text-amber-600">— Live details may differ</span>
        </div>
      )}

      <div className="animate-fade-up px-4 pt-4">
        <img
          src={imageSrc}
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
              <MapPin className="h-4 w-4" /> {shelter.area}
              {shelter.distanceKm !== undefined ? ` · ${shelter.distanceKm} km` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={shelter.status}>{shelter.status}</Pill>
            <button
              type="button"
              aria-label={isSaved ? "Remove bookmark" : "Save shelter"}
              onClick={toggleBookmark}
              className={`press grid h-9 w-9 place-items-center rounded-2xl border transition-colors ${
                isSaved
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-navy"
              }`}
            >
              <Bookmark className={`h-4.5 w-4.5 ${isSaved ? "fill-primary" : ""}`} />
            </button>
          </div>
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
            href={`tel:${dialable}`}
            className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-muted text-[14px] font-bold text-navy"
          >
            <Phone className="h-4 w-4" /> Contact
          </a>
          <Link
            to="/map"
            search={mapSearchFor({
              id: shelter.id,
              name: shelter.name,
              kind: "shelter",
              coordinates: shelter.coordinates,
            })}
            className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-navy text-[14px] font-bold text-navy-foreground"
          >
            <Navigation className="h-4 w-4" /> Directions
          </Link>
        </div>
      </div>
    </Screen>
  );
}
