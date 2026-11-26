// Database access. Works with:
//   1. Cloudflare D1 binding "DB" (when the site runs on Cloudflare Workers)
//   2. Cloudflare D1 over HTTP (CF_ACCOUNT_ID + CF_D1_DATABASE_ID + CF_API_TOKEN), for other hosts such as Vercel
//   3. nothing: the site still works with the built-in content, the admin asks you to connect a database
// Tables are created automatically on first use.

const CTX = Symbol.for('__cloudflare-context__');
let testDb = null;
export const setTestDb = d => { testDb = d; ready = null; };

function cfEnv() {
  const c = globalThis[CTX];
  return (c && c.env) || {};
}
export function envVar(name) {
  const v = (typeof process !== 'undefined' && process.env && process.env[name]) || cfEnv()[name];
  return v == null ? '' : String(v);
}

async function binding() {
  const e = cfEnv();
  if (e.DB) return e.DB;
  try {
    const m = await import('@opennextjs/cloudflare');
    const c = await m.getCloudflareContext({ async: true });
    if (c && c.env && c.env.DB) return c.env.DB;
  } catch (err) { /* not on Cloudflare */ }
  return null;
}

// D1 over HTTP, same shape as the binding: prepare().bind().first()/all()/run()
function httpD1(account, database, token) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`;
  const query = async (sql, params) => {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error('Database: ' + ((j.errors && j.errors[0] && j.errors[0].message) || 'HTTP ' + r.status));
    return j.result[0] || { results: [], meta: {} };
  };
  return {
    prepare(sql) {
      let params = [];
      const st = {
        bind: (...a) => { params = a.map(v => v === undefined ? null : v); return st; },
        first: async () => ((await query(sql, params)).results || [])[0] ?? null,
        all: async () => ({ results: (await query(sql, params)).results || [] }),
        run: async () => { const r = await query(sql, params); return { meta: { last_row_id: r.meta && r.meta.last_row_id, changes: r.meta && r.meta.changes } }; },
      };
      return st;
    },
  };
}

async function driver() {
  if (testDb) return testDb;
  const b = await binding();
  if (b) return b;
  const acc = envVar('CF_ACCOUNT_ID'), id = envVar('CF_D1_DATABASE_ID'), tok = envVar('CF_API_TOKEN');
  if (acc && id && tok) return httpD1(acc, id, tok);
  return null;
}

// ------------------------------------------------------------------ schema
const SCHEMA_VERSION = '8';
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS content (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS content_history (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS content_history_key ON content_history(key, created_at)`,
  // ---- HR automation (one company = one client account)
  `CREATE TABLE IF NOT EXISTS hr_settings (account_id INTEGER PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', last_daily TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS hr_employees (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, code TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT '', dept TEXT NOT NULL DEFAULT '', designation TEXT NOT NULL DEFAULT '', manager_id INTEGER, emp_type TEXT NOT NULL DEFAULT 'full-time',
     status TEXT NOT NULL DEFAULT 'probation', join_date TEXT NOT NULL DEFAULT '', probation_end TEXT NOT NULL DEFAULT '', contract_end TEXT NOT NULL DEFAULT '',
     dob TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', emergency TEXT NOT NULL DEFAULT '', bank TEXT NOT NULL DEFAULT '{}',
     salary TEXT NOT NULL DEFAULT '{}', exit TEXT NOT NULL DEFAULT '{}', applicant_id INTEGER, pass_hash TEXT NOT NULL DEFAULT '', pass_salt TEXT NOT NULL DEFAULT '',
     invite_token TEXT NOT NULL DEFAULT '', invite_expires INTEGER NOT NULL DEFAULT 0, login_enabled INTEGER NOT NULL DEFAULT 0, last_login INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS hr_emp_acct ON hr_employees(account_id, status)`,
  `CREATE INDEX IF NOT EXISTS hr_emp_email ON hr_employees(email)`,
  `CREATE TABLE IF NOT EXISTS hr_files (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, owner_type TEXT NOT NULL, owner_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'other',
     name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, data TEXT NOT NULL, expires_on TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS hr_files_owner ON hr_files(account_id, owner_type, owner_id)`,
  `CREATE TABLE IF NOT EXISTS hr_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, title TEXT NOT NULL, dept TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
     job_type TEXT NOT NULL DEFAULT 'Full-time', description TEXT NOT NULL DEFAULT '', requirements TEXT NOT NULL DEFAULT '', salary_range TEXT NOT NULL DEFAULT '',
     closes_on TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hr_applicants (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, job_id INTEGER NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
     phone TEXT NOT NULL DEFAULT '', experience REAL NOT NULL DEFAULT 0, current_role TEXT NOT NULL DEFAULT '', expected_salary TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
     cover TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'careers', stage TEXT NOT NULL DEFAULT 'new', ai TEXT NOT NULL DEFAULT '{}', score INTEGER,
     interview TEXT NOT NULL DEFAULT '{}', offer TEXT NOT NULL DEFAULT '{}', offer_token TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', employee_id INTEGER,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS hr_app_job ON hr_applicants(account_id, job_id, stage)`,
  `CREATE TABLE IF NOT EXISTS hr_attendance (account_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, in_time TEXT NOT NULL DEFAULT '',
     out_time TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL, PRIMARY KEY(employee_id, date))`,
  `CREATE INDEX IF NOT EXISTS hr_att_acct ON hr_attendance(account_id, date)`,
  `CREATE TABLE IF NOT EXISTS hr_leaves (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, type TEXT NOT NULL, start_date TEXT NOT NULL,
     end_date TEXT NOT NULL, half INTEGER NOT NULL DEFAULT 0, days REAL NOT NULL, reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', approver_id INTEGER,
     decided_by TEXT NOT NULL DEFAULT '', decided_at INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS hr_leave_acct ON hr_leaves(account_id, status, start_date)`,
  `CREATE TABLE IF NOT EXISTS hr_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, month TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', totals TEXT NOT NULL DEFAULT '{}',
     created_at INTEGER NOT NULL, approved_at INTEGER NOT NULL DEFAULT 0, paid_at INTEGER NOT NULL DEFAULT 0, UNIQUE(account_id, month))`,
  `CREATE TABLE IF NOT EXISTS hr_payslips (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, account_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, data TEXT NOT NULL,
     gross REAL NOT NULL, deductions REAL NOT NULL, net REAL NOT NULL, adjust TEXT NOT NULL DEFAULT '[]', UNIQUE(run_id, employee_id))`,
  `CREATE TABLE IF NOT EXISTS hr_policies (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, needs_ack INTEGER NOT NULL DEFAULT 1,
     version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hr_acks (policy_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, version INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(policy_id, employee_id))`,
  `CREATE TABLE IF NOT EXISTS hr_notices (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hr_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
     owner TEXT NOT NULL DEFAULT 'hr', due TEXT NOT NULL DEFAULT '', done_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hr_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'note', text TEXT NOT NULL,
     by_name TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hr_log (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, actor TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS hr_log_acct ON hr_log(account_id, at)`,
  `CREATE TABLE IF NOT EXISTS hr_prospects (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, job_id INTEGER NOT NULL, name TEXT NOT NULL, headline TEXT NOT NULL DEFAULT '',
     url TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'linkedin', snippet TEXT NOT NULL DEFAULT '', open_to_work INTEGER NOT NULL DEFAULT 0, score INTEGER, reason TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '', applicant_id INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(job_id, url))`,
  `CREATE INDEX IF NOT EXISTS hr_prospects_job ON hr_prospects(account_id, job_id, status)`,
  `CREATE TABLE IF NOT EXISTS emails (id INTEGER PRIMARY KEY AUTOINCREMENT, to_addr TEXT NOT NULL, subject TEXT NOT NULL, kind TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS media (name TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'editor',
     pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_login_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, first_at INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, who TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
     data TEXT NOT NULL DEFAULT '{}', is_read INTEGER NOT NULL DEFAULT 0, ip TEXT NOT NULL DEFAULT '')`,
  // Lead Engine
  `CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL,
     name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '',
     address TEXT NOT NULL DEFAULT '', business_type TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', status_note TEXT NOT NULL DEFAULT '',
     workflow_id TEXT NOT NULL DEFAULT '', settings_enc TEXT NOT NULL DEFAULT '', plan_id INTEGER, sub_status TEXT NOT NULL DEFAULT 'none', sub_ends_at INTEGER NOT NULL DEFAULT 0,
     admin_notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, approved_at INTEGER NOT NULL DEFAULT 0, last_login_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD',
     period_days INTEGER NOT NULL DEFAULT 30, lead_limit INTEGER NOT NULL DEFAULT 0, features TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, plan_id INTEGER, plan_name TEXT NOT NULL DEFAULT '', amount REAL NOT NULL DEFAULT 0,
     currency TEXT NOT NULL DEFAULT 'USD', period_days INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT 'unpaid', method TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '',
     payer_note TEXT NOT NULL DEFAULT '', admin_note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, submitted_at INTEGER NOT NULL DEFAULT 0, paid_at INTEGER NOT NULL DEFAULT 0,
     period_start INTEGER NOT NULL DEFAULT 0, period_end INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, short TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'generic', templates TEXT NOT NULL DEFAULT '[]',
     fields TEXT NOT NULL DEFAULT '[]', tables TEXT NOT NULL DEFAULT '', dashboard TEXT NOT NULL DEFAULT '{}', unit TEXT NOT NULL DEFAULT 'items',
     is_active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending', status_note TEXT NOT NULL DEFAULT '', workflow_id TEXT NOT NULL DEFAULT '', settings_enc TEXT NOT NULL DEFAULT '',
     plan_id INTEGER, sub_status TEXT NOT NULL DEFAULT 'none', sub_ends_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, approved_at INTEGER NOT NULL DEFAULT 0,
     UNIQUE(account_id, product_id))`,
  `CREATE INDEX IF NOT EXISTS subscriptions_account ON subscriptions(account_id)`,
  `CREATE INDEX IF NOT EXISTS invoices_account ON invoices(account_id)`,
  `CREATE INDEX IF NOT EXISTS invoices_status ON invoices(status)`,
  `INSERT OR IGNORE INTO config(key, value) VALUES ('payment_instructions', 'bKash (Send Money): 01XXXXXXXXX
Bank: Account name, account number, bank, branch
International: ask for a Wise or PayPal invoice at hello@briefboxdigital.com
After paying, enter the transaction ID below.')`,
  `INSERT OR IGNORE INTO config(key, value) VALUES ('payment_methods', 'bKash,Nagad,Bank transfer,Wise,PayPal')`,
  `INSERT OR IGNORE INTO config(key, value) VALUES ('grace_days', '3')`,
  `INSERT OR IGNORE INTO config(key, value) VALUES ('trial_days', '0')`,
  `INSERT OR IGNORE INTO config(key, value) VALUES ('reminder_days', '7')`,
  `INSERT INTO plans(name, price, currency, period_days, lead_limit, features, sort) SELECT 'Starter', 0, 'USD', 30, 300, 'Lead quality check
WhatsApp welcome message
1 CRM connection
Monthly report', 1 WHERE NOT EXISTS (SELECT 1 FROM plans)`,
  `INSERT INTO plans(name, price, currency, period_days, lead_limit, features, sort) SELECT 'Growth', 0, 'USD', 30, 1500, 'Everything in Starter
AI WhatsApp counselling
Counsellor assignment and follow-ups
Service feedback', 2 WHERE (SELECT COUNT(*) FROM plans) = 1`,
  `INSERT INTO plans(name, price, currency, period_days, lead_limit, features, sort) SELECT 'Pro', 0, 'USD', 30, 0, 'Everything in Growth
Unlimited leads
Priority support
Custom AI knowledge setup', 3 WHERE (SELECT COUNT(*) FROM plans) = 2`,
];


