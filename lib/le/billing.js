// Accounts, plans, invoices and the rules that decide whether a client's automation runs.
import { encryptJSON, decryptJSON } from '../auth.js';
import { mergeSettings, missing, maskSettings, provisionWorkflow, pushWorkflow, setWorkflowActive, readWorkflow, cleanClientId, webhookUrls } from './n8n.js';

const DAY = 86400e3;
const err = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
const q = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const all = async (env, sql, ...args) => (await q(env, sql, ...args).all()).results || [];
const one = (env, sql, ...args) => q(env, sql, ...args).first();
const run = (env, sql, ...args) => q(env, sql, ...args).run();
export const now = () => Date.now();

// ---------------------------------------------------------------- config
const CONFIG_KEYS = ['payment_instructions', 'payment_methods', 'grace_days', 'trial_days', 'reminder_days'];
export async function getConfig(env) {
  const rows = await all(env, 'SELECT key, value FROM config');
  const c = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    payment_instructions: c.payment_instructions || '',
    payment_methods: (c.payment_methods || 'Bank transfer').split(',').map(s => s.trim()).filter(Boolean),
    grace_days: Number(c.grace_days ?? 3) || 0, trial_days: Number(c.trial_days ?? 0) || 0, reminder_days: Number(c.reminder_days ?? 7) || 7,
  };
}
export async function setConfig(env, input) {
  for (const k of CONFIG_KEYS) if (k in input) {
    let v = input[k];
    if (k === 'payment_methods' && Array.isArray(v)) v = v.join(',');
    if (k.endsWith('_days')) v = String(Math.max(0, Math.min(365, Number(v) || 0)));
    await run(env, 'INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, String(v).slice(0, 4000));
  }
  return getConfig(env);
}

// ---------------------------------------------------------------- plans
const planOut = p => p && ({ ...p, is_active: !!p.is_active, features: String(p.features || '').split('\n').map(s => s.trim()).filter(Boolean) });
export async function listPlans(env, { includeHidden = false } = {}) {
  return (await all(env, `SELECT * FROM plans ${includeHidden ? '' : 'WHERE is_active = 1'} ORDER BY sort, id`)).map(planOut);
}
export const getPlan = async (env, id) => planOut(await one(env, 'SELECT * FROM plans WHERE id = ?', Number(id)));
export async function savePlan(env, p, id) {
  const v = {
    name: String(p.name || '').trim().slice(0, 60), price: Math.max(0, Number(p.price) || 0), currency: String(p.currency || 'USD').trim().toUpperCase().slice(0, 3),
    period_days: Math.max(1, Math.min(3660, Math.round(Number(p.period_days) || 30))), lead_limit: Math.max(0, Math.round(Number(p.lead_limit) || 0)),
    features: (Array.isArray(p.features) ? p.features.join('\n') : String(p.features || '')).slice(0, 2000),
    is_active: p.is_active === false || p.is_active === 'false' ? 0 : 1, sort: Math.round(Number(p.sort) || 0),
  };
  if (!v.name) throw err('Give the plan a name.');
  if (id) {
    await run(env, 'UPDATE plans SET name=?, price=?, currency=?, period_days=?, lead_limit=?, features=?, is_active=?, sort=? WHERE id=?',
      v.name, v.price, v.currency, v.period_days, v.lead_limit, v.features, v.is_active, v.sort, Number(id));
    return getPlan(env, id);
  }
  const r = await run(env, 'INSERT INTO plans(name, price, currency, period_days, lead_limit, features, is_active, sort) VALUES(?,?,?,?,?,?,?,?)',
    v.name, v.price, v.currency, v.period_days, v.lead_limit, v.features, v.is_active, v.sort);
  return getPlan(env, r.meta.last_row_id);
}

// ---------------------------------------------------------------- accounts
const INFO_FIELDS = ['name', 'company', 'phone', 'country', 'website', 'address', 'business_type'];
export const getAccount = (env, id) => one(env, 'SELECT * FROM accounts WHERE id = ?', Number(id));
export const getAccountByEmail = (env, email) => one(env, 'SELECT * FROM accounts WHERE email = ?', String(email || '').trim().toLowerCase());

export function publicAccount(a, cfg) {
  if (!a) return null;
  const { pass_hash, pass_salt, settings_enc, admin_notes, ...rest } = a;
  const days_left = a.sub_ends_at ? Math.ceil((a.sub_ends_at - now()) / DAY) : null;
  return { ...rest, days_left, renew_soon: !!(cfg && a.sub_ends_at && days_left <= cfg.reminder_days), stage: stageOf(a) };
}
export const adminAccount = (a, cfg) => a && ({ ...publicAccount(a, cfg), admin_notes: a.admin_notes });

// Where the client is in getting live. Used for the setup track in the portal.
export function stageOf(a) {
  if (a.status === 'rejected') return 'rejected';
  if (a.status === 'suspended') return 'suspended';
  if (a.status === 'active') return a.sub_status === 'expired' ? 'expired' : 'live';
  return 'review';
}

async function uniqueClientId(env, base) {
  let id = cleanClientId(base) || 'client';
  for (let i = 0; i < 50; i++) {
    const cand = i ? `${id.slice(0, 20)}_${i + 1}` : id;
    if (!(await one(env, 'SELECT id FROM accounts WHERE client_id = ?', cand))) return cand;
  }
  return id.slice(0, 16) + '_' + Math.random().toString(36).slice(2, 8);
}

export function cleanInfo(input) {
  const o = {};
  for (const k of INFO_FIELDS) if (k in input) o[k] = String(input[k] ?? '').trim().slice(0, k === 'address' ? 500 : 120);
  if (o.website && !/^https?:\/\//i.test(o.website)) o.website = 'https://' + o.website;
  return o;
}

export async function createAccount(env, { email, hash, salt, ...info }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('Enter a valid email address.');
  if (await getAccountByEmail(env, email)) throw err('An account with this email already exists. Sign in instead.', 409);
  const i = cleanInfo(info);
  if (!i.company) throw err('Enter your company name.');
  if (!i.name) throw err('Enter your name.');
  const client_id = await uniqueClientId(env, i.company);
  const r = await run(env, `INSERT INTO accounts(client_id, email, pass_hash, pass_salt, name, company, phone, country, website, address, business_type, created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, client_id, email, hash, salt, i.name || '', i.company || '', i.phone || '', i.country || '', i.website || '', i.address || '', i.business_type || '', now());
  return getAccount(env, r.meta.last_row_id);
}

export async function updateInfo(env, a, input, { admin = false } = {}) {
  const i = cleanInfo(input);
  if ('company' in i && !i.company) throw err('Company name cannot be empty.');
  if (admin && 'admin_notes' in input) i.admin_notes = String(input.admin_notes || '').slice(0, 4000);
  const keys = Object.keys(i);
  if (keys.length) await run(env, `UPDATE accounts SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map(k => i[k]), a.id);
  const b = await getAccount(env, a.id);
  // the company name is shown to students, so a live workflow gets the new name
  if ('company' in i && i.company !== a.company && b.workflow_id) await saveSettings(env, b, {}, { quiet: true });
  return b;
}

export async function setPassword(env, id, hash, salt) {
  await run(env, 'UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE id = ?', hash, salt, Number(id));
}
export const touchLogin = (env, id) => run(env, 'UPDATE accounts SET last_login_at = ? WHERE id = ?', now(), Number(id));

export async function listAccounts(env) {
  const rows = await all(env, `SELECT a.*, p.name AS plan_name,
      (SELECT COUNT(*) FROM invoices i WHERE i.account_id = a.id AND i.status = 'submitted') AS invoices_to_review
    FROM accounts a LEFT JOIN plans p ON p.id = a.plan_id ORDER BY a.created_at DESC`);
  const cfg = await getConfig(env);
  return rows.map(r => adminAccount(r, cfg));
}

// ---------------------------------------------------------------- automation settings (stored encrypted, pushed to n8n)
const fixedFor = a => ({ client_id: a.client_id, company_name: a.company });
export async function loadSettings(env, a) {
  let stored = {};
  try { stored = (await decryptJSON(env, a.settings_enc)) || {}; } catch (e) { stored = {}; }
  return mergeSettings({}, stored, fixedFor(a));
}

export async function settingsView(env, a) {
  const s = await loadSettings(env, a);
  return { settings: maskSettings(s), missing: missing(s), live: !!a.workflow_id,
           webhooks: a.workflow_id ? webhookUrls(env, a.client_id) : null };
}

// Live accounts must stay complete, so an incomplete save is refused. Before approval, drafts are fine.
export async function saveSettings(env, a, input, { quiet = false } = {}) {
  const s = mergeSettings(input, await loadSettings(env, a), fixedFor(a));
  const gaps = missing(s);
  if (a.workflow_id && gaps.length) throw err(gaps.join('\n'), 400, { errors: gaps });
  await run(env, 'UPDATE accounts SET settings_enc = ? WHERE id = ?', await encryptJSON(env, s), a.id);
  let pushError = '';
  if (a.workflow_id) {
    try { await pushWorkflow(env, a.workflow_id, s); } catch (e) { if (!quiet) throw e; pushError = e.message; }
    const syncError = await syncRun(env, { ...a }, s);
    pushError = pushError || syncError;
  }
  return { settings: maskSettings(s), missing: gaps, live: !!a.workflow_id, pushError };
}

// ---------------------------------------------------------------- subscription state
const PAYING = ['trial', 'active', 'grace'];
export function subStateAt(a, cfg, t = now()) {
  if (!a.sub_ends_at) return 'none';
  if (t < a.sub_ends_at) return a.sub_status === 'trial' ? 'trial' : 'active';
  if (t < a.sub_ends_at + cfg.grace_days * DAY) return 'grace';
  return 'expired';
}
export const canRun = (a, s) => a.status === 'active' && PAYING.includes(a.sub_status) && s.active !== false;

// Turns the n8n workflow on or off to match the account. Returns an error message, or ''.
export async function syncRun(env, a, s) {
  if (!a.workflow_id) return '';
  s = s || await loadSettings(env, a);
  try { await setWorkflowActive(env, a.workflow_id, canRun(a, s)); return ''; }
  catch (e) { return 'Could not switch the automation ' + (canRun(a, s) ? 'on' : 'off') + ': ' + e.message; }
}

// Recompute subscription state; switches the workflow off when it expires. Safe to call often.
export async function refresh(env, a, cfg) {
  cfg = cfg || await getConfig(env);
  const st = subStateAt(a, cfg);
  if (st !== a.sub_status) {
    await run(env, 'UPDATE accounts SET sub_status = ? WHERE id = ?', st, a.id);
    a = { ...a, sub_status: st };
    if (st === 'expired' || PAYING.includes(st)) await syncRun(env, a);
  }
  return a;
}
export async function runExpiry(env) {
  const cfg = await getConfig(env);
  const rows = await all(env, "SELECT * FROM accounts WHERE sub_ends_at > 0 AND sub_status IN ('trial','active','grace')");
  let changed = 0;
  for (const a of rows) { const b = await refresh(env, a, cfg); if (b.sub_status !== a.sub_status) changed++; }
  return { checked: rows.length, changed };
}

// ---------------------------------------------------------------- admin lifecycle
export async function approve(env, id) {
  let a = await getAccount(env, id);
  if (!a) throw err('Account not found', 404);
  const s = await loadSettings(env, a);
  const gaps = missing(s);
  if (gaps.length) throw err('Settings are not complete yet:\n' + gaps.join('\n'), 400, { errors: gaps });
  let workflow_id = a.workflow_id;
  if (workflow_id) await pushWorkflow(env, workflow_id, s);
  else workflow_id = await provisionWorkflow(env, s);
  const cfg = await getConfig(env);
  let { sub_status, sub_ends_at } = a;
  if (!sub_ends_at && cfg.trial_days > 0) { sub_status = 'trial'; sub_ends_at = now() + cfg.trial_days * DAY; }
  await run(env, "UPDATE accounts SET status = 'active', status_note = '', workflow_id = ?, approved_at = ?, sub_status = ?, sub_ends_at = ? WHERE id = ?",
    workflow_id, a.approved_at || now(), sub_status, sub_ends_at, a.id);
  a = await getAccount(env, a.id);
  const warning = await syncRun(env, a, s);
  return { account: a, warning: warning || (PAYING.includes(a.sub_status) ? '' : 'Approved. The automation stays off until a payment is recorded.') };
}

export async function setStatus(env, id, status, note = '') {
  if (!['active', 'suspended', 'rejected', 'pending'].includes(status)) throw err('Unknown status');
  let a = await getAccount(env, id);
  if (!a) throw err('Account not found', 404);
  if (status === 'active' && !a.workflow_id) throw err('Approve the account first, so its automation is created.');
  await run(env, 'UPDATE accounts SET status = ?, status_note = ? WHERE id = ?', status, String(note || '').slice(0, 500), a.id);
  a = await getAccount(env, a.id);
  return { account: a, warning: await syncRun(env, a) };
}

// Attach a workflow that already exists in n8n (made before the portal existed).
export async function linkWorkflow(env, id, workflowId) {
  const a = await getAccount(env, id);
  if (!a) throw err('Account not found', 404);
  const taken = await one(env, 'SELECT id FROM accounts WHERE workflow_id = ? AND id != ?', String(workflowId), a.id);
  if (taken) throw err('That workflow already belongs to another account.', 409);
  const { settings } = await readWorkflow(env, workflowId);
  if (!settings) throw err('That workflow has no readable Client Settings block, so it cannot be linked.');
  const cid = cleanClientId(settings.client_id);
  const clash = await one(env, 'SELECT id FROM accounts WHERE client_id = ? AND id != ?', cid, a.id);
  if (clash) throw err(`Client ID "${cid}" is used by another account.`, 409);
  const { api, apiKey, graph, client_id, company_name, ...rest } = settings;
  const s = mergeSettings(rest, {}, { client_id: cid, company_name: a.company || company_name });
  await run(env, "UPDATE accounts SET client_id = ?, workflow_id = ?, settings_enc = ?, status = 'active', approved_at = ? WHERE id = ?",
    cid, String(workflowId), await encryptJSON(env, s), a.approved_at || now(), a.id);
  const b = await getAccount(env, a.id);
  return { account: b, warning: await syncRun(env, b, s) };
}

// ---------------------------------------------------------------- invoices
export const listInvoices = (env, accountId) => all(env, 'SELECT * FROM invoices WHERE account_id = ? ORDER BY created_at DESC', Number(accountId));
export const invoicesToReview = env => all(env, `SELECT i.*, a.company, a.email, a.client_id FROM invoices i JOIN accounts a ON a.id = i.account_id
  WHERE i.status IN ('submitted','unpaid') ORDER BY CASE i.status WHEN 'submitted' THEN 0 ELSE 1 END, i.submitted_at DESC, i.created_at DESC`);
export const recentPaid = env => all(env, `SELECT i.*, a.company, a.client_id FROM invoices i JOIN accounts a ON a.id = i.account_id
  WHERE i.status IN ('paid','rejected') ORDER BY CASE WHEN i.paid_at > 0 THEN i.paid_at ELSE i.created_at END DESC LIMIT 50`);
const getInvoice = (env, id) => one(env, 'SELECT * FROM invoices WHERE id = ?', Number(id));

export async function createInvoice(env, a, planId, { amount } = {}) {
  const p = await getPlan(env, planId);
  if (!p || (!p.is_active && amount === undefined)) throw err('That plan is not available.');
  const waiting = await one(env, "SELECT id FROM invoices WHERE account_id = ? AND status = 'submitted'", a.id);
  if (waiting && amount === undefined) throw err('A payment is already waiting for review. You can choose another plan after it is checked.', 409);
  await run(env, "UPDATE invoices SET status = 'void' WHERE account_id = ? AND status = 'unpaid'", a.id);
  const r = await run(env, 'INSERT INTO invoices(account_id, plan_id, plan_name, amount, currency, period_days, created_at) VALUES(?,?,?,?,?,?,?)',
    a.id, p.id, p.name, amount === undefined ? p.price : Math.max(0, Number(amount) || 0), p.currency, p.period_days, now());
  return getInvoice(env, r.meta.last_row_id);
}

export async function submitPayment(env, a, invoiceId, { method, reference, note }) {
  const inv = await getInvoice(env, invoiceId);
  if (!inv || inv.account_id !== a.id) throw err('Invoice not found', 404);
  if (inv.status !== 'unpaid' && inv.status !== 'rejected') throw err('This invoice is already ' + inv.status + '.', 409);
  reference = String(reference || '').trim().slice(0, 120);
  if (!reference) throw err('Enter the transaction ID or payment reference.');
  await run(env, "UPDATE invoices SET status = 'submitted', method = ?, reference = ?, payer_note = ?, submitted_at = ?, admin_note = '' WHERE id = ?",
    String(method || '').slice(0, 40), reference, String(note || '').slice(0, 500), now(), inv.id);
  return getInvoice(env, inv.id);
}

export async function markPaid(env, invoiceId, { note = '', method, reference } = {}) {
  const inv = await getInvoice(env, invoiceId);
  if (!inv) throw err('Invoice not found', 404);
  if (inv.status === 'paid') throw err('Already marked as paid.', 409);
  const a = await getAccount(env, inv.account_id);
  const cfg = await getConfig(env);
  const t = now();
  const current = subStateAt(a, cfg, t);
  const start = (current === 'active' || current === 'trial') ? a.sub_ends_at : t;   // renewals stack on the remaining time
  const end = start + inv.period_days * DAY;
  await run(env, "UPDATE invoices SET status = 'paid', paid_at = ?, period_start = ?, period_end = ?, admin_note = ?, method = COALESCE(?, method), reference = COALESCE(?, reference) WHERE id = ?",
    t, start, end, String(note).slice(0, 500), method ?? null, reference ?? null, inv.id);
  await run(env, "UPDATE accounts SET plan_id = ?, sub_status = 'active', sub_ends_at = ? WHERE id = ?", inv.plan_id, end, a.id);
  const b = await getAccount(env, a.id);
  return { invoice: await getInvoice(env, inv.id), account: b, warning: await syncRun(env, b) };
}

export async function rejectInvoice(env, invoiceId, note) {
  const inv = await getInvoice(env, invoiceId);
  if (!inv) throw err('Invoice not found', 404);
  if (inv.status !== 'submitted') throw err('Only submitted payments can be rejected.', 409);
  await run(env, "UPDATE invoices SET status = 'rejected', admin_note = ? WHERE id = ?", String(note || 'Payment not found').slice(0, 500), inv.id);
  return getInvoice(env, inv.id);
}

// Admin edits the subscription directly (complimentary time, corrections).
export async function setSubscription(env, id, { plan_id, ends_at }) {
  const a = await getAccount(env, id);
  if (!a) throw err('Account not found', 404);
  const end = ends_at ? Date.parse(ends_at) : 0;
  if (ends_at && !Number.isFinite(end)) throw err('That end date is not valid.');
  const cfg = await getConfig(env);
  const b0 = { ...a, sub_ends_at: end, sub_status: 'active' };
  const st = end ? subStateAt(b0, cfg) : 'none';
  await run(env, 'UPDATE accounts SET plan_id = ?, sub_ends_at = ?, sub_status = ? WHERE id = ?', plan_id ? Number(plan_id) : a.plan_id, end, st, a.id);
  const b = await getAccount(env, a.id);
  return { account: b, warning: await syncRun(env, b) };
}

// ---------------------------------------------------------------- admin overview
export async function overview(env) {
  const cfg = await getConfig(env);
  const accounts = await listAccounts(env);
  const t = now();
  const monthStart = new Date(new Date(t).toISOString().slice(0, 7) + '-01T00:00:00Z').getTime();
  const paid = await all(env, "SELECT currency, SUM(amount) AS total, COUNT(*) AS n FROM invoices WHERE status = 'paid' AND paid_at >= ? GROUP BY currency", monthStart);
  const toReview = (await invoicesToReview(env)).filter(i => i.status === 'submitted');
  const by = st => accounts.filter(a => a.stage === st);
  return {
    counts: { accounts: accounts.length, live: by('live').length, review: by('review').length, expired: by('expired').length, suspended: by('suspended').length, payments: toReview.length },
    revenue_month: paid,
    pending: by('review').slice(0, 10),
    payments: toReview.slice(0, 10),
    expiring: accounts.filter(a => a.stage === 'live' && a.sub_ends_at && a.sub_ends_at - t < cfg.reminder_days * DAY).sort((x, y) => x.sub_ends_at - y.sub_ends_at).slice(0, 10),
  };
}
