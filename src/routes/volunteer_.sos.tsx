import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogIn,
  MapPin,
  Phone,
  RefreshCw,
  Siren,
} from "lucide-react";
import { toast } from "sonner";

import { Card, Screen, TopBar } from "@/components/rl";
import { useAuth } from "@/context/AuthContext";
import {
  SosError,
  claimSosRequest,
  resolveSosRequest,
  subscribeToActiveSosRequests,
} from "@/lib/firebase/firestore";
import type { SosRequest } from "@/lib/firebase/types";
import { formatPhoneForDisplay, toDialablePhone } from "@/lib/phone";

export const Route = createFileRoute("/volunteer_/sos")({
  head: () => ({
    meta: [
      { title: "Live SOS Requests — RescueLink Volunteers" },
      {
        name: "description",
        content: "Approved RescueLink volunteers can view and respond to active SOS requests.",
      },
    ],
  }),
  component: VolunteerSosScreen,
});

function timeAgo(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ${mins % 60} min ago`;
  return new Date(iso).toLocaleString();
}

function describeError(err: unknown): string {
  if (err instanceof SosError) return err.message;
  const code = (err as { code?: string } | null)?.code;
  if (code === "permission-denied") {
    return "You do not have permission to do this.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

function VolunteerSosScreen() {
  const { user, profile, loading, isAuthenticated, isAdmin, isVolunteerApproved } = useAuth();

  const canView = isAuthenticated && (isVolunteerApproved || isAdmin);

  const [requests, setRequests] = useState<SosRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<{ message: string; denied: boolean } | null>(null);
  const [subscribeKey, setSubscribeKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [etaInput, setEtaInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!canView) return;
    setLoaded(false);
    setError(null);
    const unsubscribe = subscribeToActiveSosRequests(
      (list) => {
        setRequests(list);
        setLoaded(true);
        setError(null);
      },
      (err) => {
        const denied = (err as { code?: string }).code === "permission-denied";
        setError({
          denied,
          message: denied
            ? "You do not have permission to view SOS requests. Only approved volunteers and administrators can."
            : err.message || "Could not load SOS requests.",
        });
        setLoaded(true);
      },
    );
    return () => unsubscribe();
  }, [canView, subscribeKey]);

  const sorted = useMemo(() => {
    const rank = (r: SosRequest) => (r.status === "active" ? 0 : 1);
    return [...requests].sort(
      (a, b) =>
        rank(a) - rank(b) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [requests]);

  const handleRespond = useCallback(
    async (sos: SosRequest) => {
      if (!user || !sos.id) return;
      setBusyId(sos.id);
      try {
        await claimSosRequest(
          sos.id,
          { uid: user.uid, isAdmin },
          {
            unit: profile?.displayName || user.displayName || "Volunteer responder",
            etaMinutes: Number(etaInput),
          },
        );
        toast.success("You are now assigned to this request", {
          description: "Contact the requester and head to their location.",
        });
        setRespondingId(null);
        setEtaInput("");
      } catch (err) {
        toast.error("Could not accept the request", { description: describeError(err) });
      } finally {
        setBusyId(null);
      }
    },
    [user, isAdmin, profile?.displayName, etaInput],
  );

  const handleResolve = useCallback(
    async (sos: SosRequest) => {
      if (!user || !sos.id) return;
      setBusyId(sos.id);
      try {
        await resolveSosRequest(sos.id, { uid: user.uid, isAdmin });
        toast.success("Request marked as resolved");
      } catch (err) {
        toast.error("Could not resolve the request", { description: describeError(err) });
      } finally {
        setBusyId(null);
      }
    },
    [user, isAdmin],
  );

  if (loading) {
    return (
      <Screen>
        <TopBar title="Live SOS Requests" back="/volunteer" />
        <div className="grid place-items-center px-6 pt-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return (
      <Screen>
        <TopBar title="Live SOS Requests" back="/volunteer" />
        <div className="px-4 pt-6">
          <Card className="space-y-3 text-center">
            <p className="text-[15px] font-extrabold text-navy">Sign in required</p>
            <p className="text-[13px] text-muted-foreground">
              Sign in with an approved volunteer account to see active SOS requests.
            </p>
            <Link
              to="/login"
              className="press mx-auto inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy px-5 text-[13px] font-bold text-white"
            >
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          </Card>
        </div>
      </Screen>
    );
  }

  if (!canView) {
    return (
      <Screen>
        <TopBar title="Live SOS Requests" back="/volunteer" />
        <div className="px-4 pt-6">
          <Card className="space-y-3 text-center">
            <p className="text-[15px] font-extrabold text-navy">Approved volunteers only</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              SOS requests contain private location and contact details. Your account must be an
              approved volunteer (or administrator) to view them.
            </p>
            <Link
              to="/volunteer"
              className="press mx-auto inline-flex h-11 items-center justify-center rounded-2xl bg-navy px-5 text-[13px] font-bold text-white"
            >
              Go to volunteer page
            </Link>
          </Card>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar
        title="Live SOS Requests"
        subtitle={loaded && !error ? `${sorted.length} open` : "Loading…"}
        back="/volunteer"
      />

      <div className="animate-fade-up space-y-3 px-4 pt-4">
        <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
          Handle these details privately. If someone is in immediate danger, also contact the
          national emergency line (999).
        </p>

        {error ? (
          <div
            role="alert"
            className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-[13px] font-semibold text-destructive">{error.message}</p>
            </div>
            {!error.denied ? (
              <button
                type="button"
                onClick={() => setSubscribeKey((k) => k + 1)}
                className="press inline-flex h-9 items-center gap-1.5 rounded-xl bg-navy px-3 text-[12px] font-bold text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!loaded && !error ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {loaded && !error && sorted.length === 0 ? (
          <Card className="space-y-2 py-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-safe" />
            <p className="text-[14px] font-bold text-navy">No open SOS requests</p>
            <p className="text-[12.5px] text-muted-foreground">
              New requests appear here instantly.
            </p>
          </Card>
        ) : null}

        {sorted.map((sos) => {
          const lat = sos.location?.lat;
          const lng = sos.location?.lng;
          const hasCoords = typeof lat === "number" && typeof lng === "number";
          const isManual = sos.location?.source === "manual" || !hasCoords;
          const phone = sos.userPhone?.trim() || "";
          const dialable = phone ? toDialablePhone(phone) : null;
          const mine = sos.assignedResponder?.responderId === user?.uid;
          const busy = busyId === sos.id;
          const assignedToOther = sos.status === "assigned" && !mine;

          return (
            <Card key={sos.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                      sos.status === "active"
                        ? "bg-primary/12 text-primary"
                        : "bg-info/12 text-info"
                    }`}
                  >
                    <Siren className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[14px] font-extrabold text-navy">
                      {sos.userName || "Citizen"}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {timeAgo(sos.createdAt, now)}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase ${
                    sos.status === "active" ? "bg-primary/12 text-primary" : "bg-info/12 text-info"
                  }`}
                >
                  {sos.status === "active" ? "Needs responder" : "Assigned"}
                </span>
              </div>

              {sos.message ? (
                <p className="rounded-xl bg-muted/60 px-3 py-2 text-[12.5px] italic text-navy/90">
                  “{sos.message}”
                </p>
              ) : null}

              <div className="space-y-1 rounded-xl bg-muted/60 p-3 text-[12px]">
                <p className="flex items-start gap-1.5 font-semibold text-navy">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{sos.location?.address || "Address not provided"}</span>
                </p>
                {isManual ? (
                  <p className="text-[11px] text-warn-foreground">
                    Approximate address typed by the requester — not GPS.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    GPS {lat!.toFixed(5)}, {lng!.toFixed(5)}
                    {typeof sos.location.accuracyMeters === "number"
                      ? ` · ±${sos.location.accuracyMeters} m`
                      : " · accuracy unknown"}
                    {sos.location.updatedAt
                      ? ` · updated ${timeAgo(sos.location.updatedAt, now)}`
                      : ""}
                  </p>
                )}
              </div>

              {sos.status === "assigned" && sos.assignedResponder ? (
                <p className="text-[12px] font-semibold text-info">
                  {mine ? "You are assigned" : `Assigned to ${sos.assignedResponder.unit}`}
                  {sos.assignedResponder.eta ? ` · ETA ${sos.assignedResponder.eta}` : ""}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                {dialable ? (
                  <a
                    href={`tel:${dialable}`}
                    className="press flex h-10 items-center justify-center gap-1.5 rounded-xl bg-safe/12 text-[12.5px] font-bold text-safe"
                  >
                    <Phone className="h-3.5 w-3.5" /> {formatPhoneForDisplay(phone)}
                  </a>
                ) : (
                  <div className="flex h-10 items-center justify-center rounded-xl bg-muted/60 px-2 text-center text-[11.5px] font-medium text-muted-foreground">
                    {phone ? `Phone: ${phone}` : "No phone provided"}
                  </div>
                )}
                {hasCoords ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="press flex h-10 items-center justify-center gap-1.5 rounded-xl bg-info/12 text-[12.5px] font-bold text-info"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open map
                  </a>
                ) : (
                  <div className="flex h-10 items-center justify-center rounded-xl bg-muted/60 text-[11.5px] font-medium text-muted-foreground">
                    No coordinates
                  </div>
                )}
              </div>

              {sos.status === "active" ? (
                respondingId === sos.id ? (
                  <div className="space-y-2 rounded-2xl border border-border p-3">
                    <label htmlFor={`eta-${sos.id}`} className="text-xs font-bold text-navy">
                      Your estimated arrival (minutes)
                    </label>
                    <input
                      id={`eta-${sos.id}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={600}
                      value={etaInput}
                      onChange={(e) => setEtaInput(e.target.value)}
                      placeholder="e.g. 15"
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] outline-none focus:border-ring"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setRespondingId(null);
                          setEtaInput("");
                        }}
                        className="press h-10 rounded-xl bg-muted text-xs font-bold text-navy disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy || etaInput.trim() === ""}
                        onClick={() => handleRespond(sos)}
                        className="press h-10 rounded-xl bg-navy text-xs font-bold text-white disabled:opacity-60"
                      >
                        {busy ? "Accepting…" : "Accept request"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRespondingId(sos.id ?? null);
                      setEtaInput("");
                    }}
                    className="press h-11 w-full rounded-2xl bg-primary text-[13.5px] font-extrabold text-primary-foreground"
                  >
                    I can respond
                  </button>
                )
              ) : mine || isAdmin ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleResolve(sos)}
                  className="press h-11 w-full rounded-2xl bg-safe text-[13.5px] font-extrabold text-white disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Mark as resolved"}
                </button>
              ) : assignedToOther ? (
                <p className="text-center text-[11.5px] text-muted-foreground">
                  Another responder has accepted this request.
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
