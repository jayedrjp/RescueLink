import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  signInWithPopup,
  signInWithCredential,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  type UserCredential,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { auth, isFirebaseConfigured } from "./config";
import { createUserProfile } from "./firestore";
import type { UserProfile } from "./types";
import {
  PASSWORD_HELP_TEXT,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "../auth-validation";

const NOT_CONFIGURED_MESSAGE =
  "Firebase is not configured yet. Please supply valid project keys in your .env file.";

/** Validation problem raised by our own code. Its message is always safe to show to users. */
export class AuthInputError extends Error {
  readonly code = "app/invalid-input";
  constructor(message: string) {
    super(message);
    this.name = "AuthInputError";
  }
}

/**
 * The email behind the "admin" username shortcut. It comes ONLY from configuration
 * (VITE_ADMIN_EMAIL); there is deliberately no built-in default account.
 * Knowing or typing this email grants nothing: the role is always read from Firestore.
 */
export function getAdminEmail(): string | null {
  const raw = (import.meta.env["VITE_ADMIN_EMAIL"] as string | undefined) ?? "";
  const v = raw.trim().toLowerCase();
  return v === "" || v.startsWith("your_") ? null : v;
}

export type ResolvedIdentifier = { ok: true; email: string } | { ok: false; message: string };

/**
 * Turns what the user typed on the sign-in form into the email used for Firebase Authentication.
 * Accepts an email address, or the configured "admin" username shortcut.
 */
export function resolveLoginIdentifier(
  identifier: string,
  adminEmail: string | null = getAdminEmail(),
): ResolvedIdentifier {
  const trimmed = identifier.trim();
  if (!trimmed) return { ok: false, message: "Please enter your email or username." };

  if (trimmed.toLowerCase() === "admin") {
    return adminEmail
      ? { ok: true, email: adminEmail }
      : {
          ok: false,
          message: "Username sign-in is not set up. Please sign in with your email address.",
        };
  }

  if (validateEmail(trimmed)) {
    return { ok: false, message: "Please enter a valid email address or username." };
  }
  return { ok: true, email: trimmed.toLowerCase() };
}

/**
 * Converts Firebase error codes into clear, user-friendly messages.
 */
export function getFriendlyAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthInputError) return error.message;
  if (!error || typeof error !== "object") {
    return "An unexpected error occurred. Please try again.";
  }

  const code = (error as { code?: string }).code || "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Incorrect email or password. Please verify your credentials and try again.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/email-already-in-use":
      return "An account with this email address already exists. Please log in instead.";
    case "auth/weak-password":
      return `Password is too weak. ${PASSWORD_HELP_TEXT}`;
    case "auth/invalid-email":
    case "auth/missing-email":
      return "The email address is invalid. Please enter a valid email format.";
    case "auth/too-many-requests":
      return "Access temporarily blocked due to many failed attempts. Please try again later or reset your password.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before completion. Please try again.";
    case "auth/popup-blocked":
      return "The Google sign-in window was blocked by your browser. Please allow popups for this site.";
    case "auth/cancelled-popup-request":
      return "Another sign-in attempt was already in progress.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email using a different sign-in method.";
    case "auth/unauthorized-domain":
    case "auth/operation-not-allowed":
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
    case "auth/configuration-not-found":
      // Deployment/configuration problems: users cannot fix them, so keep the text generic.
      console.error(
        `[RescueLink Auth] Authentication is misconfigured (${code}). Check the Firebase console.`,
      );
      return "Sign-in is temporarily unavailable. Please try again later or use another sign-in method.";
    case "permission-denied":
      console.error(
        "[RescueLink Auth] Firestore denied access to the user profile (permission-denied).",
      );
      return "We couldn't access your account data. Please try again or contact support.";
    default:
      // Never show raw Firebase messages such as "Firebase: Error (auth/xyz)."; log them instead.
      if (code) console.warn(`[RescueLink Auth] Unhandled auth error code: ${code}`);
      return "Authentication failed. Please try again.";
  }
}

/**
 * Messages for the password-reset form. Never reveals whether an account exists and never shows
 * raw Firebase codes.
 */
export function getFriendlyPasswordResetError(error: unknown): string {
  if (error instanceof AuthInputError) return error.message;
  const code = (error as { code?: string } | null)?.code || "";
  switch (code) {
    case "auth/invalid-email":
    case "auth/missing-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many requests. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection and try again.";
    default:
      if (code) console.warn(`[RescueLink Auth] Password reset failed: ${code}`);
      return "We couldn't send the reset email right now. Please try again in a moment.";
  }
}

/**
 * Signs in an existing user with email (or the configured admin username) and password.
 *
 * Authentication only: the profile/role is resolved afterwards by the single profile lifecycle in
 * AuthContext (one read per sign-in). The role always comes from Firestore, never from the
 * identifier that was typed.
 */
export async function loginUser(
  identifier: string,
  password: string,
): Promise<{ credential: UserCredential }> {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }

  const resolved = resolveLoginIdentifier(identifier);
  if (!resolved.ok) throw new AuthInputError(resolved.message);
  if (!password) throw new AuthInputError("Please enter your password.");

  const credential = await signInWithEmailAndPassword(auth, resolved.email, password);
  return { credential };
}

// ---------------------------------------------------------------------------
// Registration gate
//
// Creating the Firebase account fires onAuthStateChanged immediately, before the display name and
// the Firestore profile have been written. The AuthContext waits on this gate before it provisions
// a profile, so the name the user typed is never replaced by an email-derived placeholder.
// ---------------------------------------------------------------------------
let registrationGate: Promise<void> | null = null;

