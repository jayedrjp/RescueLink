import { redirect } from "@tanstack/react-router";
import { waitForAuthReady } from "./auth-store";

/**
 * Route-level guard for pages that need a signed-in user (use as `beforeLoad`).
 *
 * - Runs before the page renders, so a signed-out visitor never sees protected content, not even
 *   when arriving with the browser Back button after logging out.
 * - Waits for the auth state to be known (no false redirects while it is still resolving).
 * - Redirects with `replace`, so the protected URL is not left in the history (no Back loop).
 * - On the server there is no browser session to inspect, so it does nothing there; the page
 *   component keeps its own check for the very first page load.
 *
 * It only checks "signed in". Role checks (admin) stay in the page, which shows an explicit
 * "Access Denied" screen, and in the Firestore rules, which are the real enforcement.
 */
export async function requireSignedIn(): Promise<void> {
  if (typeof window === "undefined") return;
  const auth = await waitForAuthReady();
  if (auth.ready && !auth.isAuthenticated) {
    throw redirect({ to: "/login", replace: true });
  }
}
