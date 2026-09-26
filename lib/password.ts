// Cloudflare Workers Web Crypto caps PBKDF2 at 100,000 iterations.
const iterations = 100_000;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

export function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validUsername(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(value);
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

async function derive(password: string, salt: Uint8Array, count: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: count }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  return `pbkdf2-sha256$${iterations}$${toBase64Url(salt)}$${toBase64Url(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, countText, saltText, expectedText] = encoded.split("$");
  const count = Number(countText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(count) || count < 1 || count > 100_000 || !saltText || !expectedText) return false;
  const actual = await derive(password, fromBase64Url(saltText), count);
  const expected = fromBase64Url(expectedText);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}
