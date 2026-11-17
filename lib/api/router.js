// Every /api/* request. Routes:
//   /api/health, /api/forms                       public
//   /api/plans, /api/auth/*, /api/me/*, /api/cron/* Lead Engine client portal
//   /api/admin/*                                  admin panel (website + Lead Engine)
import * as A from '../auth.js';
import * as B from '../le/billing.js';
import { statsFor, leadsCsv, testConnection, mergeSettings, monthLeadCount, unlinkedWorkflows, n8n } from '../le/n8n.js';
import { getDb, all, one, run, setConfigValue } from '../db.js';
import { appEnv, encryptSecret } from '../env.js';
import { getContent, contentVersions, saveContent, history, restore, FILES } from '../content.js';
import * as U from '../admins.js';
import { clientIp, isLocked, hit, clearHits } from '../ratelimit.js';
import STATIC_UPLOADS from '../static-uploads.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const fail = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const slow = () => new Promise(r => setTimeout(r, 600));
const daysParam = url => Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
const csv = (text, name) => new Response(text, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
const NO_DB = 'The database is not connected yet. The website shows its built-in content until you connect one (see README: Database).';
const LOCKED = 'Too many wrong attempts. Wait 15 minutes and try again.';

export async function handle(request, parts) {
  try { return await route(request, parts); }
  catch (e) {
    const status = e.status && e.status < 600 ? e.status : 500;
    if (status >= 500) console.error(e);
    return json({ error: e.message || 'Something went wrong', errors: e.errors }, status);
  }
}

async function route(request, parts) {
  const url = new URL(request.url);
  const p = parts.map(String);
  const m = request.method;
  if (m !== 'GET' && m !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (origin) {
      let oh = ''; try { oh = new URL(origin).host; } catch (e) { /* invalid */ }
      const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
      if (oh !== host && oh !== url.host) return fail('Cross-site request blocked.', 403);
    }
  }
  const cookie = request.headers.get('Cookie') || '';
  const body = async () => { try { return await request.json(); } catch (e) { return {}; } };
  const match = (method, pattern) => {
    if (method !== m) return null;
    const ps = pattern.split('/');
    if (ps.length !== p.length) return null;
    const out = {};
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].startsWith(':')) out[ps[i].slice(1)] = decodeURIComponent(p[i]);
      else if (ps[i] !== p[i]) return null;
    }
    return out;
  };

  let d = null, dbError = '';
  try { d = await getDb(); } catch (e) { dbError = e.message; }

  if (match('GET', 'health')) return json({ ok: true, db: !!d, db_error: dbError || undefined });

  // ------------------------------------------------------------ website forms (contact + booking)
  if (match('POST', 'forms')) {
    if (!d) return json({ stored: false });
    const b = await body(), f = (b && typeof b.fields === 'object' && b.fields) || {};
    if (f._gotcha) return json({ stored: true });
    const ip = clientIp(request), key = 'form:' + ip;
    if (await isLocked(d, key)) return fail('Too many messages. Please try again later.', 429);
    await hit(d, key, { max: 20, windowMs: 3600e3, lockMs: 3600e3 });
    const fields = {};
    for (const [k, v] of Object.entries(f)) if (!k.startsWith('_') && Object.keys(fields).length < 20) fields[String(k).slice(0, 40)] = String(v ?? '').slice(0, 4000);
    if (!fields.email && !fields.name) return fail('Add your name and email.');
    await run(d, 'INSERT INTO messages(at, kind, name, email, data, ip) VALUES(?,?,?,?,?,?)', Date.now(), String(b.kind || 'Message').slice(0, 60),
      fields.name || '', fields.email || '', JSON.stringify({ ...fields, page: String(b.page || '').slice(0, 200) }), ip);
    return json({ stored: true });
  }

  if (p[0] === 'admin' && match('GET', 'admin/status')) {
    if (!d) return json({ db: false, db_error: dbError || undefined });
    const env = await appEnv(d);
    const user = await adminUser(env, d, cookie);
    return json({ db: true, needs_setup: (await U.countAdmins(d)) === 0, setup_code: !!env.ADMIN_SETUP_CODE, user: U.publicUser(user) });
  }
  if (!d) return fail(dbError ? 'Database error: ' + dbError : NO_DB, 503, { code: 'no_db' });
  const env = await appEnv(d);

  if (p[0] === 'admin') return adminRoutes({ request, url, p, m, match, body, cookie, d, env });
  return clientRoutes({ request, url, p, m, match, body, cookie, d, env });
}

