/**
 * ULID generator (https://github.com/ulid/spec).
 *
 * Format: 26 Crockford base32 characters.
 * - First 10 characters: 48-bit millisecond timestamp since epoch
 * - Last 16 characters: 80 bits of randomness
 *
 * Because the timestamp occupies the most significant bits, ULIDs sort
 * lexicographically in time order. Relies only on the Web Crypto API
 * (`crypto.getRandomValues`), so it works in Cloudflare Workers, browsers,
 * and Node.js 19+ — no external dependencies.
 */

/**
 * Crockford base32 alphabet.
 * Excludes I, L, O, U to avoid confusion with 1, 0, and each other.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Encodes the low 48 bits of a millisecond timestamp as 10 base32 characters.
 * The top character only carries 3 meaningful bits (48 % 5 = 3), so it is
 * always in the range [0-7], per the ULID spec.
 */
function encodeTime(now: number): string {
  let time = BigInt(now);
  let str = '';
  for (let i = 0; i < 10; i++) {
    str = ALPHABET[Number(time & 31n)] + str;
    time >>= 5n;
  }
  return str;
}

/**
 * Encodes 80 bits of randomness as 16 base32 characters.
 * The 16 characters consume exactly 80 bits (16 * 5), extracted bit by bit
 * from 10 random bytes, so every character uses its full 5-bit range without
 * the modulo bias of a per-byte `% 32`.
 */
function encodeRandom(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let str = '';
  for (let i = 0; i < 16; i++) {
    const bitIndex = i * 5;
    const byteIndex = bitIndex >> 3; // floor(bitIndex / 8)
    const bitOffset = bitIndex & 7; // bitIndex % 8
    let value = bytes[byteIndex] >> bitOffset;
    if (bitOffset > 3) {
      // The 5 bits span two bytes: take the remainder from the next byte.
      value |= bytes[byteIndex + 1] << (8 - bitOffset);
    }
    str += ALPHABET[value & 0x1f];
  }
  return str;
}

/**
 * Generates a ULID string: 10 timestamp characters + 16 random characters.
 */
export function ulid(): string {
  return encodeTime(Date.now()) + encodeRandom();
}
