/**
 * Decides whether the full-screen splash replaces the current route.
 *
 *  - On the server (`typeof window === "undefined"` or `opts.isServer`), returns false
 *    so SSR can render real route content immediately for instant first paint and SEO (UX-2).
 *  - `initializing`: the very first auth/profile resolution after page load on the client.
 *  - `loading`: also true while a freshly signed-in user's profile is being resolved. Splash is
 *    NOT used on the auth-form routes (login, register, forgot-password, ...), otherwise the form
 *    the user is typing into / submitting would be unmounted and lose its state (AUTH-1).
 */
export function shouldShowSplash(opts: {
  initializing: boolean;
  loading: boolean;
  onAuthFormRoute: boolean;
  isServer?: boolean;
}): boolean {
  if (opts.isServer || (typeof window === "undefined" && opts.isServer === undefined)) {
    return false;
  }
  if (opts.onAuthFormRoute) {
    return false;
  }
  return opts.initializing || opts.loading;
}
