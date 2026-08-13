import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

export function hashAdminPassword(password: string) {
  const salt = randomBytes(24);
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY,
  });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64url"), derived.toString("base64url")].join(":");
}

export function verifyAdminPassword(password: string, encoded: string | undefined) {
  if (!encoded || password.length > 256) return false;
  const [algorithm, nValue, rValue, pValue, saltValue, hashValue, extra] = encoded.split(":");
  if (algorithm !== "scrypt" || extra || !saltValue || !hashValue) return false;
  const N = Number(nValue); const r = Number(rValue); const p = Number(pValue);
  if (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (salt.length < 16 || expected.length !== KEY_LENGTH) return false;
    const actual = scryptSync(password, salt, expected.length, { N, r, p, maxmem: MAX_MEMORY });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
