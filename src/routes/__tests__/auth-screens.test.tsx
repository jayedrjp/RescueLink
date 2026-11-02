// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
  auth: {
    isAuthenticated: false,
    isAdmin: false,
    profile: null as null | { role: string },
    isFirebaseReady: true,
    loading: false,
  },
}));

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => h.navigate,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});
vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: h.toastInfo },
}));
// NOTE: refreshProfile is intentionally NOT provided: if a screen called it, the test would throw.
vi.mock("@/context/AuthContext", () => ({ useAuth: () => h.auth }));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  signInWithPopup: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  GoogleAuthProvider: class {},
}));
vi.mock("@/lib/firebase/config", () => ({ auth: {}, db: {}, isFirebaseConfigured: () => true }));
vi.mock("@/lib/firebase/firestore", () => ({
  createUserProfile: vi.fn(),
  ensureUserProfile: vi.fn(),
  getUserProfile: vi.fn(),
}));
vi.mock("@/lib/firebase/auth", async (orig) => {
  const actual = await orig<typeof import("@/lib/firebase/auth")>();
  return {
    ...actual,
    loginUser: h.loginUser,
    registerUser: h.registerUser,
    signInWithGoogle: h.signInWithGoogle,
    resetPassword: h.resetPassword,
  };
});

import { Route as LoginRoute } from "@/routes/login";
import { Route as RegisterRoute } from "@/routes/register";
import { Route as ForgotRoute } from "@/routes/forgot-password";

const Login = LoginRoute.options.component as React.ComponentType;
const Register = RegisterRoute.options.component as React.ComponentType;
const Forgot = ForgotRoute.options.component as React.ComponentType;

