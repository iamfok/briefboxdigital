// Products (automations) and the settings form each one asks the client to fill.
// A product is defined in the admin: name, n8n template workflow(s), form fields, data tables, dashboard.
import { all, one, run } from '../db.js';

export const LE = 'lead-engine';
export const MASK = '••••';
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const J = (t, d) => { try { const v = JSON.parse(t); return v ?? d; } catch (e) { return d; } };
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
export const FIELD_TYPES = ['text', 'textarea', 'secret', 'number', 'url', 'email', 'select', 'toggle', 'list'];

export function productOut(p) {
  if (!p) return null;
  return { ...p, is_active: !!p.is_active, builtin: p.kind === LE,
    templates: J(p.templates, []).filter(Boolean).map(String), fields: J(p.fields, []), dashboard: J(p.dashboard, {}), table_specs: parseTables(p.tables) };
}
// "posts: title topic status posted_at:date" one table per line
export function parseTables(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [name, cols = ''] = l.split(/:(.*)/s);
    const columns = cols.trim().split(/[\s,]+/).filter(Boolean).map(c => { const [n, t] = c.split(':'); return { name: n, type: ['string', 'number', 'boolean', 'date'].includes(t) ? t : 'string' }; });
    return { name: name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'), columns };
  }).filter(t => t.name);
}

export async function listProducts(d, { includeHidden = false } = {}) {
  return (await all(d, `SELECT * FROM products ${includeHidden ? '' : 'WHERE is_active = 1'} ORDER BY sort, id`)).map(productOut);
}
export async function getProduct(d, idOrSlug) {
  const r = /^\d+$/.test(String(idOrSlug)) ? await one(d, 'SELECT * FROM products WHERE id = ?', Number(idOrSlug)) : await one(d, 'SELECT * FROM products WHERE slug = ?', String(idOrSlug));
  return productOut(r);
}

