import { useCallback } from "react";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { getAuthSnapshot } from "./auth-store";

/** Where "back" should go when there is no browser history to return to (e.g. a direct link). */
export type BackTarget = string | { to: string; search?: Record<string, unknown> };

export function resolveBackFallback(
  target: BackTarget,
  isAuthenticated: boolean,
): { to: string; search?: Record<string, unknown> } {
  const t = typeof target === "string" ? { to: target } : target;
  // Home is for signed-in users and bounces visitors to the intro. Send a signed-out visitor
  // straight to the welcome screen instead of bouncing them through "/".
  if (!isAuthenticated && t.to === "/") return { to: "/welcome" };
  return t;
}

/**
 * Real "back" behaviour:
 *  - there is history inside the app  -> go back to the page the user actually came from
 *  - there is none (direct link/new tab) -> go to the fallback, REPLACING the current entry so the
 *    browser history does not grow or loop.
 */
export function useBackNavigation(fallback: BackTarget = "/") {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const fallbackKey = JSON.stringify(fallback);

  const goBack = useCallback(() => {
    if (canGoBack) {
      router.history.back();
      return;
    }
    const target = resolveBackFallback(
      JSON.parse(fallbackKey) as BackTarget,
      getAuthSnapshot().isAuthenticated,
    );
    void router.navigate({ ...target, replace: true } as never);
  }, [canGoBack, router, fallbackKey]);

  return { goBack, canGoBack };
}
