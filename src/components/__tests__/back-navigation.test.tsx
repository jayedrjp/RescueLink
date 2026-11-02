// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { TopBar } from "@/components/rl";
import { BottomNav } from "@/components/BottomNav";
import { resetAuthSnapshot, setAuthSnapshot } from "@/lib/auth-store";

vi.mock("@/lib/data", async (orig) => ({ ...(await orig<object>()) }));

type Bar = Partial<React.ComponentProps<typeof TopBar>>;

/** Small router: pages a, b, c each render a TopBar; "/welcome" and "/" are plain pages. */
function makeRouter(entries: string[], opts: { index?: number; bar?: Bar } = {}) {
  const bar = opts.bar ?? {};
  const root = createRootRoute({ component: () => <Outlet /> });
  const page = (path: string, title: string, extra: Bar = {}) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <TopBar title={title} {...bar} {...extra} />,
    });
  const tree = root.addChildren([
    page("/", "Home"),
    page("/welcome", "Welcome"),
    page("/a", "Page A", { back: "/" }),
    page("/b", "Page B", { back: "/a" }),
    page("/c", "Page C", { back: "/a" }),
    page("/search", "With search", { back: { to: "/a", search: { x: "1" } as never } }),
    createRoute({
      getParentRoute: () => root,
      path: "/admin",
      validateSearch: (s: Record<string, unknown>) => ({
        tab: typeof s["tab"] === "string" ? s["tab"] : "home",
      }),
      component: () => <BottomNav />,
    }),
    createRoute({ getParentRoute: () => root, path: "/map", component: () => <BottomNav /> }),
    createRoute({ getParentRoute: () => root, path: "/alerts", component: () => <BottomNav /> }),
    createRoute({ getParentRoute: () => root, path: "/profile", component: () => <BottomNav /> }),
    createRoute({ getParentRoute: () => root, path: "/sos", component: () => <div /> }),
  ]);
  const history = createMemoryHistory({
    initialEntries: entries,
    ...(opts.index !== undefined ? { initialIndex: opts.index } : {}),
  });
  const router = createRouter({ routeTree: tree, history, defaultPreload: false });
  return { router, history };
}

async function mount(entries: string[], opts: Parameters<typeof makeRouter>[1] = {}) {
  const made = makeRouter(entries, opts);
  render(<RouterProvider router={made.router} />);
  await waitFor(() => expect(made.router.state.status).toBe("idle"));
  return made;
}
const path = (r: ReturnType<typeof makeRouter>["router"]) => r.state.location.pathname;
const backBtn = () => screen.getByRole("button", { name: /go back/i });

beforeEach(() => resetAuthSnapshot());
afterEach(() => cleanup());

describe("NAV-1/2/5/6: the back arrow is a real back button", () => {
  it("returns to the page the user actually came from (not a fixed destination) and does not grow the history", async () => {
    const { router, history } = await mount(["/a", "/b", "/c"], { index: 2 });
    expect(path(router)).toBe("/c");
    const before = history.length;
    await userEvent.setup().click(backBtn());
    await waitFor(() => expect(path(router)).toBe("/b"));
    expect(history.length).toBe(before); // a real back, not a new push
    await userEvent.setup().click(backBtn());
    await waitFor(() => expect(path(router)).toBe("/a"));
  });

  it("ignores the fixed fallback when history exists (e.g. Profile -> Services goes back to Profile, not Home)", async () => {
    const { router } = await mount(["/profile", "/b"], { index: 1 });
    await userEvent.setup().click(backBtn());
    await waitFor(() => expect(path(router)).toBe("/profile"));
  });

  it("uses the fallback ONLY when there is no history, and replaces the entry (no extra history, no loop)", async () => {
    setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: false });
    const { router, history } = await mount(["/c"]);
    expect(history.length).toBe(1);
    await userEvent.setup().click(backBtn());
    await waitFor(() => expect(path(router)).toBe("/a")); // c's fallback
    expect(history.length).toBe(1);
  });

  it("supports a fallback with search params", async () => {
    setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: false });
    const { router } = await mount(["/search"]);
    await userEvent.setup().click(backBtn());
    await waitFor(() => expect(path(router)).toBe("/a"));
    expect(router.state.location.search).toEqual({ x: "1" });
  });

  it("NAV-11: a signed-out visitor whose fallback is Home goes to /welcome, not through '/'", async () => {
    setAuthSnapshot({ ready: true, isAuthenticated: false, isAdmin: false });
    const { router } = await mount(["/a"]); // /a falls back to "/"
    await userEvent.setup().click(backBtn());
    await waitFor(() => expect(path(router)).toBe("/welcome"));
  });

  it("a signed-in user's Home fallback stays '/'", async () => {
    setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: false });
    const { router } = await mount(["/a"]);
    await userEvent.setup().click(backBtn());
    await waitFor(() => expect(path(router)).toBe("/"));
  });

  it("hideBack removes the arrow; hideBackWhenNoHistory shows it only when there is somewhere to go", async () => {
    await mount(["/a"], { bar: { hideBack: true } });
    expect(screen.queryByRole("button", { name: /go back/i })).toBeNull();
    cleanup();

    // A direct link = a single history entry: nowhere to go back to.
    const { router } = await mount(["/a"], { bar: { hideBackWhenNoHistory: true } });
    expect(screen.queryByRole("button", { name: /go back/i })).toBeNull();
    await act(async () => {
      await router.navigate({ to: "/b" } as never);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /go back/i })).toBeTruthy());
  });

  it("onBack replaces the default behaviour", async () => {
    const onBack = vi.fn();
    const { router } = await mount(["/a", "/b"], { index: 1, bar: { onBack } });
    await userEvent.setup().click(backBtn());
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(path(router)).toBe("/b"); // untouched
  });
});

describe("NAV-4/7: admin bottom-nav tabs replace history entries", () => {
  it("switching Home/Volunteers/Shelters/More/SOS never adds history entries; browser Back leaves the portal", async () => {
    const { router, history } = await mount(["/profile", "/admin?tab=home"], { index: 1 });
    const user = userEvent.setup();
    const start = history.length;

    for (const [label, tab] of [
      ["Volunteers", "volunteers"],
      ["Shelters", "shelters"],
      ["More", "more"],
      ["Home", "home"],
    ] as const) {
      await user.click(screen.getByRole("link", { name: new RegExp(`^${label}$`, "i") }));
      await waitFor(() => expect(router.state.location.search).toMatchObject({ tab }));
      expect(history.length).toBe(start);
    }
    await user.click(screen.getByRole("link", { name: /admin sos emergency dispatch/i }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "sos" }));
    expect(history.length).toBe(start);

    act(() => history.back());
    await waitFor(() => expect(path(router)).toBe("/profile")); // one Back = out of the portal
  });

  it("(citizen tabs keep push behaviour so Back returns to the previous tab)", async () => {
    const { router, history } = await mount(["/profile"]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: /^map$/i }));
    await waitFor(() => expect(path(router)).toBe("/map"));
    expect(history.length).toBe(2);
    act(() => history.back());
    await waitFor(() => expect(path(router)).toBe("/profile"));
  });
});
