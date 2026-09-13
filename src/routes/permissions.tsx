import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, BellRing, Users, Check } from "lucide-react";

import { Card, Screen, TopBar } from "@/components/rl";

export const Route = createFileRoute("/permissions")({
  head: () => ({
    meta: [
      { title: "App Permissions — RescueLink" },
      {
        name: "description",
        content:
          "Understand exactly why RescueLink asks for location, notifications and emergency contacts before you allow them.",
      },
      { property: "og:title", content: "App Permissions — RescueLink" },
      {
        property: "og:description",
        content: "Clear, friendly explanations for every permission RescueLink requests.",
      },
    ],
  }),
  component: Permissions,
});

const items = [
  {
    id: "location",
    icon: MapPin,
    tone: "bg-accent text-info",
    title: "Location",
    body: "Your location helps us find nearby shelters and send your position during an SOS.",
    cta: "Allow Location",
  },
  {
    id: "notifications",
    icon: BellRing,
    tone: "bg-primary/10 text-primary",
    title: "Notifications",
    body: "We only notify you about disaster warnings, SOS updates and shelter changes near you.",
    cta: "Allow Notifications",
  },
  {
    id: "contacts",
    icon: Users,
    tone: "bg-safe/10 text-safe",
    title: "Emergency Contacts",
    body: "Add trusted contacts so we can alert them automatically when you send an SOS.",
    cta: "Allow Contacts",
  },
];

function Permissions() {
  const [granted, setGranted] = useState<string[]>([]);

  return (
    <Screen>
      <TopBar title="Permissions" subtitle="You stay in control" back="/onboarding" />

      <div className="px-4 pt-5">
        <h2 className="text-[21px] font-extrabold leading-tight text-navy">
          Let's set you up for safety
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          We explain every permission before asking. You can change these anytime in Settings.
        </p>
      </div>

      <div className="stagger-children space-y-3 px-4 pt-6">
        {items.map(({ id, icon: Icon, tone, title, body, cta }) => {
          const on = granted.includes(id);
          return (
            <Card key={id}>
              <div className="flex items-start gap-3">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tone}`}>
                  <Icon className="h-5.5 w-5.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-navy">{title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </div>
              <button
                onClick={() => setGranted((p) => (p.includes(id) ? p : [...p, id]))}
                className={`press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[13.5px] font-bold ${
                  on ? "bg-safe/12 text-safe" : "bg-navy text-navy-foreground"
                }`}
              >
                {on ? (
                  <>
                    <Check className="h-4 w-4" /> Allowed
                  </>
                ) : (
                  cta
                )}
              </button>
            </Card>
          );
        })}
      </div>

      <div className="px-4 pt-6">
        <Link
          to="/"
          className="press flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-[var(--shadow-sos)]"
        >
          Continue to RescueLink
        </Link>
      </div>
    </Screen>
  );
}
