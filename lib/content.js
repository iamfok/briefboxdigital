// Website content. The JSON files in /content are the built-in defaults; anything saved in the admin
// is stored in the database and wins. Cached for a few seconds so pages stay fast.
import site from '@/content/site.json';
import services from '@/content/services.json';
import pages from '@/content/pages.json';
import posts from '@/content/posts.json';
import faqs from '@/content/faqs.json';
import { getDb, all, one, run } from './db.js';

export const FILES = ['site', 'services', 'pages', 'posts', 'faqs'];
const DEFAULTS = { site, services, pages, posts, faqs };
const TTL = 10000;
let cache = null;

export const invalidateContent = () => { cache = null; };
const clone = o => JSON.parse(JSON.stringify(o));

// Put an empty "cover_alt" field right after "cover", so the admin shows it next to the image.
function withAlt(o) {
  if (!o || typeof o !== 'object' || !('cover' in o) || 'cover_alt' in o) return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) { out[k] = v; if (k === 'cover') out.cover_alt = ''; }
  return out;
}

// Fill fields the templates expect, so an old or half-edited record never breaks a page.
function normalize(c) {
  const s = c.site = { ...clone(DEFAULTS.site), ...(c.site || {}) };
  s.theme = { ...DEFAULTS.site.theme, ...(s.theme || {}) };
  s.logo = { ...DEFAULTS.site.logo, ...(s.logo || {}) };
  s.home = { ...DEFAULTS.site.home, ...(s.home || {}) };
  s.pg = { ...DEFAULTS.site.pg, ...(s.pg || {}) };
  for (const k of Object.keys(DEFAULTS.site.pg)) s.pg[k] = { ...DEFAULTS.site.pg[k], ...(s.pg[k] || {}) };
  s.footer = { ...DEFAULTS.site.footer, ...(s.footer || {}) };
  s.track = { ...DEFAULTS.site.track, ...(s.track || {}) };
  s.book = { ...DEFAULTS.site.book, ...(s.book || {}) };
  s.forms = { ...DEFAULTS.site.forms, ...(s.forms || {}) };
  for (const k of ['nav', 'social']) if (!Array.isArray(s[k])) s[k] = clone(DEFAULTS.site[k]);
  if (!Array.isArray(s.footer.cols)) s.footer.cols = clone(DEFAULTS.site.footer.cols);
  for (const k of ['ring1', 'ring2', 'ticker', 'why', 'steps', 'examples']) if (!Array.isArray(s.home[k])) s.home[k] = clone(DEFAULTS.site.home[k] || []);
  s.cover ??= ''; s.home.cover ??= '';
  s.city ??= ''; s.country ??= '';
  s.cover_alt ??= ''; s.home = withAlt(s.home);
  for (const k of Object.keys(s.pg)) s.pg[k] = withAlt(s.pg[k]);
  for (const k of ['services', 'pages', 'posts']) if (!Array.isArray(c[k])) c[k] = clone(DEFAULTS[k]);
  for (const k of ['services', 'pages', 'posts']) c[k] = c[k].map(x => withAlt(x && typeof x === 'object' ? { cover: '', ...x } : x));
  for (const sv of c.services) {
    for (const k of ['tiers', 'features', 'sections', 'process', 'faq']) if (!Array.isArray(sv[k])) sv[k] = [];
    for (const t of sv.tiers) if (!Array.isArray(t.features)) t.features = [];
    sv.cover ??= '';
  }
  for (const p of [...c.pages, ...c.posts]) p.cover ??= '';
  c.faqs = { home: [], blog: [], pricing: [], ...(c.faqs && typeof c.faqs === 'object' && !Array.isArray(c.faqs) ? c.faqs : clone(DEFAULTS.faqs)) };
  return c;
}

