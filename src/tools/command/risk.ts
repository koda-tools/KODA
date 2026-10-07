import type { CommandDecision } from "./types.js";

/** Shell operators that chain or pipe separate commands. */
const SEGMENT_SPLIT = /&&|\|\||[;|]/;

interface DenyRule {
  readonly test: RegExp;
  readonly reason: string;
}

/**
 * Rules checked against the whole command, because they span a pipe
 * (a download feeding a shell) that segment splitting would hide.
 */
const WHOLE_COMMAND_DENY: readonly DenyRule[] = [
  {
    test: /\b(?:curl|wget|iwr|invoke-webrequest)\b[\s\S]*\|[\s\S]*\b(?:sh|bash|zsh|iex)\b/,
    reason: "piping a download into a shell",
  },
];

/**
 * Rules checked against a single normalized segment. Written to catch
 * accidents, not a determined adversary: `bash -c '...'`, aliases and env
 * indirection can still slip through, so the user confirmation is the real
 * safeguard. Flag-style patterns use token boundaries so `-f` does not
 * match inside a word like `feature`.
 */
const SEGMENT_DENY: readonly DenyRule[] = [
  { test: /\b(?:sudo|doas|runas)\b/, reason: "privilege escalation" },
  {
    test: /\brm\b[^|&;]*\s-[a-z]*[rf][a-z]*\s[^|&;]*(?:\/|~|\$home)/,
    reason: "recursive delete outside the workspace",
  },
  {
    test: /\bgit\b.*\bpush\b.*(?:--force(?:-with-lease)?\b|(?:^|\s)-[a-z]*f[a-z]*(?=\s|$))/,
    reason: "force-pushing rewrites remote history",
  },
  {
    test: /\b(?:npm|yarn|pnpm)\b\s+publish\b/,
    reason: "publishing a package",
  },
  {
    test: /(?:\/etc\/|~\/\.(?:ssh|aws|gnupg|npmrc)|\$home\/\.(?:ssh|aws))/,
    reason: "touching credentials or system files",
  },
  {
    test: /[>]{1,2}\s*(?:\/|~|\.\.|[a-z]:\\)/i,
    reason: "redirecting output outside the workspace",
  },
  {
    test: /\b(?:shutdown|reboot|halt|mkfs|diskpart|format)\b/,
    reason: "system-level operation",
  },
];

function normalize(segment: string): string {
  return segment.trim().replace(/\s+/g, " ").toLowerCase();
}

function segments(command: string): string[] {
  return command
    .split(SEGMENT_SPLIT)
    .map(normalize)
    .filter((segment) => segment !== "");
}

function denyReason(segment: string): string | undefined {
  return SEGMENT_DENY.find((rule) => rule.test.test(segment))?.reason;
}

/** True when the segment starts with an allowlist entry as whole tokens. */
function isAllowlisted(segment: string, allowlist: readonly string[]): boolean {
  return allowlist.some((entry) => {
    const prefix = normalize(entry);
    return segment === prefix || segment.startsWith(`${prefix} `);
  });
}

/**
 * Classifies a command by its riskiest segment. Deny wins over the
 * allowlist, so a permissive entry cannot reopen a denied operation.
 */
export function classify(
  command: string,
  allowlist: readonly string[] = [],
): CommandDecision {
  const whole = normalize(command);
  const spanning = WHOLE_COMMAND_DENY.find((rule) => rule.test.test(whole));
  if (spanning !== undefined)
    return { level: "deny", reason: spanning.reason };
  const parts = segments(command);
  if (parts.length === 0) return { level: "confirm" };
  for (const segment of parts) {
    const reason = denyReason(segment);
    if (reason !== undefined) return { level: "deny", reason };
  }
  return parts.every((segment) => isAllowlisted(segment, allowlist))
    ? { level: "allow" }
    : { level: "confirm" };
}