export function waitForPendingRegistration(): Promise<void> {
  return registrationGate ?? Promise.resolve();
}

/**
 * Registers a new citizen user.
 * Strictly forces role: 'user' and volunteerStatus: 'none' (also enforced by the Firestore rules).
 */
export async function registerUser(
  name: string,
  email: string,
  password: string,
): Promise<{
  credential: UserCredential;
  profile: UserProfile | null;
  profileError?: Error | null;
}> {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }

  const nameProblem = validateDisplayName(name);
  if (nameProblem) throw new AuthInputError(nameProblem);
  const emailProblem = validateEmail(email);
  if (emailProblem) throw new AuthInputError(emailProblem);
  const passwordProblem = validatePassword(password);
  if (passwordProblem) throw new AuthInputError(passwordProblem);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();

  // Public sign-up must never be a way to provision or squat the administrator account. That
  // account is created by the project owner in the Firebase console.
  if (trimmedEmail === getAdminEmail()) {
    throw new AuthInputError("This email address is reserved. Please use a different email.");
  }

  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  registrationGate = gate;

  try {
    // 1. Create the account with Firebase Authentication
    const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

    // 2. Store the display name in Firebase Auth
    try {
      await updateProfile(credential.user, { displayName: trimmedName });
    } catch (err) {
      console.warn("Could not update auth displayName:", err);
    }

    // 3. Create the Firestore profile (forced citizen role). If this fails the AuthContext retries
    //    provisioning once the gate opens, using the display name stored above.
    let profile: UserProfile | null = null;
    let profileError: Error | null = null;
    try {
      profile = await createUserProfile(credential.user.uid, {
        email: trimmedEmail,
        displayName: trimmedName,
      });
    } catch (firestoreError) {
      profileError =
        firestoreError instanceof Error ? firestoreError : new Error(String(firestoreError));
      console.error(
        "[RescueLink Auth] Auth account created, but Firestore profile creation failed:",
        firestoreError,
      );
    }

    return { credential, profile, profileError };
  } finally {
    release();
    if (registrationGate === gate) registrationGate = null;
  }
}

/**
 * Sends a real password reset email via Firebase Authentication.
 *
 * Resolves when Firebase accepted the request. "user-not-found" is treated the same way on
 * purpose: the UI must not reveal whether an email address has an account.
 */
export async function resetPassword(email: string): Promise<void> {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }
  const problem = validateEmail(email);
  if (problem) throw new AuthInputError(problem);

  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "auth/user-not-found") return;
    throw err;
  }
}

let socialLoginInitialized = false;

async function ensureSocialLoginInitialized(): Promise<void> {
  if (socialLoginInitialized) return;
  const webClientId =
    (import.meta.env["VITE_GOOGLE_WEB_CLIENT_ID"] as string | undefined)?.trim() || "";

  await SocialLogin.initialize({
    google: {
      ...(webClientId ? { webClientId } : {}),
      mode: "online",
    },
  });
  socialLoginInitialized = true;
}

/**
 * Signs the current user out of Firebase and native social providers.
 */
export async function logoutUser(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await SocialLogin.logout({ provider: "google" });
    } catch {
      // Ignore if not logged in via native Google provider
    }
  }
  if (!auth) return;
  await signOut(auth);
}

/**
 * Signs in with Google.
 *
 * Uses native Credential Manager / Google Sign-In on Android/iOS via @capgo/capacitor-social-login,
 * and falls back to standard Firebase signInWithPopup on web browsers.
 *
 * Authentication only. A brand-new Google user gets a citizen profile from the AuthContext's single
 * profile lifecycle; Google sign-in never elevates anyone to 'volunteer' or 'admin', and existing
 * profiles are left untouched. `isNewUser` comes from Firebase Auth itself (not from comparing
 * Firestore timestamps).
 */
export async function signInWithGoogle(): Promise<{
  credential: UserCredential;
  isNewUser: boolean;
}> {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }

  // Native Android & iOS flow
  if (Capacitor.isNativePlatform()) {
    try {
      await ensureSocialLoginInitialized();

      const response = await SocialLogin.login({
        provider: "google",
        options: {
          scopes: ["email", "profile"],
        },
      });

      const idToken =
        response?.result && "idToken" in response.result ? response.result.idToken : undefined;

      if (!idToken) {
        throw new Error(
          "Google sign-in completed, but no ID token was returned by Google Play Services.",
        );
      }

      const googleCredential = GoogleAuthProvider.credential(idToken);
      const credential = await signInWithCredential(auth, googleCredential);
      const isNewUser = getAdditionalUserInfo(credential)?.isNewUser === true;
      return { credential, isNewUser };
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const code = (err as { code?: string | number })?.code;

      // Normalize cancellation so callers can display user-friendly cancellation notice
      if (
        msg.includes("cancel") ||
        msg.includes("dismissed") ||
        msg.includes("closed") ||
        code === 12501 || // GoogleSignInStatusCodes.SIGN_IN_CANCELLED
        code === 16 || // CommonStatusCodes.CANCELED
        code === "auth/popup-closed-by-user"
      ) {
        const cancelErr = new Error("Google sign-in was cancelled.");
        (cancelErr as { code?: string }).code = "auth/popup-closed-by-user";
        throw cancelErr;
      }

      throw err;
    }
  }

  // Web Browser fallback
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");
  provider.setCustomParameters({ prompt: "select_account" });

  const credential = await signInWithPopup(auth, provider);
  const isNewUser = getAdditionalUserInfo(credential)?.isNewUser === true;
  return { credential, isNewUser };
}
