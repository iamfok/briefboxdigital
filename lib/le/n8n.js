// Everything that talks to n8n: the client's workflow, its data tables, stats and connection tests.
import { DEFAULT_PROMPT, SCHEMA } from './shared.js';
import { findSettings, readSettingsCode } from './settings-code.js';

export const PREFIX = 'LE Client - ';
export const SECRET_KEYS = ['hubspot_token', 'email_api_key', 'email_api_secret', 'wa_token', 'sms_url'];
export const MASK = '••••';
const err = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status, ...extra });

// ---------------------------------------------------------------- API client
export function n8nBase(env) {
  const b = String(env.N8N_URL || '').trim().replace(/\/+$/, '');
  return /\/api\/v1$/.test(b) ? b : b + '/api/v1';
}
export async function n8n(env, path, opts = {}) {
  if (!env.N8N_URL || !env.N8N_API_KEY) throw err('Lead Engine is not connected to n8n yet. Add the n8n URL and API key in Admin > Lead Engine > Connection.', 400);
  const f = env.__fetch || fetch;
  const res = await f(n8nBase(env) + path, {
    method: opts.method || 'GET',
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    const why = res.status === 401 ? 'n8n did not accept the API key. Check it in Admin > Automations > n8n connection.'
      : res.status === 404 && /^\/workflows\/[^/]+$/.test(path) ? `n8n has no workflow with ID ${decodeURIComponent(path.split('/')[2])}. Check the ID.`
      : 'n8n: ' + ((data && (data.message || data.error)) || text.slice(0, 200) || 'HTTP ' + res.status);
    throw err(why, res.status >= 500 ? 502 : 400);
  }
  return data;
}
async function listAll(env, path) {
  const out = []; let cursor = '';
  for (let i = 0; i < 40; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await n8n(env, path + sep + 'limit=250' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    out.push(...(r.data || []));
    cursor = r.nextCursor; if (!cursor) break;
  }
  return out;
}

// ---------------------------------------------------------------- settings
const asciiJSON = o => JSON.stringify(o, null, 2).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

// settings object, or null. readSettingsError explains why it could not be read.
export function readSettingsDetailed(wf) {
  const node = (wf.nodes || []).find(n => n.name === 'Client Settings');
  if (!node) return { error: 'The workflow has no node named "Client Settings".' };
  return readSettingsCode(node.parameters && node.parameters.jsCode);
}
export function readSettings(wf) { return readSettingsDetailed(wf).settings || null; }

export function cleanClientId(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'c$1').slice(0, 24);
}

const NUM = ['reminder1_h', 'reminder2_h', 'escalate_h', 'digest_h'];
export const DEFAULTS = {
  active: true, crm_type: 'sheets', crm_sheet_tab: 'Sheet1',
  crm_map: { name: 'Name', phone: 'Phone Number', email: 'Email address', status: 'LE Status', call_status: 'Call Status' },
  hubspot_token: '', crm_webhook_url: '', crm_sheet_id: '',
  email_provider: 'gmail', email_api_key: '', email_api_secret: '', email_from: '', email_from_name: '',
  welcome_email_subject: 'Registration Successful - {company}',
  welcome_email_html: '<p>Dear {name},</p><p>Thank you for registering with {company}. Our counselling team will contact you on WhatsApp or phone very soon.</p><p>Best regards,<br>{company}</p>',
  sms_enabled: false, sms_method: 'GET', sms_url: '', sms_body: '',
  welcome_sms_text: 'Dear {name}, your registration with {company} is successful. We will contact you on WhatsApp soon.',
  wa_phone_number_id: '', wa_token: '', wa_lang: 'en_US',
  wa_tpl_welcome: 'reg_success', wa_tpl_reminder: 'reg_reminder', wa_tpl_feedback: 'service_feedback', wa_tpl_digest: 'counsellor_digest',
  assigned_msg: 'Thank you {name}! Your profile is complete. Our counsellor will call you tomorrow.',
  feedback_thanks_msg: 'Thank you for your feedback, {name}!',
  counsellors: [],
  reminder1_h: 6, reminder2_h: 12, escalate_h: 6, digest_h: 4,
  call_done_statuses: 'call done,called,contacted,completed,interested,not interested',
  default_cc: '880', kb: '', ai_prompt: DEFAULT_PROMPT,
};

// Form input merged over stored settings. Masked secrets ("••••abcd") keep their stored value.
// Returns only storable keys: no n8n URL or key, those are added when the workflow is written.
export function mergeSettings(input, existing = {}, fixed = {}) {
  const s = { ...DEFAULTS, ...existing };
  for (const [k, v] of Object.entries(input || {})) {
    if (!(k in DEFAULTS)) continue;
    if (SECRET_KEYS.includes(k) && typeof v === 'string' && v.startsWith(MASK)) continue;
    s[k] = v;
  }
  for (const k of NUM) { const n = Number(s[k]); s[k] = Number.isFinite(n) && n >= 0 ? n : DEFAULTS[k]; }
  s.active = s.active !== false && s.active !== 'false';
  s.sms_enabled = s.sms_enabled === true || s.sms_enabled === 'true';
  if (!String(s.ai_prompt || '').trim()) s.ai_prompt = DEFAULT_PROMPT;
  s.crm_map = { ...DEFAULTS.crm_map, ...(s.crm_map || {}) };
  s.counsellors = (Array.isArray(s.counsellors) ? s.counsellors : [])
    .map(c => ({ name: String(c.name || '').trim(), phone: String(c.phone || '').trim(), email: String(c.email || '').trim(), role: c.role === 'call' ? 'call' : 'chat' }))
    .filter(c => c.name).slice(0, 50);
  for (const k of Object.keys(s)) if (typeof s[k] === 'string') s[k] = s[k].slice(0, 20000);
  return { ...Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, s[k]])), ...fixed };
}

