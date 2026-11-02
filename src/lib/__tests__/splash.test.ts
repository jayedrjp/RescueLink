/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { shouldShowSplash } from "@/lib/splash";

describe("AUTH-1 & UX-2: splash screen display logic", () => {
  it("always shows during the first resolution on client", () => {
    for (const onAuthFormRoute of [true, false]) {
      expect(shouldShowSplash({ initializing: true, loading: true, onAuthFormRoute })).toBe(true);
    }
  });

  it("shows on normal pages while a profile is resolving", () => {
    expect(shouldShowSplash({ initializing: false, loading: true, onAuthFormRoute: false })).toBe(
      true,
    );
  });

  it("does NOT show on login/register while a profile resolves (form state survives - AUTH-1)", () => {
    expect(shouldShowSplash({ initializing: false, loading: true, onAuthFormRoute: true })).toBe(
      false,
    );
  });

  it("is off when nothing is loading", () => {
    expect(shouldShowSplash({ initializing: false, loading: false, onAuthFormRoute: false })).toBe(
      false,
    );
  });

  it("UX-2: never shows on the server during SSR so pre-rendered content and SEO markup are delivered", () => {
    expect(
      shouldShowSplash({
        initializing: true,
        loading: true,
        onAuthFormRoute: false,
        isServer: true,
      }),
    ).toBe(false);
    expect(
      shouldShowSplash({
        initializing: true,
        loading: false,
        onAuthFormRoute: true,
        isServer: true,
      }),
    ).toBe(false);
  });
});
