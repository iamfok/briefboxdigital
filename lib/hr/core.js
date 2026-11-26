// HR automation: the data and rules for one company (one client account).
// Dates are 'YYYY-MM-DD' strings in the company's time zone. Money is a plain number in the company's currency.
const q = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);
export const all = async (env, sql, ...a) => (await q(env, sql, ...a).all()).results || [];
export const one = (env, sql, ...a) => q(env, sql, ...a).first();
export const run = (env, sql, ...a) => q(env, sql, ...a).run();
export const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
export const J = (t, d) => { try { const v = JSON.parse(t); return v ?? d; } catch (e) { return d; } };
export const now = () => Date.now();
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const round2 = n => Math.round(n * 100) / 100;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

import { encryptJSON, decryptJSON } from '../auth.js';

// ---------------------------------------------------------------- dates
export const todayIn = tz => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Dhaka' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
const d2n = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const n2d = n => new Date(n).toISOString().slice(0, 10);
export const addDays = (s, k) => n2d(d2n(s) + k * 864e5);
export const diffDays = (a, b) => Math.round((d2n(b) - d2n(a)) / 864e5);
const addMonths = (s, k) => { const d = new Date(d2n(s)); d.setUTCMonth(d.getUTCMonth() + k); return n2d(d.getTime()); };
export const weekday = s => new Date(d2n(s)).getUTCDay();
export const monthDays = m => { const out = [], end = addDays(addMonths(m + '-01', 1), -1); for (let x = m + '-01'; x <= end; x = addDays(x, 1)) out.push(x); return out; };
export const range = (a, b) => { const out = []; if (!DATE.test(a) || !DATE.test(b) || a > b) return out; for (let x = a; x <= b && out.length < 400; x = addDays(x, 1)) out.push(x); return out; };