function cleanField(f, nested = false) {
  const key = String(f.key || '').trim().toLowerCase();
  if (!KEY.test(key)) throw err(`Field key "${f.key || ''}" must start with a letter and use only lowercase letters, numbers and _.`);
  if (['client_id', 'company_name', 'product', 'api', 'apikey', 'active', 'tables', 'webhooks'].includes(key)) throw err(`"${key}" is reserved. Choose another field key.`);
  const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
  if (nested && type === 'list') throw err('A list cannot contain another list.');
  const out = { key, label: String(f.label || key).slice(0, 80), type, required: !!f.required,
    help: String(f.help || '').slice(0, 400), placeholder: String(f.placeholder || '').slice(0, 120), group: String(f.group || '').slice(0, 60),
    show_if: String(f.show_if || '').trim().slice(0, 80), default: f.default ?? '' };
  if (type === 'select') {
    out.options = (Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map(o => typeof o === 'object' ? o : (() => { const [v, l] = String(o).split(':'); return { value: v.trim(), label: (l || v).trim() }; })()).filter(o => o.value);
    if (!out.options.length) throw err(`Dropdown "${out.label}" needs options, for example: daily:Every day, weekly:Every week`);
  }
  if (type === 'list') {
    const sub = Array.isArray(f.fields) ? f.fields : String(f.columns || '').split(',').map(c => c.trim()).filter(Boolean).map(c => { const [k, l] = c.split(':'); return { key: k.trim(), label: (l || k).trim(), type: 'text' }; });
    out.fields = sub.map(x => cleanField(x, true));
    if (!out.fields.length) throw err(`List "${out.label}" needs columns, for example: name:Name, phone:Phone`);
  }
  if (type === 'toggle') out.default = f.default === true || f.default === 'true';
  return out;
}

export async function saveProduct(d, input, id) {
  const cur = id ? await getProduct(d, id) : null;
  if (id && !cur) throw err('Product not found', 404);
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) throw err('Give the product a name.');
  let slug = cur ? cur.slug : String(input.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (!slug) throw err('Give the product a short URL name.');
  if (!cur && await one(d, 'SELECT id FROM products WHERE slug = ?', slug)) throw err(`A product called "${slug}" already exists.`, 409);
  const templates = (Array.isArray(input.templates) ? input.templates : String(input.templates || '').split(/[\s,]+/)).map(s => String(s).trim()).filter(Boolean).slice(0, 10);
  const builtin = cur && cur.kind === LE;
  if (cur && cur.kind === 'hr') templates.length = 0; // runs on the website, never from an n8n template
  const fields = builtin ? [] : (Array.isArray(input.fields) ? input.fields : cur ? cur.fields : []).map(f => cleanField(f));
  const keys = new Set();
  for (const f of fields) { if (keys.has(f.key)) throw err(`Two fields use the key "${f.key}".`); keys.add(f.key); }
  const dash = input.dashboard && typeof input.dashboard === 'object' ? input.dashboard : (cur ? cur.dashboard : {});
  const dashboard = { table: String(dash.table || '').trim(), date_column: String(dash.date_column || 'createdAt').trim(), kpi_label: String(dash.kpi_label || '').slice(0, 60),
    group_by: String(dash.group_by || '').trim(), columns: String(dash.columns || '').trim() };
  const v = { name, short: String(input.short ?? (cur ? cur.short : '')).slice(0, 200), description: String(input.description ?? (cur ? cur.description : '')).slice(0, 2000),
    icon: String(input.icon ?? (cur ? cur.icon : '⚙️')).slice(0, 8), templates: JSON.stringify(templates), fields: JSON.stringify(fields),
    tables: builtin ? '' : String(input.tables ?? (cur ? cur.tables : '')).slice(0, 4000), dashboard: JSON.stringify(dashboard),
    unit: String(input.unit || (cur ? cur.unit : 'items')).slice(0, 30), is_active: input.is_active === false || input.is_active === 'false' ? 0 : 1, sort: Math.round(Number(input.sort ?? (cur ? cur.sort : 0)) || 0) };
  if (cur) {
    await run(d, 'UPDATE products SET name=?, short=?, description=?, icon=?, templates=?, fields=?, tables=?, dashboard=?, unit=?, is_active=?, sort=? WHERE id=?',
      v.name, v.short, v.description, v.icon, v.templates, v.fields, v.tables, v.dashboard, v.unit, v.is_active, v.sort, cur.id);
    return getProduct(d, cur.id);
  }
  const r = await run(d, 'INSERT INTO products(slug, name, short, description, icon, kind, templates, fields, tables, dashboard, unit, is_active, sort, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    slug, v.name, v.short, v.description, v.icon, 'generic', v.templates, v.fields, v.tables, v.dashboard, v.unit, v.is_active, v.sort, Date.now());
  return getProduct(d, r.meta.last_row_id);
}

// ------------------------------------------------------------------ generic settings
const visible = (f, s) => {
  if (!f.show_if) return true;
  const [k, v] = f.show_if.split('=');
  const cur = s[k.trim()];
  return v === undefined ? !!cur && cur !== 'false' : String(v).split('|').map(x => x.trim()).includes(String(cur));
};
function coerce(f, v) {
  if (f.type === 'toggle') return v === true || v === 'true' || v === 'on';
  if (f.type === 'number') { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? '' : n; }
  if (f.type === 'list') return (Array.isArray(v) ? v : []).slice(0, 100).map(r => Object.fromEntries(f.fields.map(x => [x.key, coerce(x, r && r[x.key])])))
    .filter(r => Object.values(r).some(x => x !== '' && x !== false));
  if (f.type === 'select') return f.options.some(o => o.value === String(v)) ? String(v) : (f.default || f.options[0].value);
  return String(v ?? '').slice(0, 20000);
}
export function genericDefaults(fields) {
  const o = { active: true };
  for (const f of fields) o[f.key] = coerce(f, f.type === 'list' ? [] : f.default);
  return o;
}
export function mergeGeneric(fields, input, existing = {}, fixed = {}) {
  const s = { ...genericDefaults(fields), ...existing };
  for (const f of fields) {
    if (!input || !(f.key in input)) continue;
    let v = input[f.key];
    if (f.type === 'secret' && typeof v === 'string' && v.startsWith(MASK)) continue;
    if (f.type === 'list') v = (Array.isArray(v) ? v : []).map((row, i) => {
      const old = (existing[f.key] || [])[i] || {};
      return Object.fromEntries(f.fields.map(x => [x.key, x.type === 'secret' && String(row[x.key] || '').startsWith(MASK) ? old[x.key] : row[x.key]]));
    });
    s[f.key] = v;
  }
  if (input && 'active' in input) s.active = input.active !== false && input.active !== 'false';
  for (const f of fields) s[f.key] = coerce(f, s[f.key]);
  const keep = new Set(['active', ...fields.map(f => f.key)]);
  return { ...Object.fromEntries(Object.entries(s).filter(([k]) => keep.has(k))), ...fixed };
}
export function missingGeneric(fields, s) {
  const out = [];
  for (const f of fields) {
    if (!f.required || !visible(f, s)) continue;
    const v = s[f.key];
    if (v === '' || v == null || (Array.isArray(v) && !v.length)) out.push(`${f.label} is required.`);
  }
  return out;
}
export function maskGeneric(fields, s) {
  const o = { ...s };
  const m = v => v ? MASK + String(v).slice(-4) : '';
  for (const f of fields) {
    if (f.type === 'secret') o[f.key] = m(o[f.key]);
    if (f.type === 'list' && Array.isArray(o[f.key])) o[f.key] = o[f.key].map(r => ({ ...r, ...Object.fromEntries(f.fields.filter(x => x.type === 'secret').map(x => [x.key, m(r[x.key])])) }));
  }
  return o;
}

export const productKey = p => p.slug.replace(/-/g, '_');
export const tableName = (p, cid, t) => p.kind === LE ? `${cid}_${t}` : `${cid}_${productKey(p)}_${t}`;