// ================================================================== admin
async function adminUser(env, d, cookie) {
  const tok = await A.readToken(env, cookie, A.COOKIE.admin);
  if (!tok || tok.r !== 'a') return null;
  const u = await U.getAdmin(d, tok.u);
  if (!u || u.disabled || tok.v !== u.pass_salt.slice(0, 10)) return null;
  return u;
}
const adminCookie = async (env, u) => A.setCookie(A.COOKIE.admin, await A.makeToken(env, { r: 'a', u: u.id, v: u.pass_salt.slice(0, 10) }, 12), 12 * 3600);

async function adminRoutes(c) {
  const { request, url, p, match, body, cookie, d, env } = c;
  let r;

  if (match('POST', 'admin/setup')) {
    if ((await U.countAdmins(d)) > 0) return fail('The owner account already exists. Sign in instead.', 403);
    const b = await body();
    if (env.ADMIN_SETUP_CODE && !A.safeEqual(b.setup_code, env.ADMIN_SETUP_CODE)) { await slow(); return fail('Wrong setup code.', 403); }
    const { user } = await U.createAdmin(d, { email: b.email, name: b.name, role: 'owner', password: b.password });
    await U.log(d, user.email, 'Created the owner account');
    return json({ user: U.publicUser(user) }, 201, { 'Set-Cookie': await adminCookie(env, user) });
  }
  if (match('POST', 'admin/login')) {
    const b = await body(), email = String(b.email || '').trim().toLowerCase(), ip = clientIp(request);
    const keys = ['admin:' + email, 'adminip:' + ip];
    if (await isLocked(d, keys[0]) || await isLocked(d, keys[1])) { await slow(); return fail(LOCKED, 429); }
    const u = await U.getAdminByEmail(d, email);
    if (!u || u.disabled || !(await A.verifyPassword(b.password, u.pass_hash, u.pass_salt))) {
      await hit(d, keys[0]); await hit(d, keys[1], { max: 20 });
      await U.log(d, email, 'Failed admin sign in', ip);
      await slow(); return fail('Email or password is wrong.', 401);
    }
    await clearHits(d, keys[0]);
    await run(d, 'UPDATE admin_users SET last_login_at = ? WHERE id = ?', Date.now(), u.id);
    await U.log(d, u.email, 'Signed in', ip);
    return json({ user: U.publicUser(u) }, 200, { 'Set-Cookie': await adminCookie(env, u) });
  }
  if (match('POST', 'admin/logout')) return json({ ok: true }, 200, { 'Set-Cookie': A.setCookie(A.COOKIE.admin, '', 0) });

  const me = await adminUser(env, d, cookie);
  if (!me) return fail('Please sign in.', 401);
  const who = me.email;
  const need = (ok) => { if (!ok) throw err('Your role cannot do this. Ask a Super Admin.', 403); };

  if (match('GET', 'admin/me')) return json({ user: U.publicUser(me) });
  if (match('POST', 'admin/password')) {
    const b = await body();
    const u = await U.changeOwnPassword(d, me, b.current, b.next);
    await U.log(d, who, 'Changed own password');
    return json({ ok: true }, 200, { 'Set-Cookie': await adminCookie(env, u) });
  }

  // ---------------- website content
  if (match('GET', 'admin/content')) {
    const files = await getContent({ fresh: true });
    const { versions, source } = await contentVersions();
    const unread = (await one(d, 'SELECT COUNT(*) AS n FROM messages WHERE is_read = 0')).n;
    return json({ files, versions, source, unread });
  }
  if ((r = match('PUT', 'admin/content/:key'))) {
    need(U.can.editContent(me));
    if (!FILES.includes(r.key)) return fail('Unknown content file', 404);
    const b = await body();
    const version = await saveContent(d, r.key, b.data, who, b.version);
    await U.log(d, who, 'Saved ' + r.key);
    return json({ version });
  }
  if (match('GET', 'admin/history')) {
    const key = url.searchParams.get('key');
    return json({ versions: await history(d, key && FILES.includes(key) ? key : null) });
  }
  if ((r = match('POST', 'admin/history/:id/restore'))) {
    need(U.can.editContent(me));
    const x = await restore(d, r.id, who);
    await U.log(d, who, 'Restored an older version of ' + x.key);
    return json(x);
  }
  if (match('GET', 'admin/activity')) return json({ activity: await U.activity(d, url.searchParams.get('limit')) });

  // ---------------- media library
  if (match('GET', 'admin/media')) {
    const rows = await all(d, 'SELECT name, type, size, created_at, created_by FROM media ORDER BY created_at DESC');
    return json({ media: [...rows.map(x => ({ ...x, path: '/media/' + x.name })), ...STATIC_UPLOADS.map(x => ({ ...x, builtin: true, type: 'image' }))] });
  }
  if (match('POST', 'admin/media')) {
    need(U.can.editContent(me));
    const b = await body();
    const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
    const ext = TYPES[b.type];
    if (!ext) return fail('Upload a JPG, PNG, WebP, GIF, AVIF or SVG image.');
    const data = String(b.data || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    const size = Math.floor(data.length * 3 / 4);
    if (!data || size > 1.5e6) return fail('The image is larger than 1.5 MB. Compress it first (for example with squoosh.app).');
    let base = String(b.name || 'image').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
    let name = `${base}.${ext}`;
    for (let i = 2; await one(d, 'SELECT name FROM media WHERE name = ?', name); i++) name = `${base}-${i}.${ext}`;
    await run(d, 'INSERT INTO media(name, type, size, data, created_at, created_by) VALUES(?,?,?,?,?,?)', name, b.type, size, data, Date.now(), who);
    await U.log(d, who, 'Uploaded ' + name);
    return json({ name, path: '/media/' + name, size }, 201);
  }
  if ((r = match('DELETE', 'admin/media/:name'))) {
    need(U.can.editContent(me));
    await run(d, 'DELETE FROM media WHERE name = ?', r.name);
    await U.log(d, who, 'Deleted ' + r.name);
    return json({ ok: true });
  }

  // ---------------- inbox (contact and booking forms)
  if (match('GET', 'admin/messages')) {
    need(U.can.inbox(me));
    const rows = await all(d, 'SELECT * FROM messages ORDER BY id DESC LIMIT 300');
    return json({ messages: rows.map(x => { let data = {}; try { data = JSON.parse(x.data); } catch (e) {} return { ...x, data, is_read: !!x.is_read }; }) });
  }
  if ((r = match('POST', 'admin/messages/:id/read'))) {
    need(U.can.inbox(me));
    await run(d, 'UPDATE messages SET is_read = ? WHERE id = ?', (await body()).read === false ? 0 : 1, Number(r.id));
    return json({ ok: true });
  }
  if ((r = match('DELETE', 'admin/messages/:id'))) {
    need(U.can.inbox(me));
    await run(d, 'DELETE FROM messages WHERE id = ?', Number(r.id));
    await U.log(d, who, 'Deleted a message');
    return json({ ok: true });
  }

  // ---------------- users & access (Super Admin)
  if (p[1] === 'users') {
    need(U.can.owner(me));
    if (match('GET', 'admin/users')) return json({ users: await U.listAdmins(d) });
    if (match('POST', 'admin/users')) {
      const b = await body();
      const x = await U.createAdmin(d, { email: b.email, name: b.name, role: b.role });
      await U.log(d, who, 'Added admin ' + x.user.email + ' as ' + x.user.role);
      return json({ user: U.publicUser(x.user), temp_password: x.temp_password }, 201);
    }
    if ((r = match('PUT', 'admin/users/:id'))) {
      const u = await U.updateAdmin(d, me, r.id, await body());
      await U.log(d, who, 'Updated admin ' + u.email);
      return json({ user: U.publicUser(u) });
    }
    if ((r = match('POST', 'admin/users/:id/password'))) {
      const temp = await U.resetAdminPassword(d, r.id);
      await U.log(d, who, 'Reset the password of admin #' + r.id);
      return json({ temp_password: temp });
    }
    if ((r = match('DELETE', 'admin/users/:id'))) {
      await U.deleteAdmin(d, me, r.id);
      await U.log(d, who, 'Deleted admin #' + r.id);
      return json({ ok: true });
    }
  }

  // ---------------- Lead Engine (Super Admin)
  if (p[1] === 'le') { need(U.can.owner(me)); return leAdmin({ ...c, p: p.slice(1), who }); }
  return fail('Not found', 404);
}

// p here starts with 'le'
async function leAdmin({ url, p, body, d, env, who, request }) {
  const m = request.method;
  const match = (method, pattern) => {
    if (method !== m) return null;
    const ps = pattern.split('/');
    if (ps.length !== p.length) return null;
    const out = {};
    for (let i = 0; i < ps.length; i++) { if (ps[i].startsWith(':')) out[ps[i].slice(1)] = decodeURIComponent(p[i]); else if (ps[i] !== p[i]) return null; }
    return out;
  };
  const cfg = await B.getConfig(env);
  let r;
  if (match('GET', 'le/overview')) { await B.runExpiry(env); return json(await B.overview(env)); }
  if (match('POST', 'le/cron/expire')) return json(await B.runExpiry(env));
  if (match('GET', 'le/accounts')) { await B.runExpiry(env); return json({ accounts: await B.listAccounts(env) }); }
  if (match('POST', 'le/accounts')) {
    const b = await body(), temp = A.randomPassword();
    const { hash, salt } = await A.hashPassword(temp);
    const a = await B.createAccount(env, { ...b, hash, salt });
    await U.log(d, who, 'Added client ' + a.company);
    return json({ account: B.adminAccount(a, cfg), temp_password: temp }, 201);
  }
  if (match('GET', 'le/workflows/unlinked')) {
    const linked = new Set((await B.listAccounts(env)).map(a => String(a.workflow_id)).filter(Boolean));
    return json({ workflows: await unlinkedWorkflows(env, linked) });
  }
  if (p[1] === 'accounts' && p[2]) {
    let a = await B.getAccount(env, p[2]);
    if (!a) return fail('Account not found', 404);
    a = await B.refresh(env, a, cfg);
    const out = async (res = {}) => json({ ...res, account: B.adminAccount(res.account || await B.getAccount(env, a.id), cfg) });
    const logged = async (what, res) => { await U.log(d, who, what + ': ' + a.company); return out(res); };
    if (match('GET', 'le/accounts/:id')) return json({ account: B.adminAccount(a, cfg), plan: a.plan_id ? await B.getPlan(env, a.plan_id) : null,
      invoices: await B.listInvoices(env, a.id), plans: await B.listPlans(env, { includeHidden: true }) });
    if (match('PUT', 'le/accounts/:id/info')) return out({ account: await B.updateInfo(env, a, await body(), { admin: true }) });
    if (match('GET', 'le/accounts/:id/settings')) return json(await B.settingsView(env, a));
    if (match('PUT', 'le/accounts/:id/settings')) return json(await B.saveSettings(env, a, await body()));
    if ((r = match('POST', 'le/accounts/:id/test/:service'))) return json(await testFor(env, a, r.service, await body()));
    if (match('GET', 'le/accounts/:id/stats')) return json(a.workflow_id ? await statsFor(env, a.client_id, daysParam(url)) : { empty: true, reason: 'not_live' });
    if (match('GET', 'le/accounts/:id/leads.csv')) return csv(await leadsCsv(env, a.client_id, daysParam(url)), `${a.client_id}-leads-${daysParam(url)}d.csv`);
    if (match('POST', 'le/accounts/:id/approve')) return logged('Approved client', await B.approve(env, a.id));
    if (match('POST', 'le/accounts/:id/suspend')) return logged('Paused client', await B.setStatus(env, a.id, 'suspended', (await body()).note));
    if (match('POST', 'le/accounts/:id/resume')) return logged('Resumed client', await B.setStatus(env, a.id, 'active'));
    if (match('POST', 'le/accounts/:id/reject')) return logged('Rejected client', await B.setStatus(env, a.id, 'rejected', (await body()).note));
    if (match('POST', 'le/accounts/:id/reopen')) return logged('Reopened client', await B.setStatus(env, a.id, 'pending'));
    if (match('POST', 'le/accounts/:id/link')) return logged('Linked workflow for', await B.linkWorkflow(env, a.id, String((await body()).workflow_id || '').trim()));
    if (match('PUT', 'le/accounts/:id/subscription')) return logged('Changed subscription of', await B.setSubscription(env, a.id, await body()));
    if (match('POST', 'le/accounts/:id/password')) {
      const temp = A.randomPassword();
      const { hash, salt } = await A.hashPassword(temp);
      await B.setPassword(env, a.id, hash, salt);
      await U.log(d, who, 'Reset client password: ' + a.company);
      return json({ temp_password: temp });
    }
    if (match('POST', 'le/accounts/:id/invoices')) {
      const b = await body();
      const inv = await B.createInvoice(env, a, b.plan_id, { amount: b.amount === '' || b.amount == null ? undefined : b.amount });
      if (b.paid) return logged('Recorded payment for', await B.markPaid(env, inv.id, { method: b.method || 'Manual', reference: b.reference || '', note: b.note || 'Recorded by admin' }));
      return out({ invoice: inv });
    }
    return fail('Not found', 404);
  }
  if (match('GET', 'le/invoices')) return json({ review: await B.invoicesToReview(env), recent: await B.recentPaid(env) });
  if ((r = match('POST', 'le/invoices/:id/paid'))) { const x = await B.markPaid(env, r.id, await body()); await U.log(d, who, 'Marked paid: invoice #' + r.id); return json(x); }
  if ((r = match('POST', 'le/invoices/:id/reject'))) { const x = await B.rejectInvoice(env, r.id, (await body()).note); await U.log(d, who, 'Payment not received: invoice #' + r.id); return json({ invoice: x }); }
  if (match('GET', 'le/plans')) return json({ plans: await B.listPlans(env, { includeHidden: true }) });
  if (match('POST', 'le/plans')) return json({ plan: await B.savePlan(env, await body()) }, 201);
  if ((r = match('PUT', 'le/plans/:id'))) return json({ plan: await B.savePlan(env, await body(), r.id) });
  if (match('GET', 'le/billing')) return json({ config: cfg });
  if (match('PUT', 'le/billing')) { const x = await B.setConfig(env, await body()); await U.log(d, who, 'Changed billing settings'); return json({ config: x }); }

  // n8n connection
  if (match('GET', 'le/connection')) return json(connectionView(env, url));
  if (match('PUT', 'le/connection')) {
    const b = await body();
    if ('n8n_url' in b) {
      const v = String(b.n8n_url || '').trim().replace(/\/+$/, '');
      if (v && !/^https:\/\//.test(v)) return fail('The n8n URL must start with https://');
      await setConfigValue(d, 'n8n_url', v);
    }
    if ('template_workflow_id' in b) await setConfigValue(d, 'template_workflow_id', String(b.template_workflow_id || '').trim());
    if (b.n8n_api_key && !String(b.n8n_api_key).startsWith('••••')) await setConfigValue(d, 'n8n_api_key_enc', await encryptSecret(env, String(b.n8n_api_key).trim()));
    await U.log(d, who, 'Changed the n8n connection');
    return json(connectionView(await appEnv(d), url));
  }
  if (match('POST', 'le/connection/test')) {
    const e2 = await appEnv(d);
    await n8n(e2, '/workflows?limit=1');
    if (!e2.TEMPLATE_WORKFLOW_ID) return json({ ok: true, message: 'n8n connected. Now add the template workflow ID.' });
    try { const w = await n8n(e2, '/workflows/' + encodeURIComponent(e2.TEMPLATE_WORKFLOW_ID)); return json({ ok: true, message: `Connected. Template found: ${w.name}` }); }
    catch (e) { return json({ ok: false, message: 'n8n connected, but the template workflow was not found: ' + e.message }); }
  }
  return fail('Not found', 404);
}

function connectionView(env, url) {
  return {
    n8n_url: env.N8N_URL, template_workflow_id: env.TEMPLATE_WORKFLOW_ID,
    n8n_api_key: env.N8N_API_KEY ? '••••' + env.N8N_API_KEY.slice(-4) : '',
    from_env: env.fromEnv,
    cron_url: `${url.origin}/api/cron/expire`, cron_secret: env.CRON_SECRET,
  };
}

// ================================================================== client portal (Lead Engine)
const clientToken = (env, a) => A.makeToken(env, { r: 'c', a: a.id, v: a.pass_salt.slice(0, 10) }, 24 * 7);

async function testFor(env, a, service, b) {
  const stored = await B.loadSettings(env, a);
  const s = mergeSettings((b && b.settings) || {}, stored, { client_id: a.client_id, company_name: a.company });
  return testConnection(env, service, s);
}

async function clientRoutes({ request, url, p, match, body, cookie, d, env }) {
  let r;
  if (match('GET', 'plans')) return json({ plans: await B.listPlans(env) });

  if (match('POST', 'auth/register')) {
    const b = await body(), ip = clientIp(request);
    if (await isLocked(d, 'register:' + ip)) return fail('Too many sign ups from this network. Try again later.', 429);
    const problem = A.passwordProblem(b.password);
    if (problem) return fail(problem);
    const { hash, salt } = await A.hashPassword(b.password);
    const a = await B.createAccount(env, { ...b, hash, salt });
    await hit(d, 'register:' + ip, { max: 10, windowMs: 3600e3, lockMs: 3600e3 });
    await U.log(d, a.email, 'New client sign up: ' + a.company);
    return json({ ok: true }, 201, { 'Set-Cookie': A.setCookie(A.COOKIE.client, await clientToken(env, a), 7 * 86400) });
  }
  if (match('POST', 'auth/login')) {
    const b = await body(), email = String(b.email || '').trim().toLowerCase(), key = 'client:' + email;
    if (await isLocked(d, key)) { await slow(); return fail(LOCKED, 429); }
    const a = await B.getAccountByEmail(env, email);
    if (!a || !(await A.verifyPassword(b.password, a.pass_hash, a.pass_salt))) { await hit(d, key); await slow(); return fail('Email or password is wrong.', 401); }
    await clearHits(d, key);
    await B.touchLogin(env, a.id);
    return json({ ok: true }, 200, { 'Set-Cookie': A.setCookie(A.COOKIE.client, await clientToken(env, a), 7 * 86400) });
  }
  if (match('POST', 'auth/logout')) return json({ ok: true }, 200, { 'Set-Cookie': A.setCookie(A.COOKIE.client, '', 0) });

  if (p[0] === 'cron') {
    const key = request.headers.get('X-Cron-Key') || url.searchParams.get('key');
    if (!env.CRON_SECRET || !A.safeEqual(key, env.CRON_SECRET)) return fail('Wrong cron key.', 401);
    if (p[1] === 'expire') return json(await B.runExpiry(env));
    return fail('Not found', 404);
  }

  if (p[0] === 'me') {
    const tok = await A.readToken(env, cookie, A.COOKIE.client);
    let a = tok && tok.r === 'c' ? await B.getAccount(env, tok.a) : null;
    if (!a || tok.v !== a.pass_salt.slice(0, 10)) return fail('Please sign in.', 401);
    const cfg = await B.getConfig(env);
    a = await B.refresh(env, a, cfg);

    if (match('GET', 'me')) return json({ account: B.publicAccount(a, cfg), plan: a.plan_id ? await B.getPlan(env, a.plan_id) : null });
    if (match('PUT', 'me/info')) return json({ account: B.publicAccount(await B.updateInfo(env, a, await body()), cfg) });
    if (match('POST', 'me/password')) {
      const b = await body();
      if (!(await A.verifyPassword(b.current, a.pass_hash, a.pass_salt))) { await slow(); return fail('Your current password is wrong.'); }
      const problem = A.passwordProblem(b.next);
      if (problem) return fail(problem);
      const { hash, salt } = await A.hashPassword(b.next);
      await B.setPassword(env, a.id, hash, salt);
      a = await B.getAccount(env, a.id);
      return json({ ok: true }, 200, { 'Set-Cookie': A.setCookie(A.COOKIE.client, await clientToken(env, a), 7 * 86400) });
    }
    if (match('GET', 'me/settings')) return json(await B.settingsView(env, a));
    if (match('PUT', 'me/settings')) return json(await B.saveSettings(env, a, await body()));
    if ((r = match('POST', 'me/test/:service'))) return json(await testFor(env, a, r.service, await body()));
    if (match('GET', 'me/stats')) return json(a.workflow_id ? await statsFor(env, a.client_id, daysParam(url)) : { empty: true, reason: 'not_live' });
    if (match('GET', 'me/leads.csv')) return csv(await leadsCsv(env, a.client_id, daysParam(url)), `${a.client_id}-leads-${daysParam(url)}d.csv`);
    if (match('GET', 'me/billing')) {
      const plan = a.plan_id ? await B.getPlan(env, a.plan_id) : null;
      let used = null;
      if (a.workflow_id) { try { used = await monthLeadCount(env, a.client_id); } catch (e) { used = null; } }
      return json({ account: B.publicAccount(a, cfg), plan, plans: await B.listPlans(env), invoices: await B.listInvoices(env, a.id),
        payment: { instructions: cfg.payment_instructions, methods: cfg.payment_methods, grace_days: cfg.grace_days },
        usage: { leads_30d: used, limit: plan ? plan.lead_limit : 0 } });
    }
    if (match('POST', 'me/invoices')) return json({ invoice: await B.createInvoice(env, a, (await body()).plan_id) }, 201);
    if ((r = match('POST', 'me/invoices/:id/pay'))) return json({ invoice: await B.submitPayment(env, a, r.id, await body()) });
    return fail('Not found', 404);
  }
  return fail('Not found', 404);
}
