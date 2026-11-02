import { createFileRoute, Link } from "@tanstack/react-router";
import { Siren, Home, PhoneCall, AlertTriangle, Users, Radio, Hospital } from "lucide-react";

import { Card, Screen, SectionHeader, TopBar } from "@/components/rl";

export const Route = createFileRoute("/instructions")({
  head: () => ({
    meta: [
      { title: "Emergency System Instructions — RescueLink" },
      {
        name: "description",
        content:
          "Official instructions for using the RescueLink disaster response system: triggering SOS alerts, locating shelters, accessing emergency helplines, and tracking BMD weather warnings.",
      },
      { property: "og:title", content: "Emergency System Instructions — RescueLink" },
      {
        property: "og:description",
        content:
          "Step-by-step instructions for emergency response, SOS dispatch, shelter navigation, and weather safety.",
      },
    ],
  }),
  component: InstructionsScreen,
});

const INSTRUCTION_MODULES = [
  {
    id: "sos",
    icon: Siren,
    iconTone: "bg-primary/10 text-primary",
    badge: "Life-Threatening",
    badgeColor: "bg-primary/10 text-primary border-primary/20",
    title: "1. Triggering an SOS Emergency Alert",
    summary: "When you or someone near you needs urgent rescue, medical assistance, or evacuation:",
    steps: [
      "Tap the prominent red SOS button centered in the bottom navigation bar or on the Home screen.",
      "The app acquires your live GPS coordinates. If GPS is weak or denied, enter your landmark or street address manually.",
      "Select your emergency situation (Flood / Cyclone, Medical, Fire, trapped / stranded).",
      "Tap 'Send SOS Now'. Your alert is broadcast immediately to the emergency response team and dispatch dashboard.",
      "If you are in immediate peril, use the on-screen button to dial National Emergency 999 directly without leaving the app.",
    ],
  },
  {
    id: "shelters",
    icon: Home,
    iconTone: "bg-safe/12 text-safe",
    badge: "Evacuation & Safe Havens",
    badgeColor: "bg-safe/12 text-safe border-safe/20",
    title: "2. Locating & Navigating to Shelters",
    summary:
      "Find official government and community flood and cyclone shelters with live occupancy status:",
    steps: [
      "Tap 'Find Shelter' on the Home screen or navigate to the Shelters section.",
      "Browse shelters sorted by proximity to your current location.",
      "Review the occupancy bar: Green indicates ample space, amber indicates near capacity, and red indicates full.",
      "Check available facilities such as potable drinking water, medical staff, backup electricity, and sanitation.",
      "Tap 'Get Directions' to view the safest route on the interactive disaster map.",
    ],
  },
  {
    id: "helplines",
    icon: PhoneCall,
    iconTone: "bg-accent text-info",
    badge: "24/7 Helplines",
    badgeColor: "bg-accent text-info border-info/20",
    title: "3. Emergency Services & Official Helplines",
    summary:
      "RescueLink provides direct cellular dialing for national emergency hotlines that work even on low data connectivity:",
    steps: [
      "999 — National Emergency Service (Police, Fire & Civil Defence, Ambulance).",
      "109 — National Disaster Early Warning & Helpline (MoDMR).",
      "16163 — Fire Service and Civil Defence Central Control Room.",
      "333 — National Government Services and Relief Distribution Helpline.",
      "Tap any service card in Emergency Services to initiate an immediate phone call.",
    ],
  },
  {
    id: "weather",
    icon: AlertTriangle,
    iconTone: "bg-warn/15 text-warn",
    badge: "Early Warning",
    badgeColor: "bg-warn/15 text-warn border-warn/20",
    title: "4. Weather Forecasts & BMD Warnings",
    summary:
      "Stay ahead of dangerous weather with live data and official Bangladesh Meteorological Department alerts:",
    steps: [
      "The Home screen displays live temperature, rainfall, wind speeds, and hourly forecast from Open-Meteo.",
      "When official BMD warning bulletins or severe weather conditions are detected, an in-app banner and alert badge will notify you.",
      "Review the Alerts tab for official cyclone signal numbers (Signal 1 to 10), flood inundation warnings, and safety guidelines.",
      "Keep push notifications enabled in Settings & Permissions to receive critical storm warnings while the app is in the background.",
    ],
  },
  {
    id: "contacts",
    icon: Users,
    iconTone: "bg-navy/10 text-navy",
    badge: "Family & Circle",
    badgeColor: "bg-navy/10 text-navy border-navy/20",
    title: "5. Emergency Contacts & Community Safety",
    summary: "Protect your loved ones by establishing a verified emergency contact circle:",
    steps: [
      "Open Profile → Emergency Contacts to add trusted family members, close friends, or neighbors.",
      "Save valid Bangladesh telephone numbers (+880 or local 01xxxxxxxxx).",
      "In an emergency, your saved contacts can be reached with one tap.",
      "First responders and shelter administrators can access these contacts to assist with reuniting separated families.",
    ],
  },
];

function InstructionsScreen() {
  return (
    <Screen>
      <TopBar
        title="Emergency Instructions"
        subtitle="RescueLink Disaster System Guide"
        back="/profile"
      />

      {/* Hero Guide Card */}
      <div className="px-4 pt-4">
        <div className="rounded-3xl bg-navy p-5 text-white shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 text-white">
              <Radio className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-[17px] font-bold">Standard Operating Procedures</h2>
              <p className="text-xs text-white/80">
                Official guide for citizens and volunteers during crisis
              </p>
            </div>
          </div>
          <p className="mt-3.5 text-[13px] leading-relaxed text-white/90">
            RescueLink connects citizens in Bangladesh directly with emergency dispatchers, nearby
            shelters, and first responders. Review these guidelines before disaster strikes.
          </p>
        </div>
      </div>

      {/* Instruction Modules */}
      <div className="stagger-children space-y-4 px-4 pt-6">
        {INSTRUCTION_MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <Card key={mod.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${mod.iconTone}`}
                  >
                    <Icon className="h-5.5 w-5.5" />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-bold text-navy leading-snug">{mod.title}</h3>
                    <span
                      className={`inline-block mt-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${mod.badgeColor}`}
                    >
                      {mod.badge}
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                {mod.summary}
              </p>

              <ol className="mt-3 space-y-2 border-t border-border/60 pt-3">
                {mod.steps.map((step, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-foreground"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold text-navy">
                      {idx + 1}
                    </span>
                    <span className="flex-1">{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
      </div>

      {/* Quick Access Action Bar */}
      <div className="px-4 pt-6 pb-4">
        <SectionHeader title="Quick Actions" />
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/sos"
            className="press flex flex-col items-center justify-center rounded-2xl bg-primary p-4 text-center text-primary-foreground shadow-[var(--shadow-sos)]"
          >
            <Siren className="h-6 w-6 mb-1.5" />
            <span className="text-[14px] font-bold">Open SOS Dispatch</span>
            <span className="text-[11px] opacity-90">Send emergency alert</span>
          </Link>
          <Link
            to="/services"
            className="press flex flex-col items-center justify-center rounded-2xl bg-muted p-4 text-center text-navy shadow-xs"
          >
            <Hospital className="h-6 w-6 mb-1.5 text-info" />
            <span className="text-[14px] font-bold">Emergency Services</span>
            <span className="text-[11px] text-muted-foreground">Call 999 & responders</span>
          </Link>
        </div>
      </div>
    </Screen>
  );
}
