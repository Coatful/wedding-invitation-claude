// Small crypto helpers built on the Web Crypto API that Workers provide.

const enc = new TextEncoder();
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // no I, L, O or U: easy to read out over the phone

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function b64url(bytes) {
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(str) {        // accepts standard or URL-safe base64
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A 256-bit secret for a private link, as 43 URL-safe characters. */
export function newToken() {
  return b64url(randomBytes(32));
}

/** A readable reference such as R-7K2M-9QXA. Not a secret. */
export function newId(prefix, groups = 2) {
  const b = randomBytes(groups * 4);
  let out = prefix;
  for (let g = 0; g < groups; g++) {
    out += '-';
    for (let i = 0; i < 4; i++) out += CROCKFORD[b[g * 4 + i] & 31];
  }
  return out;
}

function hex(bytes) {
  return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))));
}

/** Constant-time comparison for the admin key. */
export function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}

// Email addresses waiting to be sent are stored encrypted (AES-256-GCM) with EMAIL_KEY.
async function aesKey(secret) {
  const raw = fromB64(secret || '');
  if (raw.length !== 32) throw new Error('EMAIL_KEY must be 32 random bytes, base64-encoded');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptText(secret, text) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(text));
  return 'v1.' + b64url(iv) + '.' + b64url(new Uint8Array(ct));
}

export async function decryptText(secret, blob) {
  const [v, iv, ct] = String(blob).split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('unrecognised ciphertext');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await aesKey(secret), fromB64(ct));
  return new TextDecoder().decode(pt);
}
