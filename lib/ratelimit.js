// Simple lockout for sign-in and public forms, stored in the database.
import { one, run } from './db.js';

export function clientIp(request) {
  const h = request.headers;
  return h.get('cf-connecting-ip') || (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

// true when this key has used up its attempts
export async function isLocked(d, key, now = Date.now()) {
  const r = await one(d, 'SELECT locked_until FROM login_attempts WHERE key = ?', key);
  return !!(r && r.locked_until > now);
}
export async function hit(d, key, { max = 5, windowMs = 15 * 60e3, lockMs = 15 * 60e3 } = {}, now = Date.now()) {
  const r = await one(d, 'SELECT count, first_at FROM login_attempts WHERE key = ?', key);
  if (!r || now - r.first_at > windowMs) {
    await run(d, 'INSERT INTO login_attempts(key, count, first_at, locked_until) VALUES(?, 1, ?, 0) ON CONFLICT(key) DO UPDATE SET count = 1, first_at = excluded.first_at, locked_until = 0', key, now);
    return 1;
  }
  const count = r.count + 1;
  await run(d, 'UPDATE login_attempts SET count = ?, locked_until = ? WHERE key = ?', count, count >= max ? now + lockMs : 0, key);
  return count;
}
export const clearHits = (d, key) => run(d, 'DELETE FROM login_attempts WHERE key = ?', key);
