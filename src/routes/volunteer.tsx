import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Clock,
  HeartHandshake,
  MapPin,
  Users,
  CheckCircle2,
  AlertCircle,
  LogIn,
  Siren,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { Card, Screen, SectionHeader, TopBar } from "@/components/rl";
import { tasks, type Task } from "@/lib/data";
import { useAuth } from "@/context/AuthContext";
import { submitVolunteerApplication } from "@/lib/firebase/firestore";
import { calculateAge, isAgeEligible, isValidNid } from "@/lib/volunteer/volunteer-verification";

export const Route = createFileRoute("/volunteer")({
  head: () => ({
    meta: [
      { title: "Volunteer for Relief Work — RescueLink" },
      {
        name: "description",
        content:
          "Join nearby relief tasks: food and water distribution, medicine delivery, shelter support and rescue assistance.",
      },
      { property: "og:title", content: "Volunteer for Relief Work — RescueLink" },
      {
        property: "og:description",
        content:
          "Your time and skills can make a difference. Accept nearby relief tasks in minutes.",
      },
    ],
  }),
  component: VolunteerScreen,
});

const urgencyTone = {
  high: "bg-primary/10 text-primary",
  medium: "bg-warn/20 text-warn-foreground",
  low: "bg-accent text-info",
} as const;

const VOLUNTEER_SKILL_OPTIONS = [
  "First Aid & Medical Support",
  "Search & Rescue",
  "Emergency Food & Water Distribution",
  "Shelter Operations",
  "Logistics & Transportation",
  "Disaster Communications",
];

