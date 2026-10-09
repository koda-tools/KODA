import type { FenceInfo } from "./types.js";

export const FENCE_OPEN = /^ {0,3}```(.*)$/;
export const FENCE_CLOSE = /^ {0,3}```\s*$/;
/** A partial line that might still turn into a fence: hold its preview. */
export const MAYBE_FENCE = /^ {0,3}`/;

const MAX_FILENAME = 120;
const NAMED_FILE = /\b(?:title|filename|file)=(?:"([^"]*)"|'([^']*)'|(\S+))/;
const LOOKS_LIKE_PATH = /[./\\]/;

function cleanFilename(name: string | undefined): string | undefined {
  const value = name?.trim();
  if (value === undefined || value === "" || value.length > MAX_FILENAME)
    return undefined;
  return value;
}

/**
 * Read the language and optional file name from a fence info string.
 * Accepts ```ts, ```ts title="a.ts", ```ts:src/a.ts and ```ts src/a.ts.
 */
export function parseFenceInfo(info: string): FenceInfo {
  const named = NAMED_FILE.exec(info);
  const rest = named === null ? info : info.replace(named[0], " ");
  const [first = "", ...others] = rest.trim().split(/\s+/);
  const colon = first.indexOf(":");
  const language = colon > 0 ? first.slice(0, colon) : first;
  const inline = colon > 0 ? first.slice(colon + 1) : undefined;
  const bare = others.find((token) => LOOKS_LIKE_PATH.test(token));
  const filename = cleanFilename(
    named === null ? (inline ?? bare) : (named[1] ?? named[2] ?? named[3]),
  );
  return { language, filename };
}
