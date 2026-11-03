import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Users,
  ShieldAlert,
  ArrowLeft,
  Search,
  X,
  Phone,
  MapPin,
  Calendar,
  RefreshCw,
  User,
  Siren,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Screen, Card } from "@/components/rl";
import { useAuth } from "@/context/AuthContext";
import { BackButton } from "@/components/BackButton";
import { requireSignedIn } from "@/lib/route-guards";
import {
  getAllUsers,
  subscribeToAllSosRequests,
  isApprovedVolunteer,
} from "@/lib/firebase/firestore";
import type { UserProfile, SosRequest } from "@/lib/firebase/types";
import { toDialablePhone } from "@/lib/phone";

export const Route = createFileRoute("/admin_/citizens")({
  head: () => ({
    meta: [
      { title: "Citizens Directory — RescueLink Admin" },
      {
        name: "description",
        content:
          "Registered citizen directory, verified emergency contacts, and disaster profiles.",
      },
    ],
  }),
  beforeLoad: requireSignedIn,
  component: AdminCitizensScreen,
});

function AdminCitizensScreen() {
  const { isAdmin, loading: authLoading, profile } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sosRequests, setSosRequests] = useState<SosRequest[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "citizens" | "volunteers">("all");

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const all = await getAllUsers();
      setUsers(all);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading users directory";
      console.error("Error loading citizens from Firestore:", err);
      setUsersError(msg);
      toast.error("Could not load users directory", { description: msg });
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin, fetchUsers]);

  // Subscribe to live SOS requests to calculate each citizen's SOS activity count
  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = subscribeToAllSosRequests((requests) => {
      setSosRequests(requests);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  const registeredCitizens = useMemo(() => users.filter((u) => u.role !== "admin"), [users]);

  const filteredCitizens = useMemo(() => {
    return registeredCitizens.filter((u) => {
      if (roleFilter === "citizens" && u.role !== "user") return false;
      if (roleFilter === "volunteers" && !isApprovedVolunteer(u)) {
        return false;
      }

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      const nameMatch = u.displayName?.toLowerCase().includes(q) || false;
      const emailMatch = u.email?.toLowerCase().includes(q) || false;
      const phoneMatch = u.phone?.toLowerCase().includes(q) || false;
      const areaMatch = u.area?.toLowerCase().includes(q) || false;

      return nameMatch || emailMatch || phoneMatch || areaMatch;
    });
  }, [registeredCitizens, roleFilter, searchQuery]);

  if (authLoading) {
    return (
      <Screen>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-navy border-t-transparent" />
        </div>
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen>
        <header className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 bg-surface/90 px-4 py-3 backdrop-blur-xl">
          <BackButton fallback={{ to: "/admin", search: { tab: "more" } }} label="Back" />
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-bold text-navy">Access Denied</h1>
          </div>
        </header>
        <div className="px-5 pt-12 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h1 className="mt-6 text-[22px] font-extrabold text-navy">Access Denied</h1>
          <p className="mx-auto mt-2 max-w-[320px] text-xs leading-relaxed text-muted-foreground">
            You are signed in as{" "}
            <span className="font-semibold text-foreground">{profile?.email || "Citizen"}</span>.
            The Citizens Directory is restricted to authorized RescueLink administrators.
          </p>
          <div className="mt-8">
            <Link
              to="/"
              className="press flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-navy text-sm font-bold text-white shadow-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Citizen Home</span>
            </Link>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen className="pb-32">
      {/* Top Header with Back to More Options */}
      <header className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 bg-surface/90 px-4 py-3 backdrop-blur-xl">
        <BackButton
          fallback={{ to: "/admin", search: { tab: "more" } }}
          label="Back to More Options"
        />
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-bold text-navy">Citizens Directory</h1>
          <p className="truncate text-xs text-muted-foreground">Registered Citizen Profiles</p>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              fetchUsers();
              toast.success("User directory updated");
            }}
            disabled={loadingUsers}
            aria-label="Refresh Directory"
            className="press grid h-10 w-10 place-items-center rounded-full bg-muted text-navy disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* Search & Filter Bar */}
        <div className="space-y-2.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, phone, or area..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-border/70 bg-card py-2.5 pl-10 pr-4 text-xs font-medium text-navy placeholder:text-muted-foreground outline-none focus:border-navy/50 shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setRoleFilter("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                roleFilter === "all"
                  ? "bg-navy text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              All Citizens ({registeredCitizens.length})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter("citizens")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                roleFilter === "citizens"
                  ? "bg-navy text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              Standard Citizens ({registeredCitizens.filter((u) => u.role === "user").length})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter("volunteers")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                roleFilter === "volunteers"
                  ? "bg-safe text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              Relief Volunteers ({registeredCitizens.filter(isApprovedVolunteer).length})
            </button>
          </div>
        </div>

        {/* Directory List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold">Registered Accounts ({filteredCitizens.length})</span>
            <span>Cloud Firestore Verified</span>
          </div>

          {loadingUsers ? (
            <div className="py-12 text-center space-y-2">
              <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-navy border-t-transparent" />
              <p className="text-xs text-muted-foreground">Loading citizen records...</p>
            </div>
          ) : usersError ? (
            <Card className="p-8 text-center space-y-3 border-destructive/30 bg-destructive/5">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/15 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-bold text-navy">Error Loading Directory</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">{usersError}</p>
              </div>
              <button
                type="button"
                onClick={fetchUsers}
                className="press inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 text-xs font-bold text-white shadow-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry Fetch</span>
              </button>
            </Card>
          ) : filteredCitizens.length === 0 ? (
            <Card className="p-8 text-center space-y-2">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Users className="h-6 w-6" />
              </span>
              <p className="text-sm font-bold text-navy">No Citizens Found</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                No user accounts match your current search criteria.
              </p>
            </Card>
          ) : (
            filteredCitizens.map((user) => {
              const citizenSos = sosRequests.filter((s) => s.userId === user.uid);
              const isVolunteer = isApprovedVolunteer(user);
              return (
                <Card key={user.uid} className="p-4 space-y-2.5 shadow-[var(--shadow-card)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-navy/10 text-navy font-extrabold text-sm">
                        {user.displayName?.charAt(0).toUpperCase() || <User className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-navy truncate">{user.displayName}</p>
                          <span
                            className={`rounded-full px-2 py-0.2 text-[9.5px] font-extrabold uppercase ${
                              isVolunteer
                                ? "bg-safe/15 text-safe"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isVolunteer ? "Volunteer" : "Citizen"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>

                        {user.phone ? (
                          <a
                            href={`tel:${toDialablePhone(user.phone)}`}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            <span>{user.phone}</span>
                          </a>
                        ) : null}

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-navy/70">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span>{user.area || "Dhaka, Bangladesh"}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {citizenSos.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10.5px] font-extrabold text-primary">
                          <Siren className="h-3 w-3" />
                          <span>{citizenSos.length} SOS</span>
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          0 SOS
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </Screen>
  );
}
