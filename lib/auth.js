// Passwords, sessions and settings encryption. Web Crypto only, so it runs on Cloudflare Workers and Node 20+.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));
export const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

export function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// ---------------------------------------------------------------- passwords (PBKDF2-SHA256, Workers allow up to 100k rounds)
const ROUNDS = 100000;
export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64u(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ROUNDS }, key, 256);
  return { hash: b64u(bits), salt: b64u(salt) };
}
export async function verifyPassword(password, hash, salt) {
  const h = await hashPassword(password, salt);
  return safeEqual(h.hash, hash);
}
export function passwordProblem(p) {
  p = String(p || '');
  if (p.length < 8) return 'Password needs at least 8 characters.';
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return 'Use letters and numbers in the password.';
  return '';
}
export function randomPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(12));
  return [...r].map(x => a[x % a.length]).join('') + '7';
}

// ---------------------------------------------------------------- sessions: payload.signature in an HttpOnly cookie
export const COOKIE = { client: 'bb_client', admin: 'bb_admin' };
export async function makeToken(env, payload, hours) {
  const body = b64u(enc.encode(JSON.stringify({ ...payload, exp: Date.now() + hours * 3600e3 })));
  return body + '.' + await hmac(env.SESSION_SECRET, body);
}
export async function readToken(env, cookieHeader, name) {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(cookieHeader || '');
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig || !safeEqual(sig, await hmac(env.SESSION_SECRET, body))) return null;
  let p; try { p = JSON.parse(dec.decode(unb64u(body))); } catch (e) { return null; }
  return p && p.exp > Date.now() ? p : null;
}
export const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ---------------------------------------------------------------- settings encryption (AES-GCM)
async function aesKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(String(env.SETTINGS_KEY || env.SESSION_SECRET) + ':settings'));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptJSON(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(JSON.stringify(obj)));
  return b64u(iv) + '.' + b64u(ct);
}
export async function decryptJSON(env, text) {
  if (!text) return null;
  const [iv, ct] = text.split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, await aesKey(env), unb64u(ct));
  return JSON.parse(dec.decode(pt));
}
