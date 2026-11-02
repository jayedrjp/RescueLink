import { RouterProvider } from "@tanstack/react-router";
import type { createTestRouter } from "./app-router";

/** Renders the (real) router built by createTestRouter. */
export function AppUnderTest({
  router,
}: {
  router: ReturnType<typeof createTestRouter>["router"];
}) {
  return <RouterProvider router={router} />;
}
