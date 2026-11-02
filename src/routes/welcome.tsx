import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/context/AuthContext";
import { getAuthSnapshot } from "@/lib/auth-store";

export const Route = createFileRoute("/welcome")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;

    // If already authenticated, redirect to role-appropriate screen
    const snapshot = getAuthSnapshot();
    if (snapshot.isAuthenticated) {
      if (snapshot.isAdmin) {
        throw redirect({ to: "/admin", replace: true });
      }
      throw redirect({ to: "/", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "RescueLink — Emergency Disaster Response System" },
      {
        name: "description",
        content:
          "Help Is Closer Than You Think. Sign in or create an account to access RescueLink disaster response tools.",
      },
      { property: "og:title", content: "RescueLink" },
      {
        property: "og:description",
        content: "Help Is Closer Than You Think. Emergency Disaster Response System.",
      },
    ],
  }),
  component: WelcomeScreen,
});

function WelcomeScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, isAdmin, profile } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      if (isAdmin || profile?.role === "admin") {
        navigate({ to: "/admin", replace: true });
      } else {
        navigate({ to: "/", replace: true });
      }
    }
  }, [isAuthenticated, loading, isAdmin, profile, navigate]);

  return (
    <div
      className="relative flex min-h-screen w-full flex-col justify-between overflow-x-hidden select-none"
      style={{
        background:
          "linear-gradient(180deg, #0C366C 0%, #15407B 10%, #38639F 20%, #7A9ECE 30%, #C1D5EF 40%, #F2F7FD 49%, #FFFFFF 56%, #FFFFFF 100%)",
      }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-between px-7 pb-10 pt-[16vh] sm:pb-12">
        {/* Upper-Middle Logo */}
        <div className="flex items-center justify-center">
          <img
            src="/rescuelink-logo.png"
            alt="RescueLink"
            className="w-[62%] max-w-[275px] h-auto object-contain pointer-events-none"
            style={{
              aspectRatio: "1024 / 833",
            }}
          />
        </div>

        {/* Lower Portion: Tagline & Auth Actions */}
        <div className="flex w-full flex-col items-center">
          {/* Tagline */}
          <p className="mb-7 text-center text-[15.5px] font-semibold text-[#05295B] tracking-tight">
            Help Is Closer Than You Think.
          </p>

          {/* Action Buttons Stack */}
          <div className="flex w-full flex-col gap-3">
            {/* Sign In Button */}
            <Link
              to="/login"
              className="press flex h-[54px] w-full items-center justify-center rounded-full bg-[#052D62] text-[16px] font-bold text-white shadow-none transition-transform active:scale-[0.98]"
            >
              Sign In
            </Link>

            {/* Create Account Button */}
            <Link
              to="/register"
              className="press flex h-[54px] w-full items-center justify-center rounded-full border-[1.5px] border-[#052D62] bg-white text-[16px] font-bold text-[#052D62] shadow-none transition-transform active:scale-[0.98]"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