export async function getContent({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.data;
  const data = clone(DEFAULTS), versions = {};
  let source = 'built-in';
  try {
    const d = await getDb();
    if (d) {
      for (const r of await all(d, 'SELECT key, value, updated_at FROM content')) {
        if (!FILES.includes(r.key)) continue;
        try { data[r.key] = JSON.parse(r.value); versions[r.key] = r.updated_at; source = 'database'; } catch (e) { /* keep default */ }
      }
    }
  } catch (e) { console.error('content load failed:', e.message); }
  data.mediaAlt = {};
  try {
    const d = await getDb();
    const r = d ? await one(d, "SELECT value FROM config WHERE key = 'media_alt'") : null;
    if (r && r.value) data.mediaAlt = JSON.parse(r.value) || {};
  } catch (e) { /* no alt texts yet */ }
  normalize(data);
  cache = { at: Date.now(), data, versions, source };
  return data;
}
export async function contentVersions() { await getContent({ fresh: true }); return { versions: cache.versions, source: cache.source }; }

// Published posts sorted newest first, like the old build.
export const sortedPosts = c => c.posts.filter(p => p.slug && p.title).sort((a, b) => String(b.date).localeCompare(String(a.date)));

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
function validate(key, v) {
  if (!FILES.includes(key)) throw err('Unknown content file', 404);
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  if (key === 'site' || key === 'faqs') { if (!isObj(v)) throw err('Content must be an object.'); }
  else if (!Array.isArray(v) || !v.every(isObj)) throw err('Content must be a list of items.');
  if (['services', 'pages', 'posts'].includes(key)) {
    const seen = new Set();
    for (const x of v) {
      x.slug = String(x.slug || '').trim().toLowerCase();
      if (!SLUG.test(x.slug)) throw err(`"${x.title || x.name || x.slug || 'An item'}" needs a URL slug made of lowercase letters, numbers and dashes.`);
      if (seen.has(x.slug)) throw err(`Two items use the slug "${x.slug}". Each one must be different.`);
      seen.add(x.slug);
    }
  }
  if (key === 'pages') {
    const reserved = ['admin', 'portal', 'api', 'media', 'assets', 'panel', 'services', 'blog', 'pricing', 'contact', 'sitemap.xml', 'robots.txt', 'team', 'careers'];
    const bad = v.find(x => reserved.includes(x.slug));
    if (bad) throw err(`The slug "${bad.slug}" is already used by the website. Choose another.`);
  }
  const size = JSON.stringify(v).length;
  if (size > 900000) throw err('This content is too large to save (over 900 KB). Move long text into separate pages or posts.');
}

export async function saveContent(d, key, value, who, baseVersion) {
  validate(key, value);
  const cur = await one(d, 'SELECT updated_at FROM content WHERE key = ?', key);
  if (baseVersion !== undefined && baseVersion !== null && cur && Number(baseVersion) !== Number(cur.updated_at))
    throw err('Someone else saved this section after you opened it. Reload the admin to get the latest version, then make your change again.', 409);
  const text = JSON.stringify(value);
  const t = Math.max(Date.now(), cur ? Number(cur.updated_at) + 1 : 0);
  await run(d, `INSERT INTO content(key, value, updated_at, updated_by) VALUES(?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`, key, text, t, who);
  await run(d, 'INSERT INTO content_history(key, value, created_at, created_by) VALUES(?, ?, ?, ?)', key, text, t, who);
  await run(d, `DELETE FROM content_history WHERE key = ? AND id NOT IN (SELECT id FROM content_history WHERE key = ? ORDER BY id DESC LIMIT 40)`, key, key);
  invalidateContent();
  return t;
}

export async function history(d, key) {
  const rows = await all(d, `SELECT id, key, created_at, created_by, LENGTH(value) AS size FROM content_history ${key ? 'WHERE key = ?' : ''} ORDER BY id DESC LIMIT 100`, ...(key ? [key] : []));
  return rows;
}
export async function restore(d, id, who) {
  const r = await one(d, 'SELECT key, value FROM content_history WHERE id = ?', Number(id));
  if (!r) throw err('That version no longer exists.', 404);
  const t = await saveContent(d, r.key, JSON.parse(r.value), who);
  return { key: r.key, version: t };
}
export const defaults = () => clone(DEFAULTS);
