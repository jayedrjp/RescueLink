import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Siren,
  MapPin,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  X,
  Phone,
  AlertTriangle,
  RefreshCw,
  LogIn,
} from "lucide-react";
import { toast } from "sonner";

import { Card, Screen, TopBar } from "@/components/rl";
import { MiniMapPreview } from "@/components/MiniMapPreview";
import { useAuth } from "@/context/AuthContext";
import {
  SosError,
  cancelSosRequest,
  createSosRequest,
  getSosRequestOnce,
  getUserSosRequests,
  newSosRequestId,
  resolveSosRequest,
  subscribeToSosRequest,
  updateSosLocation,
  updateUserProfile,
} from "@/lib/firebase/firestore";
import { PHONE_HELP_TEXT, normalizePhone } from "@/lib/phone";
import { reverseGeocode } from "@/lib/map/places";
import type { Coordinates } from "@/lib/map/types";
import type { SosRequest } from "@/lib/firebase/types";
import { watchDevicePosition, DeviceLocationError } from "@/lib/location";

export const Route = createFileRoute("/sos")({
  head: () => ({
    meta: [
      { title: "Send an SOS — RescueLink" },
      {
        name: "description",
        content:
          "Send an emergency SOS with your live location to nearby responders in three calm, simple steps.",
      },
      { property: "og:title", content: "Send an SOS — RescueLink" },
      {
        property: "og:description",
        content: "Share your live location with nearby emergency responders in seconds.",
      },
    ],
  }),
  component: SosScreen,
});

type Step = 1 | 2 | 3;

type GpsStatus = "locating" | "live" | "denied" | "unavailable" | "timeout" | "unsupported";
type SyncState = "idle" | "ok" | "failed" | "blocked";

const EMERGENCY_NUMBER = "999";
const MIN_SYNC_INTERVAL_MS = 10_000;
const MAX_SYNC_INTERVAL_MS = 60_000;
const MIN_SYNC_MOVE_METERS = 5;
const GEOCODE_MOVE_METERS = 150;

function distanceMeters(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function describeAccuracy(meters: number): string {
  const rounded = Math.round(meters);
  const label =
    rounded < 30 ? "high accuracy" : rounded < 100 ? "moderate accuracy" : "low accuracy";
  return `±${rounded} m · ${label}`;
}

/** Turns any failure into a message that never implies the request was delivered. */
function describeSosError(err: unknown): string {
  if (err instanceof SosError) return err.message;
  const code = (err as { code?: string } | null)?.code;
  if (code === "permission-denied") {
    return "RescueLink could not accept this request (permission denied). Sign in again or call 999.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return "No connection to RescueLink servers. Check your internet connection.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong while sending your request.";
}

function CallEmergencyButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={`tel:${EMERGENCY_NUMBER}`}
      className={`press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 text-[14px] font-extrabold text-primary ${className}`}
    >
      <Phone className="h-4 w-4" /> Call {EMERGENCY_NUMBER} (National Emergency)
    </a>
  );
}

