// Minimal shared-password gate for previewing this app publicly before real
// auth exists. One password (SITE_PASSWORD env var), one session cookie,
// no user accounts. Works in both the Edge middleware runtime and the
// Node.js server action runtime because it only uses Web Crypto (available
// as a global in both), never Node's `Buffer`.

export const SESSION_COOKIE = "ns_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function bufferToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Deterministic session token derived from the site password. Anyone who
 * knows SITE_PASSWORD can compute it, which is fine — the password is the
 * actual secret; the cookie just avoids asking for it on every request.
 */
export async function computeSessionToken(password: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("northstar-preview-gate"));
  return bufferToHex(signature);
}

/** If SITE_PASSWORD isn't set, the gate is off (local dev stays frictionless). */
export function gateEnabled() {
  return Boolean(process.env.SITE_PASSWORD && process.env.SITE_PASSWORD.trim().length > 0);
}
