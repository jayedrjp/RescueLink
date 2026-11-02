/**
 * A tiny, React-free snapshot of the auth state.
 *
 * AuthContext publishes it; route-level code (TanStack `beforeLoad`, the back-navigation helper)
 * reads it. Router code runs outside React, so it cannot use the context directly.
 *
 * `ready` is true once the first auth resolution is finished AND, for a signed-in user, the profile
 * has been resolved (or has definitively failed) - i.e. the same moment AuthContext's `loading`
 * becomes false.
 */
export interface AuthSnapshot {
  ready: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const INITIAL: AuthSnapshot = { ready: false, isAuthenticated: false, isAdmin: false };

let snapshot: AuthSnapshot = INITIAL;
const listeners = new Set<(s: AuthSnapshot) => void>();

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

export function setAuthSnapshot(next: AuthSnapshot): void {
  if (
    next.ready === snapshot.ready &&
    next.isAuthenticated === snapshot.isAuthenticated &&
    next.isAdmin === snapshot.isAdmin
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((l) => l(snapshot));
}

export function resetAuthSnapshot(): void {
  snapshot = INITIAL;
}

/**
 * Resolves with the snapshot as soon as the auth state is known. Never hangs: after `timeoutMs`
 * it resolves with whatever is current (callers must treat `ready: false` as "do not redirect").
 */
export function waitForAuthReady(timeoutMs = 8000): Promise<AuthSnapshot> {
  if (snapshot.ready) return Promise.resolve(snapshot);
  return new Promise((resolve) => {
    const finish = (s: AuthSnapshot) => {
      clearTimeout(timer);
      listeners.delete(onChange);
      resolve(s);
    };
    const onChange = (s: AuthSnapshot) => {
      if (s.ready) finish(s);
    };
    const timer = setTimeout(() => finish(snapshot), timeoutMs);
    listeners.add(onChange);
  });
}
