import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin_/users")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/citizens", replace: true });
  },
  component: () => null,
});