// ---------------------------------------------------------------- settings
export const DEFAULTS = {
  timezone: 'Asia/Dhaka', currency: 'BDT', work_days: [0, 1, 2, 3, 4], office_start: '09:00', office_end: '18:00', late_after_min: 15,
  departments: ['Management', 'Sales', 'Operations', 'Accounts'], holidays: [],
  leave_types: [
    { key: 'annual', name: 'Annual leave', days: 14, paid: true, carry: true },
    { key: 'sick', name: 'Sick leave', days: 10, paid: true, carry: false },
    { key: 'casual', name: 'Casual leave', days: 10, paid: true, carry: false },
    { key: 'unpaid', name: 'Unpaid leave', days: 0, paid: false, carry: false }],
  payroll: {
    pay_day: 1, auto_draft: true,
    components: [{ name: 'House rent', type: 'percent', value: 50 }, { name: 'Medical', type: 'fixed', value: 1500 }, { name: 'Transport', type: 'fixed', value: 1000 }],
    deductions: [{ name: 'Provident fund', type: 'percent', value: 0 }],
    tax: { type: 'none', value: 0, slabs: [] }, absent_deduction: true, late_count: 3, late_days: 1, leave_encashment: true },
  probation_months: 3, notice_days: 30,
  onboarding: ['Collect ID, photo and bank details', 'Sign the employment contract', 'Set up email and work tools', 'Introduce to the team', 'Read and accept company policies'],
  offboarding: ['Handover of work', 'Return laptop, ID card and keys', 'Remove access to email and systems', 'Exit interview', 'Final settlement', 'Issue experience letter'],
  hr_email: '', notify_candidates: true, notify_shortlist: true, auto_regret: false, celebrate: true, ai_shortlist: 70, webhook: '',
  // attendance from the employee app: office check-in only inside the office (location and/or office internet), field and branch visits from anywhere with a note
  checkin: { mode: 'manual', since: '', require_location: true, require_ip: false, offices: [], ips: [], allow_field: true, allow_branch: true },
  facebook: { page_id: '', token_enc: '' },
  careers_intro: 'Join our team. See our open positions below and apply in a few minutes.',
  letters: {
    offer: 'Dear {name},\n\nWe are pleased to offer you the position of {designation} at {company}, starting on {join_date}. Your monthly gross salary will be {salary}.\n\nYour first {probation_months} months will be a probation period. Please confirm your acceptance by replying to this offer.\n\nWe look forward to working with you.\n\n{company}',
    appointment: 'Date: {date}\n\nDear {name},\n\nWe are pleased to appoint you as {designation} in the {dept} department of {company}, with effect from {join_date}.\n\nYour monthly gross salary will be {salary}. You will be on probation for the first {probation_months} months, after which your appointment will be confirmed based on your performance.\n\nOffice hours are {office_hours}. You will report to {manager}. Your employee ID is {code}. Leave, attendance and other terms follow the company policies, which you can read in the employee app.\n\nPlease sign in to the employee app with your email to set up your account.\n\nWelcome to {company}.\n\nFor {company}\nHuman Resources',
    experience: 'To whom it may concern,\n\nThis is to certify that {name} worked at {company} as {designation} in the {dept} department from {join_date} to {last_day}.\n\nDuring this time, {name} was sincere and hardworking. We wish {name} every success in the future.\n\n{company}',
  },
};
export async function getSettings(env, aid) {
  const r = await one(env, 'SELECT data FROM hr_settings WHERE account_id = ?', aid);
  const d = J(r && r.data, {});
  return { ...DEFAULTS, ...d, payroll: { ...DEFAULTS.payroll, ...(d.payroll || {}), tax: { ...DEFAULTS.payroll.tax, ...((d.payroll || {}).tax || {}) } },
    letters: { ...DEFAULTS.letters, ...(d.letters || {}) }, checkin: { ...DEFAULTS.checkin, ...(d.checkin || {}) }, facebook: { ...DEFAULTS.facebook, ...(d.facebook || {}) } };
}
// what the HR screen sees (secrets masked)
export const settingsOut = S => ({ ...S, facebook: { page_id: S.facebook.page_id, token: S.facebook.token_enc ? '••••saved' : '' } });
export async function fbToken(env, S) { if (!S.facebook.token_enc) return ''; try { return (await decryptJSON(env, S.facebook.token_enc)).t || ''; } catch (e) { return ''; } }
const cleanList = (v, n = 50, len = 120) => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => str(x, len)).filter(Boolean).slice(0, n);
const part = (x, keys) => ({ name: str(x.name, 60), type: x.type === 'percent' ? 'percent' : 'fixed', value: Math.max(0, num(x.value)) });
export async function saveSettings(env, aid, b) {
  const cur = await getSettings(env, aid), S = { ...cur };
  if ('timezone' in b) { try { new Intl.DateTimeFormat('en', { timeZone: b.timezone }); S.timezone = str(b.timezone, 60); } catch (e) { throw err('Unknown time zone. Example: Asia/Dhaka, Europe/London.'); } }
  if ('currency' in b) S.currency = str(b.currency, 3).toUpperCase() || 'BDT';
  if ('work_days' in b) S.work_days = [...new Set((b.work_days || []).map(Number).filter(n => n >= 0 && n <= 6))].sort();
  for (const k of ['office_start', 'office_end']) if (k in b) { if (!/^\d{2}:\d{2}$/.test(b[k])) throw err('Office hours look like 09:00.'); S[k] = b[k]; }
  for (const k of ['late_after_min', 'probation_months', 'notice_days', 'ai_shortlist']) if (k in b) S[k] = Math.max(0, Math.round(num(b[k], cur[k])));
  if ('departments' in b) S.departments = cleanList(b.departments, 40, 60);
  if ('onboarding' in b) S.onboarding = cleanList(b.onboarding);
  if ('offboarding' in b) S.offboarding = cleanList(b.offboarding);
  if ('holidays' in b) S.holidays = (b.holidays || []).filter(h => h && DATE.test(h.date)).map(h => ({ date: h.date, name: str(h.name, 80) || 'Holiday' })).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 120);
  if ('leave_types' in b) {
    const seen = new Set();
    S.leave_types = (b.leave_types || []).map(t => ({ key: str(t.key || t.name, 30).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), name: str(t.name, 60), days: Math.max(0, num(t.days)), paid: t.paid !== false && t.paid !== 'false', carry: t.carry === true || t.carry === 'true' }))
      .filter(t => t.key && t.name && !seen.has(t.key) && seen.add(t.key)).slice(0, 20);
    if (!S.leave_types.length) throw err('Keep at least one leave type.');
  }
  if (b.payroll) {
    const p = b.payroll, P = { ...cur.payroll };
    if ('pay_day' in p) P.pay_day = Math.min(28, Math.max(1, Math.round(num(p.pay_day, 1))));
    for (const k of ['auto_draft', 'absent_deduction', 'leave_encashment']) if (k in p) P[k] = p[k] === true || p[k] === 'true';
    for (const k of ['late_count', 'late_days']) if (k in p) P[k] = Math.max(0, num(p[k]));
    if ('components' in p) P.components = (p.components || []).map(part).filter(x => x.name).slice(0, 20);
    if ('deductions' in p) P.deductions = (p.deductions || []).map(part).filter(x => x.name).slice(0, 20);
    if (p.tax) P.tax = { type: ['none', 'percent', 'slabs'].includes(p.tax.type) ? p.tax.type : 'none', value: Math.max(0, num(p.tax.value)),
      slabs: (p.tax.slabs || []).map(x => ({ upto: Math.max(0, num(x.upto)), rate: Math.max(0, num(x.rate)) })).slice(0, 12) };
    S.payroll = P;
  }
  if ('hr_email' in b) { if (b.hr_email && !EMAIL.test(str(b.hr_email))) throw err('HR email is not valid.'); S.hr_email = str(b.hr_email, 120); }
  for (const k of ['notify_candidates', 'celebrate']) if (k in b) S[k] = b[k] === true || b[k] === 'true';
  if ('webhook' in b) { if (b.webhook && !/^https:\/\//.test(b.webhook)) throw err('The webhook must start with https://'); S.webhook = str(b.webhook, 400); }
  if ('careers_intro' in b) S.careers_intro = str(b.careers_intro, 1000);
  if (b.letters) S.letters = { offer: str(b.letters.offer ?? cur.letters.offer, 5000), appointment: str(b.letters.appointment ?? cur.letters.appointment, 6000), experience: str(b.letters.experience ?? cur.letters.experience, 5000) };
  for (const k of ['notify_shortlist', 'auto_regret']) if (k in b) S[k] = b[k] === true || b[k] === 'true';
  if (b.checkin) {
    const c = b.checkin, P = { ...cur.checkin };
    if ('mode' in c) { P.mode = c.mode === 'app' ? 'app' : 'manual'; if (P.mode === 'app' && cur.checkin.mode !== 'app') P.since = todayIn(S.timezone); }
    for (const k of ['require_location', 'require_ip', 'allow_field', 'allow_branch']) if (k in c) P[k] = c[k] === true || c[k] === 'true';
    if ('offices' in c) P.offices = (c.offices || []).map(o => ({ name: str(o.name, 60), lat: num(o.lat, NaN), lng: num(o.lng, NaN), radius: Math.min(5000, Math.max(30, Math.round(num(o.radius, 150)))) }))
      .filter(o => o.name || Number.isFinite(o.lat)).map(o => { if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng) || Math.abs(o.lat) > 90 || Math.abs(o.lng) > 180) throw err(`Add the map location of ${o.name || 'each office'} (use “Use my current location” while you are in the office).`); return { ...o, name: o.name || 'Office' }; }).slice(0, 30);
    if ('ips' in c) P.ips = cleanList(c.ips, 40, 60).map(x => { if (!ipRule(x)) throw err(`“${x}” is not an IP address. Example: 103.12.34.56 or 103.12.34.0/24`); return x; });
    if (P.require_location && !P.offices.length && P.mode === 'app') throw err('Add at least one office location, or turn off the location check.');
    if (P.require_ip && !P.ips.length && P.mode === 'app') throw err('Add your office internet IP, or turn off the IP check.');
    S.checkin = P;
  }
  if (b.facebook) {
    const f = b.facebook;
    S.facebook = { page_id: str(f.page_id ?? cur.facebook.page_id, 40).replace(/\D/g, ''), token_enc: cur.facebook.token_enc };
    if (f.token === '') S.facebook.token_enc = '';
    else if (f.token && !String(f.token).startsWith('••••')) S.facebook.token_enc = await encryptJSON(env, { t: str(f.token, 600) });
  }
  await run(env, 'INSERT INTO hr_settings(account_id, data, updated_at) VALUES(?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at', aid, JSON.stringify(S), now());
  return S;
}
export const isHoliday = (S, d) => (S.holidays.find(h => h.date === d) || {}).name || '';
export const isWorkday = (S, d) => S.work_days.includes(weekday(d)) && !isHoliday(S, d);
export const workingDays = (S, a, b) => range(a, b).filter(d => isWorkday(S, d));

// ---------------------------------------------------------------- log + events
export async function hrLog(env, aid, actor, text) {
  await run(env, 'INSERT INTO hr_log(account_id, actor, text, at) VALUES(?,?,?,?)', aid, str(actor, 80) || 'System', str(text, 300), now());
}
// Every important change is also sent to the company's own n8n (optional), for WhatsApp alerts and anything else.
export async function emit(env, a, S, event, data) {
  if (!S.webhook) return;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    await fetch(S.webhook, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, company: a.company, client_id: a.client_id, at: new Date().toISOString(), data }) });
    clearTimeout(t);
  } catch (e) { /* the company's webhook is optional */ }
}