// What still stops the automation from going live. Empty list = ready.
export function missing(s) {
  const e = [];
  if (!s.company_name) e.push('Company name is missing (Info tab).');
  if (s.crm_type === 'sheets' && !s.crm_sheet_id) e.push('Add the Google Sheet ID.');
  if (s.crm_type === 'hubspot' && !s.hubspot_token) e.push('Add the HubSpot private app token.');
  if ((s.crm_type === 'webhook' || s.crm_type === 'zapier') && !/^https:\/\//.test(s.crm_webhook_url)) e.push('Add the CRM update URL (starts with https://).');
  if (['brevo', 'mailjet'].includes(s.email_provider) && !s.email_api_key) e.push('Add the email API key.');
  if (s.email_provider === 'mailjet' && !s.email_api_secret) e.push('Add the Mailjet secret key.');
  if (['brevo', 'mailjet'].includes(s.email_provider) && !s.email_from) e.push('Add the sender email address.');
  if (!s.wa_phone_number_id || !s.wa_token) e.push('Add the WhatsApp phone number ID and access token.');
  if (s.sms_enabled && !/\{to\}/.test(s.sms_url)) e.push('The SMS gateway URL needs {to} and {message}.');
  if (!s.counsellors.some(c => c.role === 'chat')) e.push('Add at least one chat counsellor.');
  return e;
}

export function maskSettings(s) {
  const out = { ...s };
  for (const k of SECRET_KEYS) if (out[k]) out[k] = MASK + String(out[k]).slice(-4);
  return out;
}

export function webhookUrls(env, id) {
  const b = String(env.N8N_URL || '').trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  return { lead: `${b}/webhook/le-lead-${id}`, whatsapp: `${b}/webhook/le-whatsapp-${id}`, call_status: `${b}/webhook/le-status-${id}` };
}

const PATHS = { 'Lead Webhook': 'le-lead-', 'WhatsApp Webhook': 'le-whatsapp-', 'Status Webhook': 'le-status-' };
function withEngine(env, s) {
  return { api: String(env.N8N_URL || '').trim(), apiKey: env.N8N_API_KEY, graph: 'v23.0',
           client_id: s.client_id, active: s.active, company_name: s.company_name, ...s };
}
export function applySettings(env, wf, s, { newWebhookIds = false } = {}) {
  const nodes = JSON.parse(JSON.stringify(wf.nodes));
  const node = nodes.find(n => n.name === 'Client Settings');
  if (!node) throw err('The template has no "Client Settings" node.', 500);
  const code = String(node.parameters.jsCode || '');
  const f = findSettings(code);
  if (!f) throw err('Could not find the "const S = { ... }" block in the Client Settings node.', 400);
  node.parameters.jsCode = code.slice(0, f.start) + asciiJSON(withEngine(env, s)) + code.slice(f.end);
  for (const n of nodes) if (PATHS[n.name]) {
    n.parameters.path = PATHS[n.name] + s.client_id;
    if (newWebhookIds) n.webhookId = crypto.randomUUID();
  }
  return nodes;
}
const wfBody = (s, nodes, wf) => ({ name: `${PREFIX}${s.company_name} (${s.client_id})`, nodes, connections: wf.connections,
  settings: { executionOrder: 'v1', timezone: (wf.settings && wf.settings.timezone) || 'Asia/Dhaka' } });

// ---------------------------------------------------------------- workflow lifecycle
async function ensureTables(env, clientId) {
  const existing = new Set((await listAll(env, '/data-tables')).map(t => t.name));
  for (const [suffix, spec] of Object.entries(SCHEMA)) {
    const name = clientId + '_' + suffix;
    if (existing.has(name)) continue;
    const columns = spec.split(/\s+/).filter(Boolean).map(c => { const [n, t] = c.split(':'); return { name: n, type: t || 'string' }; });
    await n8n(env, '/data-tables', { method: 'POST', body: { name, columns } });
  }
}

export async function provisionWorkflow(env, s) {
  if (!env.TEMPLATE_WORKFLOW_ID) throw err('Add the template workflow ID in Admin > Lead Engine > Connection.', 400);
  const all = await listAll(env, '/workflows');
  const clash = all.find(w => String(w.name || '').startsWith(PREFIX) && new RegExp('\\(' + s.client_id + '\\)\\s*$').test(w.name));
  if (clash) throw err(`n8n already has a workflow for "${s.client_id}" (id ${clash.id}). Link it instead of creating a new one.`, 409);
  const tpl = await n8n(env, '/workflows/' + encodeURIComponent(env.TEMPLATE_WORKFLOW_ID));
  const created = await n8n(env, '/workflows', { method: 'POST', body: wfBody(s, applySettings(env, tpl, s, { newWebhookIds: true }), tpl) });
  await ensureTables(env, s.client_id);
  return String(created.id);
}

export async function pushWorkflow(env, id, s) {
  const wf = await n8n(env, '/workflows/' + encodeURIComponent(id));
  await n8n(env, '/workflows/' + encodeURIComponent(id), { method: 'PUT', body: wfBody(s, applySettings(env, wf, s), wf) });
  await ensureTables(env, s.client_id);
}

export async function setWorkflowActive(env, id, on) {
  const wf = await n8n(env, '/workflows/' + encodeURIComponent(id));
  if (!!wf.active === on) return;
  await n8n(env, `/workflows/${encodeURIComponent(id)}/${on ? 'activate' : 'deactivate'}`, { method: 'POST' });
}

export async function readWorkflow(env, id) {
  const wf = await n8n(env, '/workflows/' + encodeURIComponent(id));
  const r = readSettingsDetailed(wf);
  return { wf, settings: r.settings || null, error: r.error };
}

export async function unlinkedWorkflows(env, linked, templateIds = []) {
  const skip = new Set([...templateIds.map(String), String(env.TEMPLATE_WORKFLOW_ID || '')]);
  const all = await listAll(env, '/workflows');
  return all.filter(w => !skip.has(String(w.id)) && !linked.has(String(w.id)) && !/\(template\)/i.test(w.name || ''))
    .map(w => ({ id: String(w.id), name: w.name, active: !!w.active })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- data
async function tablesFor(env, cid) {
  const tables = await listAll(env, '/data-tables');
  const t = n => tables.find(x => x.name === cid + '_' + n);
  const rows = async tb => tb ? listAll(env, `/data-tables/${tb.id}/rows`) : [];
  return { has: !!t('leads'), leads: () => rows(t('leads')), messages: () => rows(t('messages')), feedback: () => rows(t('feedback')) };
}

const dayKey = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
export function computeStats(leads, messages, feedback, days = 30, now = Date.now()) {
  const from = now - days * 86400e3;
  const inRange = r => Date.parse(r.createdAt || r.welcomed_at || '') >= from;
  const L = leads.filter(inRange), M = messages.filter(inRange), F = feedback.filter(inRange);
  const count = (arr, key) => arr.reduce((m, r) => { const k = r[key] || 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const perDay = [];
  for (let i = days - 1; i >= 0; i--) perDay.push({ day: dayKey(now - i * 86400e3), leads: 0 });
  const idx = Object.fromEntries(perDay.map((d, i) => [d.day, i]));
  for (const r of L) { const k = dayKey(r.createdAt || r.welcomed_at); if (k in idx) perDay[idx[k]].leads++; }
  const stages = count(L, 'stage');
  const assigned = L.filter(r => ['assigned', 'feedback_pending', 'feedback_done'].includes(r.stage)).length;
  const wa = M.filter(m => m.channel === 'whatsapp' && m.direction === 'out');
  const waStatus = count(wa, 'status');
  const waDelivered = wa.filter(m => ['delivered', 'read'].includes(m.status)).length;
  const ratings = F.map(r => Number(r.rating)).filter(n => n >= 1 && n <= 5);
  const team = {};
  for (const r of L) if (r.counsellor) {
    const t = team[r.counsellor] = team[r.counsellor] || { name: r.counsellor, role: r.counsellor_role || '', assigned: 0, called: 0, ratings: [] };
    t.assigned++; if (r.call_status) t.called++;
  }
  for (const r of F) if (r.counsellor && team[r.counsellor]) team[r.counsellor].ratings.push(Number(r.rating));
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
  return {
    days,
    totals: {
      leads: L.length, assigned, escalated: stages.escalated || 0,
      waiting: (stages.welcomed || 0) + (stages.chatting || 0),
      invalid: (stages.invalid || 0) + (stages.invalid_phone || 0) + (stages.duplicate || 0),
      wa_sent: wa.length, wa_delivered: waDelivered, wa_failed: waStatus.failed || 0,
      wa_delivery_rate: wa.length ? Math.round(waDelivered / wa.length * 100) : null,
      feedback_count: ratings.length, avg_rating: avg(ratings),
    },
    per_day: perDay, stages, sources: count(L, 'source'), wa_status: waStatus,
    rating_dist: [1, 2, 3, 4, 5].map(n => ({ rating: n, count: ratings.filter(r => r === n).length })),
    team: Object.values(team).map(t => ({ name: t.name, role: t.role, assigned: t.assigned, called: t.called, avg_rating: avg(t.ratings) })).sort((a, b) => b.assigned - a.assigned),
    recent: [...leads].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0)).slice(0, 15)
      .map(r => ({ name: r.name, phone: r.phone, stage: r.stage, quality: r.lead_quality, counsellor: r.counsellor, wa_status: r.wa_status, source: r.source, created: r.createdAt })),
  };
}

export async function statsFor(env, cid, days) {
  const t = await tablesFor(env, cid);
  if (!t.has) return { empty: true };
  const [l, m, f] = await Promise.all([t.leads(), t.messages(), t.feedback()]);
  return computeStats(l, m, f, days);
}

export async function monthLeadCount(env, cid, now = Date.now()) {
  const t = await tablesFor(env, cid);
  if (!t.has) return 0;
  const from = now - 30 * 86400e3;
  return (await t.leads()).filter(r => Date.parse(r.createdAt || '') >= from).length;
}

const CSV_COLS = ['createdAt', 'name', 'phone', 'email', 'source', 'stage', 'lead_quality', 'lead_score', 'counsellor', 'call_status', 'wa_status',
  'education_level', 'latest_result', 'english_test', 'preferred_country', 'program_interest', 'intake', 'budget', 'summary', 'feedback_rating'];
export async function leadsCsv(env, cid, days) {
  const t = await tablesFor(env, cid);
  const from = Date.now() - days * 86400e3;
  const rows = t.has ? (await t.leads()).filter(r => Date.parse(r.createdAt || '') >= from) : [];
  const cell = v => { v = v == null ? '' : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [CSV_COLS.join(','), ...rows.map(r => CSV_COLS.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- connection tests
export async function testConnection(env, service, s) {
  const f = env.__fetch || fetch;
  const get = async (url, headers) => { const r = await f(url, { headers }); let b = {}; try { b = await r.json(); } catch (e) {} return { ok: r.ok, status: r.status, body: b }; };
  if (service === 'whatsapp') {
    if (!s.wa_phone_number_id || !s.wa_token) return { ok: false, message: 'Enter both the phone number ID and the token.' };
    const r = await get(`https://graph.facebook.com/v23.0/${encodeURIComponent(s.wa_phone_number_id)}?fields=display_phone_number,verified_name,quality_rating`, { Authorization: 'Bearer ' + s.wa_token });
    return r.ok ? { ok: true, message: `Connected: ${r.body.verified_name || ''} ${r.body.display_phone_number || ''}`.trim() }
                : { ok: false, message: (r.body.error && r.body.error.message) || 'HTTP ' + r.status };
  }
  if (service === 'hubspot' || (service === 'crm' && s.crm_type === 'hubspot')) {
    if (!s.hubspot_token) return { ok: false, message: 'Enter the token.' };
    const r = await get('https://api.hubapi.com/crm/v3/properties/contacts/le_status', { Authorization: 'Bearer ' + s.hubspot_token });
    if (r.ok) return { ok: true, message: 'Connected. The le_status property exists.' };
    if (r.status === 404) return { ok: false, message: 'Token works, but the contact property "le_status" (and le_quality, le_counsellor, le_score, le_summary, le_feedback) is missing.' };
    return { ok: false, message: (r.body && r.body.message) || 'HTTP ' + r.status };
  }
  if (service === 'email') {
    if (s.email_provider === 'brevo') {
      const r = await get('https://api.brevo.com/v3/account', { 'api-key': s.email_api_key, accept: 'application/json' });
      return r.ok ? { ok: true, message: 'Brevo connected: ' + (r.body.email || '') } : { ok: false, message: (r.body && r.body.message) || 'HTTP ' + r.status };
    }
    if (s.email_provider === 'mailjet') {
      const r = await get('https://api.mailjet.com/v3/REST/user', { Authorization: 'Basic ' + btoa(`${s.email_api_key}:${s.email_api_secret}`) });
      return r.ok ? { ok: true, message: 'Mailjet connected' } : { ok: false, message: r.status === 401 ? 'Key or secret is wrong.' : 'HTTP ' + r.status };
    }
    if (s.email_provider === 'gmail') return { ok: true, message: 'Gmail is sent from the Briefbox account. Nothing to connect.' };
    return { ok: true, message: 'Email is off.' };
  }
  if (service === 'crm') {
    if (s.crm_type === 'sheets') return s.crm_sheet_id ? { ok: true, message: 'Sheet ID saved. Share the sheet with our Google account and add the LE columns.' } : { ok: false, message: 'Enter the sheet ID.' };
    if (!/^https:\/\//.test(s.crm_webhook_url)) return { ok: false, message: 'Enter a URL that starts with https://' };
    const r = await f(s.crm_webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'connection.test', client_id: s.client_id, lead: { name: 'Test Lead', phone: '8801700000000' } }) });
    return r.ok ? { ok: true, message: 'Test event sent (HTTP ' + r.status + ').' } : { ok: false, message: 'Webhook answered HTTP ' + r.status };
  }
  if (service === 'sms') {
    if (!s.sms_enabled) return { ok: true, message: 'SMS is off.' };
    return /\{to\}/.test(s.sms_url) && /\{message\}/.test(s.sms_url + s.sms_body) ? { ok: true, message: 'URL format is right. Send a test lead to try a real SMS.' } : { ok: false, message: 'The URL needs {to} and {message}.' };
  }
  return { ok: false, message: 'Unknown service' };
}

// ================================================================ generic products
// A product template is any n8n workflow with a Code node named "Client Settings" containing "const S = {};".
// On approval each template is copied, the client's settings are written into S, every Webhook node gets
// a unique path "<product>-<node>-<client>", and the product's data tables are created.
const nodeSlug = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'hook';
const isWebhook = n => /\.webhook$/i.test(String(n.type || '')) || /formTrigger$/i.test(String(n.type || ''));
const baseUrl = env => String(env.N8N_URL || '').trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');
export const genericHookPath = (product, node, cid) => `${product.slug}-${nodeSlug(node)}-${cid}`;

export async function ensureProductTables(env, product, cid, tableName) {
  if (!product.table_specs.length) return;
  const existing = new Set((await listAll(env, '/data-tables')).map(t => t.name));
  for (const t of product.table_specs) {
    const name = tableName(product, cid, t.name);
    if (existing.has(name)) continue;
    await n8n(env, '/data-tables', { method: 'POST', body: { name, columns: t.columns.length ? t.columns : [{ name: 'data', type: 'string' }] } });
  }
}

function genericNodes(env, product, wf, s, extra, { newWebhookIds }) {
  const nodes = JSON.parse(JSON.stringify(wf.nodes || []));
  const node = nodes.find(n => n.name === 'Client Settings');
  if (!node) throw err(`The workflow "${wf.name}" has no Code node named "Client Settings".`, 400);
  const code = String(node.parameters.jsCode || '');
  const f = findSettings(code);
  if (!f) throw err(`The Client Settings node in "${wf.name}" needs a "const S = {};" line.`, 400);
  const hooks = {};
  for (const n of nodes) if (isWebhook(n)) {
    const path = genericHookPath(product, n.name, s.client_id);
    n.parameters = { ...(n.parameters || {}), path };
    if (newWebhookIds) n.webhookId = crypto.randomUUID();
    hooks[n.name] = `${baseUrl(env)}/webhook/${path}`;
  }
  const S = { api: String(env.N8N_URL || '').trim(), apiKey: env.N8N_API_KEY, product: product.slug, client_id: s.client_id, company_name: s.company_name, ...extra, ...s };
  node.parameters.jsCode = code.slice(0, f.start) + asciiJSON(S) + code.slice(f.end);
  return { nodes, hooks };
}
const genericName = (tplName, s) => {
  const base = String(tplName || 'Automation').replace(/\s*[-–]?\s*\(?template\)?\s*$/i, '').trim();
  return `${base} - ${s.company_name} (${s.client_id})`;
};
const bodyFor = (name, nodes, wf) => ({ name, nodes, connections: wf.connections, settings: { executionOrder: 'v1', timezone: (wf.settings && wf.settings.timezone) || 'Asia/Dhaka' } });

// returns comma separated workflow ids
export async function provisionGeneric(env, product, s, extra) {
  if (!product.templates.length) throw err(`Add the n8n template workflow ID to "${product.name}" in Admin > Products.`);
  const ids = [];
  for (const tid of product.templates) {
    const tpl = await n8n(env, '/workflows/' + encodeURIComponent(tid));
    const { nodes } = genericNodes(env, product, tpl, s, extra, { newWebhookIds: true });
    const created = await n8n(env, '/workflows', { method: 'POST', body: bodyFor(genericName(tpl.name, s), nodes, tpl) });
    ids.push(String(created.id));
  }
  return ids.join(',');
}
export async function pushGeneric(env, product, wfIds, s, extra) {
  for (const id of String(wfIds).split(',').filter(Boolean)) {
    const wf = await n8n(env, '/workflows/' + encodeURIComponent(id));
    const { nodes } = genericNodes(env, product, wf, s, extra, { newWebhookIds: false });
    await n8n(env, '/workflows/' + encodeURIComponent(id), { method: 'PUT', body: bodyFor(wf.name, nodes, wf) });
  }
}
// webhook addresses the client needs, read from their own workflows
export async function genericHooks(env, product, wfIds, cid) {
  const out = [];
  for (const id of String(wfIds).split(',').filter(Boolean)) {
    const wf = await n8n(env, '/workflows/' + encodeURIComponent(id));
    for (const n of wf.nodes || []) if (isWebhook(n)) out.push({ name: n.name, url: `${baseUrl(env)}/webhook/${(n.parameters && n.parameters.path) || genericHookPath(product, n.name, cid)}` });
  }
  return out;
}
export async function setWorkflowsActive(env, wfIds, on) {
  for (const id of String(wfIds).split(',').filter(Boolean)) await setWorkflowActive(env, id, on);
}
// What the admin sees when checking a template
export async function checkTemplates(env, templates) {
  const out = [];
  for (const id of templates) {
    try {
      const wf = await n8n(env, '/workflows/' + encodeURIComponent(id));
      const node = (wf.nodes || []).find(n => n.name === 'Client Settings');
      const r = node ? readSettingsCode(node.parameters && node.parameters.jsCode) : { error: 'No Code node named "Client Settings".' };
      out.push({ id, ok: !r.error, name: wf.name, active: !!wf.active, error: r.error || '', webhooks: (wf.nodes || []).filter(isWebhook).map(n => n.name) });
    } catch (e) { out.push({ id, ok: false, error: e.message, webhooks: [] }); }
  }
  return out;
}

// ---------------------------------------------------------------- generic dashboard
async function tableRows(env, name) {
  const t = (await listAll(env, '/data-tables')).find(x => x.name === name);
  return t ? listAll(env, `/data-tables/${t.id}/rows`) : null;
}
const parseCols = text => String(text || '').split(',').map(c => c.trim()).filter(Boolean).map(c => { const [k, l] = c.split(':'); return { key: k.trim(), label: (l || k).trim() }; });
export async function genericStats(env, product, cid, tableName, days, now = Date.now()) {
  const dsh = product.dashboard || {};
  if (!dsh.table) return { empty: true, reason: 'no_dashboard' };
  const rows = await tableRows(env, tableName(product, cid, dsh.table));
  if (!rows) return { empty: true, reason: 'no_data' };
  const dc = dsh.date_column || 'createdAt';
  const at = r => Date.parse(r[dc] || r.createdAt || '');
  const from = now - days * 86400e3, inRange = rows.filter(r => at(r) >= from);
  const prev = rows.filter(r => at(r) >= from - days * 86400e3 && at(r) < from).length;
  const today = dayKey(now);
  const perDay = [];
  for (let i = days - 1; i >= 0; i--) perDay.push({ day: dayKey(now - i * 86400e3), value: 0 });
  const idx = Object.fromEntries(perDay.map((x, i) => [x.day, i]));
  for (const r of inRange) { const k = dayKey(at(r)); if (k in idx) perDay[idx[k]].value++; }
  const groups = parseCols(dsh.group_by).map(g => {
    const counts = {};
    for (const r of inRange) { const k = String(r[g.key] ?? '') || 'Not set'; counts[k] = (counts[k] || 0) + 1; }
    return { key: g.key, label: g.label, counts };
  });
  let cols = parseCols(dsh.columns);
  if (!cols.length) cols = Object.keys(rows[0] || {}).filter(k => !['id', 'updatedAt'].includes(k)).slice(0, 6).map(k => ({ key: k, label: k }));
  const recent = [...rows].sort((a, b) => (at(b) || 0) - (at(a) || 0)).slice(0, 15).map(r => Object.fromEntries(cols.map(c => [c.key, r[c.key] ?? ''])));
  return { days, kpi_label: dsh.kpi_label || ('New ' + (product.unit || 'items')), unit: product.unit || 'items',
    totals: { range: inRange.length, previous: prev, today: perDay.length ? perDay[perDay.length - 1].value : 0, all: rows.length },
    per_day: perDay, groups, columns: cols, recent };
}
export async function genericCsv(env, product, cid, tableName, days) {
  const dsh = product.dashboard || {};
  const rows = dsh.table ? (await tableRows(env, tableName(product, cid, dsh.table))) || [] : [];
  const dc = dsh.date_column || 'createdAt', from = Date.now() - days * 86400e3;
  const list = rows.filter(r => Date.parse(r[dc] || r.createdAt || '') >= from);
  const cols = [...new Set(list.flatMap(r => Object.keys(r)))];
  const cell = v => { v = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.join(','), ...list.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}
export async function genericMonthCount(env, product, cid, tableName) {
  const s = await genericStats(env, product, cid, tableName, 30);
  return s.empty ? 0 : s.totals.range;
}
