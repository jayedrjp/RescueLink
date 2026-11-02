import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Bookmark,
  ChevronRight,
  HandCoins,
  HeartHandshake,
  LifeBuoy,
  Lock,
  Phone,
  PhoneCall,
  Plus,
  Settings,
  Siren,
  UserRound,
  X,
  LogOut,
  ShieldAlert,
  Info,
  ArrowRight,
  Trash2,
  Edit2,
} from "lucide-react";
import { toast } from "sonner";

import { Card, Logo, Screen, SectionHeader } from "@/components/rl";
import { useAuth } from "@/context/AuthContext";
import { getUserSosRequests, updateUserProfile } from "@/lib/firebase/firestore";
import {
  PHONE_HELP_TEXT,
  formatPhoneForDisplay,
  normalizePhone,
  isValidPhone,
  toDialablePhone,
} from "@/lib/phone";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile & Emergency Contacts — RescueLink" },
      {
        name: "description",
        content: "Manage emergency contacts, saved shelters, SOS history, and donation history.",
      },
      { property: "og:title", content: "Your Profile & Emergency Contacts — RescueLink" },
      {
        property: "og:description",
        content: "Keep trusted emergency contacts and your safety history in one place.",
      },
    ],
  }),
  component: ProfileScreen,
});

function CallbackPhoneEditor({
  uid,
  savedPhone,
  onSaved,
}: {
  uid: string;
  savedPhone: string;
  onSaved: (phone: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(savedPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setValue(savedPhone);
  }, [savedPhone, editing]);

  const save = async () => {
    const trimmed = value.trim();
    const normalized = trimmed ? normalizePhone(trimmed) : "";
    if (trimmed && !normalized) {
      setError(`That phone number is not valid. ${PHONE_HELP_TEXT}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateUserProfile(uid, { phone: normalized ?? "" });
      onSaved(normalized ?? "");
      setEditing(false);
      toast.success(normalized ? "Callback number saved" : "Callback number removed");
    } catch (err) {
      console.error("Failed to save phone:", err);
      setError("Could not save your number. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-muted/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-navy">Callback phone number</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {savedPhone
              ? formatPhoneForDisplay(savedPhone)
              : "Not set — responders cannot call you during an SOS"}
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="press shrink-0 rounded-xl bg-card px-3 py-1.5 text-xs font-bold text-navy shadow-xs"
          >
            {savedPhone ? "Edit" : "Add"}
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            type="tel"
            inputMode="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="01XXXXXXXXX"
            aria-label="Callback phone number"
            autoComplete="tel"
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] outline-none focus:border-ring"
          />
          <p className="px-1 text-[11px] text-muted-foreground">{PHONE_HELP_TEXT}</p>
          {error ? (
            <p role="alert" className="px-1 text-[12px] font-semibold text-destructive">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setError(null);
                setValue(savedPhone);
              }}
              className="press h-10 rounded-xl bg-card text-xs font-bold text-navy disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="press h-10 rounded-xl bg-navy text-xs font-bold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface EmergencyContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
}

function ProfileScreen() {
  const navigate = useNavigate();
  const {
    user,
    profile,
    isAuthenticated,
    isAdmin,
    isVolunteerApproved,
    isVolunteerPending,
    activeMode,
    setActiveMode,
    applyProfilePatch,
    logout,
  } = useAuth();

  const storageKey = user ? `rl_contacts_${user.uid}` : "rl_contacts_guest";
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {
      return [];
    }
    return [];
  });

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", relation: "", phone: "" });

  // Sync contacts when active user changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setContacts(JSON.parse(saved));
      else setContacts([]);
    } catch {
      setContacts([]);
    }
  }, [storageKey]);

  const saveContactsToStorage = (updated: EmergencyContact[]) => {
    setContacts(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // storage unavailable
    }
  };

  // Real user activity stats
  const [sosCount, setSosCount] = useState<number>(0);
  const [donationTotal, setDonationTotal] = useState<number>(0);
  const [savedSheltersCount, setSavedSheltersCount] = useState<number>(0);

  useEffect(() => {
    if (!user) {
      setSosCount(0);
      setDonationTotal(0);
      setSavedSheltersCount(0);
      return;
    }

    let isMounted = true;

    // Load actual SOS requests submitted by the signed-in user
    getUserSosRequests(user.uid).then((requests) => {
      if (isMounted) {
        setSosCount(requests.length);
      }
    });

    // Check user-specific storage for local donations and saved shelters
    try {
      const localDonations = localStorage.getItem(`rl_donations_${user.uid}`);
      if (localDonations) {
        const parsed = JSON.parse(localDonations);
        if (typeof parsed === "number") setDonationTotal(parsed);
      }
      const localSaved = localStorage.getItem(`rl_saved_shelters_${user.uid}`);
      if (localSaved) {
        const parsed = JSON.parse(localSaved);
        if (Array.isArray(parsed)) setSavedSheltersCount(parsed.length);
      }
    } catch {
      // ignore JSON parse errors
    }

    return () => {
      isMounted = false;
    };
  }, [user]);

  const addContact = () => {
    const name = form.name.trim();
    const rawPhone = form.phone.trim();
    if (!name) {
      toast.error("Please enter a contact name.");
      return;
    }
    if (!rawPhone || !isValidPhone(rawPhone)) {
      toast.error("Please enter a valid phone number (e.g. 017XXXXXXXX or +88017XXXXXXXX).");
      return;
    }
    const cleanPhone = normalizePhone(rawPhone) || rawPhone;
    const newContact: EmergencyContact = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      relation: form.relation.trim() || "Family / Friend",
      phone: cleanPhone,
    };
    const next = [...contacts, newContact];
    saveContactsToStorage(next);
    setForm({ name: "", relation: "", phone: "" });
    setAdding(false);
    toast.success("Emergency Contact Saved", {
      description: `${name} has been added to your trusted contacts.`,
    });
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", relation: "", phone: "" });

  const startEdit = (c: EmergencyContact) => {
    setEditingId(c.id);
    setEditForm({ name: c.name, relation: c.relation, phone: c.phone });
  };

  const saveEdit = () => {
    const name = editForm.name.trim();
    const rawPhone = editForm.phone.trim();
    if (!name) {
      toast.error("Please enter a contact name.");
      return;
    }
    if (!rawPhone || !isValidPhone(rawPhone)) {
      toast.error("Please enter a valid phone number (e.g. 017XXXXXXXX or +88017XXXXXXXX).");
      return;
    }
    const cleanPhone = normalizePhone(rawPhone) || rawPhone;
    const next = contacts.map((c) =>
      c.id === editingId
        ? {
            ...c,
            name,
            relation: editForm.relation.trim() || "Family / Friend",
            phone: cleanPhone,
          }
        : c,
    );
    saveContactsToStorage(next);
    setEditingId(null);
    toast.success("Emergency contact updated");
  };

  const deleteContact = (id: string) => {
    const next = contacts.filter((c) => c.id !== id);
    saveContactsToStorage(next);
    toast.success("Contact removed");
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Signed out successfully");
      navigate({ to: "/welcome", replace: true });
    } catch {
      toast.error("Error signing out");
    }
  };

  return (
    <Screen>
      <header className="flex items-center justify-between gap-3 px-4 pt-5">
        <Logo />
        <Link
          to="/permissions"
          aria-label="Settings"
          className="press grid h-11 w-11 place-items-center rounded-full bg-muted"
        >
          <Settings className="h-5 w-5 text-navy" />
        </Link>
      </header>

      {/* 1. Profile Header */}
      <div className="animate-fade-up px-4 pt-4">
        {isAuthenticated ? (
          <Card className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent text-info">
                <UserRound className="h-8 w-8" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[18px] font-extrabold text-navy">
                  {profile?.displayName ||
                    user?.displayName ||
                    user?.email?.split("@")[0] ||
                    "Citizen"}
                </p>
                <p className="truncate text-[12.5px] text-muted-foreground">
                  {profile?.email || user?.email}
                </p>
                {isAdmin ? (
                  <span className="mt-2 inline-block rounded-full bg-destructive/12 px-2.5 py-1 text-[10.5px] font-extrabold uppercase text-destructive">
                    Administrator
                  </span>
                ) : isVolunteerApproved ? (
                  <span className="mt-2 inline-block rounded-full bg-safe/12 px-2.5 py-1 text-[10.5px] font-extrabold uppercase text-safe">
                    Verified Volunteer
                  </span>
                ) : isVolunteerPending ? (
                  <span className="mt-2 inline-block rounded-full bg-warn/20 px-2.5 py-1 text-[10.5px] font-extrabold uppercase text-warn-foreground">
                    Volunteer Pending Review
                  </span>
                ) : profile?.volunteerStatus === "rejected" ? (
                  <span className="mt-2 inline-block rounded-full bg-destructive/12 px-2.5 py-1 text-[10.5px] font-extrabold uppercase text-destructive">
                    Application Rejected
                  </span>
                ) : (
                  <span className="mt-2 inline-block rounded-full bg-navy/10 px-2.5 py-1 text-[10.5px] font-extrabold uppercase text-navy">
                    Citizen Account
                  </span>
                )}
              </div>
            </div>

            {profile?.volunteerStatus === "rejected" && (
              <div className="mt-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                <p className="font-bold">Volunteer Application Status: Rejected</p>
                {profile.volunteerApplication?.notes ? (
                  <p className="mt-1 text-[11.5px] text-destructive/90">
                    Feedback: {profile.volunteerApplication.notes}
                  </p>
                ) : (
                  <p className="mt-1 text-[11.5px] text-destructive/90">
                    Your application was reviewed and not approved at this time. You may re-apply
                    with updated details.
                  </p>
                )}
              </div>
            )}

            {/* Volunteer Mode Switcher (For Approved Volunteers) */}
            {isVolunteerApproved && (
              <div className="mt-2 flex items-center justify-between rounded-2xl bg-muted/60 p-2.5">
                <div>
                  <p className="text-xs font-bold text-navy">Interface View Mode</p>
                  <p className="text-[11px] text-muted-foreground">
                    Switch citizen vs volunteer view
                  </p>
                </div>
                <div className="flex gap-1 rounded-xl bg-card p-1 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setActiveMode("user")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                      activeMode === "user"
                        ? "bg-navy text-white"
                        : "text-muted-foreground hover:text-navy"
                    }`}
                  >
                    Citizen
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMode("volunteer")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                      activeMode === "volunteer"
                        ? "bg-safe text-white"
                        : "text-muted-foreground hover:text-navy"
                    }`}
                  >
                    Volunteer
                  </button>
                </div>
              </div>
            )}

            {user ? (
              <CallbackPhoneEditor
                uid={user.uid}
                savedPhone={profile?.phone || ""}
                onSaved={(phone) => applyProfilePatch({ phone })}
              />
            ) : null}

            {/* Admin Management Link */}
            {isAdmin && (
              <Link
                to="/admin"
                className="press flex items-center justify-between rounded-2xl bg-destructive/10 p-3 text-destructive"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="h-4.5 w-4.5" />
                  <div>
                    <p className="text-xs font-bold">Admin Management Portal</p>
                    <p className="text-[11px] text-destructive/80">
                      Manage volunteer approvals & roles
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </Card>
        ) : (
          <Card className="border-navy/15 bg-gradient-to-br from-card to-muted/40 p-4.5">
            <div className="flex items-start gap-3.5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-navy/10 text-navy">
                <UserRound className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[16px] font-extrabold text-navy">RescueLink Account</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sign in or register to save emergency contacts, manage disaster alerts, and
                  volunteer.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                to="/login"
                className="press flex h-11 items-center justify-center rounded-2xl bg-navy text-xs font-bold text-white shadow-xs"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="press flex h-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-xs font-bold text-primary"
              >
                Create Account
              </Link>
            </div>
          </Card>
        )}
      </div>

      {/* 2. User Statistics (SOS Requests and Donated only — Tasks done removed) */}
      <div className="px-4 pt-6">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-3xl bg-card p-3.5 text-center shadow-[var(--shadow-soft)]">
            <p className="text-[16px] font-extrabold text-navy">{sosCount}</p>
            <p className="text-[11px] text-muted-foreground">SOS Requests</p>
          </div>
          <div className="rounded-3xl bg-card p-3.5 text-center shadow-[var(--shadow-soft)]">
            <p className="text-[16px] font-extrabold text-navy">
              {donationTotal > 0 ? `৳${donationTotal.toLocaleString()}` : "৳0"}
            </p>
            <p className="text-[11px] text-muted-foreground">Donated</p>
          </div>
        </div>
      </div>

      {/* 3. Emergency Contacts */}
      <section className="px-4 pt-7">
        <SectionHeader title="Emergency Contacts" />
        <Card className="space-y-3">
          {contacts.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="space-y-2 rounded-2xl bg-muted/60 p-3">
                <p className="text-xs font-bold text-navy">Edit Emergency Contact</p>
                {(
                  [
                    ["name", "Full Name"],
                    ["relation", "Relation (e.g. Mother, Friend)"],
                    ["phone", "Phone (e.g. 017XXXXXXXX)"],
                  ] as const
                ).map(([key, label]) => (
                  <input
                    key={key}
                    value={editForm[key]}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={label}
                    className="h-10 w-full rounded-xl border border-border bg-card px-3 text-[13px] outline-none focus:border-ring"
                  />
                ))}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="press flex h-10 items-center justify-center gap-1.5 rounded-xl bg-card text-xs font-bold text-muted-foreground"
                  >
                    <X className="h-4 w-4" /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="press h-10 rounded-xl bg-navy text-xs font-bold text-white shadow-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div key={c.id} className="flex items-center gap-2.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/8 text-primary">
                  <Phone className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-navy">
                    {c.name}
                    {c.relation ? (
                      <span className="ml-1.5 text-[11.5px] font-medium text-muted-foreground">
                        {c.relation}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">{c.phone}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${c.name}`}
                  onClick={() => startEdit(c)}
                  className="press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted/80 text-muted-foreground hover:bg-muted hover:text-navy"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <a
                  href={`tel:${toDialablePhone(c.phone)}`}
                  className="press shrink-0 rounded-full bg-muted px-3 py-2 text-[11.5px] font-bold text-navy"
                >
                  Call
                </a>
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => deleteContact(c.id)}
                  className="press grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          )}

          {contacts.length === 0 && !adding && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              No emergency contacts added yet. Add trusted family members or friends who can be
              reached in an emergency.
            </p>
          )}

          {adding ? (
            <div className="space-y-2 rounded-2xl bg-muted/60 p-3">
              {(
                [
                  ["name", "Full Name"],
                  ["relation", "Relation (e.g. Mother, Friend)"],
                  ["phone", "Phone (e.g. 017XXXXXXXX)"],
                ] as const
              ).map(([key, label]) => (
                <input
                  key={key}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={label}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[13px] outline-none focus:border-ring"
                />
              ))}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-card text-[12.5px] font-bold text-muted-foreground"
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={addContact}
                  className="press h-11 rounded-xl bg-navy text-[12.5px] font-bold text-navy-foreground"
                >
                  Save contact
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-[13px] font-bold text-info"
            >
              <Plus className="h-4 w-4" /> Add trusted contact
            </button>
          )}
        </Card>
      </section>

      {/* 4. Become a Volunteer (Immediately after Emergency Contacts and before Your Activity) */}
      {(!isVolunteerApproved || activeMode !== "volunteer") && (
        <section className="px-4 pt-7">
          <SectionHeader title="Become a Volunteer" />
          <Card className="space-y-3.5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-safe/10 text-safe">
                <HeartHandshake className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[14.5px] font-bold text-navy">Become a Volunteer</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Help people during emergencies. Join RescueLink as a volunteer and make a
                  difference in your community.
                </p>
              </div>
            </div>
            <Link
              to="/volunteer"
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-navy text-[13px] font-bold text-white shadow-xs transition hover:bg-navy/90"
            >
              <span>{isVolunteerPending ? "View Application Status" : "Become a Volunteer"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </section>
      )}

      {/* 5. Your Activity (Saved Shelters, SOS History, Donation History only) */}
      <section className="px-4 pt-7">
        <SectionHeader title="Your Activity" />
        <Card className="divide-y divide-border/70 p-0">
          <Link
            to="/shelters"
            search={{ saved: true }}
            className="press flex items-center gap-3 px-4 py-4 first:rounded-t-3xl"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-info">
              <Bookmark className="h-4.5 w-4.5" />
            </span>
            <p className="min-w-0 flex-1 text-[14px] font-semibold text-navy">Saved Shelters</p>
            <span className="shrink-0 text-[11.5px] text-muted-foreground">
              {savedSheltersCount} saved
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
          <Link to="/sos" className="press flex items-center gap-3 px-4 py-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-info">
              <Siren className="h-4.5 w-4.5" />
            </span>
            <p className="min-w-0 flex-1 text-[14px] font-semibold text-navy">SOS History</p>
            <span className="shrink-0 text-[11.5px] text-muted-foreground">
              {sosCount} {sosCount === 1 ? "request" : "requests"}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
          <Link to="/donate" className="press flex items-center gap-3 px-4 py-4 last:rounded-b-3xl">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-info">
              <HandCoins className="h-4.5 w-4.5" />
            </span>
            <p className="min-w-0 flex-1 text-[14px] font-semibold text-navy">Donation History</p>
            <span className="shrink-0 text-[11.5px] text-muted-foreground">
              {donationTotal > 0 ? `৳${donationTotal.toLocaleString()}` : "৳0"}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </Card>
      </section>

      {/* 6. App */}
      <section className="px-4 pt-7">
        <SectionHeader title="App" />
        <Card className="divide-y divide-border/70 p-0">
          {[
            { icon: PhoneCall, label: "Emergency Helplines & Services", to: "/services" },
            { icon: Settings, label: "Settings & Permissions", to: "/permissions" },
            { icon: Info, label: "Emergency System Instructions", to: "/instructions" },
            { icon: Lock, label: "Privacy", to: "/permissions" },
            { icon: LifeBuoy, label: "Help & Support", to: "/support" },
          ].map(({ icon: Icon, label, to }) => (
            <Link
              key={label}
              to={to}
              className="press flex items-center gap-3 px-4 py-4 first:rounded-t-3xl last:rounded-b-3xl"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-muted text-navy">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <p className="min-w-0 flex-1 text-[14px] font-semibold text-navy">{label}</p>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      </section>

      {/* 7. Sign Out */}
      {isAuthenticated && (
        <section className="px-4 pt-6 pb-2">
          <button
            type="button"
            onClick={handleLogout}
            className="press flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 text-sm font-bold text-destructive hover:bg-destructive/15"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </section>
      )}
    </Screen>
  );
}
