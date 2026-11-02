import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { CheckCircle2, AlertCircle, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";
import { resetPassword, getFriendlyPasswordResetError } from "@/lib/firebase/auth";
import { validateEmail } from "@/lib/auth-validation";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — RescueLink" },
      {
        name: "description",
        content: "Reset your RescueLink disaster response account password.",
      },
      { property: "og:title", content: "Reset Password — RescueLink" },
      {
        property: "og:description",
        content: "Reset your password to regain access to RescueLink.",
      },
    ],
  }),
  component: ForgotPasswordScreen,
});

function ForgotPasswordScreen() {
  const { isFirebaseReady } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const problem = validateEmail(email);
    if (problem) {
      setErrorMessage(problem);
      return;
    }

    setLoading(true);
    try {
      // Resolves only once Firebase accepted the request. The wording stays neutral on purpose:
      // we never reveal whether an address has an account.
      await resetPassword(email);
      if (!mountedRef.current) return;
      setSubmitted(true);
      toast.success("Request received", {
        description: `If an account exists for ${email.trim()}, a reset link is on its way.`,
      });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const friendlyMsg = getFriendlyPasswordResetError(err);
      setErrorMessage(friendlyMsg);
      toast.error("Password reset request failed", { description: friendlyMsg });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF]">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-between px-6 py-8">
        <div>
          {/* Header Area */}
          <div className="relative flex items-center justify-center pt-2">
            <Link
              to="/login"
              className="press absolute left-0 p-1 text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Back to sign in"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-[26px] font-bold tracking-tight text-[#1E293B]">Reset Password</h1>
          </div>

          {/* Subtitle */}
          <p className="mt-2 text-center text-[13.5px] leading-relaxed text-[#6B7280]">
            Enter your email to receive a password reset link
          </p>

          {/* Unconfigured Firebase Keys Banner */}
          {!isFirebaseReady && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <span className="font-bold">Firebase Configuration Required:</span> Add your
                  Firebase keys to{" "}
                  <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">.env</code>.
                </div>
              </div>
            </div>
          )}

          {/* Success Confirmation State */}
          {submitted ? (
            <div className="mt-8 rounded-2xl border border-gray-100 bg-[#F6F6F6] p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#102D56]/10 text-[#102D56]">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-[#1E293B]">Check Your Email</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">
                If an account exists for{" "}
                <span className="font-semibold text-[#1E293B]">{email.trim()}</span>, a password
                reset link is on its way. It can take a few minutes; check your spam folder too.
              </p>
              <div className="mt-6 space-y-2.5">
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="press flex h-12 w-full items-center justify-center rounded-full border border-gray-300 bg-white text-[13.5px] font-medium text-[#1E293B]"
                >
                  Send to a different email
                </button>
                <Link
                  to="/login"
                  className="press flex h-12 w-full items-center justify-center rounded-full bg-[#102D56] text-[13.5px] font-semibold text-white shadow-none"
                >
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Error Banner */}
              {errorMessage && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#E6293A]/20 bg-[#E6293A]/10 p-3 text-[12.5px] text-[#E6293A]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#E6293A]" />
                  <span className="leading-snug">{errorMessage}</span>
                </div>
              )}

              {/* Reset Form */}
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="reset-email"
                    className="block text-[13px] font-medium text-[#1E293B]"
                  >
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="mt-1.5 h-12 w-full rounded-xl border border-transparent bg-[#F6F6F6] px-4 text-[14px] text-[#1E293B] placeholder:text-[#9CA3AF] outline-none transition-all focus:border-[#102D56]/30 focus:bg-white focus:ring-2 focus:ring-[#102D56]/10"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="press flex h-[52px] w-full items-center justify-center rounded-full bg-[#102D56] text-[15.5px] font-semibold text-white shadow-none transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        <span>Sending Link...</span>
                      </div>
                    ) : (
                      <span>Send Reset Link</span>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Bottom Link */}
        <div className="mt-8 pb-2 text-center">
          <p className="text-[13px] text-[#6B7280]">
            Remember your password?{" "}
            <Link to="/login" className="font-medium text-[#102D56] underline hover:opacity-80">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
