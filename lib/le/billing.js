// Client accounts, their automations (one subscription per product), plans, invoices,
// approval and the rules that decide whether each automation runs.
import { encryptJSON, decryptJSON } from '../auth.js';
import { mergeSettings, missing, maskSettings, provisionWorkflow, pushWorkflow, setWorkflowActive, readWorkflow, cleanClientId, webhookUrls,
  provisionGeneric, pushGeneric, genericHooks, setWorkflowsActive, ensureProductTables } from './n8n.js';
import { LE, getProduct, listProducts, mergeGeneric, missingGeneric, maskGeneric, tableName } from './products.js';

const DAY = 86400e3;
const err = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
const q = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);
const all = async (env, sql, ...a) => (await q(env, sql, ...a).all()).results || [];
const one = (env, sql, ...a) => q(env, sql, ...a).first();
const run = (env, sql, ...a) => q(env, sql, ...a).run();
export const now = () => Date.now();
export { getProduct, listProducts };

// ---------------------------------------------------------------- config
const CONFIG_KEYS = ['payment_instructions', 'payment_methods', 'grace_days', 'trial_days', 'reminder_days'];
export async function getConfig(env) {
  const c = Object.fromEntries((await all(env, 'SELECT key, value FROM config')).map(r => [r.key, r.value]));
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

// ---------------------------------------------------------------- plans (each belongs to a product)
const planOut = p => p && ({ ...p, is_active: !!p.is_active, features: String(p.features || '').split('\n').map(s => s.trim()).filter(Boolean) });
export async function listPlans(env, { productId, includeHidden = false } = {}) {
  const w = [], a = [];
  if (productId) { w.push('product_id = ?'); a.push(Number(productId)); }
  if (!includeHidden) w.push('is_active = 1');
  return (await all(env, `SELECT * FROM plans ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY sort, id`, ...a)).map(planOut);
}
export const getPlan = async (env, id) => planOut(await one(env, 'SELECT * FROM plans WHERE id = ?', Number(id)));
export async function savePlan(env, p, id) {
  const v = {
    name: String(p.name || '').trim().slice(0, 60), price: Math.max(0, Number(p.price) || 0), currency: String(p.currency || 'USD').trim().toUpperCase().slice(0, 3),
    period_days: Math.max(1, Math.min(3660, Math.round(Number(p.period_days) || 30))), lead_limit: Math.max(0, Math.round(Number(p.lead_limit) || 0)),
    features: (Array.isArray(p.features) ? p.features.join('\n') : String(p.features || '')).slice(0, 2000),
    is_active: p.is_active === false || p.is_active === 'false' ? 0 : 1, sort: Math.round(Number(p.sort) || 0), product_id: Number(p.product_id) || null,
  };
  if (!v.name) throw err('Give the plan a name.');
  if (id) {
    const cur = await getPlan(env, id);
    if (!cur) throw err('Plan not found', 404);
    await run(env, 'UPDATE plans SET name=?, price=?, currency=?, period_days=?, lead_limit=?, features=?, is_active=?, sort=? WHERE id=?',
      v.name, v.price, v.currency, v.period_days, v.lead_limit, v.features, v.is_active, v.sort, Number(id));
    return getPlan(env, id);
  }
  if (!v.product_id || !(await getProduct(env.DB, v.product_id))) throw err('Choose which product this plan is for.');
  const r = await run(env, 'INSERT INTO plans(name, price, currency, period_days, lead_limit, features, is_active, sort, product_id) VALUES(?,?,?,?,?,?,?,?,?)',
    v.name, v.price, v.currency, v.period_days, v.lead_limit, v.features, v.is_active, v.sort, v.product_id);
  return getPlan(env, r.meta.last_row_id);
}

// ---------------------------------------------------------------- accounts (one per client company)
const INFO_FIELDS = ['name', 'company', 'phone', 'country', 'website', 'address', 'business_type'];
export const getAccount = (env, id) => one(env, 'SELECT * FROM accounts WHERE id = ?', Number(id));
export const getAccountByEmail = (env, email) => one(env, 'SELECT * FROM accounts WHERE email = ?', String(email || '').trim().toLowerCase());
export function publicAccount(a) {
  if (!a) return null;
  return { id: a.id, client_id: a.client_id, email: a.email, name: a.name, company: a.company, phone: a.phone, country: a.country, website: a.website,
    address: a.address, business_type: a.business_type, status: a.status === 'suspended' ? 'suspended' : 'active', created_at: a.created_at, last_login_at: a.last_login_at };
}
export const adminAccount = a => a && ({ ...publicAccount(a), admin_notes: a.admin_notes });

async function uniqueClientId(env, base) {
  const id = cleanClientId(base) || 'client';
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
  if (o.website === 'https://') o.website = '';
  return o;
}
export async function createAccount(env, { email, hash, salt, ...info }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('Enter a valid email address.');
  if (await getAccountByEmail(env, email)) throw err('An account with this email already exists. Sign in instead.', 409);
  const i = cleanInfo(info);
  if (!i.company) throw err('Enter the company name.');
  if (!i.name) throw err('Enter the contact person.');
  const client_id = await uniqueClientId(env, i.company);
  const r = await run(env, `INSERT INTO accounts(client_id, email, pass_hash, pass_salt, name, company, phone, country, website, address, business_type, status, created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'active',?)`, client_id, email, hash, salt, i.name || '', i.company || '', i.phone || '', i.country || '', i.website || '', i.address || '', i.business_type || '', now());
  return getAccount(env, r.meta.last_row_id);
}
export async function updateInfo(env, a, input, { admin = false } = {}) {
  const i = cleanInfo(input);
  if ('company' in i && !i.company) throw err('Company name cannot be empty.');
  if (admin && 'admin_notes' in input) i.admin_notes = String(input.admin_notes || '').slice(0, 4000);
  const keys = Object.keys(i);
  if (keys.length) await run(env, `UPDATE accounts SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map(k => i[k]), a.id);
  const b = await getAccount(env, a.id);
  if ('company' in i && i.company !== a.company)       // the company name is used in messages: update live automations
    for (const s of await rawSubs(env, b.id)) if (s.workflow_id) { try { await saveSubSettings(env, b, s, {}, { quiet: true }); } catch (e) { /* shown on next save */ } }
  return b;
}
export const setPassword = (env, id, hash, salt) => run(env, 'UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE id = ?', hash, salt, Number(id));
export const touchLogin = (env, id) => run(env, 'UPDATE accounts SET last_login_at = ? WHERE id = ?', now(), Number(id));

// ---------------------------------------------------------------- subscriptions (a client's automation)
const PAYING = ['trial', 'active', 'grace'];
const rawSubs = (env, accountId) => all(env, 'SELECT * FROM subscriptions WHERE account_id = ? ORDER BY created_at', Number(accountId));
export const getSub = (env, id) => one(env, 'SELECT * FROM subscriptions WHERE id = ?', Number(id));

export function stageOf(s) {
  if (s.status === 'rejected') return 'rejected';
  if (s.status === 'suspended') return 'suspended';
  if (s.status === 'active') return s.sub_status === 'expired' ? 'expired' : 'live';
  return 'review';
}
export function subOut(s, p, cfg, plan) {
  if (!s) return null;
  const days_left = s.sub_ends_at ? Math.ceil((s.sub_ends_at - now()) / DAY) : null;
  return { id: s.id, account_id: s.account_id, product_id: s.product_id, status: s.status, status_note: s.status_note, live: !!s.workflow_id,
    workflow_id: s.workflow_id, plan_id: s.plan_id, sub_status: s.sub_status, sub_ends_at: s.sub_ends_at, created_at: s.created_at, approved_at: s.approved_at,
    days_left, renew_soon: !!(cfg && s.sub_ends_at && days_left <= cfg.reminder_days), stage: stageOf(s),
    product: p ? { id: p.id, slug: p.slug, name: p.name, icon: p.icon, short: p.short, kind: p.kind, unit: p.unit } : null,
    plan: plan ? { id: plan.id, name: plan.name } : null };
}
export async function listSubs(env, accountId, cfg) {
  cfg = cfg || await getConfig(env);
  const out = [];
  for (let s of await rawSubs(env, accountId)) {
    s = await refresh(env, s, cfg);
    const p = await getProduct(env.DB, s.product_id);
    out.push(subOut(s, p, cfg, s.plan_id ? await getPlan(env, s.plan_id) : null));
  }
  return out;
}
export async function addSub(env, a, productRef, { admin = false } = {}) {
  const p = await getProduct(env.DB, productRef);
  if (!p || (!p.is_active && !admin)) throw err('That automation is not available.', 404);
  const ex = await one(env, 'SELECT * FROM subscriptions WHERE account_id = ? AND product_id = ?', a.id, p.id);
  if (ex) return ex;
  const r = await run(env, "INSERT INTO subscriptions(account_id, product_id, status, created_at) VALUES(?, ?, 'pending', ?)", a.id, p.id, now());
  return getSub(env, r.meta.last_row_id);
}
export async function removeSub(env, s) {
  if (s.workflow_id) throw err('This automation is already set up in n8n. Pause it instead.');
  const paid = await one(env, "SELECT id FROM invoices WHERE subscription_id = ? AND status IN ('paid','submitted')", s.id);
  if (paid) throw err('This automation has a payment. Ask Briefbox to remove it.');
  await run(env, 'DELETE FROM invoices WHERE subscription_id = ?', s.id);
  await run(env, 'DELETE FROM subscriptions WHERE id = ?', s.id);
}

// ---------------------------------------------------------------- settings (encrypted in D1, written into the n8n workflow)
const fixedFor = a => ({ client_id: a.client_id, company_name: a.company });
async function stored(env, s) { try { return (await decryptJSON(env, s.settings_enc)) || {}; } catch (e) { return {}; } }
export async function loadSubSettings(env, a, s, p) {
  p = p || await getProduct(env.DB, s.product_id);
  const st = await stored(env, s);
  return p.kind === LE ? mergeSettings({}, st, fixedFor(a)) : mergeGeneric(p.fields, {}, st, fixedFor(a));
}
const gapsFor = (p, s) => p.kind === LE ? missing(s) : [...(s.company_name ? [] : ['Company name is missing (Info tab).']), ...missingGeneric(p.fields, s)];
const maskFor = (p, s) => p.kind === LE ? maskSettings(s) : maskGeneric(p.fields, s);
const extraFor = (p, a) => ({ tables: Object.fromEntries(p.table_specs.map(t => [t.name, tableName(p, a.client_id, t.name)])) });

export async function settingsView(env, a, s) {
  const p = await getProduct(env.DB, s.product_id);
  const st = await loadSubSettings(env, a, s, p);
  let webhooks = null, hooks_error = '';
  if (s.workflow_id) {
    if (p.kind === LE) webhooks = webhookUrls(env, a.client_id);
    else { try { webhooks = await genericHooks(env, p, s.workflow_id, a.client_id); } catch (e) { hooks_error = e.message; } }
  }
  return { settings: maskFor(p, st), missing: gapsFor(p, st), live: !!s.workflow_id, webhooks, hooks_error, fields: p.kind === LE ? null : p.fields, kind: p.kind };
}

async function pushSub(env, a, s, p, st) {
  if (p.kind === LE) await pushWorkflow(env, s.workflow_id, st);
  else { await pushGeneric(env, p, s.workflow_id, st, extraFor(p, a)); await ensureProductTables(env, p, a.client_id, tableName); }
}
export async function saveSubSettings(env, a, s, input, { quiet = false } = {}) {
  const p = await getProduct(env.DB, s.product_id);
  const cur = await stored(env, s);
  const st = p.kind === LE ? mergeSettings(input, cur, fixedFor(a)) : mergeGeneric(p.fields, input, cur, fixedFor(a));
  const gaps = gapsFor(p, st);
  if (s.workflow_id && gaps.length) throw err(gaps.join('\n'), 400, { errors: gaps });
  await run(env, 'UPDATE subscriptions SET settings_enc = ? WHERE id = ?', await encryptJSON(env, st), s.id);
  let pushError = '';
  if (s.workflow_id) {
    try { await pushSub(env, a, s, p, st); } catch (e) { if (!quiet) throw e; pushError = e.message; }
    pushError = pushError || await syncRun(env, s, st);
  }
  return { settings: maskFor(p, st), missing: gaps, live: !!s.workflow_id, pushError };
}

// ---------------------------------------------------------------- subscription state
export function subStateAt(s, cfg, t = now()) {
  if (!s.sub_ends_at) return 'none';
  if (t < s.sub_ends_at) return s.sub_status === 'trial' ? 'trial' : 'active';
  if (t < s.sub_ends_at + cfg.grace_days * DAY) return 'grace';
  return 'expired';
}
export const canRun = (s, st, acct) => s.status === 'active' && PAYING.includes(s.sub_status) && st.active !== false && (!acct || acct.status !== 'suspended');

// Turns the n8n workflow(s) on or off to match the subscription. Returns an error message or ''.
export async function syncRun(env, s, st) {
  if (!s.workflow_id) return '';
  const a = await getAccount(env, s.account_id);
  const p = await getProduct(env.DB, s.product_id);
  st = st || await loadSubSettings(env, a, s, p);
  const on = canRun(s, st, a);
  try { await setWorkflowsActive(env, s.workflow_id, on); return ''; }
  catch (e) { return 'Could not switch the automation ' + (on ? 'on' : 'off') + ': ' + e.message; }
}
export async function refresh(env, s, cfg) {
  cfg = cfg || await getConfig(env);
  const st = subStateAt(s, cfg);
  if (st !== s.sub_status) {
    await run(env, 'UPDATE subscriptions SET sub_status = ? WHERE id = ?', st, s.id);
    s = { ...s, sub_status: st };
    if (st === 'expired' || PAYING.includes(st)) await syncRun(env, s);
  }
  return s;
}
export async function runExpiry(env) {
  const cfg = await getConfig(env);
  const rows = await all(env, "SELECT * FROM subscriptions WHERE sub_ends_at > 0 AND sub_status IN ('trial','active','grace')");
  let changed = 0;
  for (const s of rows) { const b = await refresh(env, s, cfg); if (b.sub_status !== s.sub_status) changed++; }
  return { checked: rows.length, changed };
}

// ---------------------------------------------------------------- admin lifecycle
export async function approve(env, subId) {
  let s = await getSub(env, subId);
  if (!s) throw err('Automation not found', 404);
  const a = await getAccount(env, s.account_id), p = await getProduct(env.DB, s.product_id);
  const st = await loadSubSettings(env, a, s, p);
  const gaps = gapsFor(p, st);
  if (gaps.length) throw err('Settings are not complete yet:\n' + gaps.join('\n'), 400, { errors: gaps });
  let wf = s.workflow_id;
  if (p.kind === LE) {
    const e2 = { ...env, TEMPLATE_WORKFLOW_ID: p.templates[0] || env.TEMPLATE_WORKFLOW_ID };
    if (wf) await pushWorkflow(e2, wf, st); else wf = await provisionWorkflow(e2, st);
  } else {
    if (wf) await pushGeneric(env, p, wf, st, extraFor(p, a)); else wf = await provisionGeneric(env, p, st, extraFor(p, a));
    await ensureProductTables(env, p, a.client_id, tableName);
  }
  const cfg = await getConfig(env);
  let { sub_status, sub_ends_at } = s;
  if (!sub_ends_at && cfg.trial_days > 0) { sub_status = 'trial'; sub_ends_at = now() + cfg.trial_days * DAY; }
  await run(env, "UPDATE subscriptions SET status = 'active', status_note = '', workflow_id = ?, approved_at = ?, sub_status = ?, sub_ends_at = ? WHERE id = ?",
    wf, s.approved_at || now(), sub_status, sub_ends_at, s.id);
  s = await getSub(env, s.id);
  const warning = await syncRun(env, s, st);
  return { sub: s, warning: warning || (PAYING.includes(s.sub_status) ? '' : 'Approved. The automation stays off until a payment is recorded.') };
}
export async function setSubStatus(env, subId, status, note = '') {
  if (!['active', 'suspended', 'rejected', 'pending'].includes(status)) throw err('Unknown status');
  let s = await getSub(env, subId);
  if (!s) throw err('Automation not found', 404);
  if (status === 'active' && !s.workflow_id) throw err('Approve it first, so its workflow is created.');
  await run(env, 'UPDATE subscriptions SET status = ?, status_note = ? WHERE id = ?', status, String(note || '').slice(0, 500), s.id);
  s = await getSub(env, s.id);
  return { sub: s, warning: await syncRun(env, s) };
}
export async function setAccountStatus(env, id, status) {
  await run(env, 'UPDATE accounts SET status = ? WHERE id = ?', status === 'suspended' ? 'suspended' : 'active', Number(id));
  const warnings = [];
  for (const s of await rawSubs(env, id)) { const w = await syncRun(env, s); if (w) warnings.push(w); }
  return warnings.join(' ');
}

// Attach workflow(s) that already exist in n8n.
export async function linkWorkflows(env, subId, ids) {
  let s = await getSub(env, subId);
  if (!s) throw err('Automation not found', 404);
  ids = [].concat(ids || []).map(String).map(x => x.trim()).filter(Boolean);
  if (!ids.length) throw err('Choose at least one workflow.');
  for (const id of ids) {
    const taken = await one(env, "SELECT id FROM subscriptions WHERE id != ? AND (',' || workflow_id || ',') LIKE ?", s.id, `%,${id},%`);
    if (taken) throw err(`Workflow ${id} already belongs to another automation.`, 409);
  }
  const a = await getAccount(env, s.account_id), p = await getProduct(env.DB, s.product_id);
  const { settings, error } = await readWorkflow(env, ids[0]);
  if (!settings) throw err('Cannot read this workflow\'s Client Settings: ' + error);
  const { api, apiKey, graph, client_id, company_name, product, tables, ...rest } = settings;
  let clientId = a.client_id;
  if (client_id && cleanClientId(client_id) !== a.client_id) {     // keep the workflow's id so its tables and webhooks keep working
    const cid = cleanClientId(client_id);
    const clash = await one(env, 'SELECT id FROM accounts WHERE client_id = ? AND id != ?', cid, a.id);
    if (clash) throw err(`Client ID "${cid}" is used by another account.`, 409);
    const others = await one(env, 'SELECT COUNT(*) AS n FROM subscriptions WHERE account_id = ? AND id != ? AND workflow_id != ?', a.id, s.id, '');
    if (others.n) throw err(`This workflow uses client ID "${cid}" but this account already runs other automations as "${a.client_id}".`, 409);
    await run(env, 'UPDATE accounts SET client_id = ? WHERE id = ?', cid, a.id);
    clientId = cid;
  }
  const fixed = { client_id: clientId, company_name: a.company || company_name };
  const st = p.kind === LE ? mergeSettings(rest, {}, fixed) : mergeGeneric(p.fields, rest, {}, fixed);
  await run(env, "UPDATE subscriptions SET workflow_id = ?, settings_enc = ?, status = 'active', approved_at = ? WHERE id = ?",
    ids.join(','), await encryptJSON(env, st), s.approved_at || now(), s.id);
  s = await getSub(env, s.id);
  return { sub: s, warning: await syncRun(env, s, st) };
}

// ---------------------------------------------------------------- invoices (per subscription)
export const listInvoices = (env, accountId) => all(env, 'SELECT * FROM invoices WHERE account_id = ? ORDER BY created_at DESC', Number(accountId));
export const subInvoices = (env, subId) => all(env, 'SELECT * FROM invoices WHERE subscription_id = ? ORDER BY created_at DESC', Number(subId));
export const invoicesToReview = env => all(env, `SELECT i.*, a.company, a.email, a.client_id FROM invoices i JOIN accounts a ON a.id = i.account_id
  WHERE i.status IN ('submitted','unpaid') ORDER BY CASE i.status WHEN 'submitted' THEN 0 ELSE 1 END, i.submitted_at DESC, i.created_at DESC`);
export const recentPaid = env => all(env, `SELECT i.*, a.company, a.client_id FROM invoices i JOIN accounts a ON a.id = i.account_id
  WHERE i.status IN ('paid','rejected') ORDER BY CASE WHEN i.paid_at > 0 THEN i.paid_at ELSE i.created_at END DESC LIMIT 50`);
const getInvoice = (env, id) => one(env, 'SELECT * FROM invoices WHERE id = ?', Number(id));

export async function createInvoice(env, s, planId, { amount } = {}) {
  const plan = await getPlan(env, planId);
  if (!plan || plan.product_id !== s.product_id || (!plan.is_active && amount === undefined)) throw err('That plan is not available for this automation.');
  const p = await getProduct(env.DB, s.product_id);
  const waiting = await one(env, "SELECT id FROM invoices WHERE subscription_id = ? AND status = 'submitted'", s.id);
  if (waiting && amount === undefined) throw err('A payment for this automation is already waiting for review.', 409);
  await run(env, "UPDATE invoices SET status = 'void' WHERE subscription_id = ? AND status = 'unpaid'", s.id);
  const r = await run(env, 'INSERT INTO invoices(account_id, subscription_id, product_name, plan_id, plan_name, amount, currency, period_days, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    s.account_id, s.id, p.name, plan.id, plan.name, amount === undefined ? plan.price : Math.max(0, Number(amount) || 0), plan.currency, plan.period_days, now());
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
  const s = await getSub(env, inv.subscription_id);
  if (!s) throw err('This invoice is not linked to an automation.', 409);
  const cfg = await getConfig(env), t = now();
  const current = subStateAt(s, cfg, t);
  const start = (current === 'active' || current === 'trial') ? s.sub_ends_at : t;   // renewals stack on the remaining time
  const end = start + inv.period_days * DAY;
  await run(env, "UPDATE invoices SET status = 'paid', paid_at = ?, period_start = ?, period_end = ?, admin_note = ?, method = COALESCE(?, method), reference = COALESCE(?, reference) WHERE id = ?",
    t, start, end, String(note).slice(0, 500), method ?? null, reference ?? null, inv.id);
  await run(env, "UPDATE subscriptions SET plan_id = ?, sub_status = 'active', sub_ends_at = ? WHERE id = ?", inv.plan_id, end, s.id);
  const b = await getSub(env, s.id);
  return { invoice: await getInvoice(env, inv.id), sub: b, warning: await syncRun(env, b) };
}
export async function rejectInvoice(env, invoiceId, note) {
  const inv = await getInvoice(env, invoiceId);
  if (!inv) throw err('Invoice not found', 404);
  if (inv.status !== 'submitted') throw err('Only submitted payments can be rejected.', 409);
  await run(env, "UPDATE invoices SET status = 'rejected', admin_note = ? WHERE id = ?", String(note || 'Payment not found').slice(0, 500), inv.id);
  return getInvoice(env, inv.id);
}
export async function setSubscription(env, subId, { plan_id, ends_at }) {
  const s = await getSub(env, subId);
  if (!s) throw err('Automation not found', 404);
  const end = ends_at ? Date.parse(ends_at) : 0;
  if (ends_at && !Number.isFinite(end)) throw err('That end date is not valid.');
  const cfg = await getConfig(env);
  const st = end ? subStateAt({ ...s, sub_ends_at: end, sub_status: 'active' }, cfg) : 'none';
  await run(env, 'UPDATE subscriptions SET plan_id = ?, sub_ends_at = ?, sub_status = ? WHERE id = ?', plan_id ? Number(plan_id) : s.plan_id, end, st, s.id);
  const b = await getSub(env, s.id);
  return { sub: b, warning: await syncRun(env, b) };
}

// ---------------------------------------------------------------- admin lists
export async function listAccounts(env) {
  const cfg = await getConfig(env);
  const accounts = await all(env, 'SELECT * FROM accounts ORDER BY created_at DESC');
  const subs = await all(env, `SELECT s.*, p.name AS product_name, p.icon AS product_icon, pl.name AS plan_name,
      (SELECT COUNT(*) FROM invoices i WHERE i.subscription_id = s.id AND i.status = 'submitted') AS to_review
    FROM subscriptions s JOIN products p ON p.id = s.product_id LEFT JOIN plans pl ON pl.id = s.plan_id`);
  return accounts.map(a => {
    const mine = subs.filter(s => s.account_id === a.id).map(s => ({ ...subOut(s, { id: s.product_id, name: s.product_name, icon: s.product_icon }, cfg), plan_name: s.plan_name, to_review: s.to_review }));
    return { ...adminAccount(a), subs: mine };
  });
}
export async function overview(env) {
  const cfg = await getConfig(env);
  const accounts = await listAccounts(env);
  const subs = accounts.flatMap(a => a.subs.map(s => ({ ...s, company: a.company, email: a.email })));
  const t = now();
  const monthStart = new Date(new Date(t).toISOString().slice(0, 7) + '-01T00:00:00Z').getTime();
  const paid = await all(env, "SELECT currency, SUM(amount) AS total, COUNT(*) AS n FROM invoices WHERE status = 'paid' AND paid_at >= ? GROUP BY currency", monthStart);
  const toReview = (await invoicesToReview(env)).filter(i => i.status === 'submitted');
  const by = st => subs.filter(s => s.stage === st);
  return {
    counts: { accounts: accounts.length, live: by('live').length, review: by('review').length, expired: by('expired').length, suspended: by('suspended').length, payments: toReview.length },
    revenue_month: paid, pending: by('review').slice(0, 10), payments: toReview.slice(0, 10),
    expiring: subs.filter(s => s.stage === 'live' && s.sub_ends_at && s.sub_ends_at - t < cfg.reminder_days * DAY).sort((x, y) => x.sub_ends_at - y.sub_ends_at).slice(0, 10),
  };
}
