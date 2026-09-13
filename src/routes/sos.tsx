import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Siren, MapPin, CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";

import { Card, Screen, TopBar } from "@/components/rl";

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

function SosScreen() {
  const [step, setStep] = useState<Step>(1);
  const [message, setMessage] = useState("I'm at Dhanmondi, Dhaka.");
  const [stage, setStage] = useState(0);

  const startSending = () => {
    setStep(3);
    setStage(0);
    setTimeout(() => setStage(1), 2200);
    setTimeout(() => setStage(2), 4600);
  };

  return (
    <Screen>
      <TopBar
        title={step === 3 ? "SOS Active" : "Emergency SOS"}
        subtitle={step === 3 ? "Responders notified" : `Step ${step} of 2`}
      />

      {step === 1 ? (
        <div className="animate-fade-up px-5 pt-10 text-center">
          <div className="relative mx-auto grid h-44 w-44 place-items-center">
            <span className="absolute inset-0 rounded-full bg-primary/25 animate-ripple" />
            <button
              onClick={() => setStep(2)}
              className="press relative grid h-36 w-36 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-sos)] animate-breathe"
            >
              <Siren className="h-9 w-9" />
              <span className="mt-1 text-xl font-extrabold tracking-wide">SOS</span>
            </button>
          </div>

          <h2 className="mt-9 text-[22px] font-extrabold text-navy">Are you in an emergency?</h2>
          <p className="mx-auto mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
            Send your location to nearby emergency responders. Help stays with you until you're safe.
          </p>

          <div className="mt-8 space-y-3">
            <button
              onClick={() => setStep(2)}
              className="press h-14 w-full rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-[var(--shadow-sos)]"
            >
              Continue
            </button>
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

          <Card className="p-0">
            <MapPreview />
            <div className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-info">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-navy">Dhanmondi 27, Dhaka</p>
                  <p className="text-xs text-muted-foreground">
                    Location accuracy · ±8 m (GPS strong)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-safe/10 px-3 py-2.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-safe" />
                <p className="text-[12px] font-medium text-navy">
                  Only verified responders can see your location.
                </p>
              </div>
            </div>
          </Card>

          <div>
            <label htmlFor="sos-msg" className="px-1 text-xs font-bold text-navy">
              Emergency message (optional)
            </label>
            <textarea
              id="sos-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-3xl border border-border bg-card p-4 text-[14px] outline-none transition focus:border-ring"
            />
          </div>

          <button
            onClick={startSending}
            className="press h-14 w-full rounded-2xl bg-primary text-[15px] font-extrabold tracking-wide text-primary-foreground shadow-[var(--shadow-sos)]"
          >
            CONFIRM SOS
          </button>
          <button
            onClick={() => setStep(1)}
            className="press h-13 w-full rounded-2xl py-3.5 text-[14px] font-bold text-muted-foreground"
          >
            Go back
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="animate-fade-up space-y-4 px-4 pt-5">
          <Card className="bg-primary text-primary-foreground">
            <div className="flex items-center gap-3">
              <span className="relative grid h-12 w-12 place-items-center rounded-full bg-primary-foreground/15">
                <span className="absolute inset-0 rounded-full bg-primary-foreground/20 animate-ripple" />
                <Siren className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[16px] font-extrabold">SOS Request Sent</p>
                <p className="text-[12.5px] text-primary-foreground/85">
                  Your live location is being shared.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-0">
            <MapPreview />
            <div className="p-4">
              <p className="text-[14px] font-bold text-navy">Dhanmondi 27, Dhaka</p>
              <p className="text-xs text-muted-foreground">Live location · updating every 10s</p>
            </div>
          </Card>

          <Card className="space-y-4">
            <p className="text-[14px] font-bold text-navy">Request status</p>
            <StatusLine done label="Searching for nearby responders…" active={stage >= 0} />
            <StatusLine done={stage >= 1} label="Help request received" active={stage >= 1} />
            <StatusLine
              done={stage >= 2}
              label="Responder assigned · Unit 04, ETA 7 min"
              active={stage >= 2}
            />
          </Card>

          {stage < 2 ? (
            <button
              onClick={() => setStep(1)}
              className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-muted text-[15px] font-bold text-navy"
            >
              <X className="h-4 w-4" /> Cancel SOS
            </button>
          ) : (
            <p className="px-2 text-center text-[12.5px] text-muted-foreground">
              A responder is on the way. Stay where you are if it is safe to do so.
            </p>
          )}
        </div>
      ) : null}
    </Screen>
  );
}

function StatusLine({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
          done ? "bg-safe/12 text-safe" : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? (
          <CheckCircle2 className="h-4.5 w-4.5" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
      </span>
      <p
        className={`text-[13px] ${active ? "font-semibold text-navy" : "text-muted-foreground"}`}
      >
        {label}
      </p>
    </div>
  );
}

function MapPreview() {
  return (
    <div className="relative h-40 overflow-hidden rounded-t-3xl bg-accent">
      <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(oklch(0.88_0.03_248)_1px,transparent_1px),linear-gradient(90deg,oklch(0.88_0.03_248)_1px,transparent_1px)] [background-size:26px_26px]" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute -inset-6 rounded-full bg-info/25 animate-ripple" />
        <span className="relative grid h-9 w-9 place-items-center rounded-full border-4 border-surface bg-info shadow-[var(--shadow-card)]" />
      </div>
    </div>
  );
}
