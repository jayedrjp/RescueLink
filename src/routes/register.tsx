import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, AlertCircle, Check, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";
import { registerUser, signInWithGoogle, getFriendlyAuthErrorMessage } from "@/lib/firebase/auth";
import {
  PASSWORD_HELP_TEXT,
  PASSWORD_MIN_LENGTH,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "@/lib/auth-validation";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create Account — RescueLink" },
      {
        name: "description",
        content:
          "Create a citizen account on RescueLink to access emergency disaster relief services.",
      },
      { property: "og:title", content: "Create Account — RescueLink" },
      {
        property: "og:description",
        content: "Fill your information below to register with RescueLink.",
      },
    ],
  }),
  component: RegisterScreen,
});

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-black">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.36c.64-.78 1.08-1.86.96-2.95-1 .04-2.14.65-2.79 1.43-.57.67-.99 1.76-.85 2.81 1.11.09 2.05-.51 2.68-1.29z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-[#1877F2]">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function RegisterScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, isFirebaseReady, loading: authLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Leave this page once signed in and the profile has been resolved (the AuthContext loads it
  // once; this screen never reads or writes the profile itself).
  useEffect(() => {
    if (loading || googleLoading) return;
    if (!authLoading && isAuthenticated) {
      navigate({ to: "/", replace: true });
    }
  }, [isAuthenticated, authLoading, loading, googleLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation (shared rules, so the messages always match what is enforced)
    const problem =
      validateDisplayName(fullName) ?? validateEmail(email) ?? validatePassword(password);
    if (problem) {
      setErrorMessage(problem);
      return;
    }

    if (!agreedToTerms) {
      setErrorMessage("Please agree with the Terms & Condition to continue.");
      return;
    }

    setLoading(true);
    try {
      await registerUser(fullName, email, password);
      toast.success("Account created successfully!", {
        description: "Welcome to RescueLink. You are now registered.",
      });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const friendlyMsg = getFriendlyAuthErrorMessage(err);
      setErrorMessage(friendlyMsg);
      toast.error("Registration failed", { description: friendlyMsg });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setErrorMessage(null);
    setGoogleLoading(true);
    try {
      const { isNewUser } = await signInWithGoogle();
      toast.success(isNewUser ? "Welcome to RescueLink!" : "Welcome back to RescueLink!", {
        description: isNewUser
          ? "Your account is ready with Google."
          : "You are signed in with Google.",
      });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const code = (err as { code?: string })?.code;
      if (code === "auth/popup-closed-by-user") {
        toast.info("Google sign-up was cancelled.");
      } else {
        const friendlyMsg = getFriendlyAuthErrorMessage(err);
        setErrorMessage(friendlyMsg);
        toast.error("Google sign-up failed", { description: friendlyMsg });
      }
    } finally {
      if (mountedRef.current) setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF]">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-between px-6 py-6 sm:py-8">
        {/* Vertically Centered Main Authentication Content Group */}
        <div className="my-auto flex w-full flex-col justify-center py-4">
          {/* Centered Heading */}
          <h1 className="text-center text-[26px] font-bold tracking-tight text-[#1E293B]">
            Create Account
          </h1>

          {/* Subtitle */}
          <p className="mt-2 text-center text-[13.5px] leading-relaxed text-[#6B7280]">
            Fill your information below or register
            <br />
            with your social account.
          </p>

          {/* Unconfigured Firebase Keys Banner */}
          {!isFirebaseReady && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <span className="font-bold">Firebase Configuration Required:</span> Add your
                  Firebase keys to{" "}
                  <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">.env</code> to
                  enable live registration.
                </div>
              </div>
            </div>
          )}

          {/* Validation / Error Message using Emergency Red */}
          {errorMessage && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#E6293A]/20 bg-[#E6293A]/10 p-3 text-[12.5px] text-[#E6293A]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#E6293A]" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Name Field */}
            <div>
              <label
                htmlFor="register-name"
                className="block text-[13px] font-medium text-[#1E293B]"
              >
                Name
              </label>
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex. John Doe"
                className="mt-1.5 h-12 w-full rounded-xl border border-transparent bg-[#F6F6F6] px-4 text-[14px] text-[#1E293B] placeholder:text-[#9CA3AF] outline-none transition-all focus:border-[#102D56]/30 focus:bg-white focus:ring-2 focus:ring-[#102D56]/10"
              />
            </div>

            {/* Email Field */}
            <div>
              <label
                htmlFor="register-email"
                className="block text-[13px] font-medium text-[#1E293B]"
              >
                Email
              </label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="mt-1.5 h-12 w-full rounded-xl border border-transparent bg-[#F6F6F6] px-4 text-[14px] text-[#1E293B] placeholder:text-[#9CA3AF] outline-none transition-all focus:border-[#102D56]/30 focus:bg-white focus:ring-2 focus:ring-[#102D56]/10"
              />
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="register-password"
                className="block text-[13px] font-medium text-[#1E293B]"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  aria-describedby="register-password-help"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••••"
                  className="h-12 w-full rounded-xl border border-transparent bg-[#F6F6F6] pl-4 pr-11 text-[14px] text-[#1E293B] placeholder:text-[#9CA3AF] outline-none transition-all focus:border-[#102D56]/30 focus:bg-white focus:ring-2 focus:ring-[#102D56]/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-500 hover:text-gray-800 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <Eye className="h-5 w-5 stroke-[1.75]" />
                  ) : (
                    <EyeOff className="h-5 w-5 stroke-[1.75]" />
                  )}
                </button>
              </div>
              <p id="register-password-help" className="mt-1.5 text-[11.5px] text-[#6B7280]">
                {PASSWORD_HELP_TEXT}
              </p>
            </div>

            {/* Terms and Conditions Checkbox */}
            <div className="pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                    agreedToTerms
                      ? "border-[#102D56] bg-[#102D56] text-white"
                      : "border-gray-300 bg-white hover:border-gray-400"
                  }`}
                >
                  {agreedToTerms && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                </span>
                <span className="text-[13px] text-[#475569]">
                  Agree with{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowTermsModal(true);
                    }}
                    className="font-medium text-[#102D56] underline hover:opacity-80"
                  >
                    Terms & Condition
                  </button>
                </span>
              </label>
            </div>

            {/* Sign Up Button (Pill-shaped, Primary Navy Blue) */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="press flex h-[52px] w-full items-center justify-center rounded-full bg-[#102D56] text-[15.5px] font-semibold text-white shadow-none transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Signing Up...</span>
                  </div>
                ) : (
                  <span>Sign Up</span>
                )}
              </button>
            </div>
          </form>

          {/* Centered Divider */}
          <div className="relative my-7 flex items-center justify-center">
            <div className="w-full border-t border-gray-200" />
            <span className="absolute bg-[#FFFFFF] px-3 text-[12px] text-[#6B7280]">
              Or sign up with
            </span>
          </div>

          {/* Social Sign-up Buttons Row (Apple, Google, Facebook) */}
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              aria-label="Sign up with Apple (not available yet)"
              disabled
              title="Apple sign-up is not available yet"
              className="press flex h-[54px] w-[54px] items-center justify-center rounded-full border border-gray-200 bg-white transition-colors hover:bg-gray-50 active:scale-95 disabled:opacity-60 cursor-not-allowed opacity-40"
            >
              <AppleIcon />
            </button>

            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={loading || googleLoading}
              aria-label="Sign up with Google"
              className="press flex h-[54px] w-[54px] items-center justify-center rounded-full border border-gray-200 bg-white transition-colors hover:bg-gray-50 active:scale-95 disabled:opacity-60"
            >
              {googleLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#102D56] border-t-transparent" />
              ) : (
                <GoogleIcon />
              )}
            </button>

            <button
              type="button"
              aria-label="Sign up with Facebook (not available yet)"
              disabled
              title="Facebook sign-up is not available yet"
              className="press flex h-[54px] w-[54px] items-center justify-center rounded-full border border-gray-200 bg-white transition-colors hover:bg-gray-50 active:scale-95 disabled:opacity-60 cursor-not-allowed opacity-40"
            >
              <FacebookIcon />
            </button>
          </div>
          <p className="mt-3 text-center text-[11.5px] text-[#6B7280]">
            Apple and Facebook sign-up are not available yet. Use your email or Google.
          </p>
        </div>

        {/* Bottom Navigation Link */}
        <div className="shrink-0 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center">
          <p className="text-[13px] text-[#6B7280]">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-[#102D56] underline hover:opacity-80">
              Sign In
            </Link>
          </p>
        </div>
      </div>

      {/* Terms & Conditions Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-[17px] font-bold text-[#1E293B]">Terms & Conditions</h2>
              <button
                type="button"
                aria-label="Close Terms and Conditions"
                onClick={() => setShowTermsModal(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-[#475569]">
              <p>
                <strong>1. Emergency Response Purpose:</strong> RescueLink provides disaster
                management coordination, shelter locator information, and community assistance.
              </p>
              <p>
                <strong>2. Official Emergency Hotlines:</strong> In situations posing an immediate
                threat to life, always contact local emergency services (e.g., 999 or 911) directly.
              </p>
              <p>
                <strong>3. Accurate Reporting:</strong> Users must not broadcast false alarms or
                simulated SOS signals.
              </p>
              <p>
                <strong>4. Location & Privacy:</strong> Location permissions are used strictly to
                determine vicinity to evacuation shelters and assist relief coordination.
              </p>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setAgreedToTerms(true);
                  setShowTermsModal(false);
                }}
                className="press flex h-12 w-full items-center justify-center rounded-full bg-[#102D56] text-sm font-semibold text-white"
              >
                I Agree & Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
