import { createHmac } from "crypto";

const b64url = (buf) =>
  (Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const HEADER = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export function signJwt(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret)
    .update(`${HEADER}.${body}`)
    .digest();
  return `${HEADER}.${body}.${b64url(sig)}`;
}

export function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const sig = createHmac("sha256", secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  if (b64url(sig) !== parts[2]) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    );
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
