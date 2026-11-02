import { describe, expect, it } from "vitest";
import {
  PASSWORD_HELP_TEXT,
  PASSWORD_MIN_LENGTH,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "@/lib/auth-validation";

describe("AUTH-6: password policy, validation and messages agree", () => {
  it("rejects short passwords and explains the real rule", () => {
    const msg = validatePassword("ab1");
    expect(msg).toContain(`${PASSWORD_MIN_LENGTH} characters`);
    expect(msg).toContain(PASSWORD_HELP_TEXT);
  });
  it("requires a letter AND a number (what the old message promised but never enforced)", () => {
    expect(validatePassword("abcdefghij")).toMatch(/letter and one number/);
    expect(validatePassword("1234567890")).toMatch(/letter and one number/);
    expect(validatePassword("        ")).not.toBeNull();
  });
  it("accepts a compliant password", () => {
    expect(validatePassword("abcdefg1")).toBeNull();
    expect(validatePassword("Correct-Horse-9")).toBeNull();
  });
  it("asks for a password when empty", () => {
    expect(validatePassword("")).toMatch(/enter a password/i);
  });
  it("help text states the exact configured minimum", () => {
    expect(PASSWORD_HELP_TEXT).toContain(String(PASSWORD_MIN_LENGTH));
  });
});

describe("email and name validation", () => {
  it("validates emails", () => {
    expect(validateEmail("")).toMatch(/enter your email/i);
    expect(validateEmail("nope")).toMatch(/valid email/i);
    expect(validateEmail("a@b")).toMatch(/valid email/i);
    expect(validateEmail(" a@b.co ")).toBeNull();
  });
  it("validates names", () => {
    expect(validateDisplayName(" a ")).not.toBeNull();
    expect(validateDisplayName("Al")).toBeNull();
    expect(validateDisplayName("x".repeat(101))).not.toBeNull();
  });
});