beforeEach(() => {
  Object.assign(h.auth, {
    isAuthenticated: false,
    isAdmin: false,
    profile: null,
    isFirebaseReady: true,
    loading: false,
  });
  for (const f of [
    h.navigate,
    h.toastSuccess,
    h.toastError,
    h.toastInfo,
    h.loginUser,
    h.registerUser,
    h.signInWithGoogle,
    h.resetPassword,
  ])
    f.mockReset();
  vi.stubEnv("VITE_ADMIN_EMAIL", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Login screen", () => {
  it("AUTH-4: the identifier field accepts a username (type text, not type=email) and says so", () => {
    render(<Login />);
    const input = screen.getByLabelText(/email or username/i) as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.getAttribute("autocomplete")).toBe("username");
  });

  it("AUTH-4: 'admin' reaches the sign-in call when an admin email is configured", async () => {
    vi.stubEnv("VITE_ADMIN_EMAIL", "boss@example.com");
    h.loginUser.mockResolvedValue({ credential: {} });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText(/email or username/i), "admin");
    await user.type(screen.getByLabelText(/^password$/i), "secret1234");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(h.loginUser).toHaveBeenCalledWith("admin", "secret1234"));
  });

  it("AUTH-4: without a configured admin email 'admin' is refused with a clear message (no default account)", async () => {
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText(/email or username/i), "admin");
    await user.type(screen.getByLabelText(/^password$/i), "secret1234");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/username sign-in is not set up/i)).toBeTruthy();
    expect(h.loginUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid identifier and shows a friendly failure message (no raw codes)", async () => {
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText(/email or username/i), "not an email");
    await user.type(screen.getByLabelText(/^password$/i), "x");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/valid email address or username/i)).toBeTruthy();

    h.loginUser.mockRejectedValue({
      code: "auth/invalid-credential",
      message: "Firebase: Error (auth/invalid-credential).",
    });
    await user.clear(screen.getByLabelText(/email or username/i));
    await user.type(screen.getByLabelText(/email or username/i), "a@b.co");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/incorrect email or password/i)).toBeTruthy();
    expect(screen.queryByText(/auth\/invalid-credential/)).toBeNull();
  });

  it("AUTH-1/2: submitting only authenticates; navigation is left to the profile-aware redirect", async () => {
    h.loginUser.mockResolvedValue({ credential: {} });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText(/email or username/i), "a@b.co");
    await user.type(screen.getByLabelText(/^password$/i), "secret1234");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());
    expect(h.navigate).not.toHaveBeenCalled(); // user is not authenticated in the (mocked) context yet
    expect((screen.getByLabelText(/email or username/i) as HTMLInputElement).value).toBe("a@b.co"); // form kept
  });

  it("redirects administrators to /admin and everyone else to / once the profile is resolved", () => {
    Object.assign(h.auth, { isAuthenticated: true, isAdmin: true, profile: { role: "admin" } });
    render(<Login />);
    expect(h.navigate).toHaveBeenCalledWith({ to: "/admin", replace: true });
    cleanup();
    h.navigate.mockReset();
    Object.assign(h.auth, { isAuthenticated: true, isAdmin: false, profile: { role: "user" } });
    render(<Login />);
    expect(h.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("waits while the profile is still resolving (no premature redirect)", () => {
    Object.assign(h.auth, { isAuthenticated: true, loading: true, profile: null });
    render(<Login />);
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("leaves the page when the profile failed to load so the app shell can show the verification error", () => {
    Object.assign(h.auth, { isAuthenticated: true, loading: false, profile: null });
    render(<Login />);
    expect(h.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("Apple and Facebook are clearly unavailable; Google works", async () => {
    h.signInWithGoogle.mockResolvedValue({ credential: {}, isNewUser: true });
    const user = userEvent.setup();
    render(<Login />);
    const apple = screen.getByLabelText(/apple/i) as HTMLButtonElement;
    const fb = screen.getByLabelText(/facebook/i) as HTMLButtonElement;
    const google = screen.getByLabelText(/^sign in with google$/i) as HTMLButtonElement;
    expect(apple.disabled).toBe(true);
    expect(fb.disabled).toBe(true);
    expect(apple.getAttribute("aria-label")).toMatch(/not available/i);
    expect(google.disabled).toBe(false);
    expect(screen.getByText(/apple and facebook sign-in are not available yet/i)).toBeTruthy();
    await user.click(apple);
    expect(h.toastInfo).not.toHaveBeenCalled();
    await user.click(google);
    await waitFor(() => expect(h.signInWithGoogle).toHaveBeenCalledTimes(1));
  });

  it("shows the configuration banner when Firebase is not configured", () => {
    h.auth.isFirebaseReady = false;
    render(<Login />);
    expect(screen.getByText(/firebase configuration required/i)).toBeTruthy();
  });
});

describe("Register screen", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, pw: string, terms = true) {
    await user.type(screen.getByLabelText(/full name|^name/i), "Rahim Uddin");
    await user.type(screen.getByLabelText(/^email$/i), "rahim@example.com");
    await user.type(screen.getByLabelText(/^password$/i), pw);
    if (terms) await user.click(screen.getByRole("checkbox"));
  }

  it("AUTH-6: enforces the stated policy and the hint matches it", async () => {
    const user = userEvent.setup();
    render(<Register />);
    expect(
      screen.getByText(/at least 8 characters, including a letter and a number/i),
    ).toBeTruthy();
    expect((screen.getByLabelText(/^password$/i) as HTMLInputElement).minLength).toBe(8);

    await fill(user, "abcdefgh"); // no number
    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    expect(await screen.findByText(/at least one letter and one number/i)).toBeTruthy();
    expect(h.registerUser).not.toHaveBeenCalled();
  });

  it("requires the terms checkbox", async () => {
    const user = userEvent.setup();
    render(<Register />);
    await fill(user, "abcdefg1", false);
    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    expect(await screen.findByText(/agree with the terms/i)).toBeTruthy();
    expect(h.registerUser).not.toHaveBeenCalled();
  });

  it("registers with the typed details, then leaves navigation to the profile-aware redirect", async () => {
    h.registerUser.mockResolvedValue({ credential: {}, profile: null });
    const user = userEvent.setup();
    render(<Register />);
    await fill(user, "abcdefg1");
    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    await waitFor(() =>
      expect(h.registerUser).toHaveBeenCalledWith("Rahim Uddin", "rahim@example.com", "abcdefg1"),
    );
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("shows friendly errors (e.g. reserved or already-used email)", async () => {
    h.registerUser.mockRejectedValue({
      code: "auth/email-already-in-use",
      message: "Firebase: Error (auth/email-already-in-use).",
    });
    const user = userEvent.setup();
    render(<Register />);
    await fill(user, "abcdefg1");
    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    expect(await screen.findByText(/already exists/i)).toBeTruthy();
    expect(screen.queryByText(/auth\/email-already-in-use/)).toBeNull();
  });

  it("navigates only after the user is signed in AND the profile is resolved", () => {
    Object.assign(h.auth, { isAuthenticated: true, loading: true });
    render(<Register />);
    expect(h.navigate).not.toHaveBeenCalled();
    cleanup();
    Object.assign(h.auth, { isAuthenticated: true, loading: false });
    render(<Register />);
    // NAV-10: replace, so Back never returns to the (now meaningless) registration form.
    expect(h.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("Apple and Facebook sign-up are clearly unavailable", () => {
    render(<Register />);
    expect((screen.getByLabelText(/apple/i) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/facebook/i) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^sign up with google$/i) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(screen.getByText(/apple and facebook sign-up are not available yet/i)).toBeTruthy();
  });
});

describe("Forgot-password screen", () => {
  it("validates the email before calling Firebase", async () => {
    const user = userEvent.setup();
    render(<Forgot />);
    await user.type(screen.getByLabelText(/^email$/i), "nope@");
    // The browser's own type=email check normally stops this first; submit the form directly to
    // prove our validation also holds when that check is bypassed.
    fireEvent.submit(screen.getByRole("button", { name: /send reset link/i }).closest("form")!);
    expect(await screen.findByText(/valid email/i)).toBeTruthy();
    expect(h.resetPassword).not.toHaveBeenCalled();
  });

  it("shows the neutral confirmation only AFTER the request succeeded", async () => {
    let resolve!: () => void;
    h.resetPassword.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<Forgot />);
    await user.type(screen.getByLabelText(/^email$/i), "a@b.co");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(screen.queryByText(/check your email/i)).toBeNull(); // still pending
    expect(h.toastSuccess).not.toHaveBeenCalled();
    resolve();
    expect(await screen.findByText(/check your email/i)).toBeTruthy();
    expect(screen.getByText(/if an account exists for/i)).toBeTruthy();
    expect(h.toastSuccess).toHaveBeenCalledWith("Request received", expect.anything());
  });

  it("on failure shows a safe message and never claims success", async () => {
    h.resetPassword.mockRejectedValue({
      code: "auth/internal-error",
      message: "Firebase: Error (auth/internal-error).",
    });
    const user = userEvent.setup();
    render(<Forgot />);
    await user.type(screen.getByLabelText(/^email$/i), "a@b.co");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByText(/couldn't send the reset email/i)).toBeTruthy();
    expect(screen.queryByText(/check your email/i)).toBeNull();
    expect(screen.queryByText(/auth\/internal-error/)).toBeNull();
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });
});
