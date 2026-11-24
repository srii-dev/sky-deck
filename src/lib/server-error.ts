/*
 * What a failed request tells the caller. A request the server could not parse or validate is the caller's mistake
 * (400); anything else is ours (500). Neither answer carries the library's own message, which names internals.
 */

export function isBadRequestError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  if (error == null || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  // zod validation errors, however many copies of the library are loaded
  return name === "ZodError" || Array.isArray((error as { issues?: unknown }).issues);
}

export function errorStatus(error: unknown): 400 | 500 {
  return isBadRequestError(error) ? 400 : 500;
}

export const GENERIC_ERROR_MESSAGES = {
  400: "Bad request",
  500: "Something went wrong",
} as const;
