const SAMPLE_BYTES = 8 * 1024;
const NON_TEXT_RATIO = 0.3;

/**
 * Classifies a buffer as likely binary by looking at the first 8 KB:
 * a single NUL byte is enough, and otherwise more than 30% of bytes
 * outside the printable UTF-8 range flags the file as binary. Good
 * enough to skip images, archives and executables while reading source
 * code without surprises.
 */
export function isLikelyBinary(buffer: Buffer): boolean {
  const length = Math.min(buffer.length, SAMPLE_BYTES);
  if (length === 0) return false;
  let suspicious = 0;
  for (let index = 0; index < length; index += 1) {
    const byte = buffer[index] ?? 0;
    if (byte === 0) return true;
    const isPrintable =
      byte === 0x09 ||
      byte === 0x0a ||
      byte === 0x0d ||
      (byte >= 0x20 && byte <= 0x7e) ||
      byte >= 0x80;
    if (!isPrintable) suspicious += 1;
  }
  return suspicious / length > NON_TEXT_RATIO;
}
