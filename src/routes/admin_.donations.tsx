import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  HandCoins,
  ShieldAlert,
  ArrowLeft,
  Search,
  X,
  Building2,
  PackageCheck,
  Calendar,
} from "lucide-react";

import { Screen, Card } from "@/components/rl";
import { useAuth } from "@/context/AuthContext";
import { BackButton } from "@/components/BackButton";
import { requireSignedIn } from "@/lib/route-guards";
import { getStoredDonations, type DonationRecord } from "@/lib/data";
import { subscribeToDonations } from "@/lib/firebase/firestore";

export const Route = createFileRoute("/admin_/donations")({
  head: () => ({
    meta: [
      { title: "Relief Donations Ledger — RescueLink Admin" },
      {
        name: "description",
        content: "Track public donations, relief contributions, and shelter allocation records.",
      },
    ],
  }),
  beforeLoad: requireSignedIn,
  component: AdminDonationsScreen,
});

function AdminDonationsScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, loading: authLoading, profile } = useAuth();

  const [donationsList, setDonationsList] = useState<DonationRecord[]>(() => getStoredDonations());
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "money" | "supplies">("all");

  useEffect(() => {
    const unsub = subscribeToDonations((data) => setDonationsList(data));
    return () => unsub();
  }, []);

  // Auth protection guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/login", replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const totalDonationsAmount = useMemo(
    () =>
      donationsList
        .filter((d) => d.type === "money" && typeof d.amount === "number")
        .reduce((acc, d) => acc + (d.amount || 0), 0),
    [donationsList],
  );

  const monetaryCount = useMemo(
    () => donationsList.filter((d) => d.type === "money").length,
    [donationsList],
  );

  const suppliesCount = useMemo(
    () => donationsList.filter((d) => d.type === "supplies").length,
    [donationsList],
  );

  const filteredDonations = useMemo(() => {
    return donationsList.filter((don) => {
      const matchesType = typeFilter === "all" || don.type === typeFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        don.donorName.toLowerCase().includes(q) ||
        don.donorEmail.toLowerCase().includes(q) ||
        don.shelterName.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [donationsList, typeFilter, searchQuery]);

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
            The donations ledger is restricted to authorized RescueLink administrators.
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
          <h1 className="truncate text-[17px] font-bold text-navy">Donations</h1>
          <p className="truncate text-xs text-muted-foreground">Relief Ledger & Contributions</p>
        </div>
        <div className="shrink-0">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-safe/15 text-safe">
            <HandCoins className="h-5 w-5" />
          </span>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* Total Ledger Summary Card */}
        <div className="rounded-2xl border border-safe/25 bg-safe/10 p-4 text-navy shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-safe">
              Total Relief Funds
            </span>
            <span className="rounded-full bg-safe/20 px-2 py-0.5 text-[10px] font-extrabold text-safe">
              {donationsList.length} Donations
            </span>
          </div>
          <p className="mt-1 text-3xl font-black text-navy">
            ৳{totalDonationsAmount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {monetaryCount} financial grants · {suppliesCount} physical supplies contributions
          </p>
        </div>

        {/* Search & Type Filter Bar */}
        <div className="space-y-2.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by donor name, email, or shelter..."
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
              onClick={() => setTypeFilter("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                typeFilter === "all"
                  ? "bg-navy text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              All Records ({donationsList.length})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("money")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                typeFilter === "money"
                  ? "bg-safe text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              Financial Grants ({monetaryCount})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("supplies")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                typeFilter === "supplies"
                  ? "bg-info text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              Relief Supplies ({suppliesCount})
            </button>
          </div>
        </div>

        {/* Donations List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold">Transaction Ledger ({filteredDonations.length})</span>
            <span>Verified Citizen Contributions</span>
          </div>

          {filteredDonations.length === 0 ? (
            <Card className="p-8 text-center space-y-2">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <HandCoins className="h-6 w-6" />
              </span>
              <p className="text-sm font-bold text-navy">No Donations Found</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                No relief donations match your current search query or filter.
              </p>
            </Card>
          ) : (
            filteredDonations.map((don) => (
              <Card key={don.id} className="p-4 space-y-2 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-navy truncate">{don.donorName}</p>
                    <p className="text-xs text-muted-foreground truncate">{don.donorEmail}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-safe">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Destination: {don.shelterName}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {don.type === "money" ? (
                      <span className="inline-block rounded-xl bg-safe/15 px-3 py-1 text-xs font-black text-safe">
                        ৳{don.amount?.toLocaleString()}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-info/15 px-2.5 py-1 text-xs font-bold text-info">
                        <PackageCheck className="h-3.5 w-3.5" />
                        <span>{don.items?.join(", ") || "Supplies"}</span>
                      </span>
                    )}
                    <p className="mt-1 flex items-center justify-end gap-1 text-[10.5px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(don.date).toLocaleDateString()}</span>
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </Screen>
  );
}
