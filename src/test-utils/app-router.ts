import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { Route as RootRoute } from "@/routes/__root";

// The root route's `shellComponent` renders the <html>/<body> document for server rendering, which
// cannot be mounted inside a test container. Everything else (RootComponent, AppLayout, guards,
// real pages) is the production code.
(RootRoute.options as { shellComponent?: unknown }).shellComponent = undefined;

/**
 * Builds a router from the REAL generated route tree on an in-memory history, so tests exercise
 * the real route definitions, guards (`beforeLoad`), search validation and history behaviour.
 */
export function createTestRouter(initialEntries: string[], initialIndex?: number) {
  const history = createMemoryHistory({
    initialEntries,
    ...(initialIndex !== undefined ? { initialIndex } : {}),
  });
  const router = createRouter({
    routeTree,
    history,
    defaultPreload: false,
    // Same context the production router (src/router.tsx) provides to the root route.
    context: { queryClient: new QueryClient() },
  });
  return { router, history };
}

/** Current location as "pathname + search" (e.g. "/admin?tab=sos"). */
export function here(router: ReturnType<typeof createTestRouter>["router"]): string {
  const l = router.state.location;
  return `${l.pathname}${l.searchStr ?? ""}`;
}
