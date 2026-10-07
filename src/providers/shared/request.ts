/**
 * Builds `{ [key]: value }` only when the value is defined, so it can be
 * spread into request objects under `exactOptionalPropertyTypes`.
 */
export function optional<K extends string, V>(
  key: K,
  value: V | null | undefined,
): Partial<Record<K, V>> {
  const field: Partial<Record<K, V>> = {};
  if (value !== undefined && value !== null) field[key] = value;
  return field;
}

/** Same as `optional`, but also skips empty arrays and empty strings. */
export function optionalNonEmpty<
  K extends string,
  V extends string | readonly unknown[],
>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined || value.length === 0 ? {} : optional(key, value);
}
