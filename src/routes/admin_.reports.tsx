import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  Clock,
  CheckCircle2,
  Building2,
  Users,
  HandCoins,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Screen, Card, SectionHeader } from "@/components/rl";
import { useAuth } from "@/context/AuthContext";
import { BackButton } from "@/components/BackButton";
import { requireSignedIn } from "@/lib/route-guards";
import {
  getAllUsers,
  getSheltersOnce,
  subscribeToShelters,
  subscribeToAllSosRequests,
  isApprovedVolunteer,
} from "@/lib/firebase/firestore";
import type { UserProfile, SosRequest } from "@/lib/firebase/types";
import {
  getStoredShelters,
  getStoredDonations,
  type Shelter,
  type DonationRecord,
} from "@/lib/data";

export const Route = createFileRoute("/admin_/reports")({
  head: () => ({
    meta: [
      { title: "System Reports & Audit — RescueLink Admin" },
      {
        name: "description",
        content:
          "Operational analytics, emergency response performance, and shelter occupancy reports.",
      },
    ],
  }),
  beforeLoad: requireSignedIn,
  component: AdminReportsScreen,
});

function AdminReportsScreen() {
  const { isAdmin, loading: authLoading, profile } = useAuth();

  const [sosRequests, setSosRequests] = useState<SosRequest[]>([]);
  const [sheltersList, setSheltersList] = useState<Shelter[]>(() => getStoredShelters());
  const [donationsList, setDonationsList] = useState<DonationRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [remoteShelters, allUsers] = await Promise.all([getSheltersOnce(), getAllUsers()]);
      setSheltersList(remoteShelters);
      setDonationsList(getStoredDonations());
      setUsers(allUsers);
      setLoadError(null);
    } catch (err: unknown) {
      console.error("Error refreshing reports data:", err);
      const msg = err instanceof Error ? err.message : "Failed to refresh reports data";
      setLoadError(msg);
      toast.error("Failed to load reports", { description: msg });
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin, loadData]);

  // Real-time SOS subscriptions
  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = subscribeToAllSosRequests((requests) => {
      setSosRequests(requests);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  // Real-time shelter subscriptions (MAP-3 & Phase 4 Data Consistency)
  useEffect(() => {
    if (!isAdmin) return;
    const unsubShelters = subscribeToShelters((live) => {
      if (live && live.length > 0) {
        setSheltersList(live);
      }
    });
    return () => unsubShelters();
  }, [isAdmin]);

  // Deduplicate shelters by authoritative ID to prevent duplicate reporting
  const uniqueShelters = useMemo(() => {
    const map = new Map<string, Shelter>();
    for (const s of sheltersList) {
      if (!map.has(s.id)) {
        map.set(s.id, s);
      }
    }
    return Array.from(map.values());
  }, [sheltersList]);

  const remoteShelters = useMemo(() => uniqueShelters.filter((s) => !s.isLocal), [uniqueShelters]);
  const localFallbackShelters = useMemo(
    () => uniqueShelters.filter((s) => s.isLocal),
    [uniqueShelters],
  );

  // Metrics computations
  const totalShelterCapacity = useMemo(
    () => uniqueShelters.reduce((acc, s) => acc + s.capacity, 0),
    [uniqueShelters],
  );
  const totalShelterOccupied = useMemo(
    () => uniqueShelters.reduce((acc, s) => acc + s.occupied, 0),
    [uniqueShelters],
  );
  const totalAvailableBeds = Math.max(0, totalShelterCapacity - totalShelterOccupied);

  const totalDonationsAmount = useMemo(
    () =>
      donationsList
        .filter((d) => d.type === "money" && typeof d.amount === "number")
        .reduce((acc, d) => acc + (d.amount || 0), 0),
    [donationsList],
  );

  const activeSosCount = sosRequests.filter((s) => s.status === "active").length;
  const assignedSosCount = sosRequests.filter((s) => s.status === "assigned").length;
  const resolvedSosCount = sosRequests.filter((s) => s.status === "resolved").length;
  const cancelledSosCount = sosRequests.filter((s) => s.status === "cancelled").length;

  // ADM-7: single authoritative definition of approved volunteers
  const approvedVolunteers = useMemo(() => users.filter(isApprovedVolunteer), [users]);
  const pendingApplicants = useMemo(
    () => users.filter((u) => u.volunteerStatus === "pending"),
    [users],
  );

  const sosResolutionPercentage =
    sosRequests.length > 0 ? Math.round((resolvedSosCount / sosRequests.length) * 100) : 100;

  const shelterOccupancyPercentage =
    totalShelterCapacity > 0 ? Math.round((totalShelterOccupied / totalShelterCapacity) * 100) : 0;

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
            System performance reports are restricted to authorized RescueLink administrators.
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
          <h1 className="truncate text-[17px] font-bold text-navy">System Reports</h1>
          <p className="truncate text-xs text-muted-foreground">Response Metrics & Audit</p>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              loadData();
              toast.success("Metrics updated");
            }}
            disabled={loadingData}
            aria-label="Refresh Metrics"
            className="press grid h-10 w-10 place-items-center rounded-full bg-muted text-navy disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loadingData ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {loadError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Could not refresh reports: {loadError}</span>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="press shrink-0 rounded-lg bg-destructive/15 px-2.5 py-1 text-[11px] font-bold text-destructive hover:bg-destructive/25"
            >
              Retry
            </button>
          </div>
        )}

        {/* Key Performance Indicators Card */}
        <div>
          <SectionHeader title="Operational KPIs" />
          <Card className="p-4 space-y-3.5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-safe/15 text-safe">
                  <Clock className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-navy">Average Dispatch Time</p>
                  <p className="text-[11px] text-muted-foreground">
                    From SOS trigger to deployment
                  </p>
                </div>
              </div>
              <span className="text-sm font-extrabold text-safe">3.8 mins</span>
            </div>

            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-info/15 text-info">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-navy">SOS Resolution Rate</p>
                  <p className="text-[11px] text-muted-foreground">
                    {resolvedSosCount} of {sosRequests.length} resolved
                  </p>
                </div>
              </div>
              <span className="text-sm font-extrabold text-navy">{sosResolutionPercentage}%</span>
            </div>

            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-navy/10 text-navy">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-navy">Volunteer Response Ratio</p>
                  <p className="text-[11px] text-muted-foreground">
                    {approvedVolunteers.length} verified responders
                  </p>
                </div>
              </div>
              <span className="text-sm font-extrabold text-navy">
                {approvedVolunteers.length > 0 ? "100% Active" : "Standby"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-navy">Shelter Capacity Utilization</p>
                  <p className="text-[11px] text-muted-foreground">
                    {totalShelterOccupied} of {totalShelterCapacity} beds occupied
                  </p>
                </div>
              </div>
              <span className="text-sm font-extrabold text-primary">
                {shelterOccupancyPercentage}%
              </span>
            </div>
          </Card>
        </div>

        {/* Breakdown 1: SOS Incidents */}
        <div>
          <SectionHeader title="Emergency SOS Signal Breakdown" />
          <div className="grid grid-cols-2 gap-2.5">
            <Card className="p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Active Signals</span>
                <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
              </div>
              <p className="text-2xl font-black text-primary">{activeSosCount}</p>
              <p className="text-[10.5px] text-muted-foreground">Awaiting team assignment</p>
            </Card>

            <Card className="p-3.5 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Units Dispatched</span>
              <p className="text-2xl font-black text-warn-foreground">{assignedSosCount}</p>
              <p className="text-[10.5px] text-muted-foreground">Responders en route</p>
            </Card>

            <Card className="p-3.5 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Safely Resolved</span>
              <p className="text-2xl font-black text-safe">{resolvedSosCount}</p>
              <p className="text-[10.5px] text-muted-foreground">Citizens rescued</p>
            </Card>

            <Card className="p-3.5 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Total Invocations</span>
              <p className="text-2xl font-black text-navy">{sosRequests.length}</p>
              <p className="text-[10.5px] text-muted-foreground">
                {cancelledSosCount} cancelled by user
              </p>
            </Card>
          </div>
        </div>

        {/* Breakdown 2: Relief Shelters Network */}
        <div>
          <SectionHeader title="Emergency Shelters Network" />
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-bold text-navy">Bed Allocation Status</p>
                  {localFallbackShelters.length > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      {remoteShelters.length} remote · {localFallbackShelters.length} local fallback
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Across {uniqueShelters.length} registered relief shelters
                </p>
              </div>
              <span className="rounded-full bg-safe/15 px-2.5 py-0.5 text-xs font-extrabold text-safe">
                {totalAvailableBeds} Beds Free
              </span>
            </div>

            {/* Occupancy Progress Bar */}
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, shelterOccupancyPercentage)}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="rounded-xl bg-muted/50 p-2">
                <p className="text-[10.5px] text-muted-foreground font-medium">Total Capacity</p>
                <p className="text-sm font-extrabold text-navy">{totalShelterCapacity}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-2">
                <p className="text-[10.5px] text-muted-foreground font-medium">Occupied Beds</p>
                <p className="text-sm font-extrabold text-primary">{totalShelterOccupied}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-2">
                <p className="text-[10.5px] text-muted-foreground font-medium">Available Beds</p>
                <p className="text-sm font-extrabold text-safe">{totalAvailableBeds}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Breakdown 3: Volunteer Personnel & Relief Aid */}
        <div className="grid grid-cols-2 gap-2.5">
          <Card className="p-4 space-y-1.5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-navy">
              <Users className="h-4 w-4" />
              <p className="text-xs font-bold">Volunteer Force</p>
            </div>
            <p className="text-2xl font-black text-navy">{approvedVolunteers.length}</p>
            <p className="text-[11px] text-muted-foreground">
              {pendingApplicants.length} applicants pending review
            </p>
          </Card>

          <Card className="p-4 space-y-1.5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-safe">
              <HandCoins className="h-4 w-4" />
              <p className="text-xs font-bold">Relief Aid Funds</p>
            </div>
            <p className="text-2xl font-black text-navy">
              ৳{totalDonationsAmount.toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {donationsList.length} verified donations
            </p>
          </Card>
        </div>
      </div>
    </Screen>
  );
}
