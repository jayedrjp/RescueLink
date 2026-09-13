import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { HomeIcon, Siren, BellRing } from "lucide-react";

import { Logo } from "@/components/rl";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome to RescueLink — Find Safety Faster" },
      {
        name: "description",
        content:
          "A short tour of RescueLink: find shelters, send an SOS with your live location, and stay connected with real-time alerts.",
      },
      { property: "og:title", content: "Welcome to RescueLink" },
      {
        property: "og:description",
        content: "Find safety faster, get help when you need it, and stay connected during disasters.",
      },
    ],
  }),
  component: Onboarding,
});

const slides = [
  {
    icon: HomeIcon,
    tone: "bg-safe/10 text-safe",
    title: "Find Safety Faster",
    body: "Find nearby shelters and emergency services with live availability, in seconds.",
  },
  {
    icon: Siren,
    tone: "bg-primary/10 text-primary",
    title: "Get Help When You Need It",
    body: "Send an SOS request with your live location to verified responders near you.",
  },
  {
    icon: BellRing,
    tone: "bg-accent text-info",
    title: "Stay Connected",
    body: "Receive real-time flood, cyclone and storm alerts for your exact area.",
  },
];

function Onboarding() {
  const [i, setI] = useState(0);
  const slide = slides[i]!;
  const Icon = slide.icon;
  const last = i === slides.length - 1;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-background px-6 pb-10 pt-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="h-10 w-10" />
          <div className="leading-tight">
            <p className="text-[15px] font-extrabold text-navy">RescueLink</p>
            <p className="bn text-[11px] text-muted-foreground">সাহায্য হোক সহজ</p>
          </div>
        </div>
        {!last ? (
          <Link to="/" className="text-[12.5px] font-bold text-muted-foreground">
            Skip
          </Link>
        ) : null}
      </div>

      <div key={i} className="animate-fade-up flex flex-1 flex-col items-center justify-center text-center">
        <span className={`grid h-28 w-28 place-items-center rounded-[36px] ${slide.tone}`}>
          <Icon className="h-12 w-12" />
        </span>
        <h1 className="mt-9 text-[27px] font-extrabold leading-tight text-navy">{slide.title}</h1>
        <p className="mt-3 max-w-[300px] text-[14.5px] leading-relaxed text-muted-foreground">
          {slide.body}
        </p>
      </div>

      <div className="mb-7 flex justify-center gap-2">
        {slides.map((_, idx) => (
          <span
            key={idx}
            className={`h-2 rounded-full transition-all duration-300 ${
              idx === i ? "w-7 bg-primary" : "w-2 bg-border"
            }`}
          />
        ))}
      </div>

      {last ? (
        <Link
          to="/permissions"
          className="press flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-[var(--shadow-sos)]"
        >
          Get Started
        </Link>
      ) : (
        <button
          onClick={() => setI(i + 1)}
          className="press h-14 w-full rounded-2xl bg-navy text-[15px] font-bold text-navy-foreground"
        >
          Continue
        </button>
      )}
    </div>
  );
}
