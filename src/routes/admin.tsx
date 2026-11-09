import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Siren,
  Phone,
  MapPin,
  Clock,
  Radio,
  Building2,
  HandCoins,
  User,
  Plus,
  Edit2,
  ExternalLink,
  Search,
  LogOut,
  ChevronRight,
  FileText,
  Bell,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Screen, Card, TopBar, Pill, OccupancyBar, SectionHeader } from "@/components/rl";
import { useAuth } from "@/context/AuthContext";
import { requireSignedIn } from "@/lib/route-guards";
import { db } from "@/lib/firebase/config";
import {
  setVolunteerStatus,
  setIdentityVerificationStatus,
  isApprovedVolunteer,
  subscribeToAllSosRequests,
  updateSosStatus,
  cancelSosRequest,
  getAllUsers,
  createShelter,
  updateShelter,
  saveShelter,
  updateShelterCapacity,
  deleteShelter,
  type UpdateShelterInput,
  subscribeToShelters,
  ShelterNotFoundError,
} from "@/lib/firebase/firestore";
import { isValidCoordinates } from "@/lib/map/types";
import type { UserProfile, SosRequest, SosStatus } from "@/lib/firebase/types";
import { formatSosTimeAgo, formatSosAbsolute, formatSosFull } from "@/lib/date-utils";
import { normalizePhone, isValidPhone, toDialablePhone } from "@/lib/phone";
import {
  type Shelter,
  type DonationRecord,
  getStoredShelters,
  getStoredDonations,
} from "@/lib/data";

interface AdminSearchParams {
  tab?: string | undefined;
  sub?: string | undefined;
}

/**
 * Older links used /admin?sub=alerts|donations|users|reports. Those now live on their own pages.
 * Redirecting here (before the page renders, with `replace`) means the old URL never enters the
 * browser history, so Back cannot bounce between the two addresses.
 */
function legacyAdminRedirect(sub: string | undefined) {
  switch (sub) {
    case "alerts":
      return redirect({ to: "/admin/alerts", replace: true });
    case "donations":
      return redirect({ to: "/admin/donations", replace: true });
    case "users":
      return redirect({ to: "/admin/citizens", replace: true });
    case "reports":
      return redirect({ to: "/admin/reports", replace: true });
    default:
      return null;
  }
}

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ search }) => {
    const legacy = legacyAdminRedirect(search.sub);
    if (legacy) throw legacy;
    await requireSignedIn();
  },
  validateSearch: (search: Record<string, unknown>): AdminSearchParams => {
    const rawTab = search["tab"];
    const rawSub = search["sub"];
    const result: AdminSearchParams = {
      tab: typeof rawTab === "string" ? rawTab : "home",
    };
    if (typeof rawSub === "string") {
      result.sub = rawSub;
    }
    return result;
  },
  head: () => ({
    meta: [
      { title: "Admin Portal — RescueLink Emergency Disaster Response" },
      {
        name: "description",
        content:
          "RescueLink Administrative Portal: Real-time emergency oversight, volunteer approvals, shelter management, and crisis dispatch.",
      },
    ],
  }),
  component: AdminScreen,
});