// Changes to tables that already exist. Each runs once; "duplicate column" errors are ignored.
const ALTERS = [
  `ALTER TABLE plans ADD COLUMN product_id INTEGER`,
  `ALTER TABLE invoices ADD COLUMN subscription_id INTEGER`,
  `ALTER TABLE invoices ADD COLUMN product_name TEXT NOT NULL DEFAULT ''`,
  // HR v2: attendance from the employee app, job sourcing
  `ALTER TABLE hr_attendance ADD COLUMN source TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE hr_attendance ADD COLUMN kind TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE hr_attendance ADD COLUMN place TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE hr_attendance ADD COLUMN geo TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE hr_jobs ADD COLUMN sourcing TEXT NOT NULL DEFAULT '{}'`,
  // test mode: emails are kept (not sent) so links can be opened by hand; demo data can be removed in one click
  `ALTER TABLE emails ADD COLUMN html TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE emails ADD COLUMN account_id INTEGER`,
  `ALTER TABLE hr_employees ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE hr_jobs ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`,
];
const MIGRATE = [
  `INSERT INTO products(slug, name, short, description, icon, kind, unit, sort, created_at) SELECT 'hr-automation', 'AI HR Automation',
     'Hiring to exit in one place: AI CV screening, employees, attendance, leave, payroll and policies, with a portal for every employee.',
     'Post jobs and let AI screen every CV. Hire with one click, run onboarding, record attendance, approve leave, run payroll with payslips, and manage exits. Employees get their own login for leave, payslips and policies.',
     '🧑‍💼', 'hr', 'employees', 3, 0 WHERE NOT EXISTS (SELECT 1 FROM products WHERE kind = 'hr')`,
  // Lead Engine becomes the first product
  `INSERT INTO products(slug, name, short, description, icon, kind, unit, sort, created_at) SELECT 'lead-engine', 'Lead Engine',
     'Every student lead answered on WhatsApp, qualified by AI and handed to the right counsellor.',
     'Lead quality check, WhatsApp welcome and AI counselling, counsellor assignment, follow-ups, call status and service feedback, synced with your CRM.',
     '🎓', 'lead-engine', 'leads', 1, 0 WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'lead-engine')`,
  `UPDATE products SET templates = json_array((SELECT value FROM config WHERE key = 'template_workflow_id'))
     WHERE slug = 'lead-engine' AND templates = '[]' AND COALESCE((SELECT value FROM config WHERE key = 'template_workflow_id'), '') != ''`,
  `UPDATE plans SET product_id = (SELECT id FROM products WHERE slug = 'lead-engine') WHERE product_id IS NULL`,
  // accounts that already used Lead Engine get a Lead Engine subscription
  `INSERT INTO subscriptions(account_id, product_id, status, status_note, workflow_id, settings_enc, plan_id, sub_status, sub_ends_at, created_at, approved_at)
     SELECT a.id, (SELECT id FROM products WHERE slug = 'lead-engine'), a.status, a.status_note, a.workflow_id, a.settings_enc, a.plan_id, a.sub_status, a.sub_ends_at, a.created_at, a.approved_at
     FROM accounts a WHERE (a.workflow_id != '' OR a.settings_enc != '' OR a.sub_ends_at > 0 OR a.plan_id IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.account_id = a.id AND s.product_id = (SELECT id FROM products WHERE slug = 'lead-engine'))`,
  `UPDATE invoices SET subscription_id = (SELECT s.id FROM subscriptions s WHERE s.account_id = invoices.account_id
     AND s.product_id = (SELECT id FROM products WHERE slug = 'lead-engine')), product_name = 'Lead Engine' WHERE subscription_id IS NULL`,
  `UPDATE accounts SET status = 'active' WHERE status = 'pending'`,
  // HR runs on the website: an n8n workflow linked to an HR subscription by mistake is unlinked, and HR products keep no template
  `UPDATE subscriptions SET workflow_id = 'builtin:hr' WHERE status = 'active' AND product_id IN (SELECT id FROM products WHERE kind = 'hr') AND workflow_id != 'builtin:hr'`,
  `UPDATE products SET templates = '[]' WHERE kind = 'hr'`,
  `INSERT OR IGNORE INTO config(key, value) VALUES('mail_mode', 'test')`,
];

