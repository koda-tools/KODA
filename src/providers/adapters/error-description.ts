export interface FailureInfo {
  readonly status?: number | undefined;
  readonly connection?: boolean;
}

const STATUS_HINTS: Readonly<Record<number, string>> = {
  401: "invalid or revoked API key",
  403: "access denied",
  404: "model not found",
  429: "rate limit or insufficient quota",
};

const DEFAULT_HINT = "request rejected";
const CONNECTION_HINT = "connection error; check network or base URL";

export function describeFailure({ status, connection }: FailureInfo): string {
  if (typeof status === "number")
    return ` (HTTP ${status}: ${STATUS_HINTS[status] ?? DEFAULT_HINT})`;
  return connection === true ? ` (${CONNECTION_HINT})` : "";
}
