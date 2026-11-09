/*
 * Rules and messages for the sign-in form (Phase 18d). Pure functions so they can be tested without a browser or
 * a Supabase project. The server is the authority on what a password must be; these checks only give quick,
 * clear feedback before a request is sent.
 */

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt, which Supabase uses, ignores everything after 72 bytes, so longer passwords are refused. */
export const MAX_PASSWORD_BYTES = 72;
export const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A deliberately simple check (one @, something on both sides, a dot in the domain, no spaces). */
export function emailError(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!email) return "Enter your email address.";
  if (email.length > MAX_EMAIL_LENGTH) return "That email address is too long.";
  if (email.includes(" ")) return "An email address cannot contain spaces.";
  const parts = email.split("@");
  const local = parts[0] ?? "";
  const domain = parts[1] ?? "";
  if (parts.length !== 2 || !local || !domain) return "Enter a valid email address.";
  const dot = domain.indexOf(".");
  if (dot < 1 || domain.endsWith(".") || domain.includes(".."))
    return "Enter a valid email address.";
  return null;
}

export function passwordError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Use at least " + MIN_PASSWORD_LENGTH + " characters.";
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return "That password is too long (most " + MAX_PASSWORD_BYTES + " bytes).";
  }
  return null;
}

export type AuthMode = "sign-in" | "sign-up";

/** The first problem with the form, or null when it can be sent. */
export function formError(mode: AuthMode, email: string, password: string): string | null {
  const e = emailError(email);
  if (e) return e;
  if (mode === "sign-in") return password ? null : "Enter your password.";
  return passwordError(password);
}

interface AuthLikeError {
  code?: string | undefined;
  message?: string | undefined;
  status?: number | undefined;
}

/** Friendly text for the errors Supabase Auth returns. Unknown errors get a generic message, not the raw text. */
export function authErrorMessage(err: AuthLikeError | null | undefined): string {
  if (!err) return "Something went wrong. Try again.";
  switch (err.code) {
    case "invalid_credentials":
      return "That email and password do not match.";
    case "email_not_confirmed":
      return "Confirm your email first: open the link we sent you, then sign in.";
    case "user_already_exists":
    case "email_exists":
      return "That email already has an account. Try signing in.";
    case "weak_password":
      return "That password is too easy to guess. Try a longer one.";
    case "signup_disabled":
      return "Sign-up is switched off right now.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    case "validation_failed":
      return "Check the email address and password.";
    default:
      break;
  }
  if (err.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  return "Something went wrong. Try again.";
}

/**
 * Supabase hides whether an address is already registered when email confirmation is on: sign-up then answers
 * with a user whose `identities` list is empty. Treat that like "already registered".
 */
export function signUpLooksRegistered(
  user: { identities?: unknown[] | null } | null | undefined,
): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}