function SosScreen() {
  const { user, profile, loading: authLoading, applyProfilePatch } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [message, setMessage] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [sosId, setSosId] = useState<string | null>(null);
  const [activeSos, setActiveSos] = useState<SosRequest | null>(null);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [subscribeKey, setSubscribeKey] = useState(0);
  const [actionBusy, setActionBusy] = useState<"cancel" | "resolve" | null>(null);

  // Real device location only. There is intentionally NO default coordinate.
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("locating");
  const [locationAddress, setLocationAddress] = useState<string | null>(null);

  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const attemptedRef = useRef(false);
  const phoneTouchedRef = useRef(false);
  const geocodeTokenRef = useRef(0);
  const lastGeocodePosRef = useRef<Coordinates | null>(null);
  const sosIdRef = useRef<string | null>(null);
  const lastSyncRef = useRef<{ t: number; pos: Coordinates } | null>(null);
  const syncInFlightRef = useRef(false);
  const checkedRecoveryUidRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    sosIdRef.current = sosId;
  }, [sosId]);

  // Attempt to recover an existing open (active or assigned) SOS request on mount / page refresh
  useEffect(() => {
    if (!user?.uid || authLoading || sosId || step !== 1) return;
    if (checkedRecoveryUidRef.current === user.uid) return;
    checkedRecoveryUidRef.current = user.uid;

    let isCancelled = false;
    getUserSosRequests(user.uid)
      .then((requests) => {
        if (isCancelled || !mountedRef.current) return;
        const openRequest = requests.find((r) => r.status === "active" || r.status === "assigned");
        if (openRequest && openRequest.id) {
          requestIdRef.current = openRequest.id;
          setSosId(openRequest.id);
          setActiveSos(openRequest);
          setStep(3);
        }
      })
      .catch((err) => {
        console.warn("Could not check for existing SOS request:", err);
      });

    return () => {
      isCancelled = true;
    };
  }, [user?.uid, authLoading, sosId, step]);

  // Pre-fill the callback number from the saved profile (until the user edits it).
  useEffect(() => {
    if (!phoneTouchedRef.current && profile?.phone) {
      setPhoneInput(profile.phone);
    }
  }, [profile?.phone]);

  // Watch the real device GPS. The watcher is cleared on unmount.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const cleanup = watchDevicePosition(
      (pos) => {
        if (!mountedRef.current) return;
        const next: Coordinates = { lat: pos.lat, lng: pos.lng };
        setCoords(next);
        setAccuracyMeters(pos.accuracy);
        setGpsStatus("live");

        // Reverse-geocode the first fix and then only after meaningful movement.
        if (sosIdRef.current) return;
        const last = lastGeocodePosRef.current;
        if (last && distanceMeters(last, next) < GEOCODE_MOVE_METERS) return;
        lastGeocodePosRef.current = next;
        const token = ++geocodeTokenRef.current;
        reverseGeocode(next).then((address) => {
          if (mountedRef.current && token === geocodeTokenRef.current) {
            setLocationAddress(address);
          }
        });
      },
      (err) => {
        if (!mountedRef.current) return;
        console.warn("GPS error in SOS:", err);
        if (err.code === DeviceLocationError.PERMISSION_DENIED) setGpsStatus("denied");
        else if (err.code === DeviceLocationError.POSITION_UNAVAILABLE) setGpsStatus("unavailable");
        else setGpsStatus((prev) => (prev === "live" ? prev : "timeout"));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );

    return () => {
      cleanup();
    };
  }, []);

  // Listen to the real request document. Status shown in the UI comes only from here.
  useEffect(() => {
    if (!sosId) return;
    setListenerError(null);
    const unsubscribe = subscribeToSosRequest(
      sosId,
      (updated) => {
        if (!mountedRef.current) return;
        if (!updated) {
          setListenerError("This request could not be found on the server.");
          return;
        }
        setListenerError(null);
        setActiveSos(updated);
      },
      (err) => {
        if (!mountedRef.current) return;
        setListenerError(err.message || "Live status updates were interrupted.");
      },
    );
    return () => unsubscribe();
  }, [sosId, subscribeKey]);

  const status = activeSos?.status;
  const isLive = status === "active" || status === "assigned";

  // Persist real GPS updates (throttled) while the request is open.
  useEffect(() => {
    if (!sosId || !isLive || !coords || gpsStatus !== "live") return;
    if (activeSos?.location.source === "manual") return;
    if (syncState === "blocked" || syncInFlightRef.current) return;

    const now = Date.now();
    const last = lastSyncRef.current;
    if (last) {
      const elapsed = now - last.t;
      if (elapsed < MIN_SYNC_INTERVAL_MS) return;
      if (
        distanceMeters(last.pos, coords) < MIN_SYNC_MOVE_METERS &&
        elapsed < MAX_SYNC_INTERVAL_MS
      ) {
        return;
      }
    } else if (
      activeSos?.location.lat !== undefined &&
      activeSos.location.lng !== undefined &&
      distanceMeters({ lat: activeSos.location.lat, lng: activeSos.location.lng }, coords) <
        MIN_SYNC_MOVE_METERS
    ) {
      return;
    }

    syncInFlightRef.current = true;
    updateSosLocation(sosId, {
      lat: coords.lat,
      lng: coords.lng,
      ...(accuracyMeters !== null ? { accuracyMeters } : {}),
    })
      .then(() => {
        lastSyncRef.current = { t: Date.now(), pos: coords };
        if (mountedRef.current) {
          setSyncState("ok");
          setLastSyncAt(new Date().toISOString());
        }
      })
      .catch((err: unknown) => {
        lastSyncRef.current = { t: Date.now(), pos: coords };
        const code = (err as { code?: string } | null)?.code;
        console.warn("Could not update SOS location:", err);
        if (mountedRef.current) {
          setSyncState(code === "permission-denied" ? "blocked" : "failed");
        }
      })
      .finally(() => {
        syncInFlightRef.current = false;
      });
  }, [sosId, isLive, coords, accuracyMeters, gpsStatus, syncState, activeSos?.location]);

  const trimmedManual = manualAddress.trim();
  const hasGps = gpsStatus === "live" && coords !== null;
  const hasUsableLocation = hasGps || trimmedManual.length >= 5;

  const startSending = useCallback(async () => {
    if (submittingRef.current) return; // prevents duplicate submissions from repeated taps
    if (!user) {
      setSubmitError("Please sign in to send an SOS request, or call 999 now.");
      return;
    }

    const phoneTrimmed = phoneInput.trim();
    let normalizedPhone = "";
    if (phoneTrimmed) {
      const normalized = normalizePhone(phoneTrimmed);
      if (!normalized) {
        setSubmitError(`That phone number is not valid. ${PHONE_HELP_TEXT}`);
        return;
      }
      normalizedPhone = normalized;
    }

    if (!hasUsableLocation) {
      setSubmitError(
        "We could not get your GPS position. Please type your address or a nearby landmark.",
      );
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    const requestId = requestIdRef.current ?? newSosRequestId();
    requestIdRef.current = requestId;

    const location =
      hasGps && coords
        ? {
            source: "gps" as const,
            address: locationAddress ?? "",
            lat: coords.lat,
            lng: coords.lng,
            ...(accuracyMeters !== null ? { accuracyMeters } : {}),
          }
        : { source: "manual" as const, address: trimmedManual };

    let created: SosRequest | null = null;
    let failure: unknown = null;

    try {
      // A previous attempt may have reached the server even though we saw an error/timeout.
      if (attemptedRef.current) {
        try {
          const existing = await getSosRequestOnce(requestId);
          if (existing && existing.userId === user.uid) created = existing;
        } catch {
          // Not readable/existing yet; fall through and (re)send with the same id.
        }
      }

      if (!created) {
        attemptedRef.current = true;
        created = await createSosRequest({
          requestId,
          userId: user.uid,
          userName: profile?.displayName || user.displayName || "Citizen",
          userEmail: profile?.email || user.email || "",
          userPhone: normalizedPhone,
          message: message.trim() || "Emergency assistance needed.",
          location,
        });
      }
    } catch (err) {
      failure = err;
      // The write may have landed even though we got an error (e.g. a retry of an existing id).
      try {
        const existing = await getSosRequestOnce(requestId);
        if (existing && existing.userId === user.uid) {
          created = existing;
          failure = null;
        }
      } catch {
        // Could not verify; treat as failed.
      }
    }

    submittingRef.current = false;
    if (!mountedRef.current) return;
    setIsSubmitting(false);

    if (!created || failure) {
      console.warn("SOS submission failed:", failure);
      setSubmitError(describeSosError(failure));
      return; // stay on the confirm step, keep everything the user typed
    }

    // Success is shown only now: the server confirmed the document exists.
    setSosId(created.id ?? requestId);
    setActiveSos(created);
    setSyncState("idle");
    setLastSyncAt(null);
    lastSyncRef.current = null;
    setStep(3);
    toast.success("SOS request saved to RescueLink", {
      description: "A responder has not accepted it yet. Call 999 if you are in immediate danger.",
    });

    // Remember the callback number on the profile (best effort; never blocks the SOS).
    if (normalizedPhone && normalizedPhone !== (profile?.phone || "")) {
      updateUserProfile(user.uid, { phone: normalizedPhone })
        .then(() => applyProfilePatch({ phone: normalizedPhone }))
        .catch((err: unknown) => console.warn("Could not save phone to profile:", err));
    }
  }, [
    user,
    profile,
    phoneInput,
    hasUsableLocation,
    hasGps,
    coords,
    locationAddress,
    accuracyMeters,
    trimmedManual,
    message,
    applyProfilePatch,
  ]);

  const handleCancelSos = async () => {
    if (!sosId || !user || actionBusy) return;
    setActionBusy("cancel");
    try {
      await cancelSosRequest(sosId, { uid: user.uid });
      setActiveSos((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
      toast.success("SOS request cancelled");
    } catch (err) {
      toast.error("Could not cancel the request", { description: describeSosError(err) });
    } finally {
      if (mountedRef.current) setActionBusy(null);
    }
  };

  const handleResolveSos = async () => {
    if (!sosId || !user || actionBusy) return;
    setActionBusy("resolve");
    try {
      await resolveSosRequest(sosId, { uid: user.uid });
      setActiveSos((prev) => (prev ? { ...prev, status: "resolved" } : prev));
      toast.success("Request closed as resolved");
    } catch (err) {
      toast.error("Could not close the request", { description: describeSosError(err) });
    } finally {
      if (mountedRef.current) setActionBusy(null);
    }
  };

  const startNewRequest = () => {
    requestIdRef.current = null;
    attemptedRef.current = false;
    lastSyncRef.current = null;
    setSosId(null);
    setActiveSos(null);
    setListenerError(null);
    setSubmitError(null);
    setSyncState("idle");
    setLastSyncAt(null);
    setStep(1);
  };

  // ----- derived display values for step 3 -----
  const responder = activeSos?.assignedResponder;
  const responderPos =
    status === "assigned" && responder?.location
      ? { lat: responder.location.lat, lng: responder.location.lng }
      : undefined;
  const requestCoords: Coordinates | null =
    activeSos?.location.lat !== undefined && activeSos.location.lng !== undefined
      ? { lat: activeSos.location.lat, lng: activeSos.location.lng }
      : null;
  const liveCoords = hasGps && isLive && activeSos?.location.source !== "manual" ? coords : null;
  const mapLocation = liveCoords ?? requestCoords;

  const stepSubtitle =
    step === 3
      ? status === "assigned"
        ? "Responder accepted"
        : status === "resolved"
          ? "Closed · resolved"
          : status === "cancelled"
            ? "Closed · cancelled"
            : "Request saved · awaiting responder"
      : `Step ${step} of 3`;

  return (
    <Screen>
      <TopBar
        title={step === 3 ? (isLive ? "SOS Active" : "SOS Closed") : "Emergency SOS"}
        subtitle={stepSubtitle}
      />

      {step === 1 ? (
        <div className="animate-fade-up px-5 pt-10 text-center">
          <div className="relative mx-auto grid h-44 w-44 place-items-center">
            <span className="absolute inset-0 rounded-full bg-primary/25 animate-ripple" />
            <button
              type="button"
              aria-label="Initiate Emergency SOS"
              onClick={() => setStep(2)}
              className="press relative grid h-36 w-36 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-sos)] animate-breathe"
            >
              <Siren className="h-9 w-9" />
              <span className="mt-1 text-xl font-extrabold tracking-wide">SOS</span>
            </button>
          </div>

          <h2 className="mt-9 text-[22px] font-extrabold text-navy">Are you in an emergency?</h2>
          <p className="mx-auto mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
            Send your location to RescueLink responders. For immediate danger, always call{" "}
            {EMERGENCY_NUMBER} as well.
          </p>

          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="press h-14 w-full rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-[var(--shadow-sos)]"
            >
              Continue
            </button>
            <CallEmergencyButton />
            <Link
              to="/"
              className="press flex h-14 w-full items-center justify-center rounded-2xl bg-muted text-[15px] font-bold text-navy"
            >
              Cancel
            </Link>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="animate-fade-up space-y-4 px-4 pt-5">
          <h2 className="px-1 text-[20px] font-extrabold text-navy">Confirm Emergency Request</h2>

          {!authLoading && !user ? (
            <Card className="space-y-3 border-warn/40 bg-warn/10">
              <p className="text-[14px] font-bold text-navy">Sign in to send an SOS request</p>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                RescueLink needs to know who is asking for help so responders can reach you. Nothing
                has been sent. If you are in immediate danger, call {EMERGENCY_NUMBER} now.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  className="press flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy text-[13px] font-bold text-white"
                >
                  <LogIn className="h-4 w-4" /> Sign in
                </Link>
                <Link
                  to="/register"
                  className="press flex h-11 items-center justify-center rounded-2xl border border-border bg-card text-[13px] font-bold text-navy"
                >
                  Create account
                </Link>
              </div>
            </Card>
          ) : null}

          <Card className="overflow-hidden p-0">
            {hasGps && coords ? (
              <MiniMapPreview location={coords} zoom={16} label="Your detected location" />
            ) : (
              <div className="grid h-40 w-full place-items-center rounded-t-3xl bg-muted px-6 text-center">
                <div>
                  {gpsStatus === "locating" ? (
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <AlertTriangle className="mx-auto h-6 w-6 text-warn-foreground" />
                  )}
                  <p className="mt-2 text-[12.5px] font-semibold text-navy">
                    {gpsStatus === "locating" && "Looking for your GPS position…"}
                    {gpsStatus === "denied" && "Location permission was denied."}
                    {gpsStatus === "unavailable" && "Your device could not determine a position."}
                    {gpsStatus === "timeout" && "GPS took too long to respond."}
                    {gpsStatus === "unsupported" && "This browser does not support location."}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    Type your address below so responders can find you.
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-info">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  {hasGps && coords ? (
                    <>
                      <p className="text-[14px] font-bold text-navy leading-snug">
                        {locationAddress ?? "Finding the address…"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        GPS location ·{" "}
                        {accuracyMeters !== null
                          ? describeAccuracy(accuracyMeters)
                          : "accuracy unknown"}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">
                        {coords.lat.toFixed(5)}° N, {coords.lng.toFixed(5)}° E
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[14px] font-bold text-navy leading-snug">
                        {trimmedManual || "No location yet"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {trimmedManual
                          ? "Approximate address typed by you · not GPS"
                          : "GPS unavailable · enter an address"}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {!hasGps ? (
                <div>
                  <label htmlFor="sos-address" className="px-1 text-xs font-bold text-navy">
                    Your address or nearest landmark
                  </label>
                  <input
                    id="sos-address"
                    type="text"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    placeholder="e.g. House 12, Road 5, Dhanmondi"
                    autoComplete="street-address"
                    className="mt-2 h-12 w-full rounded-2xl border border-border bg-card px-4 text-[14px] outline-none transition focus:border-ring"
                  />
                </div>
              ) : null}

              <div className="flex items-center gap-2 rounded-2xl bg-safe/10 px-3 py-2.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-safe" />
                <p className="text-[12px] font-medium text-navy">
                  Your location is visible to you, RescueLink administrators and volunteers.
                </p>
              </div>
            </div>
          </Card>

          <div>
            <label htmlFor="sos-phone" className="px-1 text-xs font-bold text-navy">
              Callback phone number
            </label>
            <input
              id="sos-phone"
              type="tel"
              inputMode="tel"
              value={phoneInput}
              onChange={(e) => {
                phoneTouchedRef.current = true;
                setPhoneInput(e.target.value);
              }}
              placeholder="01XXXXXXXXX"
              autoComplete="tel"
              className="mt-2 h-12 w-full rounded-2xl border border-border bg-card px-4 text-[14px] outline-none transition focus:border-ring"
            />
            {phoneInput.trim() === "" ? (
              <p className="mt-1.5 px-1 text-[11.5px] text-warn-foreground">
                No number provided — responders will not be able to call you.
              </p>
            ) : (
              <p className="mt-1.5 px-1 text-[11.5px] text-muted-foreground">{PHONE_HELP_TEXT}</p>
            )}
          </div>

          <div>
            <label htmlFor="sos-msg" className="px-1 text-xs font-bold text-navy">
              Emergency message (optional)
            </label>
            <textarea
              id="sos-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Describe what is happening (optional)"
              className="mt-2 w-full rounded-3xl border border-border bg-card p-4 text-[14px] outline-none transition focus:border-ring"
            />
          </div>

          {submitError ? (
            <div
              role="alert"
              className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-[13.5px] font-extrabold text-destructive">
                    Your SOS request was NOT sent
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-destructive/90">
                    {submitError}
                  </p>
                </div>
              </div>
              <CallEmergencyButton />
            </div>
          ) : null}

          <button
            type="button"
            onClick={startSending}
            disabled={isSubmitting || authLoading || !user || !hasUsableLocation}
            className="press h-14 w-full rounded-2xl bg-primary text-[15px] font-extrabold tracking-wide text-primary-foreground shadow-[var(--shadow-sos)] disabled:opacity-60"
          >
            {isSubmitting ? "SENDING…" : submitError ? "TRY AGAIN" : "CONFIRM SOS"}
          </button>
          {!isSubmitting && user && !hasUsableLocation ? (
            <p className="px-1 text-center text-[12px] text-muted-foreground">
              Enter your address (or allow GPS) to enable sending.
            </p>
          ) : null}
          <CallEmergencyButton />
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={isSubmitting}
            className="press h-13 w-full rounded-2xl py-3.5 text-[14px] font-bold text-muted-foreground disabled:opacity-60"
          >
            Go back
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="animate-fade-up space-y-4 px-4 pt-5">
          {listenerError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-warn/40 bg-warn/10 p-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold text-navy">Live status updates interrupted</p>
                <p className="text-[11.5px] text-muted-foreground">{listenerError}</p>
              </div>
              <button
                type="button"
                onClick={() => setSubscribeKey((k) => k + 1)}
                className="press inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-navy px-3 text-[12px] font-bold text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          ) : null}

          {isLive ? (
            <Card className="bg-primary text-primary-foreground">
              <div className="flex items-center gap-3">
                <span className="relative grid h-12 w-12 place-items-center rounded-full bg-primary-foreground/15">
                  <span className="absolute inset-0 rounded-full bg-primary-foreground/20 animate-ripple" />
                  <Siren className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[16px] font-extrabold">
                    {status === "assigned"
                      ? "A responder accepted your request"
                      : "SOS request saved"}
                  </p>
                  <p className="text-[12.5px] text-primary-foreground/85">
                    {status === "assigned"
                      ? "Stay where you are if it is safe to do so."
                      : "No responder has accepted it yet. Response time is not guaranteed."}
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="space-y-1">
              <p className="text-[16px] font-extrabold text-navy">
                {status === "resolved"
                  ? "This request was closed as resolved"
                  : "This request was cancelled"}
              </p>
              <p className="text-[12.5px] text-muted-foreground">
                Location sharing for this request has stopped.
              </p>
            </Card>
          )}

          {isLive ? <CallEmergencyButton /> : null}

          <Card className="overflow-hidden p-0">
            {mapLocation ? (
              <MiniMapPreview
                location={mapLocation}
                zoom={15}
                responderLocation={responderPos}
                label="Your emergency location"
              />
            ) : null}
            <div className="p-4">
              <p className="text-[14px] font-bold text-navy leading-snug">
                {activeSos?.location.address || "Address not provided"}
              </p>
              <div className="mt-1 flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {activeSos?.location.source === "manual"
                    ? "Approximate address typed by you · not GPS"
                    : !isLive
                      ? "Last location sent to responders"
                      : syncState === "ok" && lastSyncAt
                        ? `GPS shared with responders · updated ${formatTime(lastSyncAt)}`
                        : syncState === "blocked"
                          ? "Your first position was sent. Automatic updates are not available — tell responders if you move."
                          : syncState === "failed"
                            ? "Could not update your location just now. Will retry on the next GPS fix."
                            : `GPS position sent at ${formatTime(activeSos?.createdAt)}`}
                </p>
                {requestCoords ? (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground/80">
                    {requestCoords.lat.toFixed(4)}°, {requestCoords.lng.toFixed(4)}°
                  </span>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <p className="text-[14px] font-bold text-navy">Request status</p>
            <StatusLine
              state="done"
              label={`Request saved to RescueLink${activeSos?.createdAt ? ` · ${formatTime(activeSos.createdAt)}` : ""}`}
            />
            {status === "assigned" && responder ? (
              <StatusLine
                state="done"
                label={`Responder: ${responder.unit}${responder.eta ? ` · ETA ${responder.eta}` : ""}${
                  responder.assignedAt ? ` (accepted ${formatTime(responder.assignedAt)})` : ""
                }`}
              />
            ) : status === "active" ? (
              <StatusLine state="pending" label="Waiting for a responder to accept…" />
            ) : (
              <StatusLine
                state="ended"
                label={status === "resolved" ? "Marked as resolved" : "Cancelled"}
              />
            )}
          </Card>

          {isLive ? (
            <div className="space-y-3">
              {status === "assigned" ? (
                <button
                  type="button"
                  onClick={handleResolveSos}
                  disabled={actionBusy !== null}
                  className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-safe/15 text-[13.5px] font-bold text-safe disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {actionBusy === "resolve" ? "Closing…" : "I'm safe — close as resolved"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleCancelSos}
                disabled={actionBusy !== null}
                className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-muted text-[15px] font-bold text-navy disabled:opacity-60"
              >
                <X className="h-4 w-4" />
                {actionBusy === "cancel" ? "Cancelling…" : "Cancel SOS request"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={startNewRequest}
                className="press h-14 w-full rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground"
              >
                Start a new request
              </button>
              <Link
                to="/"
                className="press flex h-12 w-full items-center justify-center rounded-2xl bg-muted text-[14px] font-bold text-navy"
              >
                Back to home
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </Screen>
  );
}

function StatusLine({ label, state }: { label: string; state: "done" | "pending" | "ended" }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
          state === "done" ? "bg-safe/12 text-safe" : "bg-muted text-muted-foreground"
        }`}
      >
        {state === "pending" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "done" ? (
          <CheckCircle2 className="h-4.5 w-4.5" />
        ) : (
          <X className="h-4 w-4" />
        )}
      </span>
      <p
        className={`text-[13px] ${state === "pending" ? "text-muted-foreground" : "font-semibold text-navy"}`}
      >
        {label}
      </p>
    </div>
  );
}