// ---------------------------------------------------------------- employees
const ACTIVE = ['probation', 'active', 'notice'];
export const STATUSES = ['probation', 'active', 'notice', 'exited'];
export function empOut(e, { full = true } = {}) {
  if (!e) return null;
  const o = { id: e.id, code: e.code, name: e.name, email: e.email, phone: e.phone, dept: e.dept, designation: e.designation, manager_id: e.manager_id, emp_type: e.emp_type,
    status: e.status, join_date: e.join_date, probation_end: e.probation_end, contract_end: e.contract_end, dob: e.dob, gender: e.gender, has_login: !!e.login_enabled,
    invited: !!e.invite_token && !e.login_enabled, last_login: e.last_login };
  if (full) Object.assign(o, { address: e.address, emergency: e.emergency, bank: J(e.bank, {}), salary: J(e.salary, {}), exit: J(e.exit, {}), applicant_id: e.applicant_id, created_at: e.created_at });
  return o;
}
export const listEmployees = (env, aid) => all(env, "SELECT * FROM hr_employees WHERE account_id = ? ORDER BY CASE status WHEN 'exited' THEN 1 ELSE 0 END, name", aid);
export const getEmp = (env, aid, id) => one(env, 'SELECT * FROM hr_employees WHERE id = ? AND account_id = ?', Number(id), aid);
export const activeEmployees = async (env, aid) => (await listEmployees(env, aid)).filter(e => ACTIVE.includes(e.status));
export async function saveEmployee(env, a, S, b, id, { limit = 0 } = {}) {
  const cur = id ? await getEmp(env, a.id, id) : null;
  if (id && !cur) throw err('Employee not found', 404);
  const name = str(b.name ?? (cur && cur.name), 100);
  if (!name) throw err('Add the employee’s name.');
  const email = str(b.email ?? (cur && cur.email), 120).toLowerCase();
  if (email && !EMAIL.test(email)) throw err('The email is not valid.');
  if (email) {
    const dup = await one(env, "SELECT id FROM hr_employees WHERE account_id = ? AND email = ? AND id != ? AND status != 'exited'", a.id, email, cur ? cur.id : 0);
    if (dup) throw err('Another employee already uses this email.');
  }
  const join = str(b.join_date ?? (cur && cur.join_date), 10) || todayIn(S.timezone);
  if (!DATE.test(join)) throw err('Joining date looks like 2026-01-31.');
  for (const k of ['probation_end', 'contract_end', 'dob']) if (b[k] && !DATE.test(b[k])) throw err('Dates look like 2026-01-31.');
  const mgr = b.manager_id === '' || b.manager_id == null ? (b.manager_id === '' ? null : cur ? cur.manager_id : null) : Number(b.manager_id);
  if (mgr && (mgr === (cur && cur.id) || !(await getEmp(env, a.id, mgr)))) throw err('Choose a different manager.');
  const salary = b.salary ? { basic: Math.max(0, num(b.salary.basic)), extra: (b.salary.extra || []).map(x => ({ name: str(x.name, 60), amount: Math.max(0, num(x.amount)) })).filter(x => x.name).slice(0, 10) } : J(cur && cur.salary, { basic: 0, extra: [] });
  const bank = b.bank ? { method: str(b.bank.method, 30), bank: str(b.bank.bank, 80), branch: str(b.bank.branch, 80), account_name: str(b.bank.account_name, 100), account_no: str(b.bank.account_no, 40), mobile: str(b.bank.mobile, 20) } : J(cur && cur.bank, {});
  const v = {
    name, email, phone: str(b.phone ?? (cur && cur.phone), 30), dept: str(b.dept ?? (cur && cur.dept), 60), designation: str(b.designation ?? (cur && cur.designation), 80),
    manager_id: mgr || null, emp_type: ['full-time', 'part-time', 'contract', 'intern'].includes(b.emp_type) ? b.emp_type : (cur ? cur.emp_type : 'full-time'),
    join_date: join, probation_end: str(b.probation_end ?? (cur && cur.probation_end), 10), contract_end: str(b.contract_end ?? (cur && cur.contract_end), 10),
    dob: str(b.dob ?? (cur && cur.dob), 10), gender: str(b.gender ?? (cur && cur.gender), 20), address: str(b.address ?? (cur && cur.address), 300), emergency: str(b.emergency ?? (cur && cur.emergency), 200),
    bank: JSON.stringify(bank), salary: JSON.stringify(salary),
  };
  if (cur) {
    let status = cur.status;
    if (b.status && STATUSES.includes(b.status) && b.status !== 'exited' && cur.status !== 'exited') status = b.status;
    await run(env, `UPDATE hr_employees SET name=?, email=?, phone=?, dept=?, designation=?, manager_id=?, emp_type=?, join_date=?, probation_end=?, contract_end=?, dob=?, gender=?, address=?, emergency=?, bank=?, salary=?, status=?, updated_at=? WHERE id=?`,
      v.name, v.email, v.phone, v.dept, v.designation, v.manager_id, v.emp_type, v.join_date, v.probation_end, v.contract_end, v.dob, v.gender, v.address, v.emergency, v.bank, v.salary, status, now(), cur.id);
    return getEmp(env, a.id, cur.id);
  }
  if (limit > 0 && (await activeEmployees(env, a.id)).length >= limit) throw err(`Your plan covers ${limit} employees. Upgrade the plan on the Subscription tab to add more.`);
  if (!v.probation_end && S.probation_months > 0) v.probation_end = addMonths(join, S.probation_months);
  const n = (await one(env, 'SELECT COUNT(*) AS n FROM hr_employees WHERE account_id = ?', a.id)).n + 1;
  const code = str(b.code, 20) || 'E' + String(n).padStart(3, '0');
  const status = S.probation_months > 0 && b.status !== 'active' ? 'probation' : 'active';
  const r = await run(env, `INSERT INTO hr_employees(account_id, code, name, email, phone, dept, designation, manager_id, emp_type, status, join_date, probation_end, contract_end, dob, gender, address, emergency, bank, salary, applicant_id, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, a.id, code, v.name, v.email, v.phone, v.dept, v.designation, v.manager_id, v.emp_type, status, v.join_date, v.probation_end,
    v.contract_end, v.dob, v.gender, v.address, v.emergency, v.bank, v.salary, b.applicant_id || null, now(), now());
  const e = await getEmp(env, a.id, r.meta.last_row_id);
  if (diffDays(e.join_date, todayIn(S.timezone)) <= 30) await addTasks(env, a.id, e, 'onboarding', S.onboarding, e.join_date);
  return e;
}
export async function addTasks(env, aid, e, kind, titles, due) {
  for (const t of titles) await run(env, 'INSERT INTO hr_tasks(account_id, employee_id, kind, title, owner, due, created_at) VALUES(?,?,?,?,?,?,?)', aid, e.id, kind, t,
    /accept company policies|read and accept/i.test(t) ? 'employee' : 'hr', due || '', now());
}
export async function startExit(env, a, S, id, b) {
  const e = await getEmp(env, a.id, id);
  if (!e) throw err('Employee not found', 404);
  if (e.status === 'exited') throw err('This employee has already left.');
  const type = ['resignation', 'termination', 'contract end', 'retirement', 'other'].includes(b.type) ? b.type : 'resignation';
  const notice = DATE.test(b.notice_date || '') ? b.notice_date : todayIn(S.timezone);
  const last = DATE.test(b.last_day || '') ? b.last_day : addDays(notice, S.notice_days);
  if (last < notice) throw err('The last working day is before the notice date.');
  const exit = { type, notice_date: notice, last_day: last, reason: str(b.reason, 1000), rehire: b.rehire !== false && b.rehire !== 'false' };
  await run(env, "UPDATE hr_employees SET status = 'notice', exit = ?, updated_at = ? WHERE id = ?", JSON.stringify(exit), now(), e.id);
  const open = await one(env, "SELECT id FROM hr_tasks WHERE employee_id = ? AND kind = 'offboarding'", e.id);
  if (!open) await addTasks(env, a.id, e, 'offboarding', S.offboarding, last);
  return getEmp(env, a.id, e.id);
}
export async function finishExit(env, a, e) {
  await run(env, "UPDATE hr_employees SET status = 'exited', login_enabled = 0, invite_token = '', updated_at = ? WHERE id = ?", now(), e.id);
}

// ---------------------------------------------------------------- attendance (HR enters it; leave, holidays and weekends fill in by themselves)
export const ATT = { P: 'Present', L: 'Late', H: 'Half day', A: 'Absent' };
const employedOn = (e, d) => { if (!e.join_date || e.join_date > d) return false; const last = J(e.exit, {}).last_day; if (last && last < d) return false; return !(e.status === 'exited' && !last); };
export async function approvedLeaves(env, aid, from, to, empId) {
  return all(env, `SELECT * FROM hr_leaves WHERE account_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ? ${empId ? 'AND employee_id = ?' : ''}`, aid, to, from, ...(empId ? [empId] : []));
}
// What a day was for one employee: entered status, leave, holiday, weekend, or '' (not entered = counted as present).
export function dayStatus(S, e, d, rec, leaves) {
  if (!employedOn(e, d)) return { code: '-', label: 'Not employed' };
  const lv = leaves.find(l => l.employee_id === e.id && l.start_date <= d && l.end_date >= d && isWorkday(S, d));
  if (lv) { const t = S.leave_types.find(x => x.key === lv.type); return { code: 'LV', label: (t ? t.name : 'Leave') + (lv.half ? ' (half)' : ''), paid: t ? t.paid : true, half: !!lv.half, type: lv.type }; }
  const h = isHoliday(S, d);
  if (h) return { code: 'HO', label: h };
  if (!S.work_days.includes(weekday(d))) return { code: 'WE', label: 'Weekend' };
  if (rec) return { code: rec.status, label: ATT[rec.status] || rec.status, in_time: rec.in_time, out_time: rec.out_time, note: rec.note,
    source: rec.source || '', kind: rec.kind || '', place: rec.place || '', geo: J(rec.geo, {}) };
  const C0 = S.checkin;
  if (C0.mode === 'app' && C0.since && d >= C0.since && d < todayIn(S.timezone)) return { code: 'A', label: 'No check-in', auto: true };
  return { code: '', label: C0.mode === 'app' ? 'Not checked in' : 'Not marked' };
}
export async function attendanceDay(env, aid, S, d) {
  if (!DATE.test(d)) throw err('Choose a date.');
  const emps = (await listEmployees(env, aid)).filter(e => employedOn(e, d));
  const recs = await all(env, 'SELECT * FROM hr_attendance WHERE account_id = ? AND date = ?', aid, d);
  const leaves = await approvedLeaves(env, aid, d, d);
  return { date: d, workday: isWorkday(S, d), holiday: isHoliday(S, d), weekend: !S.work_days.includes(weekday(d)),
    rows: emps.map(e => ({ employee: empOut(e, { full: false }), ...dayStatus(S, e, d, recs.find(r => r.employee_id === e.id), leaves) })) };
}
export async function saveAttendance(env, aid, d, rows) {
  if (!DATE.test(d)) throw err('Choose a date.');
  let n = 0;
  for (const r of (rows || []).slice(0, 2000)) {
    const e = await getEmp(env, aid, r.employee_id);
    if (!e) continue;
    if (!r.status) { await run(env, 'DELETE FROM hr_attendance WHERE employee_id = ? AND date = ?', e.id, d); continue; }
    if (!ATT[r.status]) throw err('Unknown attendance status.');
    const t = x => /^\d{2}:\d{2}$/.test(x || '') ? x : '';
    await run(env, `INSERT INTO hr_attendance(account_id, employee_id, date, status, in_time, out_time, note, updated_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, in_time = excluded.in_time, out_time = excluded.out_time, note = excluded.note, updated_at = excluded.updated_at`,
      aid, e.id, d, r.status, t(r.in_time), t(r.out_time), str(r.note, 200), now());
    n++;
  }
  return n;
}
// ---------------------------------------------------------------- check-in from the employee app
// IP rules: exact (103.12.34.56), IPv4 range (103.12.34.0/24) or IPv6 prefix (2401:db00:: style, matched by start).
function ipRule(x) {
  if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(x)) return { v: 4, x };
  if (/^[0-9a-f:]+(\/\d{1,3})?$/i.test(x) && x.includes(':')) return { v: 6, x };
  return null;
}
const ip4 = s => s.split('.').reduce((n, p) => n * 256 + (+p), 0);
export function ipAllowed(list, ip) {
  ip = String(ip || '').trim();
  if (!ip) return false;
  return list.some(rule => {
    if (rule.includes('.') && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      const [base, bits] = rule.split('/'); const b = bits == null ? 32 : +bits;
      if (b === 0) return true;
      const mask = b >= 32 ? 0xffffffff : (0xffffffff << (32 - b)) >>> 0;
      return ((ip4(ip) & mask) >>> 0) === ((ip4(base) & mask) >>> 0);
    }
    if (rule.includes(':') && ip.includes(':')) { const base = rule.split('/')[0].toLowerCase().replace(/:+$/, ''); return ip.toLowerCase() === rule.toLowerCase() || ip.toLowerCase().startsWith(base + ':'); }
    return false;
  });
}
export function metres(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const nowHM = tz => new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const addMin = (hm, m) => { const t = +hm.slice(0, 2) * 60 + +hm.slice(3, 5) + m; return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
// Is this phone inside an office? Checks only what the company turned on.
export function officeCheck(S, pos, ip) {
  const c = S.checkin, out = { ok: true, ip_ok: null, office: null, distance: null, reasons: [] };
  if (c.require_ip) { out.ip_ok = ipAllowed(c.ips, ip); if (!out.ip_ok) { out.ok = false; out.reasons.push('You are not on the office internet (Wi-Fi). Connect to the office Wi-Fi and try again.'); } }
  if (c.require_location) {
    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) { out.ok = false; out.reasons.push('Your location is needed. Allow location for this app and try again.'); }
    else {
      const acc = Math.min(Math.max(0, num(pos.acc, 0)), 100);
      const near = c.offices.map(o => ({ o, d: metres(pos, o) })).sort((x, y) => x.d - y.d)[0];
      if (near) { out.office = near.o.name; out.distance = near.d; }
      if (!near || near.d - acc > near.o.radius) { out.ok = false; out.reasons.push(near ? `You are about ${near.d >= 1000 ? (near.d / 1000).toFixed(1) + ' km' : near.d + ' m'} from ${near.o.name}. Office check-in works only inside the office.` : 'No office location is set up yet. Ask HR.'); }
    }
  } else if (c.offices.length && pos && Number.isFinite(pos.lat)) {
    const near = c.offices.map(o => ({ o, d: metres(pos, o) })).sort((x, y) => x.d - y.d)[0]; out.office = near.o.name; out.distance = near.d;
  }
  return out;
}
export async function checkinToday(env, S, e) {
  const today = todayIn(S.timezone);
  const rec = await one(env, 'SELECT * FROM hr_attendance WHERE employee_id = ? AND date = ?', e.id, today);
  return rec ? { ...rec, geo: J(rec.geo, {}) } : null;
}
const posOf = b => ({ lat: num(b.lat, NaN), lng: num(b.lng, NaN), acc: Math.round(num(b.acc, 0)) });
export async function checkIn(env, a, S, e, b, ip) {
  const c = S.checkin, today = todayIn(S.timezone), kind = ['office', 'field', 'branch'].includes(b.kind) ? b.kind : 'office';
  if (c.mode !== 'app') throw err('Your company records attendance in the HR office. You don’t need to check in here.');
  const cur = await checkinToday(env, S, e);
  if (cur && cur.in_time) throw err(`You already checked in today at ${cur.in_time}.`);
  const lv = (await approvedLeaves(env, a.id, today, today, e.id))[0];
  if (lv && !lv.half) throw err('You are on leave today.');
  const pos = posOf(b), note = str(b.note, 300), place = str(b.place, 60);
  let chk = { ok: true };
  if (kind === 'office') { chk = officeCheck(S, pos, ip); if (!chk.ok) throw err(chk.reasons.join(' ')); }
  else {
    if (kind === 'field' && !c.allow_field) throw err('Field visit check-in is turned off. Ask HR.');
    if (kind === 'branch' && !c.allow_branch) throw err('Branch visit check-in is turned off. Ask HR.');
    if (!note) throw err(kind === 'field' ? 'Write where you are going and why (for example: Client meeting at ABC Ltd, Motijheel).' : 'Write which branch and the reason for the visit.');
    if (!Number.isFinite(pos.lat)) throw err('Your location is needed for a visit check-in. Allow location for this app and try again.');
  }
  const t = nowHM(S.timezone), late = t > addMin(S.office_start, S.late_after_min);
  const geo = { in: { lat: Number.isFinite(pos.lat) ? pos.lat : null, lng: Number.isFinite(pos.lng) ? pos.lng : null, acc: pos.acc, ip: str(ip, 60), office: chk.office || null, distance: chk.distance ?? null, at: now() } };
  const status = late ? 'L' : 'P', placeName = kind === 'office' ? (chk.office || '') : place;
  await run(env, `INSERT INTO hr_attendance(account_id, employee_id, date, status, in_time, out_time, note, source, kind, place, geo, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, in_time = excluded.in_time, note = excluded.note, source = excluded.source, kind = excluded.kind, place = excluded.place, geo = excluded.geo, updated_at = excluded.updated_at`,
    a.id, e.id, today, status, t, '', note, 'app', kind, placeName, JSON.stringify(geo), now());
  return { rec: await checkinToday(env, S, e), late };
}
export async function checkOut(env, a, S, e, b, ip) {
  if (S.checkin.mode !== 'app') throw err('Your company records attendance in the HR office.');
  const cur = await checkinToday(env, S, e);
  if (!cur || !cur.in_time) throw err('Check in first.');
  if (cur.out_time) throw err(`You already checked out at ${cur.out_time}.`);
  const pos = posOf(b), t = nowHM(S.timezone);
  // leaving is never blocked; a check-out outside the office is shown to HR
  const chk = cur.kind === 'office' ? officeCheck(S, pos, ip) : { ok: true };
  const geo = { ...cur.geo, out: { lat: Number.isFinite(pos.lat) ? pos.lat : null, lng: Number.isFinite(pos.lng) ? pos.lng : null, acc: pos.acc, ip: str(ip, 60), outside: !chk.ok, distance: chk.distance ?? null, at: now() } };
  const note = str(b.note, 300);
  await run(env, 'UPDATE hr_attendance SET out_time = ?, geo = ?, note = CASE WHEN ? = \'\' THEN note ELSE TRIM(note || \' · \' || ?) END, updated_at = ? WHERE employee_id = ? AND date = ?',
    t, JSON.stringify(geo), note, note, now(), e.id, cur.date);
  return { rec: await checkinToday(env, S, e), outside: !chk.ok };
}

// Counts for one employee in one month (also used by payroll).
export function monthCounts(S, e, days, recs, leaves) {
  const c = { workdays: 0, employed_workdays: 0, present: 0, late: 0, half: 0, absent: 0, paid_leave: 0, unpaid_leave: 0, holidays: 0, unmarked: 0 };
  for (const d of days) {
    const st = dayStatus(S, e, d, recs.find(r => r.employee_id === e.id && r.date === d), leaves);
    if (isWorkday(S, d)) c.workdays++;
    if (st.code === '-') continue;
    if (st.code === 'HO') { c.holidays++; continue; }
    if (st.code === 'WE') continue;
    c.employed_workdays++;
    if (st.code === 'LV') { const k = st.half ? 0.5 : 1; if (st.paid) c.paid_leave += k; else c.unpaid_leave += k; if (st.half) c.present += 0.5; continue; }
    if (st.code === 'A') c.absent++;
    else if (st.code === 'H') { c.half++; c.present += 0.5; }
    else if (st.code === 'L') { c.late++; c.present++; }
    else if (st.code === 'P') c.present++;
    else { c.unmarked++; c.present++; }
  }
  return c;
}
export async function attendanceMonth(env, aid, S, m, empId) {
  if (!MONTH.test(m)) throw err('Choose a month.');
  const days = monthDays(m), emps = (await listEmployees(env, aid)).filter(e => (!empId || e.id === Number(empId)) && days.some(d => employedOn(e, d)));
  const recs = await all(env, 'SELECT * FROM hr_attendance WHERE account_id = ? AND date BETWEEN ? AND ?', aid, days[0], days[days.length - 1]);
  const leaves = await approvedLeaves(env, aid, days[0], days[days.length - 1]);
  return { month: m, days, rows: emps.map(e => ({ employee: empOut(e, { full: false }), counts: monthCounts(S, e, days, recs, leaves),
    days: days.map(d => { const s = dayStatus(S, e, d, recs.find(r => r.employee_id === e.id && r.date === d), leaves); return { date: d, code: s.code, label: s.label }; }) })) };
}

// ---------------------------------------------------------------- leave
export function leaveDays(S, start, end, half) {
  const n = workingDays(S, start, end).length;
  return half ? Math.min(0.5, n * 0.5) : n;
}
export async function balances(env, aid, S, e, year) {
  year = year || todayIn(S.timezone).slice(0, 4);
  const rows = await all(env, "SELECT type, start_date, days, status FROM hr_leaves WHERE employee_id = ? AND status IN ('approved','pending') AND (substr(start_date,1,4) = ? OR substr(start_date,1,4) = ?)", e.id, year, String(+year - 1));
  return S.leave_types.map(t => {
    const used = rows.filter(r => r.type === t.key && r.status === 'approved' && r.start_date.startsWith(year)).reduce((x, r) => x + r.days, 0);
    const pending = rows.filter(r => r.type === t.key && r.status === 'pending' && r.start_date.startsWith(year)).reduce((x, r) => x + r.days, 0);
    // first year: entitlement from the joining month; carry forward unused days from last year (up to one year's entitlement)
    let ent = t.days;
    if (e.join_date.startsWith(year)) ent = Math.round(t.days * (13 - Number(e.join_date.slice(5, 7))) / 12 * 2) / 2;
    let carry = 0;
    if (t.carry && t.days > 0 && e.join_date < year + '-01-01') {
      const prev = String(+year - 1), lastUsed = rows.filter(r => r.type === t.key && r.status === 'approved' && r.start_date.startsWith(prev)).reduce((x, r) => x + r.days, 0);
      const prevEnt = e.join_date.startsWith(prev) ? Math.round(t.days * (13 - Number(e.join_date.slice(5, 7))) / 12 * 2) / 2 : t.days;
      carry = Math.max(0, Math.min(t.days, prevEnt - lastUsed));
    }
    const total = t.days > 0 ? ent + carry : null;
    return { key: t.key, name: t.name, paid: t.paid, entitled: total, carried: carry, used, pending, left: total == null ? null : round2(total - used - pending) };
  });
}
export async function applyLeave(env, aid, S, e, b, { by = 'employee', approve = false } = {}) {
  const t = S.leave_types.find(x => x.key === b.type);
  if (!t) throw err('Choose a leave type.');
  const start = str(b.start_date, 10), end = str(b.end_date || b.start_date, 10), half = b.half === true || b.half === 'true';
  if (!DATE.test(start) || !DATE.test(end) || end < start) throw err('Check the dates.');
  if (half && start !== end) throw err('A half day is one date only.');
  if (diffDays(start, end) > 90) throw err('One request can be 90 days at most.');
  const days = leaveDays(S, start, end, half);
  if (!days) throw err('Those dates are all weekends or holidays.');
  const clash = await one(env, "SELECT id FROM hr_leaves WHERE employee_id = ? AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ?", e.id, end, start);
  if (clash) throw err('There is already a leave request on these dates.');
  if (t.days > 0) {
    const bal = (await balances(env, aid, S, e, start.slice(0, 4))).find(x => x.key === t.key);
    if (bal && bal.left != null && days > bal.left) throw err(`Only ${bal.left} day${bal.left === 1 ? '' : 's'} of ${t.name} left this year.`);
  }
  const status = approve ? 'approved' : 'pending';
  const r = await run(env, `INSERT INTO hr_leaves(account_id, employee_id, type, start_date, end_date, half, days, reason, status, approver_id, decided_by, decided_at, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    aid, e.id, t.key, start, end, half ? 1 : 0, days, str(b.reason, 500), status, e.manager_id || null, approve ? by : '', approve ? now() : 0, now());
  return one(env, 'SELECT * FROM hr_leaves WHERE id = ?', r.meta.last_row_id);
}
export async function decideLeave(env, aid, id, ok, by, note = '') {
  const l = await one(env, 'SELECT * FROM hr_leaves WHERE id = ? AND account_id = ?', Number(id), aid);
  if (!l) throw err('Leave request not found', 404);
  if (l.status !== 'pending' && !(l.status === 'approved' && !ok)) throw err('This request is already ' + l.status + '.');
  await run(env, 'UPDATE hr_leaves SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?', ok ? 'approved' : (l.status === 'approved' ? 'cancelled' : 'rejected'), str(by, 80), now(), str(note, 300), l.id);
  return one(env, 'SELECT * FROM hr_leaves WHERE id = ?', l.id);
}
export async function listLeaves(env, aid, { status, empId, from } = {}) {
  const w = ['l.account_id = ?'], a = [aid];
  if (status) { w.push('l.status = ?'); a.push(status); }
  if (empId) { w.push('l.employee_id = ?'); a.push(Number(empId)); }
  if (from) { w.push('l.end_date >= ?'); a.push(from); }
  return all(env, `SELECT l.*, e.name AS employee_name, e.dept AS dept FROM hr_leaves l JOIN hr_employees e ON e.id = l.employee_id WHERE ${w.join(' AND ')} ORDER BY CASE l.status WHEN 'pending' THEN 0 ELSE 1 END, l.start_date DESC LIMIT 300`, ...a);
}

// ---------------------------------------------------------------- payroll
const amountOf = (x, basic) => x.type === 'percent' ? basic * x.value / 100 : x.value;
export function grossOf(S, sal) {
  const basic = num(sal.basic);
  const parts = [{ name: 'Basic', amount: basic }, ...S.payroll.components.map(c => ({ name: c.name, amount: round2(amountOf(c, basic)) })), ...(sal.extra || []).map(x => ({ name: x.name, amount: num(x.amount) }))].filter(x => x.amount > 0 || x.name === 'Basic');
  return { basic, parts, gross: round2(parts.reduce((s, x) => s + x.amount, 0)) };
}
function taxFor(S, gross) {
  const t = S.payroll.tax;
  if (t.type === 'percent') return round2(gross * t.value / 100);
  if (t.type === 'slabs' && t.slabs.length) {
    let left = gross * 12, prev = 0, tax = 0;
    for (const s of [...t.slabs].sort((x, y) => (x.upto || Infinity) - (y.upto || Infinity))) {
      const cap = s.upto > 0 ? s.upto : Infinity, band = Math.max(0, Math.min(left, cap - prev));
      tax += band * s.rate / 100; left -= band; prev = cap;
      if (left <= 0) break;
    }
    return round2(tax / 12);
  }
  return 0;
}
// One employee's payslip for a month: salary structure + attendance + one-off adjustments.
export function computeSlip(S, e, m, counts, adjust = []) {
  const sal = J(e.salary, {}), g = grossOf(S, sal), P = S.payroll;
  const lateDays = P.late_count > 0 ? Math.floor(counts.late / P.late_count) * P.late_days : 0;
  const notEmployed = Math.max(0, counts.workdays - counts.employed_workdays);
  const unpaid = (P.absent_deduction ? counts.absent + counts.half * 0.5 + lateDays : 0) + counts.unpaid_leave + notEmployed;
  const perDay = counts.workdays ? g.gross / counts.workdays : 0;
  const lop = round2(Math.min(g.gross, perDay * unpaid));
  const deductions = [];
  if (lop > 0) deductions.push({ name: `Unpaid days (${round2(unpaid)})`, amount: lop });
  for (const x of P.deductions) { const v = round2(amountOf(x, g.basic)); if (v > 0) deductions.push({ name: x.name, amount: v }); }
  const tax = taxFor(S, g.gross);
  if (tax > 0) deductions.push({ name: 'Income tax', amount: tax });
  const earnings = [...g.parts];
  for (const x of adjust) { const v = round2(num(x.amount)); if (!v || !x.name) continue; if (x.kind === 'deduction') deductions.push({ name: x.name, amount: v }); else earnings.push({ name: x.name, amount: v }); }
  const gross = round2(earnings.reduce((s, x) => s + x.amount, 0)), ded = round2(deductions.reduce((s, x) => s + x.amount, 0));
  return { month: m, earnings, deductions, gross, deductions_total: ded, net: round2(Math.max(0, gross - ded)), days: { ...counts, late_deduct_days: lateDays, unpaid_days: round2(unpaid), per_day: round2(perDay) },
    employee: { code: e.code, name: e.name, designation: e.designation, dept: e.dept, join_date: e.join_date, bank: J(e.bank, {}) }, currency: S.currency };
}
export async function buildRun(env, a, S, m) {
  if (!MONTH.test(m)) throw err('Choose a month.');
  let r = await one(env, 'SELECT * FROM hr_runs WHERE account_id = ? AND month = ?', a.id, m);
  if (r && r.status !== 'draft') throw err('Payroll for this month is already approved.');
  if (!r) { await run(env, 'INSERT INTO hr_runs(account_id, month, created_at) VALUES(?,?,?)', a.id, m, now()); r = await one(env, 'SELECT * FROM hr_runs WHERE account_id = ? AND month = ?', a.id, m); }
  const days = monthDays(m);
  const emps = (await listEmployees(env, a.id)).filter(e => e.join_date <= days[days.length - 1] && days.some(d => employedOn(e, d)));
  const recs = await all(env, 'SELECT * FROM hr_attendance WHERE account_id = ? AND date BETWEEN ? AND ?', a.id, days[0], days[days.length - 1]);
  const leaves = await approvedLeaves(env, a.id, days[0], days[days.length - 1]);
  const old = await all(env, 'SELECT employee_id, adjust FROM hr_payslips WHERE run_id = ?', r.id);
  await run(env, 'DELETE FROM hr_payslips WHERE run_id = ?', r.id);
  for (const e of emps) {
    const adjust = J((old.find(o => o.employee_id === e.id) || {}).adjust, []);
    const slip = computeSlip(S, e, m, monthCounts(S, e, days, recs, leaves), adjust);
    await run(env, 'INSERT INTO hr_payslips(run_id, account_id, employee_id, data, gross, deductions, net, adjust) VALUES(?,?,?,?,?,?,?,?)', r.id, a.id, e.id, JSON.stringify(slip), slip.gross, slip.deductions_total, slip.net, JSON.stringify(adjust));
  }
  return totals(env, r.id);
}
export async function totals(env, runId) {
  const t = await one(env, 'SELECT COUNT(*) AS people, COALESCE(SUM(gross),0) AS gross, COALESCE(SUM(deductions),0) AS deductions, COALESCE(SUM(net),0) AS net FROM hr_payslips WHERE run_id = ?', runId);
  await run(env, 'UPDATE hr_runs SET totals = ? WHERE id = ?', JSON.stringify(t), runId);
  return one(env, 'SELECT * FROM hr_runs WHERE id = ?', runId);
}
export async function setAdjust(env, a, S, runId, empId, adjust) {
  const r = await one(env, 'SELECT * FROM hr_runs WHERE id = ? AND account_id = ?', Number(runId), a.id);
  if (!r) throw err('Payroll not found', 404);
  if (r.status !== 'draft') throw err('This payroll is approved, so it can’t change.');
  const sl = await one(env, 'SELECT * FROM hr_payslips WHERE run_id = ? AND employee_id = ?', r.id, Number(empId));
  if (!sl) throw err('Payslip not found', 404);
  const adj = (adjust || []).map(x => ({ name: str(x.name, 60), kind: x.kind === 'deduction' ? 'deduction' : 'earning', amount: Math.max(0, num(x.amount)) })).filter(x => x.name && x.amount).slice(0, 10);
  const old = J(sl.data, {}), e = await getEmp(env, a.id, empId);
  const slip = computeSlip(S, e, r.month, old.days, adj);
  await run(env, 'UPDATE hr_payslips SET data = ?, gross = ?, deductions = ?, net = ?, adjust = ? WHERE id = ?', JSON.stringify(slip), slip.gross, slip.deductions_total, slip.net, JSON.stringify(adj), sl.id);
  return totals(env, r.id);
}
export const slipsOf = async (env, runId) => (await all(env, 'SELECT p.*, e.name, e.code, e.email, e.dept FROM hr_payslips p JOIN hr_employees e ON e.id = p.employee_id WHERE p.run_id = ? ORDER BY e.name', runId))
  .map(p => ({ ...p, data: J(p.data, {}), adjust: J(p.adjust, []) }));

// Final settlement when someone leaves: pay for days worked in the last month, unused annual leave, minus nothing else by default.
export async function settlement(env, a, S, e) {
  const ex = J(e.exit, {}), last = ex.last_day || todayIn(S.timezone), m = last.slice(0, 7);
  const days = monthDays(m).filter(d => d <= last);
  const recs = await all(env, 'SELECT * FROM hr_attendance WHERE employee_id = ? AND date BETWEEN ? AND ?', e.id, days[0], last);
  const leaves = await approvedLeaves(env, a.id, days[0], last, e.id);
  const full = monthDays(m), c = monthCounts(S, e, days, recs, leaves);
  c.workdays = full.filter(d => isWorkday(S, d)).length;
  const slip = computeSlip(S, e, m, c, []);
  const bal = await balances(env, a.id, S, e, last.slice(0, 4));
  const annual = bal.find(b => b.key === 'annual' || /annual/i.test(b.name));
  const g = grossOf(S, J(e.salary, {}));
  const enc = S.payroll.leave_encashment && annual && annual.left > 0 ? round2(annual.left * (g.basic / (c.workdays || 22))) : 0;
  return { last_day: last, month: m, salary: slip, leave_left: annual ? annual.left : 0, encashment: enc, total: round2(slip.net + enc) };
}

// ---------------------------------------------------------------- overview + reports
export async function overview(env, a, S) {
  const today = todayIn(S.timezone), emps = await listEmployees(env, a.id), act = emps.filter(e => ACTIVE.includes(e.status));
  const day = await attendanceDay(env, a.id, S, today);
  const marked = day.rows.filter(r => ['P', 'L', 'H', 'A'].includes(r.code));
  const onLeave = day.rows.filter(r => r.code === 'LV');
  const pending = await listLeaves(env, a.id, { status: 'pending' });
  const jobs = await all(env, "SELECT id, title FROM hr_jobs WHERE account_id = ? AND status = 'open'", a.id);
  const newApps = await all(env, "SELECT a.id, a.name, a.score, a.job_id, j.title FROM hr_applicants a JOIN hr_jobs j ON j.id = a.job_id WHERE a.account_id = ? AND a.stage = 'new' ORDER BY a.created_at DESC LIMIT 20", a.id);
  const interviews = (await all(env, "SELECT a.id, a.name, a.interview, j.title FROM hr_applicants a JOIN hr_jobs j ON j.id = a.job_id WHERE a.account_id = ? AND a.stage = 'interview'", a.id))
    .map(x => ({ ...x, interview: J(x.interview, {}) })).filter(x => x.interview.date >= today).sort((x, y) => (x.interview.date + x.interview.time).localeCompare(y.interview.date + y.interview.time)).slice(0, 8);
  const soon = (d, n) => d && d >= today && d <= addDays(today, n);
  const attention = [];
  for (const e of act) {
    if (e.status === 'probation' && e.probation_end && e.probation_end <= addDays(today, 14)) attention.push({ kind: 'probation', employee_id: e.id, text: `${e.name}: probation ${e.probation_end < today ? 'ended' : 'ends'}`, date: e.probation_end });
    if (soon(e.contract_end, 30)) attention.push({ kind: 'contract', employee_id: e.id, text: `${e.name}: contract ends`, date: e.contract_end });
    const ex = J(e.exit, {});
    if (e.status === 'notice' && ex.last_day) attention.push({ kind: 'exit', employee_id: e.id, text: `${e.name}: last working day`, date: ex.last_day });
  }
  const docs = await all(env, "SELECT f.id, f.name, f.expires_on, e.name AS emp, e.id AS employee_id FROM hr_files f JOIN hr_employees e ON e.id = f.owner_id WHERE f.account_id = ? AND f.owner_type = 'employee' AND f.expires_on != '' AND f.expires_on <= ? AND e.status != 'exited'", a.id, addDays(today, 30));
  for (const f of docs) attention.push({ kind: 'document', employee_id: f.employee_id, text: `${f.emp}: ${f.name} ${f.expires_on < today ? 'expired' : 'expires'}`, date: f.expires_on });
  attention.sort((x, y) => x.date.localeCompare(y.date));
  const md = (d) => d ? d.slice(5) : '';
  const celebrations = [];
  for (const e of act) {
    for (let k = 0; k < 14; k++) {
      const d = addDays(today, k);
      if (e.dob && md(e.dob) === md(d)) celebrations.push({ date: d, text: `${e.name}: birthday` });
      if (e.join_date && md(e.join_date) === md(d) && e.join_date.slice(0, 4) < d.slice(0, 4)) celebrations.push({ date: d, text: `${e.name}: ${+d.slice(0, 4) - +e.join_date.slice(0, 4)} year${+d.slice(0, 4) - +e.join_date.slice(0, 4) === 1 ? '' : 's'} at work` });
    }
  }
  const holidays = S.holidays.filter(h => soon(h.date, 30));
  const m = today.slice(0, 7), runRow = await one(env, 'SELECT * FROM hr_runs WHERE account_id = ? AND month = ?', a.id, m);
  const prev = await one(env, 'SELECT * FROM hr_runs WHERE account_id = ? ORDER BY month DESC LIMIT 1', a.id);
  const tasks = await all(env, "SELECT t.*, e.name AS emp FROM hr_tasks t JOIN hr_employees e ON e.id = t.employee_id WHERE t.account_id = ? AND t.done_at = 0 AND t.owner = 'hr' AND e.status != 'exited' ORDER BY t.due LIMIT 6", a.id);
  const tasks_open = (await one(env, "SELECT COUNT(*) AS n FROM hr_tasks t JOIN hr_employees e ON e.id = t.employee_id WHERE t.account_id = ? AND t.done_at = 0 AND t.owner = 'hr' AND e.status != 'exited'", a.id)).n;
  const log = await all(env, 'SELECT * FROM hr_log WHERE account_id = ? ORDER BY at DESC LIMIT 12', a.id);
  return { today, employees: act.length, probation: act.filter(e => e.status === 'probation').length, notice: act.filter(e => e.status === 'notice').length,
    workday: day.workday, holiday: day.holiday, marked: marked.length, present: marked.filter(r => r.code !== 'A').length + (day.workday ? day.rows.filter(r => r.code === '').length : 0),
    absent: marked.filter(r => r.code === 'A').length, late: marked.filter(r => r.code === 'L').length, unmarked: day.workday ? day.rows.filter(r => r.code === '').length : 0,
    on_leave: onLeave.map(r => ({ name: r.employee.name, label: r.label })), pending_leaves: pending.slice(0, 8), pending_count: pending.length,
    open_jobs: jobs.length, new_applicants: newApps, interviews, attention: attention.slice(0, 15), celebrations: celebrations.sort((x, y) => x.date.localeCompare(y.date)).slice(0, 8), holidays,
    payroll: runRow ? { id: runRow.id, month: runRow.month, status: runRow.status, totals: J(runRow.totals, {}) } : null, last_payroll: prev ? { id: prev.id, month: prev.month, status: prev.status } : null,
    tasks, tasks_open, log, currency: S.currency, depts: S.departments };
}
export async function reports(env, a, S) {
  const today = todayIn(S.timezone), emps = await listEmployees(env, a.id), act = emps.filter(e => ACTIVE.includes(e.status));
  const by = (list, f) => Object.entries(list.reduce((o, e) => { const k = f(e) || 'Not set'; o[k] = (o[k] || 0) + 1; return o; }, {})).map(([k, n]) => ({ k, n })).sort((x, y) => y.n - x.n);
  const months = []; for (let k = 11; k >= 0; k--) months.push(addMonths(today.slice(0, 7) + '-01', -k).slice(0, 7));
  const flow = months.map(m => ({ month: m, joined: emps.filter(e => e.join_date.startsWith(m)).length, left: emps.filter(e => (J(e.exit, {}).last_day || '').startsWith(m) && e.status === 'exited').length }));
  const runs = await all(env, "SELECT month, status, totals FROM hr_runs WHERE account_id = ? ORDER BY month DESC LIMIT 12", a.id);
  const att = await attendanceMonth(env, a.id, S, today.slice(0, 7));
  const tot = att.rows.reduce((o, r) => { for (const k of ['present', 'absent', 'late', 'paid_leave', 'unpaid_leave', 'employed_workdays']) o[k] = (o[k] || 0) + r.counts[k]; return o; }, {});
  const year = today.slice(0, 4);
  const leave = await all(env, "SELECT type, SUM(days) AS days FROM hr_leaves WHERE account_id = ? AND status = 'approved' AND substr(start_date,1,4) = ? GROUP BY type", a.id, year);
  const funnel = await all(env, 'SELECT stage, COUNT(*) AS n FROM hr_applicants WHERE account_id = ? GROUP BY stage', a.id);
  const left12 = flow.reduce((s, x) => s + x.left, 0);
  return { headcount: act.length, by_dept: by(act, e => e.dept), by_type: by(act, e => e.emp_type), by_status: by(act, e => e.status), flow,
    attrition: act.length ? Math.round(left12 / ((act.length + left12) || 1) * 1000) / 10 : 0,
    attendance: { month: today.slice(0, 7), ...tot, rate: tot.employed_workdays ? Math.round((tot.present / tot.employed_workdays) * 1000) / 10 : null },
    leave: leave.map(l => ({ ...l, name: (S.leave_types.find(t => t.key === l.type) || {}).name || l.type })), payroll: runs.map(r => ({ month: r.month, status: r.status, ...J(r.totals, {}) })).reverse(),
    funnel, currency: S.currency };
}
export const toCsv = rows => rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
