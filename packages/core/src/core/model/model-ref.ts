import { AgentError } from "../../utils/errors.js";
import type { AgentIdentity } from "../agent/types.js";
import type { ModelRef } from "./types.js";

const PROVIDER_SEPARATOR = "/";
const VARIANT_SEPARATOR = "#";

/** Parses `model`, `provider/model` or `provider/model#variant`. */
export function parseModelRef(raw: string): ModelRef {
  const separator = raw.indexOf(PROVIDER_SEPARATOR);
  if (separator === -1) return { model: raw };
  const rest = raw.slice(separator + 1);
  return {
    provider: raw.slice(0, separator),
    model: rest.split(VARIANT_SEPARATOR, 1)[0] ?? rest,
  };
}

/**
 * Resolves the model to request: the identity default when no override is
 * given, otherwise the override without its provider prefix.
 */
export function resolveModel(
  raw: string | undefined,
  identity: AgentIdentity,
): string {
  if (raw === undefined) return identity.model;
  const ref = parseModelRef(raw);
  if (ref.provider !== undefined && ref.provider !== identity.provider)
    throw new AgentError(
      `Model provider '${ref.provider}' does not match selected provider '${identity.provider}'.`,
    );
  return ref.model;
}
