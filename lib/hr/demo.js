// Demo data, so a company can try everything from the web before adding real people. Everything it adds is marked and can be removed in one click.
import { all, one, run, now, getEmp, todayIn, addDays, monthDays, isWorkday, saveEmployee, saveSettings, getSettings, saveAttendance, applyLeave, hrLog, totals } from './core.js';
import { saveJob, addApplicant } from './recruit.js';
import * as A from '../auth.js';

export const DEMO_PASSWORD = 'demo1234';
const PEOPLE = [
  ['Tanvir Ahmed', 'Admin', 'General Manager', 90000, null, 'lead'],
  ['Farhana Akter', 'Sales', 'Sales Manager', 60000, 0, 'lead'],
  ['Rafiq Hasan', 'Sales', 'Sales Executive', 30000, 1],
  ['Mitu Rahman', 'Sales', 'Sales Executive', 28000, 1],
  ['Sadia Karim', 'Marketing', 'Marketing Lead', 55000, 0, 'lead'],
  ['Arif Chowdhury', 'Marketing', 'Content Executive', 32000, 4],
  ['Nadia Islam', 'Accounts', 'Accountant', 40000, 0, 'lead'],
  ['Sumi Begum', 'Admin', 'Office Assistant', 18000, 0],
];
let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

export async function demoInfo(env, a) {
  const list = await all(env, 'SELECT id, name, email, dept, designation FROM hr_employees WHERE account_id = ? AND demo = 1 ORDER BY id', a.id);
  return { on: list.length > 0, employees: list, password: DEMO_PASSWORD };
}
export async function addDemo(env, a) {
  if ((await demoInfo(env, a)).on) return demoInfo(env, a);
  let S = await getSettings(env, a.id);
  const today = todayIn(S.timezone), month = today.slice(0, 7);
  const depts = [...new Set([...S.departments, 'Admin', 'Sales', 'Marketing', 'Accounts'])];
  S = await saveSettings(env, a.id, { departments: depts });
  const { hash, salt } = await A.hashPassword(DEMO_PASSWORD);
  const ids = [], leads = {};
  for (const [i, [name, dept, designation, basic, mgr, lead]] of PEOPLE.entries()) {
    const join = addDays(today, -(120 + i * 70));
    const e = await saveEmployee(env, a, S, { name, email: `${name.split(' ')[0].toLowerCase()}@${a.client_id}.demo`, phone: '0171' + String(1000000 + i * 1371).slice(0, 7), dept, designation, join_date: join,
      manager_id: mgr == null ? '' : ids[mgr], salary: { basic, extra: [] }, dob: `199${i}-${String(i + 2).padStart(2, '0')}-1${i}` }, null, { limit: 0 });
    await run(env, "UPDATE hr_employees SET demo = 1, status = 'active', pass_hash = ?, pass_salt = ?, login_enabled = 1, invite_token = '' WHERE id = ?", hash, salt, e.id);
    await run(env, "UPDATE hr_tasks SET done_at = ? WHERE employee_id = ?", now(), e.id);
    ids.push(e.id); if (lead) leads[dept] = e.id;
  }
  S = await saveSettings(env, a.id, { team_leads: { ...S.team_leads, ...leads } });
  // attendance for this month so far (HR entered), and today's check-ins from the app
  for (const d of monthDays(month).filter(d => d < today && isWorkday(S, d))) {
    await saveAttendance(env, a.id, d, ids.map(id => { const r = rnd(); const st = r < 0.04 ? 'A' : r < 0.14 ? 'L' : r < 0.16 ? 'H' : 'P';
      return { employee_id: id, status: st, in_time: st === 'A' ? '' : st === 'L' ? '09:' + (20 + Math.floor(rnd() * 30)) : '08:' + (45 + Math.floor(rnd() * 14)), out_time: st === 'A' ? '' : '18:0' + Math.floor(rnd() * 9) }; }));
  }
  if (isWorkday(S, today)) {
    const off = S.checkin.offices[0] || { name: 'Head office', lat: 23.7925, lng: 90.4078 };
    const rows = [[0, 'office', '08:52', 'P'], [1, 'field', '09:40', 'L', 'Client visit, Gulshan 1'], [2, 'office', '09:05', 'P'], [4, 'office', '09:31', 'L'], [5, 'branch', '09:10', 'P', 'Uttara branch: product shoot'], [6, 'office', '08:58', 'P']];
    for (const [i, kind, t, st, note] of rows) {
      const geo = { in: { lat: off.lat + (kind === 'office' ? 0.0001 : 0.02), lng: off.lng + (kind === 'office' ? 0.0001 : 0.015), acc: 15, ip: '', office: kind === 'office' ? off.name : null, distance: kind === 'office' ? 14 : null, at: now() } };
      await run(env, `INSERT INTO hr_attendance(account_id, employee_id, date, status, in_time, out_time, note, source, kind, place, geo, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(employee_id, date) DO NOTHING`, a.id, ids[i], today, st, t, '', note || '', 'app', kind, kind === 'office' ? off.name : (note || '').split(':')[0], JSON.stringify(geo), now());
    }
  }
  // leave: one taken, one today, one waiting for the team lead
  const S2 = await getSettings(env, a.id);
  const tryLeave = async (i, type, from, to, reason, approve, half = false) => { try { const l = await applyLeave(env, a.id, S2, await getEmp(env, a.id, ids[i]), { type, start_date: from, end_date: to, reason, half }, { by: 'Demo', approve }); return l; } catch (e) { return null; } };
  await tryLeave(3, 'sick', addDays(today, -6), addDays(today, -5), 'Fever', true);
  await tryLeave(7, 'casual', today, today, 'Family program', true);
  await tryLeave(2, 'annual', addDays(today, 7), addDays(today, 8), 'Trip to Sylhet', false);
  await tryLeave(5, 'casual', addDays(today, 3), addDays(today, 3), 'Personal work', false, true);
  // a job with applicants
  const j = await saveJob(env, a.id, { title: 'Sales Executive', dept: 'Sales', location: 'Dhaka', salary_range: 'BDT 25,000-35,000', description: 'Visit clients, run demos and close B2B deals across Dhaka.', requirements: '2+ years B2B sales\nCRM experience\nNegotiation\nGood English\nOwn motorbike is a plus' });
  await run(env, 'UPDATE hr_jobs SET demo = 1 WHERE id = ?', j.id);
  for (const [n, ex, role, cover] of [['Shakil Ahmed', 5, 'B2B Sales Executive', 'I manage 40 B2B accounts with HubSpot CRM, lead negotiation and English presentations. I have my own motorbike.'],
    ['Jannat Ara', 3, 'Sales Officer', 'B2B sales of industrial goods, CRM reporting, negotiation.'], ['Imran Khan', 1, 'Customer support', 'Customer service at a telecom company.'], ['Polash Das', 0.5, 'Intern', 'Fresh graduate interested in sales.']])
    await addApplicant(env, a, S2, j, { name: n, email: n.split(' ')[0].toLowerCase() + '@candidate.demo', phone: '0181' + Math.floor(1000000 + rnd() * 8999999), experience: ex, current_role: role, cover }, { source: 'hr' });
  await hrLog(env, a.id, 'Demo', 'Added demo data');
  return demoInfo(env, a);
}
export async function removeDemo(env, a) {
  const emps = (await all(env, 'SELECT id FROM hr_employees WHERE account_id = ? AND demo = 1', a.id)).map(x => x.id);
  const jobs = (await all(env, 'SELECT id FROM hr_jobs WHERE account_id = ? AND demo = 1', a.id)).map(x => x.id);
  const q = n => n.map(() => '?').join(',');
  if (emps.length) {
    const runs = (await all(env, `SELECT DISTINCT run_id FROM hr_payslips WHERE employee_id IN (${q(emps)})`, ...emps)).map(x => x.run_id);
    for (const t of ['hr_attendance', 'hr_leaves', 'hr_payslips', 'hr_tasks', 'hr_notes', 'hr_acks']) await run(env, `DELETE FROM ${t} WHERE employee_id IN (${q(emps)})`, ...emps);
    await run(env, `DELETE FROM hr_files WHERE owner_type = 'employee' AND owner_id IN (${q(emps)})`, ...emps);
    await run(env, `UPDATE hr_employees SET manager_id = NULL WHERE manager_id IN (${q(emps)})`, ...emps);
    await run(env, `DELETE FROM hr_employees WHERE id IN (${q(emps)})`, ...emps);
    for (const r of runs) { const left = await one(env, 'SELECT COUNT(*) AS n FROM hr_payslips WHERE run_id = ?', r); if (!left.n) await run(env, 'DELETE FROM hr_runs WHERE id = ?', r); else await totals(env, r); }
    const S = await getSettings(env, a.id);
    await saveSettings(env, a.id, { team_leads: Object.fromEntries(Object.entries(S.team_leads).filter(([, v]) => !emps.includes(v))) });
  }
  if (jobs.length) {
    const aps = (await all(env, `SELECT id FROM hr_applicants WHERE job_id IN (${q(jobs)})`, ...jobs)).map(x => x.id);
    if (aps.length) await run(env, `DELETE FROM hr_files WHERE owner_type = 'applicant' AND owner_id IN (${q(aps)})`, ...aps);
    await run(env, `DELETE FROM hr_applicants WHERE job_id IN (${q(jobs)})`, ...jobs);
    await run(env, `DELETE FROM hr_prospects WHERE job_id IN (${q(jobs)})`, ...jobs);
    await run(env, `DELETE FROM hr_jobs WHERE id IN (${q(jobs)})`, ...jobs);
  }
  await hrLog(env, a.id, 'HR', 'Removed demo data');
  return { removed: emps.length, jobs: jobs.length };
}