let ready = null;
async function migrate(d) {
  let v = null;
  try { v = await d.prepare("SELECT value FROM config WHERE key = 'schema_version'").bind().first(); } catch (e) { v = null; }
  if (v && v.value === SCHEMA_VERSION) return;
  for (const sql of SCHEMA) await d.prepare(sql).bind().run();
  for (const sql of ALTERS) { try { await d.prepare(sql).bind().run(); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
  for (const sql of MIGRATE) await d.prepare(sql).bind().run();
  // secrets the app needs; generated once and kept in the database
  const rnd = () => { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, ''); };
  for (const k of ['session_secret', 'settings_key', 'cron_secret'])
    await d.prepare('INSERT OR IGNORE INTO config(key, value) VALUES(?, ?)').bind(k, rnd()).run();
  await d.prepare("INSERT INTO config(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(SCHEMA_VERSION).run();
}

// Returns the database (tables ready) or null when none is connected.
export async function getDb() {
  const d = await driver();
  if (!d) return null;
  if (!ready || ready.d !== d) {
    const p = migrate(d).catch(e => { ready = null; throw e; });
    ready = { d, p };
  }
  await ready.p;
  return d;
}

export async function dbStatus() {
  try { const d = await getDb(); return d ? { connected: true } : { connected: false }; }
  catch (e) { return { connected: false, error: e.message }; }
}

// small helpers
export const q = (d, sql, ...a) => d.prepare(sql).bind(...a);
export const all = async (d, sql, ...a) => (await q(d, sql, ...a).all()).results || [];
export const one = (d, sql, ...a) => q(d, sql, ...a).first();
export const run = (d, sql, ...a) => q(d, sql, ...a).run();

export async function getConfigValue(d, key) {
  const r = await one(d, 'SELECT value FROM config WHERE key = ?', key);
  return r ? r.value : '';
}
export async function setConfigValue(d, key, value) {
  await run(d, 'INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}