function AdminScreen() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const currentTab = (search.tab || "home") as "home" | "volunteers" | "sos" | "shelters" | "more";
  const currentSub = search.sub || "all";

  const { user, isAuthenticated, isAdmin, loading: authLoading, profile, logout } = useAuth();

  // Primary Data State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [sosRequests, setSosRequests] = useState<SosRequest[]>([]);
  const [sosSubscriptionError, setSosSubscriptionError] = useState<string | null>(null);
  const [sosSubscriptionRetries, setSosSubscriptionRetries] = useState(0);
  const [sheltersList, setSheltersList] = useState<Shelter[]>([]);
  const [donationsList, setDonationsList] = useState<DonationRecord[]>([]);

  // Sub-tab & Filter States
  const [volunteerSubTab, setVolunteerSubTab] = useState<"pending" | "approved">(
    currentSub === "approved" ? "approved" : "pending",
  );
  const [volunteerSearch, setVolunteerSearch] = useState("");
  const [sosStatusFilter, setSosStatusFilter] = useState<"all" | SosStatus>("all");
  const [sosSearch, setSosSearch] = useState("");
  const [shelterSearch, setShelterSearch] = useState("");

  // Interactive Action Modals / Forms
  const [processingUid, setProcessingUid] = useState<string | null>(null);
  const [processingSosId, setProcessingSosId] = useState<string | null>(null);
  const [dispatchModalSos, setDispatchModalSos] = useState<SosRequest | null>(null);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedResponderId, setSelectedResponderId] = useState("");
  const [selectedEta, setSelectedEta] = useState("5 mins");

  // Shelter Edit, Delete & Create
  const [editingShelter, setEditingShelter] = useState<Shelter | null>(null);
  const [shelterEditForm, setShelterEditForm] = useState({
    name: "",
    area: "",
    capacity: 0,
    occupied: 0,
    phone: "",
    lat: "",
    lng: "",
    facilities: [] as string[],
    needs: "",
    image: "shelter-1" as "shelter-1" | "shelter-2" | "shelter-3",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deletingShelter, setDeletingShelter] = useState<Shelter | null>(null);
  const [isDeletingShelter, setIsDeletingShelter] = useState(false);

  const [isAddingShelter, setIsAddingShelter] = useState(false);
  const [newShelterForm, setNewShelterForm] = useState({
    name: "",
    area: "",
    capacity: 150,
    occupied: 0,
    phone: "",
    lat: "",
    lng: "",
    facilities: [] as string[],
    needs: "",
    image: "shelter-1" as "shelter-1" | "shelter-2" | "shelter-3",
  });

  // Rejection modal
  const [rejectingUid, setRejectingUid] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingIdentityUid, setRejectingIdentityUid] = useState<string | null>(null);
  const [rejectIdentityReason, setRejectIdentityReason] = useState("");

  const setTab = (tab: string, sub?: string) => {
    // Tabs are siblings, not pages: replace the entry so browser Back does not walk through them.
    navigate({
      to: "/admin",
      search: sub ? { tab, sub } : { tab },
      replace: true,
    });
  };

  // Sync sub tab param
  useEffect(() => {
    if (search.sub === "approved" || search.sub === "pending") {
      setVolunteerSubTab(search.sub);
    }
  }, [search.sub]);

  // Load persistent local data
  const loadLocalData = () => {
    setSheltersList(getStoredShelters());
    setDonationsList(getStoredDonations());
  };

  useEffect(() => {
    loadLocalData();
  }, []);

  // Fetch Firestore users list
  const fetchUsers = useCallback(async () => {
    if (!db || !isAdmin) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const all = await getAllUsers();
      setUsers(all);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading users directory";
      console.error("Error loading users:", err);
      setUsersError(msg);
      toast.error("Could not load users directory", { description: msg });
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin]);

  // Real-time SOS subscriptions for admin oversight with error capture & recovery
  useEffect(() => {
    if (!isAdmin) return;
    setSosSubscriptionError(null);
    const unsubscribe = subscribeToAllSosRequests(
      (requests) => {
        setSosRequests(requests);
        setSosSubscriptionError(null);
      },
      (err) => {
        const isPermission = (err as { code?: string })?.code === "permission-denied";
        const message = isPermission
          ? "Permission denied while connecting to emergency feed. Please verify admin privileges."
          : "Real-time emergency feed disconnected. Live updates may be paused.";
        setSosSubscriptionError(message);
      },
    );
    return () => unsubscribe();
  }, [isAdmin, sosSubscriptionRetries]);

  const handleRetrySosSubscription = useCallback(() => {
    setSosSubscriptionRetries((c) => c + 1);
  }, []);

  // Real-time shelters subscription for admin oversight
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToShelters((data) => {
      if (data.length > 0) setSheltersList(data);
    });
    return () => unsub();
  }, [isAdmin]);

  // Initial user directory fetch for verified admins (ADM-4: route-guard handles unauthorized access)
  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin, fetchUsers]);

  // Derived user categories - ADM-7: single consistent definition of approved volunteers
  const pendingApplicants = useMemo(
    () => users.filter((u) => u.role === "user" && u.volunteerStatus === "pending"),
    [users],
  );
  const approvedVolunteers = useMemo(() => users.filter(isApprovedVolunteer), [users]);
  const registeredCitizens = useMemo(() => users.filter((u) => u.role !== "admin"), [users]);

  // Derived SOS Metrics
  const activeSosCount = sosRequests.filter((s) => s.status === "active").length;
  const assignedSosCount = sosRequests.filter((s) => s.status === "assigned").length;

  // Derived Shelters Metrics
  const totalShelterCapacity = sheltersList.reduce((acc, s) => acc + s.capacity, 0);
  const totalShelterOccupied = sheltersList.reduce((acc, s) => acc + s.occupied, 0);
  const totalAvailableBeds = Math.max(0, totalShelterCapacity - totalShelterOccupied);

  // Derived Donations Metrics
  const totalDonationsAmount = donationsList
    .filter((d) => d.type === "money" && typeof d.amount === "number")
    .reduce((acc, d) => acc + (d.amount || 0), 0);

  // Volunteer Decisions - ADM-1 & ADM-2: Save rejection reason and prevent demoting admins
  const handleDecision = async (targetUid: string, approve: boolean, reason?: string) => {
    setProcessingUid(targetUid);
    const cleanReason = reason?.trim();
    try {
      await setVolunteerStatus(
        targetUid,
        approve ? "approved" : "rejected",
        cleanReason,
        user?.uid,
      );
      toast.success(approve ? "Volunteer Approved!" : "Application Rejected", {
        description: approve
          ? "User role upgraded to Volunteer. Ready for emergency dispatch."
          : `Application status set to rejected.${cleanReason ? ` Reason: ${cleanReason}` : ""}`,
      });
      await fetchUsers();
      setRejectingUid(null);
      setRejectReason("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Permission denied";
      toast.error("Action failed", { description: msg });
    } finally {
      setProcessingUid(null);
    }
  };

  // Manual Identity Verification Decisions
  const handleIdentityDecision = async (targetUid: string, verified: boolean, reason?: string) => {
    setProcessingUid(targetUid);
    const cleanReason = reason?.trim();
    try {
      await setIdentityVerificationStatus(
        targetUid,
        verified ? "verified" : "rejected",
        user?.uid || "admin",
        cleanReason,
      );
      toast.success(verified ? "Identity Verified" : "Identity Rejected", {
        description: verified
          ? "Applicant identity verified. Volunteer application can now be approved."
          : `Identity verification marked as rejected.${cleanReason ? ` Reason: ${cleanReason}` : ""}`,
      });
      await fetchUsers();
      setRejectingIdentityUid(null);
      setRejectIdentityReason("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Identity verification failed";
      toast.error("Action failed", { description: msg });
    } finally {
      setProcessingUid(null);
    }
  };

  // SOS Management Actions - ADM-6: bind real eligible responder identities from approved volunteers
  const handleOpenDispatch = (sos: SosRequest) => {
    setDispatchModalSos(sos);
    if (approvedVolunteers.length > 0) {
      const first = approvedVolunteers[0];
      if (first) {
        setSelectedResponderId(first.uid);
        setSelectedUnit(`Volunteer: ${first.displayName} (${first.area || "Dhaka"})`);
      } else {
        setSelectedResponderId("");
        setSelectedUnit("General Emergency Services");
      }
    } else {
      setSelectedResponderId("");
      setSelectedUnit("General Emergency Services");
    }
  };

  const handleConfirmDispatch = async () => {
    if (!dispatchModalSos?.id) return;
    setProcessingSosId(dispatchModalSos.id);
    try {
      const matchedVolunteer = approvedVolunteers.find((v) => v.uid === selectedResponderId);
      // ADM-6: Validate responder eligibility and authorization before assignment
      if (selectedResponderId && !matchedVolunteer) {
        toast.error("Invalid responder", {
          description: "Selected responder is not an active, approved volunteer.",
        });
        setProcessingSosId(null);
        return;
      }
      const responderInfo: { unit: string; eta: string; responderId?: string } = {
        unit: matchedVolunteer
          ? `Volunteer: ${matchedVolunteer.displayName} (${matchedVolunteer.area || "Dhaka"})`
          : selectedUnit.trim() || "General Emergency Services",
        eta: selectedEta,
        ...(matchedVolunteer ? { responderId: matchedVolunteer.uid } : {}),
      };
      await updateSosStatus(dispatchModalSos.id, "assigned", responderInfo);
      toast.success("Emergency Responder Dispatched!", {
        description: `${responderInfo.unit} has been deployed (ETA: ${selectedEta}).`,
      });
      setDispatchModalSos(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Dispatch failed";
      toast.error("Dispatch error", { description: msg });
    } finally {
      setProcessingSosId(null);
    }
  };

  const handleResolveSos = async (requestId: string) => {
    setProcessingSosId(requestId);
    try {
      await updateSosStatus(requestId, "resolved");
      toast.success("SOS Incident Resolved", {
        description: "Emergency marked as safely completed and archived.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast.error("Resolve error", { description: msg });
    } finally {
      setProcessingSosId(null);
    }
  };

  const handleCancelSos = async (requestId: string) => {
    setProcessingSosId(requestId);
    try {
      await cancelSosRequest(requestId);
      toast.success("SOS Incident Cancelled", {
        description: "Emergency alert marked as cancelled.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast.error("Cancellation error", { description: msg });
    } finally {
      setProcessingSosId(null);
    }
  };

  // Shelter Actions - Complete Shelter CRUD & Reliability (Phase 4)
  const handleOpenEditShelter = (s: Shelter) => {
    setEditingShelter(s);
    setShelterEditForm({
      name: s.name,
      area: s.area,
      capacity: s.capacity,
      occupied: s.occupied,
      phone: s.phone || "",
      lat: s.coordinates?.lat !== undefined ? String(s.coordinates.lat) : "",
      lng: s.coordinates?.lng !== undefined ? String(s.coordinates.lng) : "",
      facilities: s.facilities || [],
      needs: (s.needs || []).join(", "),
      image: (s.image as "shelter-1" | "shelter-2" | "shelter-3") || "shelter-1",
    });
  };

  const handleSaveShelter = async () => {
    if (!editingShelter || isSavingEdit) return;

    const name = shelterEditForm.name.trim();
    const area = shelterEditForm.area.trim();
    if (!name || !area) {
      toast.error("Validation error", { description: "Shelter name and area are required." });
      return;
    }

    const cap = Math.max(1, Number(shelterEditForm.capacity) || 1);
    const occ = Math.max(0, Math.min(Number(shelterEditForm.occupied) || 0, cap));

    let coordinates = editingShelter.coordinates;
    const latStr = shelterEditForm.lat.trim();
    const lngStr = shelterEditForm.lng.trim();
    if (latStr || lngStr) {
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isValidCoordinates({ lat, lng })) {
        toast.error("Invalid coordinates", {
          description: "Coordinates must be between -90 and 90 latitude, -180 and 180 longitude.",
        });
        return;
      }
      coordinates = { lat, lng };
    }

    const cleanPhone = shelterEditForm.phone.trim();
    const parsedNeeds = shelterEditForm.needs
      ? shelterEditForm.needs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : editingShelter.needs;

    const updates: UpdateShelterInput = {
      name,
      area,
      capacity: cap,
      occupied: occ,
      phone: cleanPhone || editingShelter.phone,
      facilities:
        shelterEditForm.facilities.length > 0
          ? shelterEditForm.facilities
          : editingShelter.facilities,
      needs: parsedNeeds,
      image: shelterEditForm.image || editingShelter.image,
      ...(coordinates ? { coordinates } : {}),
    };

    setIsSavingEdit(true);
    try {
      const updated = await saveShelter(editingShelter.id, updates);
      setSheltersList((prev) => prev.map((s) => (s.id === editingShelter.id ? updated : s)));
      setEditingShelter(null);
      toast.success("Shelter Saved", {
        description: `${updated.name} details and live availability updated in Cloud Firestore.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save shelter";
      toast.error("Save failed", { description: msg, duration: 6000 });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteShelter = async () => {
    if (!deletingShelter || isDeletingShelter) return;
    setIsDeletingShelter(true);
    try {
      await deleteShelter(deletingShelter.id);
      setSheltersList((prev) => prev.filter((s) => s.id !== deletingShelter.id));
      toast.success("Shelter Deleted", {
        description: `${deletingShelter.name} was successfully deleted.`,
      });
      setDeletingShelter(null);
    } catch (err: unknown) {
      if (err instanceof ShelterNotFoundError) {
        toast.error("Remote Shelter Not Found", {
          description: err.message,
          duration: 6000,
        });
      } else {
        const msg = err instanceof Error ? err.message : "Failed to delete shelter";
        toast.error("Deletion error", { description: msg });
      }
    } finally {
      setIsDeletingShelter(false);
    }
  };

  // Backwards compatibility for capacity update
  const handleSaveShelterCapacity = handleSaveShelter;

  const handleCreateShelter = async () => {
    const name = newShelterForm.name.trim();
    const area = newShelterForm.area.trim();
    if (!name || !area) {
      toast.error("Validation error", { description: "Please fill in shelter name and area." });
      return;
    }

    // ADM-5: Require valid coordinates using existing isValidCoordinates utility; do not fabricate defaults
    const latStr = String(newShelterForm.lat).trim();
    const lngStr = String(newShelterForm.lng).trim();
    if (!latStr || !lngStr) {
      toast.error("Coordinates required", {
        description: "Please enter both Latitude and Longitude for the shelter.",
      });
      return;
    }

    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!isValidCoordinates({ lat, lng })) {
      toast.error("Invalid coordinates", {
        description:
          "Coordinates must be valid numbers within Bangladesh bounds (Latitude 20.5–26.7, Longitude 88.0–92.7).",
      });
      return;
    }

    // ADM-5: Validate phone when provided; keep optional without fake fallback
    const rawPhone = newShelterForm.phone.trim();
    let cleanPhone = "";
    if (rawPhone) {
      if (!isValidPhone(rawPhone)) {
        toast.error("Invalid phone number", {
          description: "Please enter a valid phone number (e.g. 017XXXXXXXX or +88017XXXXXXXX).",
        });
        return;
      }
      cleanPhone = normalizePhone(rawPhone) || rawPhone;
    }

    const cap = Math.max(1, Number(newShelterForm.capacity) || 100);
    const occ = Math.max(0, Math.min(Number(newShelterForm.occupied) || 0, cap));

    // ADM-5: Optional needs & facilities are genuinely optional; no fabricated defaults
    const parsedNeeds = newShelterForm.needs
      ? newShelterForm.needs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const newShelterData: Omit<Shelter, "id"> = {
      name,
      area,
      capacity: cap,
      occupied: occ,
      status: occ >= cap ? "full" : occ >= cap * 0.8 ? "limited" : "open",
      facilities: newShelterForm.facilities,
      needs: parsedNeeds,
      phone: cleanPhone,
      image: newShelterForm.image || "shelter-1",
      coordinates: {
        lat,
        lng,
      },
    };

    try {
      const created = await createShelter(newShelterData);
      setSheltersList((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      setIsAddingShelter(false);
      setNewShelterForm({
        name: "",
        area: "",
        capacity: 150,
        occupied: 0,
        phone: "",
        lat: "",
        lng: "",
        facilities: [],
        needs: "",
        image: "shelter-1",
      });
      toast.success("New Shelter Added to RescueLink!", {
        description: `${created.name} is now visible across the live network and map.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create shelter";
      toast.error("Creation error", { description: msg });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Signed out successfully");
      navigate({ to: "/login", replace: true });
    } catch {
      toast.error("Error signing out");
    }
  };

  // Loading & Unauthorized View
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
        <TopBar title="Admin Portal" back="/" />
        <div className="px-5 pt-12 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h1 className="mt-6 text-[22px] font-extrabold text-navy">Access Denied</h1>
          <p className="mx-auto mt-2 max-w-[320px] text-xs leading-relaxed text-muted-foreground">
            You are signed in as{" "}
            <span className="font-semibold text-foreground">{profile?.email || "Citizen"}</span>{" "}
            with role{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-bold uppercase">
              {profile?.role || "user"}
            </code>
            . This portal is strictly restricted to authorized RescueLink administrators.
          </p>
          <div className="mt-8 space-y-2.5">
            <Link
              to="/"
              className="press flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-navy text-sm font-bold text-white shadow-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Safe Citizen Dashboard</span>
            </Link>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* -------------------- TAB 1: HOME DASHBOARD -------------------- */}
      {currentTab === "home" && (
        <>
          <TopBar
            title="Admin Dashboard"
            subtitle="Central Command · RescueLink Bangladesh"
            hideBack
            right={
              <button
                type="button"
                onClick={() => {
                  fetchUsers();
                  loadLocalData();
                  toast.success("Data refreshed");
                }}
                disabled={loadingUsers}
                aria-label="Refresh Dashboard"
                className="press grid h-10 w-10 place-items-center rounded-full bg-muted text-navy"
              >
                <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
              </button>
            }
          />

          <div className="space-y-4 px-4 pt-4">
            {/* Admin Identity Card */}
            <Card className="border-navy/20 bg-navy text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-white">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] font-extrabold leading-tight">
                        {profile?.displayName || "System Administrator"}
                      </p>
                      <span className="rounded-full bg-safe/25 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                        Admin
                      </span>
                    </div>
                    <p className="text-xs text-white/70">
                      {profile?.email || "admin@rescuelink.org"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {sosSubscriptionError ? (
                    <button
                      type="button"
                      onClick={handleRetrySosSubscription}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/30 transition-colors"
                      title="Click to reconnect emergency feed"
                    >
                      <AlertTriangle className="h-3 w-3 text-amber-300 shrink-0" />
                      Feed Paused · Retry
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Live Ops
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Status Bar */}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center text-xs">
                <div>
                  <p className="text-lg font-black text-rose-300">{activeSosCount}</p>
                  <p className="text-[10.5px] text-white/70">Active SOS</p>
                </div>
                <div>
                  <p className="text-lg font-black text-amber-200">{pendingApplicants.length}</p>
                  <p className="text-[10.5px] text-white/70">Pending Vol.</p>
                </div>
                <div>
                  <p className="text-lg font-black text-emerald-300">{totalAvailableBeds}</p>
                  <p className="text-[10.5px] text-white/70">Free Beds</p>
                </div>
              </div>
            </Card>

            {/* Urgent Attention Banners */}
            {activeSosCount > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3.5 text-primary">
                <div className="flex items-center gap-2.5">
                  <Siren className="h-5 w-5 shrink-0 animate-bounce" />
                  <div className="text-xs">
                    <p className="font-extrabold">
                      {activeSosCount} SOS Emergenc{activeSosCount === 1 ? "y" : "ies"} Need
                      Dispatch!
                    </p>
                    <p className="text-[11px] text-primary/80">
                      Citizens waiting for response unit deployment.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("sos")}
                  className="press shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs"
                >
                  Dispatch
                </button>
              </div>
            )}

            {pendingApplicants.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn/15 p-3.5 text-warn-foreground">
                <div className="flex items-center gap-2.5">
                  <Users className="h-5 w-5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-extrabold">
                      {pendingApplicants.length} Volunteer Application
                      {pendingApplicants.length === 1 ? "" : "s"} Pending
                    </p>
                    <p className="text-[11px] opacity-80">
                      Review applicant skills and verify credentials.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("volunteers", "pending")}
                  className="press shrink-0 rounded-xl bg-navy px-3 py-1.5 text-xs font-bold text-white shadow-xs"
                >
                  Review
                </button>
              </div>
            )}

            {/* Comprehensive KPI Metric Cards */}
            <div>
              <SectionHeader title="System Response & Operations" />
              <div className="grid grid-cols-2 gap-2.5">
                {/* Total SOS */}
                <button
                  type="button"
                  aria-label="View SOS Requests Dashboard"
                  onClick={() => setTab("sos")}
                  className="press rounded-2xl border border-border/70 bg-card p-3.5 text-left shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Siren className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold text-primary">Live</span>
                  </div>
                  <p className="mt-2 text-2xl font-black text-navy">{sosRequests.length}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Total SOS Requests</p>
                  <p className="mt-1 text-[10.5px] text-navy/70">
                    {activeSosCount} active · {assignedSosCount} assigned
                  </p>
                </button>

                {/* Volunteers */}
                <button
                  type="button"
                  aria-label="View Volunteers Directory"
                  onClick={() => setTab("volunteers")}
                  className="press rounded-2xl border border-border/70 bg-card p-3.5 text-left shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-safe/10 text-safe">
                      <Users className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold text-safe">Approved</span>
                  </div>
                  <p className="mt-2 text-2xl font-black text-navy">{approvedVolunteers.length}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Active Volunteers</p>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">
                    +{pendingApplicants.length} pending review
                  </p>
                </button>

                {/* Shelters */}
                <button
                  type="button"
                  aria-label="View Shelters Directory"
                  onClick={() => setTab("shelters")}
                  className="press rounded-2xl border border-border/70 bg-card p-3.5 text-left shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-info/10 text-info">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold text-info">Beds</span>
                  </div>
                  <p className="mt-2 text-2xl font-black text-navy">{totalAvailableBeds}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Available Beds</p>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">
                    {sheltersList.length} registered shelters
                  </p>
                </button>

                {/* Citizens Registered */}
                <button
                  type="button"
                  aria-label="View Registered Citizens"
                  onClick={() => navigate({ to: "/admin/citizens" })}
                  className="press rounded-2xl border border-border/70 bg-card p-3.5 text-left shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-navy/10 text-navy">
                      <User className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold text-navy">Accounts</span>
                  </div>
                  <p className="mt-2 text-2xl font-black text-navy">{registeredCitizens.length}</p>
                  <p className="text-xs font-semibold text-muted-foreground">Registered Citizens</p>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">
                    ৳{totalDonationsAmount.toLocaleString()} donated
                  </p>
                </button>
              </div>
            </div>

            {/* Urgent Active Emergencies Stream */}
            <div className="pt-2">
              <div className="flex items-center justify-between pb-2.5">
                <h3 className="text-sm font-bold text-navy">Urgent Active Emergencies</h3>
                <button
                  type="button"
                  onClick={() => setTab("sos")}
                  className="text-xs font-semibold text-info hover:underline"
                >
                  View All ({sosRequests.length})
                </button>
              </div>

              {sosSubscriptionError && (
                <div
                  role="alert"
                  className="mb-2.5 flex items-center justify-between gap-2 rounded-2xl border border-warn/30 bg-warn/10 p-2.5 text-xs text-navy"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
                    <span className="truncate">{sosSubscriptionError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetrySosSubscription}
                    className="press shrink-0 rounded-xl bg-warn px-2.5 py-1 text-[11px] font-bold text-white hover:bg-warn/90 shadow-xs"
                  >
                    Reconnect
                  </button>
                </div>
              )}

              {sosRequests.filter((s) => s.status === "active" || s.status === "assigned")
                .length === 0 ? (
                <Card className="py-6 text-center">
                  <CheckCircle2 className="mx-auto h-7 w-7 text-safe" />
                  <p className="mt-1.5 text-sm font-bold text-navy">No Active Emergency Calls</p>
                  <p className="text-xs text-muted-foreground">
                    All emergency calls are safely resolved or standby.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {sosRequests
                    .filter((s) => s.status === "active" || s.status === "assigned")
                    .slice(0, 3)
                    .map((sos) => (
                      <Card key={sos.id} className="border-primary/20 p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-navy truncate">
                                {sos.userName || "Citizen"}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase shrink-0 ${
                                  sos.status === "active"
                                    ? "bg-primary text-primary-foreground animate-pulse"
                                    : "bg-warn/25 text-warn-foreground"
                                }`}
                              >
                                {sos.status}
                              </span>
                              {sos.createdAt && (
                                <span
                                  className="flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground ml-auto shrink-0"
                                  title={formatSosFull(sos.createdAt)}
                                >
                                  <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span>{formatSosTimeAgo(sos.createdAt)}</span>
                                </span>
                              )}
                            </div>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="truncate">{sos.location?.address}</span>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (sos.status === "active") {
                                handleOpenDispatch(sos);
                              } else {
                                setTab("sos");
                              }
                            }}
                            className="press shrink-0 rounded-xl bg-navy px-3 py-1.5 text-xs font-bold text-white shadow-xs"
                          >
                            {sos.status === "active" ? "Dispatch" : "Track"}
                          </button>
                        </div>
                      </Card>
                    ))}
                </div>
              )}
            </div>

            {/* Quick Action Shortcuts */}
            <div className="pt-2">
              <SectionHeader title="Administrative Quick Actions" />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigate({ to: "/admin/alerts", search: { create: true } });
                  }}
                  className="press flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-xs"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn/15 text-warn-foreground">
                    <Bell className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-navy">Broadcast Alert</p>
                    <p className="truncate text-[10.5px] text-muted-foreground">Public Warning</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTab("shelters");
                    setIsAddingShelter(true);
                  }}
                  className="press flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-xs"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-info/15 text-info">
                    <Plus className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-navy">Add Shelter</p>
                    <p className="truncate text-[10.5px] text-muted-foreground">Capacity Intake</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* -------------------- TAB 2: VOLUNTEERS -------------------- */}
      {currentTab === "volunteers" && (
        <>
          <TopBar
            title="Volunteers"
            subtitle="Application review & team dispatch"
            back={{ to: "/admin", search: { tab: "home" } }}
            onBack={() => setTab("home")}
            right={
              <button
                type="button"
                onClick={fetchUsers}
                disabled={loadingUsers}
                aria-label="Refresh volunteers"
                className="press grid h-10 w-10 place-items-center rounded-full bg-muted text-navy"
              >
                <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
              </button>
            }
          />

          <div className="px-4 pt-4">
            {/* Sub-tab toggle pills */}
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted/70 p-1">
              <button
                type="button"
                onClick={() => setVolunteerSubTab("pending")}
                className={`press flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-colors ${
                  volunteerSubTab === "pending"
                    ? "bg-navy text-white shadow-xs"
                    : "text-muted-foreground hover:text-navy"
                }`}
              >
                <span>Pending Applications</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
                  {pendingApplicants.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVolunteerSubTab("approved")}
                className={`press flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-colors ${
                  volunteerSubTab === "approved"
                    ? "bg-safe text-white shadow-xs"
                    : "text-muted-foreground hover:text-navy"
                }`}
              >
                <span>Approved Active</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
                  {approvedVolunteers.length}
                </span>
              </button>
            </div>

            {/* Search Input for Approved Volunteers */}
            {volunteerSubTab === "approved" && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-xs">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, area, or skills..."
                  value={volunteerSearch}
                  onChange={(e) => setVolunteerSearch(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
              </div>
            )}
          </div>

          <div className="px-4 pt-4 space-y-3">
            {volunteerSubTab === "pending" ? (
              /* Pending Volunteer Applications */
              loadingUsers ? (
                <Card className="py-12 text-center space-y-2">
                  <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-navy border-t-transparent" />
                  <p className="text-xs text-muted-foreground">Loading volunteer applications...</p>
                </Card>
              ) : usersError ? (
                <Card className="py-10 text-center space-y-3 border-destructive/20 bg-destructive/5">
                  <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
                  <div>
                    <p className="text-sm font-bold text-destructive">
                      Failed to Load Applications
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{usersError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchUsers()}
                    className="press mx-auto inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 text-xs font-bold text-white shadow-xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry Directory</span>
                  </button>
                </Card>
              ) : pendingApplicants.length === 0 ? (
                <Card className="py-12 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-safe" />
                  <p className="mt-2 text-sm font-bold text-navy">All Applications Reviewed</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    There are currently no volunteer applications waiting for admin approval.
                  </p>
                </Card>
              ) : (
                pendingApplicants.map((applicant) => {
                  const identityStatus =
                    applicant.volunteerApplication?.identityVerificationStatus ??
                    (applicant.volunteerApplication?.nidMasked ? "pending" : "verified");
                  const isIdentityVerified = identityStatus === "verified";
                  const isIdentityRejected = identityStatus === "rejected";
                  const isIdentityPending = identityStatus === "pending";

                  return (
                    <Card key={applicant.uid} className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-navy">{applicant.displayName}</p>
                          <p className="text-xs text-muted-foreground">{applicant.email}</p>
                          {applicant.phone && (
                            <a
                              href={`tel:${toDialablePhone(applicant.phone)}`}
                              className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-info"
                            >
                              <Phone className="h-3 w-3" />
                              {applicant.phone}
                            </a>
                          )}
                          <p className="mt-1 text-[11px] font-medium text-navy/80">
                            📍 {applicant.area || "Dhaka"} · Applied{" "}
                            {new Date(applicant.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="rounded-full bg-warn/20 px-2.5 py-1 text-[10px] font-bold uppercase text-warn-foreground">
                            Application Pending
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                              isIdentityVerified
                                ? "bg-safe/15 text-safe"
                                : isIdentityRejected
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-warn/15 text-warn-foreground"
                            }`}
                          >
                            {isIdentityVerified
                              ? "Identity Verified"
                              : isIdentityRejected
                                ? "Identity Rejected"
                                : "Identity Pending"}
                          </span>
                        </div>
                      </div>

                      {/* NID & Age Details (Manual Verification) */}
                      {applicant.volunteerApplication &&
                        (applicant.volunteerApplication.dateOfBirth ||
                          applicant.volunteerApplication.nidMasked) && (
                          <div className="rounded-xl border border-border/70 bg-surface/80 p-2.5 text-xs space-y-1">
                            <p className="font-bold text-navy text-[11.5px]">
                              Applicant Eligibility & Identity:
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-navy/80">
                              {applicant.volunteerApplication.dateOfBirth && (
                                <div>
                                  <span className="text-muted-foreground">DOB: </span>
                                  <span className="font-semibold">
                                    {applicant.volunteerApplication.dateOfBirth}
                                  </span>
                                </div>
                              )}
                              {applicant.volunteerApplication.age !== undefined && (
                                <div>
                                  <span className="text-muted-foreground">Age: </span>
                                  <span className="font-semibold">
                                    {applicant.volunteerApplication.age} yrs
                                  </span>
                                </div>
                              )}
                              {applicant.volunteerApplication.nidMasked && (
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">NID Number: </span>
                                  <span className="font-mono font-bold tracking-wider">
                                    {applicant.volunteerApplication.nidMasked}
                                  </span>
                                </div>
                              )}
                            </div>
                            {applicant.volunteerApplication.identityVerifiedAt && (
                              <p className="text-[10px] text-muted-foreground pt-0.5">
                                Identity checked:{" "}
                                {new Date(
                                  applicant.volunteerApplication.identityVerifiedAt,
                                ).toLocaleDateString()}
                              </p>
                            )}
                            {applicant.volunteerApplication.identityRejectionReason && (
                              <p className="text-[10.5px] text-destructive italic">
                                Rejection note: "
                                {applicant.volunteerApplication.identityRejectionReason}"
                              </p>
                            )}
                          </div>
                        )}

                      {/* Skills & Notes */}
                      {applicant.volunteerApplication && (
                        <div className="rounded-xl bg-muted/60 p-2.5 text-xs">
                          <p className="font-semibold text-navy">Specialties & Skills:</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {applicant.volunteerApplication.skills?.map((skill) => (
                              <span
                                key={skill}
                                className="rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-semibold text-navy"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                          {applicant.volunteerApplication.notes && (
                            <p className="mt-2 text-[11.5px] italic text-muted-foreground">
                              "{applicant.volunteerApplication.notes}"
                            </p>
                          )}
                        </div>
                      )}

                      {/* Step 1: Identity Verification Actions (if pending) */}
                      {isIdentityPending && (
                        <div className="rounded-xl border border-warn/30 bg-warn/5 p-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-navy">
                              Step 1: Manual Identity Verification
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Review NID & DOB
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={processingUid === applicant.uid}
                              onClick={() => handleIdentityDecision(applicant.uid, true)}
                              className="press flex h-8 items-center justify-center gap-1.5 rounded-lg bg-navy/90 text-[11px] font-bold text-white shadow-xs disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-safe" />
                              <span>Verify Identity</span>
                            </button>
                            <button
                              type="button"
                              disabled={processingUid === applicant.uid}
                              onClick={() => setRejectingIdentityUid(applicant.uid)}
                              className="press flex h-8 items-center justify-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 text-[11px] font-bold text-destructive disabled:opacity-60"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Reject Identity</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Step 2: Volunteer Approval Actions */}
                      <div className="space-y-1 pt-1">
                        {!isIdentityVerified && (
                          <p className="text-[10px] text-muted-foreground italic text-center">
                            {isIdentityRejected
                              ? "Identity rejected. Cannot approve as volunteer."
                              : "Verify applicant identity before approving volunteer permissions."}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={processingUid === applicant.uid || !isIdentityVerified}
                            onClick={() => handleDecision(applicant.uid, true)}
                            title={
                              !isIdentityVerified ? "Verify identity first" : "Approve volunteer"
                            }
                            className="press flex h-10 items-center justify-center gap-1.5 rounded-xl bg-safe text-xs font-bold text-white shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Approve Volunteer</span>
                          </button>
                          <button
                            type="button"
                            disabled={processingUid === applicant.uid}
                            onClick={() => {
                              setRejectingUid(applicant.uid);
                            }}
                            className="press flex h-10 items-center justify-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/10 text-xs font-bold text-destructive disabled:opacity-60"
                          >
                            <XCircle className="h-4 w-4" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )
            ) : /* Approved Active Volunteers */
            loadingUsers ? (
              <Card className="py-12 text-center space-y-2">
                <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-navy border-t-transparent" />
                <p className="text-xs text-muted-foreground">Loading active volunteers...</p>
              </Card>
            ) : usersError ? (
              <Card className="py-10 text-center space-y-3 border-destructive/20 bg-destructive/5">
                <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
                <div>
                  <p className="text-sm font-bold text-destructive">Failed to Load Volunteers</p>
                  <p className="mt-1 text-xs text-muted-foreground">{usersError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => fetchUsers()}
                  className="press mx-auto inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 text-xs font-bold text-white shadow-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry Directory</span>
                </button>
              </Card>
            ) : approvedVolunteers.filter((v) => {
                const q = volunteerSearch.toLowerCase().trim();
                if (!q) return true;
                return (
                  v.displayName.toLowerCase().includes(q) ||
                  (v.area && v.area.toLowerCase().includes(q)) ||
                  (v.email && v.email.toLowerCase().includes(q))
                );
              }).length === 0 ? (
              <Card className="py-12 text-center">
                <Users className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-sm font-bold text-navy">No Approved Volunteers</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  There are currently no approved community volunteers matching the search criteria.
                </p>
              </Card>
            ) : (
              approvedVolunteers
                .filter((v) => {
                  const q = volunteerSearch.toLowerCase().trim();
                  if (!q) return true;
                  return (
                    v.displayName.toLowerCase().includes(q) ||
                    (v.area && v.area.toLowerCase().includes(q)) ||
                    (v.email && v.email.toLowerCase().includes(q))
                  );
                })
                .map((volunteer) => (
                  <Card key={volunteer.uid} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-navy">{volunteer.displayName}</p>
                          <span className="rounded-full bg-safe/15 px-2 py-0.5 text-[10px] font-bold text-safe">
                            Active Responder
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{volunteer.email}</p>
                        <p className="mt-1 text-[11px] font-medium text-navy/70">
                          📍 {volunteer.area || "Dhaka, Bangladesh"}
                        </p>
                      </div>

                      {volunteer.phone && (
                        <a
                          href={`tel:${toDialablePhone(volunteer.phone)}`}
                          aria-label={`Call ${volunteer.displayName}`}
                          className="press grid h-9 w-9 place-items-center rounded-xl bg-safe text-white shadow-xs"
                        >
                          <Phone className="h-4 w-4" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-muted/40 p-2 text-xs">
                      <span className="text-muted-foreground">Emergency Readiness:</span>
                      <span className="font-bold text-safe">Standby · Rapid Response</span>
                    </div>
                  </Card>
                ))
            )}
          </div>
        </>
      )}

      {/* -------------------- TAB 3: SOS MANAGEMENT -------------------- */}
      {currentTab === "sos" && (
        <>
          <TopBar
            title="SOS Emergency Control"
            subtitle="Incident dispatch & status coordination"
            back={{ to: "/admin", search: { tab: "home" } }}
            onBack={() => setTab("home")}
            right={
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-extrabold text-primary">
                {activeSosCount} Active
              </span>
            }
          />

          <div className="space-y-3 px-4 pt-4">
            {/* Status Filter Chips */}
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto py-1">
              {(["all", "active", "assigned", "resolved", "cancelled"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSosStatusFilter(st)}
                  className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold capitalize transition-colors ${
                    sosStatusFilter === st
                      ? "bg-navy text-white shadow-xs"
                      : "bg-muted text-muted-foreground hover:text-navy"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-xs">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search citizen name, phone, address..."
                value={sosSearch}
                onChange={(e) => setSosSearch(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
            </div>
          </div>

          <div className="px-4 pt-4 space-y-3 pb-6">
            {sosSubscriptionError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-2xl border border-warn/30 bg-warn/10 p-3 text-xs text-navy"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
                  <span className="truncate">{sosSubscriptionError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRetrySosSubscription}
                  className="press shrink-0 rounded-xl bg-warn px-2.5 py-1 text-[11px] font-bold text-white hover:bg-warn/90 shadow-xs"
                >
                  Reconnect
                </button>
              </div>
            )}

            {sosRequests
              .filter((s) => (sosStatusFilter === "all" ? true : s.status === sosStatusFilter))
              .filter((s) => {
                const q = sosSearch.toLowerCase().trim();
                if (!q) return true;
                return (
                  s.userName?.toLowerCase().includes(q) ||
                  s.userPhone?.toLowerCase().includes(q) ||
                  s.location?.address.toLowerCase().includes(q)
                );
              }).length === 0 ? (
              <Card className="py-12 text-center">
                <ShieldCheck className="mx-auto h-9 w-9 text-safe" />
                <p className="mt-2 text-sm font-bold text-navy">No SOS Incidents Found</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  No emergency calls match the selected filter.
                </p>
              </Card>
            ) : (
              sosRequests
                .filter((s) => (sosStatusFilter === "all" ? true : s.status === sosStatusFilter))
                .filter((s) => {
                  const q = sosSearch.toLowerCase().trim();
                  if (!q) return true;
                  return (
                    s.userName?.toLowerCase().includes(q) ||
                    s.userPhone?.toLowerCase().includes(q) ||
                    s.location?.address.toLowerCase().includes(q)
                  );
                })
                .map((sos) => (
                  <Card key={sos.id} className="space-y-3 border-primary/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                          <Siren className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-navy truncate">
                            {sos.userName || "Citizen"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {sos.userPhone || sos.userEmail || "Emergency Broadcast"}
                          </p>
                          {sos.createdAt && (
                            <p
                              className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                              title={formatSosFull(sos.createdAt)}
                            >
                              <Clock className="h-3 w-3 text-primary/70 shrink-0" />
                              <span className="font-semibold text-navy/80">
                                {formatSosTimeAgo(sos.createdAt)}
                              </span>
                              <span className="text-muted-foreground/75">
                                · {formatSosAbsolute(sos.createdAt)}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                          sos.status === "active"
                            ? "bg-primary text-primary-foreground animate-pulse"
                            : sos.status === "assigned"
                              ? "bg-warn text-warn-foreground font-black"
                              : sos.status === "resolved"
                                ? "bg-safe/20 text-safe font-black"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {sos.status}
                      </span>
                    </div>

                    {/* Reported Location & Coordinates */}
                    <div className="rounded-xl bg-muted/60 p-2.5 text-xs text-navy/90 space-y-1">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{sos.location?.address || "Address not provided"}</span>
                      </p>
                      {typeof sos.location?.lat === "number" &&
                      typeof sos.location?.lng === "number" ? (
                        <p className="text-[11px] text-muted-foreground">
                          GPS: {sos.location.lat.toFixed(5)}, {sos.location.lng.toFixed(5)} (
                          {typeof sos.location.accuracyMeters === "number"
                            ? `±${sos.location.accuracyMeters} m`
                            : sos.location.accuracy || "accuracy unknown"}
                          )
                        </p>
                      ) : (
                        <p className="text-[11px] font-semibold text-warn-foreground">
                          Approximate address typed by the requester — no GPS
                        </p>
                      )}
                      {sos.message && (
                        <p className="pt-1 text-[11.5px] italic text-muted-foreground">
                          "{sos.message}"
                        </p>
                      )}
                      {sos.assignedResponder && (
                        <div className="mt-2 rounded-lg bg-safe/15 p-2 text-[11.5px] font-bold text-safe">
                          🚑 Dispatched: {sos.assignedResponder.unit} · ETA{" "}
                          {sos.assignedResponder.eta}
                        </div>
                      )}
                    </div>

                    {/* Action Controls */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {sos.userPhone ? (
                        <a
                          href={`tel:${toDialablePhone(sos.userPhone)}`}
                          className="press flex h-10 items-center justify-center gap-1 rounded-xl bg-safe text-xs font-bold text-white shadow-xs"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span>Call</span>
                        </a>
                      ) : (
                        <div className="flex h-10 items-center justify-center rounded-xl bg-muted text-[11px] font-semibold text-muted-foreground">
                          No Phone
                        </div>
                      )}

                      {sos.status === "active" ? (
                        <button
                          type="button"
                          disabled={processingSosId === sos.id}
                          onClick={() => handleOpenDispatch(sos)}
                          className="press col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-navy text-xs font-bold text-white shadow-xs disabled:opacity-60"
                        >
                          <Radio className="h-3.5 w-3.5" />
                          <span>Dispatch Responder</span>
                        </button>
                      ) : sos.status === "assigned" ? (
                        <button
                          type="button"
                          disabled={processingSosId === sos.id}
                          onClick={() => handleResolveSos(sos.id!)}
                          className="press col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-safe text-xs font-bold text-white shadow-xs disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Mark Resolved</span>
                        </button>
                      ) : (
                        <div className="col-span-2 flex flex-col items-center justify-center rounded-xl bg-muted/60 text-[11px] font-medium text-muted-foreground p-1 text-center">
                          <span>
                            {sos.status === "resolved"
                              ? "Resolved Incident"
                              : sos.status === "cancelled"
                                ? "Cancelled Incident"
                                : "Archived Incident"}
                          </span>
                          {sos.status === "resolved" && sos.resolvedAt ? (
                            <span className="text-[10px] text-muted-foreground/75">
                              {formatSosTimeAgo(sos.resolvedAt)}
                            </span>
                          ) : sos.status === "cancelled" && sos.cancelledAt ? (
                            <span className="text-[10px] text-muted-foreground/75">
                              {formatSosTimeAgo(sos.cancelledAt)}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Secondary Actions: Open Map / Cancel */}
                    {sos.status !== "resolved" && sos.status !== "cancelled" && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px]">
                        {typeof sos.location?.lat === "number" &&
                        typeof sos.location?.lng === "number" ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${sos.location.lat},${sos.location.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-info hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Open Navigation Map</span>
                          </a>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          disabled={processingSosId === sos.id}
                          onClick={() => handleCancelSos(sos.id!)}
                          className="font-medium text-destructive hover:underline"
                        >
                          Cancel Alert
                        </button>
                      </div>
                    )}
                  </Card>
                ))
            )}
          </div>
        </>
      )}

      {/* -------------------- TAB 4: SHELTERS -------------------- */}
      {currentTab === "shelters" && (
        <>
          <TopBar
            title="Shelters"
            subtitle="Occupancy intake & capacity tracking"
            back={{ to: "/admin", search: { tab: "home" } }}
            onBack={() => setTab("home")}
            right={
              <button
                type="button"
                onClick={() => setIsAddingShelter(true)}
                className="press flex items-center gap-1 rounded-xl bg-navy px-3 py-1.5 text-xs font-bold text-white shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Shelter</span>
              </button>
            }
          />

          <div className="space-y-3 px-4 pt-4">
            {/* Shelter Summary Bar */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/70 p-3 text-center text-xs">
              <div>
                <p className="text-base font-black text-navy">{sheltersList.length}</p>
                <p className="text-[10.5px] text-muted-foreground">Total Shelters</p>
              </div>
              <div>
                <p className="text-base font-black text-navy">{totalShelterCapacity}</p>
                <p className="text-[10.5px] text-muted-foreground">Max Capacity</p>
              </div>
              <div>
                <p className="text-base font-black text-safe">{totalAvailableBeds}</p>
                <p className="text-[10.5px] text-muted-foreground">Available Beds</p>
              </div>
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-xs">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search shelter name or area..."
                value={shelterSearch}
                onChange={(e) => setShelterSearch(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
            </div>
          </div>

          <div className="px-4 pt-4 space-y-3 pb-6">
            {sheltersList
              .filter((s) => {
                const q = shelterSearch.toLowerCase().trim();
                if (!q) return true;
                return s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q);
              })
              .map((s) => {
                const available = Math.max(0, s.capacity - s.occupied);
                const pct = Math.round((s.occupied / (s.capacity || 1)) * 100);
                return (
                  <Card key={s.id} className="p-0 overflow-hidden">
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold text-navy">{s.name}</p>
                            {s.isLocal && (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                Local Fallback
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {s.area} · {s.phone}
                          </p>
                        </div>
                        <Pill tone={s.status}>{s.status}</Pill>
                      </div>

                      {/* Progress & Stats */}
                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1">
                          <span>
                            {s.occupied} / {s.capacity} Occupied
                          </span>
                          <span className="font-bold text-navy">
                            {available} free beds ({pct}%)
                          </span>
                        </div>
                        <OccupancyBar value={pct} tone={s.status} />
                      </div>

                      {/* Facilities */}
                      <div className="flex flex-wrap gap-1">
                        {(s.facilities || []).map((f) => (
                          <span
                            key={f}
                            className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
                          >
                            {f}
                          </span>
                        ))}
                      </div>

                      {/* Shelter Actions */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => handleOpenEditShelter(s)}
                          className="press flex h-9 items-center justify-center gap-1 rounded-xl bg-navy text-xs font-bold text-white shadow-xs"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <Link
                          to="/shelters/$shelterId"
                          params={{ shelterId: s.id }}
                          className="press flex h-9 items-center justify-center rounded-xl bg-muted text-xs font-bold text-navy"
                        >
                          Citizen View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeletingShelter(s)}
                          className="press flex h-9 items-center justify-center gap-1 rounded-xl bg-destructive/10 text-xs font-bold text-destructive hover:bg-destructive/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
        </>
      )}

      {/* -------------------- TAB 5: MORE (ADDITIONAL OPTIONS) -------------------- */}
      {currentTab === "more" && (
        <>
          <TopBar
            title="More Options"
            subtitle="Disaster alerts, donations & system configuration"
            back={{ to: "/admin", search: { tab: "home" } }}
            onBack={() => setTab("home")}
          />

          <div className="px-4 pt-4 space-y-4 pb-6">
            {/* 4 Full-Width Menu Cards Stacked Vertically */}
            <div className="flex flex-col gap-3">
              {/* 1. Disaster Alerts */}
              <Link
                to="/admin/alerts"
                className="press flex w-full items-center justify-between rounded-2xl border border-border/70 bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-navy/30"
              >
                <div className="flex items-center gap-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn-foreground">
                    <Bell className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy">Disaster Alerts</p>
                    <p className="text-xs text-muted-foreground">Broadcast & Manage</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>

              {/* 2. Donations */}
              <Link
                to="/admin/donations"
                className="press flex w-full items-center justify-between rounded-2xl border border-border/70 bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-navy/30"
              >
                <div className="flex items-center gap-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-safe/15 text-safe">
                    <HandCoins className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy">Donations</p>
                    <p className="text-xs text-muted-foreground">Relief Ledger</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>

              {/* 3. Citizens Directory */}
              <Link
                to="/admin/citizens"
                className="press flex w-full items-center justify-between rounded-2xl border border-border/70 bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-navy/30"
              >
                <div className="flex items-center gap-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-navy/10 text-navy">
                    <Users className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy">Citizens Directory</p>
                    <p className="text-xs text-muted-foreground">Registered Users</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>

              {/* 4. System Reports */}
              <Link
                to="/admin/reports"
                className="press flex w-full items-center justify-between rounded-2xl border border-border/70 bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-navy/30"
              >
                <div className="flex items-center gap-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-info/15 text-info">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy">System Reports</p>
                    <p className="text-xs text-muted-foreground">Response Metrics</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            </div>

            {/* Admin Settings & Sign Out */}
            <div className="pt-4 border-t border-border/70 space-y-3">
              <SectionHeader title="Admin Account & Security" />
              <Card className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy/10 text-navy">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-navy">Super Administrator</p>
                    <p className="text-[11px] text-muted-foreground">admin@rescuelink.org</p>
                  </div>
                </div>
                <Link
                  to="/"
                  className="press rounded-xl bg-muted px-3 py-1.5 text-xs font-bold text-navy"
                >
                  Citizen View
                </Link>
              </Card>

              <button
                type="button"
                onClick={handleLogout}
                className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 text-xs font-bold text-destructive shadow-xs"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out from Admin Session</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* -------------------- MODAL: DISPATCH RESPONDER UNIT -------------------- */}
      {dispatchModalSos && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-[400px] rounded-3xl bg-surface p-5 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-extrabold text-navy">Deploy Emergency Unit</h3>
              </div>
              <button
                type="button"
                aria-label="Close dispatch modal"
                onClick={() => setDispatchModalSos(null)}
                className="press rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <div className="rounded-xl bg-muted/60 p-2.5 text-xs">
                <p className="font-bold text-navy">{dispatchModalSos.userName}</p>
                <p className="text-muted-foreground">{dispatchModalSos.location?.address}</p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">Select Response Unit:</label>
                <select
                  value={selectedResponderId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedResponderId(val);
                    const matchedVol = approvedVolunteers.find((v) => v.uid === val);
                    if (matchedVol) {
                      setSelectedUnit(`Volunteer: ${matchedVol.displayName}`);
                    } else {
                      setSelectedUnit("General Emergency Services");
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-xs font-medium text-navy outline-none"
                >
                  <option value="">General Emergency Services (Unassigned)</option>
                  {approvedVolunteers.length > 0 ? (
                    <optgroup label="Verified Community Volunteers">
                      {approvedVolunteers.map((v) => (
                        <option key={v.uid} value={v.uid}>
                          Volunteer: {v.displayName} ({v.area || "Dhaka"})
                        </option>
                      ))}
                    </optgroup>
                  ) : (
                    <option disabled value="__none">
                      No approved volunteers available
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">
                  Estimated Arrival Time (ETA):
                </label>
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {["3 mins", "5 mins", "10 mins", "15 mins"].map((eta) => (
                    <button
                      key={eta}
                      type="button"
                      onClick={() => setSelectedEta(eta)}
                      className={`press rounded-xl py-2 text-xs font-bold ${
                        selectedEta === eta
                          ? "bg-navy text-white shadow-xs"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {eta}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDispatchModalSos(null)}
                  className="press h-10 rounded-xl bg-muted text-xs font-bold text-navy"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingSosId !== null}
                  onClick={handleConfirmDispatch}
                  className="press h-10 rounded-xl bg-primary text-xs font-bold text-white shadow-xs disabled:opacity-60"
                >
                  Confirm Dispatch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: EDIT SHELTER (PHASE 4 COMPLETE CRUD) -------------------- */}
      {editingShelter && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-[420px] rounded-3xl bg-surface p-5 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-navy" />
                <h3 className="text-sm font-extrabold text-navy">Edit Emergency Shelter</h3>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                disabled={isSavingEdit}
                onClick={() => setEditingShelter(null)}
                className="press rounded-full p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2.5 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-navy truncate">ID: {editingShelter.id}</p>
                {editingShelter.isLocal && (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Local Fallback
                  </span>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">Shelter Name *</label>
                <input
                  type="text"
                  value={shelterEditForm.name}
                  onChange={(e) =>
                    setShelterEditForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Mirpur Shelter Center"
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">Area / Address *</label>
                <input
                  type="text"
                  value={shelterEditForm.area}
                  onChange={(e) =>
                    setShelterEditForm((prev) => ({ ...prev, area: e.target.value }))
                  }
                  placeholder="e.g. Mirpur 10, Dhaka"
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-navy">Total Bed Capacity *</label>
                  <input
                    type="number"
                    min="1"
                    value={shelterEditForm.capacity}
                    onChange={(e) =>
                      setShelterEditForm((prev) => ({
                        ...prev,
                        capacity: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-navy">Current Occupancy *</label>
                  <input
                    type="number"
                    min="0"
                    value={shelterEditForm.occupied}
                    onChange={(e) =>
                      setShelterEditForm((prev) => ({
                        ...prev,
                        occupied: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-muted/60 p-2 text-xs text-muted-foreground flex items-center justify-between">
                <span>Calculated Availability:</span>
                <span className="font-bold text-safe">
                  {Math.max(0, shelterEditForm.capacity - shelterEditForm.occupied)} beds available
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">Helpline Phone:</label>
                <input
                  type="text"
                  value={shelterEditForm.phone}
                  onChange={(e) =>
                    setShelterEditForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="+880 1711 000 000"
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-navy">Latitude (GPS):</label>
                  <input
                    type="number"
                    step="any"
                    value={shelterEditForm.lat}
                    onChange={(e) =>
                      setShelterEditForm((prev) => ({ ...prev, lat: e.target.value }))
                    }
                    placeholder="23.7500"
                    className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-navy">Longitude (GPS):</label>
                  <input
                    type="number"
                    step="any"
                    value={shelterEditForm.lng}
                    onChange={(e) =>
                      setShelterEditForm((prev) => ({ ...prev, lng: e.target.value }))
                    }
                    placeholder="90.3800"
                    className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">Facilities Available:</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {["Food", "Water", "Beds", "Medicine", "Doctor", "Sanitation", "Power"].map(
                    (facility) => {
                      const active = shelterEditForm.facilities.includes(facility);
                      return (
                        <button
                          key={facility}
                          type="button"
                          onClick={() => {
                            setShelterEditForm((prev) => ({
                              ...prev,
                              facilities: active
                                ? prev.facilities.filter((f) => f !== facility)
                                : [...prev.facilities, facility],
                            }));
                          }}
                          className={`press rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            active
                              ? "bg-navy text-white shadow-xs"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {facility} {active && "✓"}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">
                  Urgent Supplies & Needs (comma-separated):
                </label>
                <input
                  type="text"
                  value={shelterEditForm.needs}
                  onChange={(e) =>
                    setShelterEditForm((prev) => ({ ...prev, needs: e.target.value }))
                  }
                  placeholder="e.g. Drinking water, Blankets, First Aid kits"
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">Shelter Image Template:</label>
                <select
                  value={shelterEditForm.image}
                  onChange={(e) =>
                    setShelterEditForm((prev) => ({
                      ...prev,
                      image: e.target.value as "shelter-1" | "shelter-2" | "shelter-3",
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                >
                  <option value="shelter-1">Facility 1 (Community Center)</option>
                  <option value="shelter-2">Facility 2 (School Complex)</option>
                  <option value="shelter-3">Facility 3 (Stadium / Relief Hub)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingShelter(null)}
                  className="press h-10 rounded-xl bg-muted text-xs font-bold text-navy disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={handleSaveShelter}
                  className="press flex h-10 items-center justify-center gap-1.5 rounded-xl bg-safe text-xs font-bold text-white shadow-xs disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: DELETE SHELTER CONFIRMATION (PHASE 4) -------------------- */}
      {deletingShelter && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-[400px] rounded-3xl bg-surface p-5 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                <h3 className="text-sm font-extrabold text-navy">Confirm Shelter Deletion</h3>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                disabled={isDeletingShelter}
                onClick={() => setDeletingShelter(null)}
                className="press rounded-full p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Are you sure you want to permanently delete this emergency shelter? This action
                cannot be undone.
              </p>

              <div className="rounded-2xl border border-border/70 bg-muted/40 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-navy">{deletingShelter.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {deletingShelter.status}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Location:</span>{" "}
                  {deletingShelter.area}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Authoritative ID:</span>{" "}
                  <code>shelters/{deletingShelter.id}</code>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Capacity:</span>{" "}
                  {deletingShelter.occupied} / {deletingShelter.capacity} occupied
                </p>
              </div>

              {deletingShelter.isLocal && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>Local Fallback Record Notice</span>
                  </p>
                  <p className="mt-1 text-[11px] text-amber-700 leading-relaxed">
                    This shelter is a local fallback record. Deleting will attempt to remove any
                    corresponding document from Cloud Firestore. If no remote document exists,
                    deletion will fail safely.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeletingShelter}
                  onClick={() => setDeletingShelter(null)}
                  className="press h-10 rounded-xl bg-muted text-xs font-bold text-navy disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingShelter}
                  onClick={handleDeleteShelter}
                  className="press flex h-10 items-center justify-center gap-1.5 rounded-xl bg-destructive text-xs font-bold text-white shadow-xs disabled:opacity-50"
                >
                  {isDeletingShelter ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Shelter</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: ADD NEW SHELTER -------------------- */}
      {isAddingShelter && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-[400px] rounded-3xl bg-surface p-5 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="text-sm font-extrabold text-navy">Add New Emergency Shelter</h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setIsAddingShelter(false)}
                className="press rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2.5 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div>
                <label className="text-[11px] font-bold text-navy">Shelter Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Mohammadpur Community Camp"
                  value={newShelterForm.name}
                  onChange={(e) => setNewShelterForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">Area / Address:</label>
                <input
                  type="text"
                  placeholder="e.g. Ring Road, Mohammadpur, Dhaka"
                  value={newShelterForm.area}
                  onChange={(e) => setNewShelterForm((prev) => ({ ...prev, area: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-navy">Max Capacity:</label>
                  <input
                    type="number"
                    value={newShelterForm.capacity}
                    onChange={(e) =>
                      setNewShelterForm((prev) => ({
                        ...prev,
                        capacity: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-navy">Current Occupancy:</label>
                  <input
                    type="number"
                    value={newShelterForm.occupied}
                    onChange={(e) =>
                      setNewShelterForm((prev) => ({
                        ...prev,
                        occupied: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">
                  Helpline Phone (Optional):
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +880 1711 000000"
                  value={newShelterForm.phone}
                  onChange={(e) =>
                    setNewShelterForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-navy">
                    Latitude (GPS) <span className="text-primary">*</span>:
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 23.7500"
                    value={newShelterForm.lat}
                    onChange={(e) =>
                      setNewShelterForm((prev) => ({
                        ...prev,
                        lat: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-navy">
                    Longitude (GPS) <span className="text-primary">*</span>:
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 90.3800"
                    value={newShelterForm.lng}
                    onChange={(e) =>
                      setNewShelterForm((prev) => ({
                        ...prev,
                        lng: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">
                  Urgent Supplies & Needs (Optional, comma-separated):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Drinking water, Emergency supplies, First Aid kits"
                  value={newShelterForm.needs}
                  onChange={(e) =>
                    setNewShelterForm((prev) => ({ ...prev, needs: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-navy">
                  Facility Illustration (Visual Placeholder):
                </label>
                <select
                  value={newShelterForm.image}
                  onChange={(e) =>
                    setNewShelterForm((prev) => ({
                      ...prev,
                      image: e.target.value as "shelter-1" | "shelter-2" | "shelter-3",
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-xs text-navy outline-none"
                >
                  <option value="shelter-1">Facility 1 (Community Center)</option>
                  <option value="shelter-2">Facility 2 (School Complex)</option>
                  <option value="shelter-3">Facility 3 (Stadium / Relief Hub)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingShelter(false)}
                  className="press h-10 rounded-xl bg-muted text-xs font-bold text-navy"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateShelter}
                  className="press h-10 rounded-xl bg-navy text-xs font-bold text-white shadow-xs"
                >
                  Create Shelter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: REJECT VOLUNTEER -------------------- */}
      {rejectingUid && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-[400px] rounded-3xl bg-surface p-5 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="text-sm font-extrabold text-navy">Reject Volunteer Application</h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setRejectingUid(null)}
                className="press rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Please provide an optional reason for rejecting this volunteer application.
              </p>
              <textarea
                rows={3}
                placeholder="e.g. Incomplete verification documents or out of operational zone..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-navy outline-none"
              />

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingUid(null)}
                  className="press h-10 rounded-xl bg-muted text-xs font-bold text-navy"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingUid !== null}
                  onClick={() => handleDecision(rejectingUid, false, rejectReason)}
                  className="press h-10 rounded-xl bg-destructive text-xs font-bold text-white shadow-xs disabled:opacity-60"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: REJECT IDENTITY -------------------- */}
      {rejectingIdentityUid && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-[400px] rounded-3xl bg-surface p-5 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="text-sm font-extrabold text-navy">Reject Identity Verification</h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setRejectingIdentityUid(null)}
                className="press rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Please provide an optional reason for rejecting this applicant's identity
                verification.
              </p>
              <textarea
                rows={3}
                placeholder="e.g. NID number does not match submitted name/age records..."
                value={rejectIdentityReason}
                onChange={(e) => setRejectIdentityReason(e.target.value)}
                className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-navy outline-none"
              />

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingIdentityUid(null)}
                  className="press h-10 rounded-xl bg-muted text-xs font-bold text-navy"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingUid !== null}
                  onClick={() =>
                    handleIdentityDecision(rejectingIdentityUid, false, rejectIdentityReason)
                  }
                  className="press h-10 rounded-xl bg-destructive text-xs font-bold text-white shadow-xs disabled:opacity-60"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
