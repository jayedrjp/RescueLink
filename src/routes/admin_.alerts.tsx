import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Bell, Plus, X, Radio, ShieldAlert, ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";

import { Screen, Card } from "@/components/rl";
import { useAuth } from "@/context/AuthContext";
import { BackButton } from "@/components/BackButton";
import { requireSignedIn } from "@/lib/route-guards";
import { formatAlertTime, getStoredAlerts, type Alert } from "@/lib/data";
import { createAlert, deleteAlert, subscribeToAlerts } from "@/lib/firebase/firestore";

interface AdminAlertsSearchParams {
  create?: boolean;
}

export const Route = createFileRoute("/admin_/alerts")({
  validateSearch: (search: Record<string, unknown>): AdminAlertsSearchParams => {
    const isCreate = search["create"] === "true" || search["create"] === true;
    return isCreate ? { create: true } : {};
  },
  head: () => ({
    meta: [
      { title: "Disaster Alerts Management — RescueLink Admin" },
      {
        name: "description",
        content: "Broadcast and manage public disaster alerts for citizens across Bangladesh.",
      },
    ],
  }),
  beforeLoad: requireSignedIn,
  component: AdminAlertsScreen,
});

function AdminAlertsScreen() {
  const navigate = useNavigate();
  const search = Route.useSearch() as AdminAlertsSearchParams;
  const { isAdmin, loading: authLoading, profile } = useAuth();

  const [alertsList, setAlertsList] = useState<Alert[]>(() => getStoredAlerts());
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning" | "info">(
    "all",
  );
  const [isAddingAlert, setIsAddingAlert] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New alert form state
  const [newAlertForm, setNewAlertForm] = useState({
    title: "",
    severity: "warning" as "critical" | "warning" | "info",
    location: "Dhaka North",
    body: "",
    category: "general" as "flood" | "cyclone" | "rainfall" | "road" | "shelter" | "general",
  });

  useEffect(() => {
    const unsub = subscribeToAlerts((data) => setAlertsList(data));
    return () => unsub();
  }, []);

  // Open modal automatically if query param ?create=true was passed
  useEffect(() => {
    if (search.create) {
      setIsAddingAlert(true);
    }
  }, [search.create]);

  const closeModal = () => {
    setIsAddingAlert(false);
    if (search.create) {
      navigate({ to: "/admin/alerts", search: {}, replace: true });
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlertForm.title.trim() || !newAlertForm.body.trim()) {
      toast.error("Please fill in both the alert title and body message.");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const newAlert: Alert = {
        id: `alert-${Date.now()}`,
        title: newAlertForm.title.trim(),
        severity: newAlertForm.severity,
        location: newAlertForm.location.trim() || "National Emergency Zone",
        body: newAlertForm.body.trim(),
        createdAt: now,
        updatedAt: now,
        category: newAlertForm.category,
      };

      await createAlert(newAlert);
      closeModal();
      setNewAlertForm({
        title: "",
        severity: "warning",
        location: "Dhaka North",
        body: "",
        category: "general",
      });

      toast.success("Emergency Alert Broadcasted!", {
        description: `"${newAlert.title}" has been published to all citizens.`,
      });
    } catch (err) {
      console.error("Alert creation failed:", err);
      toast.error("Failed to broadcast alert. Please check permissions.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    try {
      await deleteAlert(alertId);
      toast.info("Alert deactivated", {
        description: "The alert has been removed from citizen broadcasts.",
      });
    } catch (err) {
      console.error("Alert deletion failed:", err);
      toast.error("Failed to deactivate alert.");
    }
  };

  const filteredAlerts = alertsList.filter((alert) => {
    const matchesSeverity = severityFilter === "all" || alert.severity === severityFilter;
    const matchesQuery =
      alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSeverity && matchesQuery;
  });

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
            This disaster management screen is restricted to authorized RescueLink administrators.
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
          <h1 className="truncate text-[17px] font-bold text-navy">Disaster Alerts</h1>
          <p className="truncate text-xs text-muted-foreground">Broadcast & Crisis Notices</p>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setIsAddingAlert(true)}
            aria-label="Create Alert"
            className="press flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Broadcast</span>
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* Search & Severity Filter Bar */}
        <div className="space-y-2.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search active alerts by title or area..."
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
              onClick={() => setSeverityFilter("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                severityFilter === "all"
                  ? "bg-navy text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              All ({alertsList.length})
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter("critical")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                severityFilter === "critical"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              Critical ({alertsList.filter((a) => a.severity === "critical").length})
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter("warning")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                severityFilter === "warning"
                  ? "bg-warn text-warn-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              Warning ({alertsList.filter((a) => a.severity === "warning").length})
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter("info")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                severityFilter === "info"
                  ? "bg-info text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-navy"
              }`}
            >
              Advisory ({alertsList.filter((a) => a.severity === "info").length})
            </button>
          </div>
        </div>

        {/* Alerts List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold">Published Alerts ({filteredAlerts.length})</span>
            <span>Live Citizen Broadcast</span>
          </div>

          {filteredAlerts.length === 0 ? (
            <Card className="p-8 text-center space-y-2">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Bell className="h-6 w-6" />
              </span>
              <p className="text-sm font-bold text-navy">No Alerts Found</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                {searchQuery
                  ? "No published alerts match your search terms."
                  : "There are currently no active disaster broadcasts."}
              </p>
              <button
                onClick={() => setIsAddingAlert(true)}
                className="press mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create First Alert</span>
              </button>
            </Card>
          ) : (
            filteredAlerts.map((alert) => (
              <Card key={alert.id} className="space-y-2.5 p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase ${
                        alert.severity === "critical"
                          ? "bg-primary text-primary-foreground"
                          : alert.severity === "warning"
                            ? "bg-warn text-warn-foreground"
                            : "bg-info/20 text-info"
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <h3 className="mt-1.5 text-sm font-bold text-navy leading-snug">
                      {alert.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    aria-label="Deactivate and dismiss alert"
                    onClick={() => handleDeleteAlert(alert.id)}
                    className="press rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Deactivate and dismiss alert"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">{alert.body}</p>

                <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11px] font-medium text-navy/70">
                  <span>📍 {alert.location}</span>
                  <span className="text-muted-foreground">{formatAlertTime(alert)}</span>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* -------------------- MODAL: CREATE DISASTER ALERT -------------------- */}
      {isAddingAlert && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-[420px] rounded-3xl bg-surface p-5 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-extrabold text-navy">Broadcast Disaster Alert</h3>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={closeModal}
                className="press rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAlert} className="mt-3 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-navy">Alert Severity Level</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewAlertForm((p) => ({ ...p, severity: "critical" }))}
                    className={`rounded-xl p-2 text-xs font-bold border transition-colors ${
                      newAlertForm.severity === "critical"
                        ? "border-primary bg-primary text-white shadow-xs"
                        : "border-border bg-card text-navy"
                    }`}
                  >
                    Critical
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAlertForm((p) => ({ ...p, severity: "warning" }))}
                    className={`rounded-xl p-2 text-xs font-bold border transition-colors ${
                      newAlertForm.severity === "warning"
                        ? "border-warn bg-warn text-warn-foreground shadow-xs"
                        : "border-border bg-card text-navy"
                    }`}
                  >
                    Warning
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAlertForm((p) => ({ ...p, severity: "info" }))}
                    className={`rounded-xl p-2 text-xs font-bold border transition-colors ${
                      newAlertForm.severity === "info"
                        ? "border-info bg-info text-white shadow-xs"
                        : "border-border bg-card text-navy"
                    }`}
                  >
                    Advisory
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">Alert Headline / Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flash Flood Emergency Warning"
                  value={newAlertForm.title}
                  onChange={(e) => setNewAlertForm((p) => ({ ...p, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-xs text-navy outline-none focus:border-navy"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">Affected Geographic Area</label>
                <input
                  type="text"
                  placeholder="e.g. Sylhet Sadar & Sunamganj Basin"
                  value={newAlertForm.location}
                  onChange={(e) => setNewAlertForm((p) => ({ ...p, location: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-xs text-navy outline-none focus:border-navy"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">
                  Public Instructions & Description
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe emergency conditions and evacuation advice for citizens..."
                  value={newAlertForm.body}
                  onChange={(e) => setNewAlertForm((p) => ({ ...p, body: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-xs text-navy outline-none focus:border-navy"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="press h-11 rounded-xl bg-muted text-xs font-bold text-navy"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-white shadow-xs disabled:opacity-60"
                >
                  <Radio className="h-4 w-4" />
                  <span>Broadcast Alert</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Screen>
  );
}
