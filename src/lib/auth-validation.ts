/** Shared form validation for authentication screens (single source of truth for rules AND messages). */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_HELP_TEXT = `Use at least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number.`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

/** Returns a user-facing message when the email is invalid, otherwise null. */
export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return "Please enter your email address.";
  if (!EMAIL_REGEX.test(v)) return "Please enter a valid email address.";
  return null;
}

/**
 * New-account password policy. Existing accounts are never re-validated at sign-in, so people who
 * registered under the older, looser rule can still log in.
 */
export function validatePassword(value: string): string | null {
  if (!value) return "Please enter a password.";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters. ${PASSWORD_HELP_TEXT}`;
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return `Password must include at least one letter and one number. ${PASSWORD_HELP_TEXT}`;
  }
  return null;
}

export function validateDisplayName(value: string): string | null {
  const v = value.trim();
  if (v.length < 2) return "Please enter your name.";
  if (v.length > 100) return "Name is too long (100 characters maximum).";
  return null;
}
