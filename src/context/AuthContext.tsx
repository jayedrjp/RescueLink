import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "../lib/firebase/config";
import { ensureUserProfile } from "../lib/firebase/firestore";
import { logoutUser, waitForPendingRegistration } from "../lib/firebase/auth";
import { setAuthSnapshot } from "../lib/auth-store";
import type { UserProfile, UserRole } from "../lib/firebase/types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  profileError: Error | null;
  /**
   * True during the first auth resolution AND while a signed-in user's profile is still being
   * resolved. Use it to avoid acting on a not-yet-known role.
   */
  loading: boolean;
  /** True only during the very first auth/profile resolution after page load. */
  initializing: boolean;
  isFirebaseReady: boolean;
  activeMode: "user" | "volunteer";
  setActiveMode: (mode: "user" | "volunteer") => void;
  /** Re-reads the profile in the background. Never flips the whole app into a loading state. */
  refreshProfile: () => Promise<void>;
  /** Merges already-persisted changes into the in-memory profile without a global loading flash. */
  applyProfilePatch: (patch: Partial<UserProfile>) => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  role: UserRole | null;
  isAdmin: boolean;
  isVolunteer: boolean;
  isVolunteerApproved: boolean;
  isVolunteerPending: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<Error | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [activeMode, setActiveMode] = useState<"user" | "volunteer">("user");
  const isFirebaseReady = isFirebaseConfigured();

  const mountedRef = useRef(true);
  /** Incremented whenever the signed-in user changes or a newer load starts: older results are dropped. */
  const loadSeqRef = useRef(0);
  const profileRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * THE single profile lifecycle. It is called by the auth listener (once per sign-in) and by
   * refreshProfile(); sign-in/registration helpers only authenticate and never read the profile.
   */
  const loadProfile = React.useCallback(async (firebaseUser: User) => {
    const seq = ++loadSeqRef.current;
    const isStale = () => !mountedRef.current || seq !== loadSeqRef.current;

    setProfileError(null);
    try {
      // If a registration is in flight, wait until the user's chosen name has been saved.
      await waitForPendingRegistration();
      if (isStale()) return;

      // Existing profiles (admin, volunteer, citizen) are returned untouched; a missing profile is
      // provisioned as a plain citizen.
      const userProf = await ensureUserProfile(firebaseUser);
      if (isStale()) return;

      setProfile(userProf);
      setProfileError(null);
      setActiveMode(
        userProf.role === "volunteer" && userProf.volunteerStatus === "approved"
          ? "volunteer"
          : "user",
      );

      // Someone with an account has obviously been through the intro: never show it to them again.
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("rescuelink_intro_completed", "true");
        }
      } catch {
        /* storage unavailable (private mode): ignore */
      }
    } catch (err: unknown) {
      if (isStale()) return;
      const errorObj = err instanceof Error ? err : new Error(String(err));

      // A transient failure while refreshing must not lock out a user whose profile we already hold.
      if (profileRef.current?.uid === firebaseUser.uid) {
        console.warn(
          "[RescueLink Auth] Could not refresh the profile; keeping the last known one.",
          errorObj,
        );
        return;
      }

      // CRITICAL: never silently default to the citizen role. Surface the error instead.
      console.error("[RescueLink Auth] Error loading user profile from Firestore:", errorObj);
      setProfile(null);
      setProfileError(errorObj);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseReady || !auth) {
      setInitializing(false);
      return;
    }

    const handleAuthChange = async (firebaseUser: User | null) => {
      if (!mountedRef.current) return;
      setUser(firebaseUser);

      if (firebaseUser) {
        // A different account must never briefly see the previous account's profile.
        if (profileRef.current && profileRef.current.uid !== firebaseUser.uid) {
          setProfile(null);
        }
        await loadProfile(firebaseUser);
      } else {
        loadSeqRef.current++; // drop any in-flight load for the previous user
        setProfile(null);
        setProfileError(null);
        setActiveMode("user");
      }

      if (mountedRef.current) setInitializing(false);
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      void handleAuthChange(firebaseUser);
    });
    return () => unsubscribe();
  }, [isFirebaseReady, loadProfile]);

  const refreshProfile = React.useCallback(async () => {
    const targetUser = auth?.currentUser;
    if (targetUser) {
      await loadProfile(targetUser);
    }
  }, [loadProfile]);

  const applyProfilePatch = React.useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const logout = React.useCallback(async () => {
    loadSeqRef.current++;
    await logoutUser();
    setUser(null);
    setProfile(null);
    setProfileError(null);
    setActiveMode("user");
  }, []);

  const value = useMemo<AuthContextType>(() => {
    // Never expose a profile that belongs to a different account than the signed-in user.
    const currentProfile = user && profile && profile.uid === user.uid ? profile : null;
    // While a user is signed in but their profile is still resolving (and has not errored), the
    // role is unknown: report loading so guards wait instead of treating them as a citizen.
    const isProfileResolving = Boolean(user) && currentProfile === null && profileError === null;
    const effectiveLoading = initializing || isProfileResolving;
    const role = currentProfile?.role || null;
    const isVolunteerApproved =
      role === "volunteer" && currentProfile?.volunteerStatus === "approved";

    return {
      user,
      profile: currentProfile,
      profileError,
      loading: effectiveLoading,
      initializing,
      isFirebaseReady,
      activeMode,
      setActiveMode,
      refreshProfile,
      applyProfilePatch,
      logout,
      isAuthenticated: Boolean(user),
      role,
      isAdmin: role === "admin",
      isVolunteer: isVolunteerApproved,
      isVolunteerApproved,
      isVolunteerPending: currentProfile?.volunteerStatus === "pending",
    };
  }, [
    user,
    profile,
    profileError,
    initializing,
    isFirebaseReady,
    activeMode,
    refreshProfile,
    applyProfilePatch,
    logout,
  ]);

  // Publish a React-free snapshot for route-level code (beforeLoad guards, back navigation).
  const snapshotReady = !value.loading;
  const snapshotAuthed = value.isAuthenticated;
  const snapshotAdmin = value.isAdmin;
  useEffect(() => {
    setAuthSnapshot({
      ready: snapshotReady,
      isAuthenticated: snapshotAuthed,
      isAdmin: snapshotAdmin,
    });
  }, [snapshotReady, snapshotAuthed, snapshotAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
