/**
 * Resolves a bounded limit. `requested` comes from the model, `fallback` is
 * the default when it asks for nothing, and `ceiling` is the operator cap
 * from `ToolRegistryOptions`. Without a ceiling the request stands: the
 * default must not double as a maximum.
 */
export function bounded(
  requested: number | undefined,
  fallback: number,
  ceiling: number | undefined,
): number {
  const value = requested ?? fallback;
  return ceiling === undefined ? value : Math.min(value, ceiling);
}