function VolunteerScreen() {
  const {
    user,
    profile,
    isAuthenticated,
    isVolunteerApproved,
    isVolunteerPending,
    refreshProfile,
  } = useAuth();

  const [applying, setApplying] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([
    "First Aid & Medical Support",
    "Emergency Food & Water Distribution",
  ]);
  const [areaInput, setAreaInput] = useState(profile?.area || "Dhaka");
  const [notesInput, setNotesInput] = useState("");
  const [dobInput, setDobInput] = useState("");
  const [nidInput, setNidInput] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);

  const calculatedAge = useMemo(() => {
    return calculateAge(dobInput);
  }, [dobInput]);

  const isAgeValid = useMemo(() => {
    return isAgeEligible(calculatedAge);
  }, [calculatedAge]);

  const ageDisplay = useMemo(() => {
    if (!dobInput) return "Select Date of Birth";
    if (calculatedAge === null) return "Invalid date";
    return `${calculatedAge} years old`;
  }, [dobInput, calculatedAge]);

  const tasksKey = user ? `rl_volunteer_tasks_${user.uid}` : "rl_volunteer_tasks_guest";
  const [accepted, setAccepted] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(tasksKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  };

  const handleApply = async () => {
    if (!user) {
      toast.error("Please sign in first to apply as a volunteer.");
      return;
    }

    if (!dobInput.trim()) {
      toast.error("Please provide your date of birth.");
      return;
    }

    if (calculatedAge === null || !isAgeValid) {
      toast.error("Volunteer applicants must be between 18 and 30 years of age (inclusive).");
      return;
    }

    if (!isValidNid(nidInput)) {
      toast.error("NID number must be exactly 10 numeric digits.");
      return;
    }

    if (!areaInput.trim()) {
      toast.error("Please specify your operational district or area.");
      return;
    }

    if (selectedSkills.length === 0) {
      toast.error("Please select at least one relief skill.");
      return;
    }

    if (!termsAgreed) {
      toast.error("Please accept the volunteer code of conduct to proceed.");
      return;
    }

    setApplying(true);
    try {
      await submitVolunteerApplication(user.uid, {
        area: areaInput.trim(),
        skills: selectedSkills,
        notes: notesInput.trim(),
        dateOfBirth: dobInput.trim(),
        nid: nidInput.trim(),
      });
      await refreshProfile();
      setShowApplyForm(false);
      toast.success("Volunteer Application Submitted!", {
        description: "Your details have been registered for administrator verification.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      if (msg.includes("This NID number is already registered")) {
        toast.error("This NID number is already registered.");
      } else {
        toast.error("Application error", { description: msg });
      }
    } finally {
      setApplying(false);
    }
  };

  const acceptTask = (t: Task) => {
    setAccepted((p) => {
      const alreadyJoined = p.includes(t.id);
      const next = alreadyJoined ? p.filter((id) => id !== t.id) : [...p, t.id];
      try {
        localStorage.setItem(tasksKey, JSON.stringify(next));
      } catch (err) {
        console.warn("Could not save volunteer task:", err);
      }
      if (alreadyJoined) {
        toast.info(`Withdrawn from "${t.title}"`);
      } else {
        toast.success(`You're in for "${t.title}"`, {
          description: `${t.area} · ${t.time}. Assigned to your volunteer profile.`,
        });
      }
      return next;
    });
  };

  const showTaskDetails = (t: Task) => {
    toast.message(t.title, {
      description: `${t.area} · ${t.distanceKm} km away · ${t.joined}/${t.needed} volunteers joined · ${t.time}`,
    });
  };

  return (
    <Screen>
      <TopBar
        title="Volunteer"
        subtitle={isVolunteerApproved ? "Verified volunteer" : "Community relief"}
      />

      {!isAuthenticated ? (
        <div className="animate-fade-up px-5 pt-10 text-center">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-safe/10">
            <HeartHandshake className="h-9 w-9 text-safe" />
          </span>
          <h2 className="mt-6 text-[24px] font-extrabold leading-tight text-navy">
            Volunteer with RescueLink
          </h2>
          <p className="mx-auto mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
            Sign in to apply as a verified disaster relief volunteer and access active emergency
            operations.
          </p>
          <div className="mt-8 space-y-2">
            <Link
              to="/login"
              className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-navy text-[15px] font-bold text-white shadow-[var(--shadow-card)]"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In to Volunteer</span>
            </Link>
            <Link
              to="/register"
              className="press flex h-14 w-full items-center justify-center rounded-2xl border border-border bg-card text-[15px] font-bold text-navy"
            >
              Create Account
            </Link>
          </div>
        </div>
      ) : !isVolunteerApproved ? (
        <div className="animate-fade-up px-5 pt-5 text-center">
          <h2 className="text-[24px] font-extrabold leading-tight text-navy">
            Help Your Community
          </h2>
          <p className="mx-auto mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
            Your time and skills can make a difference. Join verified relief teams working near you.
          </p>

          {isVolunteerPending ? (
            <div className="mt-6 rounded-3xl border border-warn/30 bg-warn/10 p-5 text-left">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warn-foreground" />
                <div>
                  <p className="text-[14px] font-bold text-navy">Application Under Review</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Your volunteer application has been submitted and is currently awaiting
                    administrator verification. Once verified, you will gain access to active relief
                    tasks.
                  </p>
                </div>
              </div>
            </div>
          ) : showApplyForm ? (
            <div className="mt-6 rounded-3xl border border-border/80 bg-card p-5 text-left shadow-lg animate-fade-up">
              <h3 className="text-base font-extrabold text-navy">Relief Volunteer Application</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Specify your active location, core competencies, and availability.
              </p>

              {profile?.volunteerStatus === "rejected" && (
                <div className="mt-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                  <p className="font-bold">Previous Application Feedback:</p>
                  <p className="mt-0.5 text-[11px] text-destructive/90">
                    {profile.volunteerApplication?.notes ||
                      "Your previous application was not approved. Please review your details and re-submit."}
                  </p>
                </div>
              )}

              <div className="mt-4 space-y-3.5">
                <div>
                  <label htmlFor="volunteer-dob" className="text-[11.5px] font-bold text-navy">
                    Date of Birth: <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="volunteer-dob"
                    type="date"
                    required
                    value={dobInput}
                    onChange={(e) => setDobInput(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy outline-none focus:border-navy/50"
                  />
                </div>

                <div>
                  <label htmlFor="volunteer-age" className="text-[11.5px] font-bold text-navy">
                    Calculated Age:
                  </label>
                  <input
                    id="volunteer-age"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    value={ageDisplay}
                    className={`mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold outline-none cursor-not-allowed ${
                      calculatedAge === null
                        ? "text-muted-foreground"
                        : isAgeValid
                          ? "text-safe"
                          : "text-destructive"
                    }`}
                  />
                  {calculatedAge !== null && !isAgeValid && (
                    <p className="mt-1 text-[11px] font-semibold text-destructive">
                      {calculatedAge < 18
                        ? "Applicants must be at least 18 years old to apply (Eligible: 18–30)."
                        : "Applicants must be 30 years old or younger to apply (Eligible: 18–30)."}
                    </p>
                  )}
                  {calculatedAge !== null && isAgeValid && (
                    <p className="mt-1 text-[11px] font-medium text-safe">
                      Eligible age range (18–30 years).
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="volunteer-nid" className="text-[11.5px] font-bold text-navy">
                    NID Number: <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="volunteer-nid"
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    required
                    placeholder="Enter 10-digit numeric NID"
                    value={nidInput}
                    onChange={(e) => {
                      const numericOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setNidInput(numericOnly);
                    }}
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy outline-none focus:border-navy/50"
                  />
                  <p className="mt-1 text-[10.5px] text-muted-foreground">
                    Must be exactly 10 numeric digits. Stored securely and masked for privacy.
                  </p>
                </div>

                <div>
                  <label className="text-[11.5px] font-bold text-navy">
                    Operational Area / District: <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={areaInput}
                    onChange={(e) => setAreaInput(e.target.value)}
                    placeholder="e.g. Mohammadpur, Dhaka"
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11.5px] font-bold text-navy">
                    Select Your Relief Skills:
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {VOLUNTEER_SKILL_OPTIONS.map((skill) => {
                      const on = selectedSkills.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => toggleSkill(skill)}
                          className={`press rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                            on
                              ? "bg-safe text-safe-foreground shadow-xs"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[11.5px] font-bold text-navy">
                    Notes / Previous Experience (Optional):
                  </label>
                  <textarea
                    rows={2}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Certifications, vehicle availability, or medical training..."
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy outline-none"
                  />
                </div>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAgreed}
                    onChange={(e) => setTermsAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded accent-safe"
                  />
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    I agree to adhere to RescueLink safety policies, emergency protocols, and code
                    of conduct.
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowApplyForm(false)}
                    className="press h-11 rounded-xl bg-muted text-xs font-bold text-navy"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={applying}
                    onClick={handleApply}
                    className="press h-11 rounded-xl bg-safe text-xs font-bold text-safe-foreground shadow-sm disabled:opacity-60"
                  >
                    {applying ? "Submitting..." : "Submit Application"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {profile?.volunteerStatus === "rejected" && (
                <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-left text-xs text-destructive">
                  <p className="font-bold">Application Status: Feedback Received</p>
                  <p className="mt-0.5 text-[11px] text-destructive/90">
                    {profile.volunteerApplication?.notes ||
                      "Your previous application was not approved. You can update your skills or area and re-apply."}
                  </p>
                </div>
              )}

              <div className="mt-8 grid grid-cols-3 gap-2 text-left">
                {[
                  { n: "2.4k", l: "Volunteers" },
                  { n: "38", l: "Active tasks" },
                  { n: "12k", l: "People helped" },
                ].map((s) => (
                  <div key={s.l} className="rounded-3xl bg-card p-3 shadow-[var(--shadow-soft)]">
                    <p className="text-[17px] font-extrabold text-navy">{s.n}</p>
                    <p className="text-[11px] text-muted-foreground">{s.l}</p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowApplyForm(true)}
                className="press mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-safe text-[15px] font-bold text-safe-foreground shadow-[var(--shadow-card)]"
              >
                {profile?.volunteerStatus === "rejected"
                  ? "Update & Re-apply as Volunteer"
                  : "Apply to Become a Volunteer"}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="px-4 pt-4">
            <Link
              to="/volunteer/sos"
              className="press flex items-center justify-between rounded-3xl bg-primary p-4 text-primary-foreground shadow-[var(--shadow-sos)]"
            >
              <div className="flex items-center gap-3">
                <Siren className="h-6 w-6" />
                <div>
                  <p className="text-[14.5px] font-extrabold">Live SOS requests</p>
                  <p className="text-[12px] text-primary-foreground/85">
                    See people who need help right now
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
          <div className="px-4 pt-4">
            <Card className="bg-navy text-navy-foreground">
              <p className="text-[15px] font-extrabold">
                Welcome, {profile?.displayName || "Volunteer"} 🎉
              </p>
              <p className="mt-1 text-[12.5px] text-navy-foreground/80">
                You're an approved RescueLink relief volunteer in {profile?.area || "Dhaka North"}.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { n: String(accepted.length), l: "Active tasks" },
                  { n: "14", l: "Completed" },
                  { n: "62 hrs", l: "Contributed" },
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl bg-navy-foreground/10 p-2.5">
                    <p className="text-[15px] font-extrabold">{s.n}</p>
                    <p className="text-[10.5px] text-navy-foreground/75">{s.l}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="px-4 pt-7">
            <SectionHeader title="Nearby Relief Tasks" />
            <div className="stagger-children space-y-3">
              {tasks.map((t) => {
                const on = accepted.includes(t.id);
                return (
                  <Card key={t.id}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-navy">{t.title}</p>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" /> {t.area} · {t.distanceKm} km
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase ${urgencyTone[t.urgency]}`}
                      >
                        {t.urgency}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> {t.joined + (on ? 1 : 0)}/{t.needed}{" "}
                        volunteers
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> {t.time}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => acceptTask(t)}
                        className={`press flex h-11 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-bold ${
                          on ? "bg-safe/12 text-safe" : "bg-safe text-safe-foreground"
                        }`}
                      >
                        {on ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> Joined · Leave
                          </>
                        ) : (
                          "Accept Task"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => showTaskDetails(t)}
                        className="press flex h-11 items-center justify-center rounded-2xl bg-muted text-[13px] font-bold text-navy"
                      >
                        View Details
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Screen>
  );
}
