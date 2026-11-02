import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome to RescueLink — Emergency Disaster Response System" },
      {
        name: "description",
        content:
          "Stay safe during emergencies with RescueLink: share your location with trusted contacts, locate nearby hospitals, police, and fire services, and send instant SOS alerts.",
      },
      { property: "og:title", content: "RescueLink Onboarding" },
      {
        property: "og:description",
        content: "Stay safe during emergencies with RescueLink. Help is closer than you think.",
      },
    ],
  }),
  component: OnboardingScreen,
});

export interface OnboardingSlide {
  id: string;
  title: string;
  description: string;
  imageSrc: string;
  alt: string;
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: "together",
    title: "Stay Safe Together",
    description:
      "Share your location with trusted contacts and help each other stay safe during emergencies.",
    imageSrc: "/images/onboarding/screen1-together.png",
    alt: "Illustration of smartphone with map, trusted contacts avatars, and security shield",
  },
  {
    id: "nearby",
    title: "Find Help Nearby",
    description:
      "Locate nearby hospitals, police stations, and fire services when every second matters.",
    imageSrc: "/images/onboarding/screen2-nearby.png",
    alt: "Illustration of smartphone with map route to nearby emergency services: hospital, police, and fire",
  },
  {
    id: "fast",
    title: "Get Help Fast",
    description: "Send an SOS alert with your location when you need emergency help.",
    imageSrc: "/images/onboarding/screen3-fast.png",
    alt: "Illustration of smartphone with glowing SOS alert button, medical cross shield, and map pin",
  },
];

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, profile } = useAuth();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.location.search.includes("reset_intro=1")) {
        localStorage.removeItem("rescuelink_intro_completed");
      }
    } catch {
      // ignore
    }
  }, []);

  const currentSlide = ONBOARDING_SLIDES[currentIdx]!;
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === ONBOARDING_SLIDES.length - 1;

  const handleFinish = (targetPath?: string) => {
    if (navigating) return;
    setNavigating(true);

    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("rescuelink_intro_completed", "true");
      }
    } catch {
      // ignore storage access errors (private browsing, cookies blocked, etc.)
    }

    const destination =
      targetPath ??
      (isAuthenticated ? (isAdmin || profile?.role === "admin" ? "/admin" : "/") : "/welcome");
    // Replace history entry so browser Back never loops back to onboarding slides
    navigate({ to: destination, replace: true });
  };

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      setCurrentIdx((prev) => Math.min(prev + 1, ONBOARDING_SLIDES.length - 1));
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setCurrentIdx((prev) => Math.max(prev - 1, 0));
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between overflow-x-hidden bg-[#FEFEFE] select-none text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-between">
        {/* Top Header with Skip Button */}
        <header className="flex w-full items-center justify-end px-6 pt-6 sm:pt-8">
          <button
            type="button"
            onClick={() => handleFinish()}
            disabled={navigating}
            className="press p-2 text-[15px] font-semibold text-[#0A1C3E] transition-opacity hover:opacity-75 active:scale-95 disabled:pointer-events-none"
            aria-label="Skip introduction"
            data-testid="skip-button"
          >
            Skip
          </button>
        </header>

        {/* Center Content: Illustration, Heading & Description */}
        <main
          key={currentSlide.id}
          className="flex flex-1 flex-col items-center justify-center px-6 pb-6 pt-2 text-center animate-fade-in"
        >
          {/* Main Illustration */}
          <div className="relative flex h-[230px] sm:h-[270px] w-full max-w-[340px] items-center justify-center">
            <img
              src={currentSlide.imageSrc}
              alt={currentSlide.alt}
              className="max-h-full max-w-full object-contain pointer-events-none drop-shadow-sm transition-all duration-300"
              loading="eager"
            />
          </div>

          {/* Heading */}
          <h1 className="mt-6 text-center text-[26px] sm:text-[28px] font-bold text-[#0A1C3E] tracking-tight">
            {currentSlide.title}
          </h1>

          {/* Description */}
          <p className="mt-3 max-w-[310px] text-center text-[14px] sm:text-[14.5px] leading-relaxed text-[#4A5568]">
            {currentSlide.description}
          </p>
        </main>

        {/* Deep Navy Bottom Panel with Symmetrical Wave Edge */}
        <footer className="relative w-full overflow-hidden">
          {/* Smooth Curved Wave SVG Edge */}
          <svg
            viewBox="0 0 375 70"
            preserveAspectRatio="none"
            className="block h-12 sm:h-14 w-full text-[#14305E]"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M 0 55 C 60 25 110 25 180 50 C 250 75 320 50 375 0 L 375 70 L 0 70 Z" />
          </svg>

          {/* Navy Blue Controls Bar */}
          <div className="bg-[#14305E] px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-1">
            <div className="flex h-16 items-center justify-between">
              {/* Previous Button (Left Circle) */}
              <button
                type="button"
                onClick={handlePrev}
                disabled={isFirst || navigating}
                aria-label="Previous slide"
                data-testid="onboarding-prev-btn"
                className={cn(
                  "press flex h-[50px] w-[50px] items-center justify-center rounded-full bg-white text-[#14305E] shadow-lg transition-all active:scale-95",
                  isFirst
                    ? "opacity-0 pointer-events-none cursor-default"
                    : "hover:bg-white/95 cursor-pointer",
                )}
              >
                <ArrowLeft className="h-5 w-5 stroke-[2.5]" />
              </button>

              {/* Pagination Dots (Center) */}
              <div
                className="flex items-center gap-2.5"
                role="tablist"
                aria-label="Onboarding slide indicators"
              >
                {ONBOARDING_SLIDES.map((slide, idx) => {
                  const isActive = idx === currentIdx;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => {
                        if (!navigating) setCurrentIdx(idx);
                      }}
                      aria-label={`Go to slide ${idx + 1}: ${slide.title}`}
                      data-testid={`pagination-dot-${idx + 1}`}
                      className={cn(
                        "rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
                        isActive
                          ? "h-2.5 w-2.5 bg-white shadow-sm"
                          : "h-2 w-2 bg-[#4E6B95] hover:bg-white/60 cursor-pointer",
                      )}
                    />
                  );
                })}
              </div>

              {/* Next / Get Started Action (Right Circle) */}
              <button
                type="button"
                onClick={handleNext}
                disabled={navigating}
                aria-label={isLast ? "Get Started" : "Next slide"}
                data-testid={isLast ? "get-started-button" : "onboarding-next-btn"}
                className="press flex h-[50px] w-[50px] items-center justify-center rounded-full bg-white text-[#14305E] shadow-lg transition-all hover:bg-white/95 active:scale-95 cursor-pointer"
              >
                <ArrowRight className="h-5 w-5 stroke-[2.5]" />
                <span className="sr-only">{isLast ? "Get Started" : "Next"}</span>
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
