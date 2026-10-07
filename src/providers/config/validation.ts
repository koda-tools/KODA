import { ProviderError } from "../../utils/errors.js";

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

function isHttpURL(value: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Rejects non-HTTP(S) base URLs (e.g. file://) before any request is made. */
export function validateBaseURL(value: string, variable: string): void {
  if (!isHttpURL(value))
    throw new ProviderError(`${variable} must be a valid HTTP(S) URL.`);
}
