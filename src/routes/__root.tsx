import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { SplashScreen } from "../components/SplashScreen";
import { shouldShowSplash } from "../lib/splash";
import { AuthProvider, useAuth } from "../context/AuthContext";

import { BottomNav } from "../components/BottomNav";
import { Toaster } from "../components/ui/sonner";
import { AlertCircle, RefreshCw, LogOut } from "lucide-react";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { name: "theme-color", content: "#F8FAFC" },
      { title: "RescueLink — Emergency Disaster Response" },
      {
        name: "description",
        content:
          "RescueLink helps you find safety fast: SOS, shelters, emergency services and live disaster alerts.",
      },
      { name: "author", content: "RescueLink" },
      { property: "og:title", content: "RescueLink — Emergency Disaster Response" },
      {
        property: "og:description",
        content: "সাহায্য হোক সহজ — SOS, shelters, emergency services and live disaster alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const {
    loading,
    initializing,
    profileError,
    refreshProfile,
    logout,
    user,
    isAuthenticated,
    isAdmin,
    profile,
  } = useAuth();

  const isAuthForm =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password");

  // Citizen Home on "/" is strictly for a verified non-admin citizen whose profile is loaded.
  // Until auth/onboarding resolution is finalized, hideNav prevents BottomNav from flashing on "/".
  const isCitizenHome =
    pathname === "/" && !loading && isAuthenticated && !isAdmin && profile?.role !== "admin";

  const hideNav =
    (pathname === "/" && !isCitizenHome) ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/permissions") ||
    pathname.startsWith("/welcome") ||
    isAuthForm;

  // The splash replaces the route only for the first auth resolution, or while a profile resolves
  // on a normal page. It never replaces the auth forms, so sign-in/registration never lose state.
  if (shouldShowSplash({ initializing, loading, onAuthFormRoute: isAuthForm })) {
    return <SplashScreen />;
  }

  // If user is authenticated but profile/role retrieval or provisioning failed from Firestore,
  // do NOT render the Citizen interface! Show an explicit error state with diagnostics.
  if (user && profileError && !hideNav) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-navy">Profile & Role Verification</h1>
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Authenticated as{" "}
          <span className="font-semibold text-foreground">{user.email || "Google User"}</span> (UID:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{user.uid}</code>),
          but RescueLink could not access your user document in Cloud Firestore at{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            users/{user.uid}
          </code>
          .
        </p>
        <div className="mt-3 max-w-sm rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-left font-mono text-[11px] text-destructive leading-relaxed">
          {profileError.message}
        </div>
        <p className="mt-3 max-w-xs text-[11px] text-muted-foreground">
          Please check your network connection or ensure Firestore Security Rules permit read and
          create access to <code className="font-mono">users/{user.uid}</code>.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 w-full max-w-xs">
          <button
            type="button"
            onClick={() => refreshProfile()}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-navy text-sm font-bold text-white shadow-xs"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Retry Profile Verification</span>
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
        <Toaster position="top-center" richColors closeButton />
      </div>
    );
  }

  return (
    <>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {!hideNav ? <BottomNav /> : null}
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
