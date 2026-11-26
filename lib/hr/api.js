// HR API. Three audiences:
//   /api/me/s/:id/hr/*   the company's HR team (client portal login)
//   /api/team/*          employees (their own login)
//   /api/careers/*       job seekers (public)
// and the daily automation (runDaily), called by the existing daily cron.
import * as C from './core.js';
import * as R from './recruit.js';
import * as HM from './mail.js';
import { askHr, searchKey, aiConfig } from './ai.js';
import * as SO from './source.js';
import * as DM from './demo.js';
import { emailHtml } from '../le/mail.js';
import * as A from '../auth.js';

const { all, one, run, err, J, now } = C;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const csv = (text, name) => new Response('﻿' + text, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
export const ipOf = req => req ? String(req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim() : '';
const rnd = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join('');
function matcher(method, rest) {
  return (m, pattern) => {
    if (m !== method) return null;
    const ps = pattern.split('/').filter(Boolean);
    if (ps.length !== rest.length) return null;
    const out = {};
    for (let i = 0; i < ps.length; i++) { if (ps[i].startsWith(':')) out[ps[i].slice(1)] = decodeURIComponent(rest[i]); else if (ps[i] !== rest[i]) return null; }
    return out;
  };
}
const typeName = (S, k) => (S.leave_types.find(t => t.key === k) || {}).name || k;

// ================================================================ HR team (client)
export async function hrClient({ method, rest, url, body, env, request, a, s, limit, who }) {
  const M = matcher(method, rest), S = await C.getSettings(env, a.id);
  let r;
  const log = t => C.hrLog(env, a.id, who, t);
  // overview + settings
  if (M('GET', 'overview')) return json(await C.overview(env, a, S));
  if (M('GET', 'settings')) return json({ settings: C.settingsOut(S), limit, careers_url: `${url.origin}/careers#/${a.client_id}`, team_url: `${url.origin}/team/${a.client_id}`,
    logo_url: S.brand.logo ? `/api/team/brand/${a.client_id}/logo?v=${S.brand.logo.length}` : '', company: a.company, demo: await DM.demoInfo(env, a), mail_mode: (await one(env, "SELECT value FROM config WHERE key = 'mail_mode'") || {}).value || 'live',
    my_ip: ipOf(request), search_ready: !!(await searchKey(env)), ai_ready: !!(await aiConfig(env)).key });
  if (M('PUT', 'settings')) { const x = await C.saveSettings(env, a.id, await body()); await log('Changed HR settings'); return json({ settings: C.settingsOut(x) }); }
  if (M('GET', 'teams')) return json(await C.teams(env, a, S));
  if (M('GET', 'outbox')) return json({ emails: await all(env, 'SELECT id, to_addr, subject, kind, status, error, created_at FROM emails WHERE account_id = ? ORDER BY id DESC LIMIT 100', a.id) });
  if ((r = M('GET', 'outbox/:mid'))) return emailHtml(env, r.mid, a.id);
  if (M('POST', 'demo')) { const x = await DM.addDemo(env, a); return json({ demo: x }); }
  if (M('DELETE', 'demo')) { const x = await DM.removeDemo(env, a); return json({ ...x, demo: await DM.demoInfo(env, a) }); }
  if ((r = M('POST', 'employees/:eid/password'))) {
    const b = await body(), e = await C.getEmp(env, a.id, r.eid);
    if (!e) return json({ error: 'Employee not found' }, 404);
    if (!e.email) return json({ error: 'Add the employee’s email first: it is their sign-in name.' }, 400);
    const problem = A.passwordProblem(b.password);
    if (problem) return json({ error: problem }, 400);
    const { hash, salt } = await A.hashPassword(b.password);
    await run(env, "UPDATE hr_employees SET pass_hash = ?, pass_salt = ?, login_enabled = 1, invite_token = '', invite_expires = 0 WHERE id = ?", hash, salt, e.id);
    await log(`Set an app password for ${e.name}`);
    return json({ ok: true, link: `${url.origin}/team/${a.client_id}` });
  }
  if (M('GET', 'log')) return json({ log: await all(env, 'SELECT * FROM hr_log WHERE account_id = ? ORDER BY at DESC LIMIT 200', a.id) });

  // employees
  if (M('GET', 'employees')) {
    const list = await C.listEmployees(env, a.id);
    return json({ employees: list.map(e => C.empOut(e)), limit, depts: S.departments });
  }
  if (M('GET', 'employees.csv')) {
    const list = await C.listEmployees(env, a.id), byId = Object.fromEntries(list.map(e => [e.id, e.name]));
    return csv(C.toCsv([['ID', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'Manager', 'Type', 'Status', 'Joined', 'Basic', 'Gross'],
      ...list.map(e => { const g = C.grossOf(S, J(e.salary, {})); return [e.code, e.name, e.email, e.phone, e.dept, e.designation, byId[e.manager_id] || '', e.emp_type, e.status, e.join_date, g.basic, g.gross]; })]), 'employees.csv');
  }
  if (M('POST', 'employees')) {
    const b = await body(), e = await C.saveEmployee(env, a, S, b, null, { limit });
    await log(`Added employee ${e.name}`);
    await C.emit(env, a, S, 'employee.added', C.empOut(e, { full: false }));
    const letter = b.send_letter ? await R.sendAppointment(env, a, S, e, who, { invite: b.invite !== false }) : null;
    return json({ employee: C.empOut(e), letter }, 201);
  }
  if ((r = M('GET', 'employees/:eid/appointment'))) {
    const e = await C.getEmp(env, a.id, r.eid);
    if (!e) return json({ error: 'Employee not found' }, 404);
    const saved = await R.letterOf(env, a.id, e.id);
    return json({ saved, draft: saved ? saved.text : await R.appointmentText(env, a, S, e), company: companyOut(a), employee: C.empOut(e, { full: false }) });
  }
  if ((r = M('POST', 'employees/:eid/appointment'))) {
    const b = await body(), e = await C.getEmp(env, a.id, r.eid);
    if (!e) return json({ error: 'Employee not found' }, 404);
    return json(await R.sendAppointment(env, a, S, e, who, { text: b.text, invite: b.invite !== false }));
  }
  if ((r = M('GET', 'employees/:eid'))) {
    const e = await C.getEmp(env, a.id, r.eid);
    if (!e) return json({ error: 'Employee not found' }, 404);
    const year = C.todayIn(S.timezone).slice(0, 4);
    return json({ employee: C.empOut(e), gross: C.grossOf(S, J(e.salary, {})), balances: await C.balances(env, a.id, S, e, year),
      leaves: await C.listLeaves(env, a.id, { empId: e.id }), files: await R.filesOf(env, a.id, 'employee', e.id),
      tasks: await all(env, 'SELECT * FROM hr_tasks WHERE employee_id = ? ORDER BY kind, id', e.id), notes: await all(env, 'SELECT * FROM hr_notes WHERE employee_id = ? ORDER BY created_at DESC', e.id),
      payslips: await all(env, 'SELECT p.id, r.month, r.status, p.net FROM hr_payslips p JOIN hr_runs r ON r.id = p.run_id WHERE p.employee_id = ? ORDER BY r.month DESC LIMIT 24', e.id),
      settlement: e.status === 'notice' || e.status === 'exited' ? await C.settlement(env, a, S, e) : null,
      acks: await all(env, 'SELECT p.id, p.title, k.at FROM hr_policies p LEFT JOIN hr_acks k ON k.policy_id = p.id AND k.employee_id = ? AND k.version = p.version WHERE p.account_id = ? AND p.needs_ack = 1', e.id, a.id) });
  }
  if ((r = M('PUT', 'employees/:eid'))) { const e = await C.saveEmployee(env, a, S, await body(), r.eid); await log(`Updated ${e.name}`); return json({ employee: C.empOut(e) }); }
  if ((r = M('POST', 'employees/:eid/confirm'))) {
    const e = await C.getEmp(env, a.id, r.eid);
    if (!e || e.status !== 'probation') return json({ error: 'Only an employee on probation can be confirmed.' }, 400);
    await run(env, "UPDATE hr_employees SET status = 'active', updated_at = ? WHERE id = ?", now(), e.id);
    await log(`Confirmed ${e.name} after probation`);
    await C.emit(env, a, S, 'employee.confirmed', { employee: e.name, email: e.email });
    return json({ ok: true });
  }
  if ((r = M('POST', 'employees/:eid/exit'))) {
    const b = await body(), e = await C.startExit(env, a, S, r.eid, b), ex = J(e.exit, {});
    if (b.notify !== false && e.email) await HM.exitLetter(env, a, S, e, ex);
    await log(`Started exit for ${e.name} (${ex.type}), last day ${ex.last_day}`);
    await C.emit(env, a, S, 'employee.exit_started', { employee: e.name, email: e.email, ...ex });
    return json({ employee: C.empOut(e) });
  }
  if ((r = M('POST', 'employees/:eid/cancel-exit'))) {
    const e = await C.getEmp(env, a.id, r.eid);
    if (!e || e.status !== 'notice') return json({ error: 'There is no exit to cancel.' }, 400);
    await run(env, "UPDATE hr_employees SET status = 'active', exit = '{}', updated_at = ? WHERE id = ?", now(), e.id);
    await run(env, "DELETE FROM hr_tasks WHERE employee_id = ? AND kind = 'offboarding' AND done_at = 0", e.id);
    await log(`Cancelled exit for ${e.name}`);
    return json({ ok: true });
  }
  if ((r = M('POST', 'employees/:eid/invite'))) {
    const e = await C.getEmp(env, a.id, r.eid);
    if (!e) return json({ error: 'Employee not found' }, 404);
    if (!e.email) return json({ error: 'Add the employee’s email first.' }, 400);
    if (e.status === 'exited') return json({ error: 'This employee has left.' }, 400);
    const token = rnd();
    await run(env, 'UPDATE hr_employees SET invite_token = ?, invite_expires = ? WHERE id = ?', token, now() + 7 * 864e5, e.id);
    const sent = await HM.invite(env, a, S, e, token);
    await log(`Invited ${e.name} to the employee app`);
    return json({ ok: true, link: `${url.origin}/team/${a.client_id}#/invite/${token}`, emailed: !!(sent && sent.ok && !sent.held), held: !!(sent && sent.held), email_error: sent && sent.error });
  }
  if ((r = M('POST', 'employees/:eid/notes'))) {
    const b = await body(), e = await C.getEmp(env, a.id, r.eid);
    if (!e) return json({ error: 'Employee not found' }, 404);
    const kind = ['note', 'warning', 'appreciation', 'review'].includes(b.kind) ? b.kind : 'note', text = String(b.text || '').trim().slice(0, 3000);
    if (!text) return json({ error: 'Write the note.' }, 400);
    await run(env, 'INSERT INTO hr_notes(account_id, employee_id, kind, text, by_name, created_at) VALUES(?,?,?,?,?,?)', a.id, e.id, kind, text, who, now());
    if (kind === 'warning') { await log(`Warning recorded for ${e.name}`); await C.emit(env, a, S, 'employee.warning', { employee: e.name, text }); }
    return json({ ok: true }, 201);
  }
  if ((r = M('POST', 'employees/:eid/tasks'))) {
    const b = await body(), e = await C.getEmp(env, a.id, r.eid);
    if (!e || !String(b.title || '').trim()) return json({ error: 'Write the task.' }, 400);
    await C.addTasks(env, a.id, e, b.kind === 'offboarding' ? 'offboarding' : 'onboarding', [String(b.title).trim().slice(0, 200)], C.DATE.test(b.due || '') ? b.due : '');
    return json({ ok: true }, 201);
  }
  if ((r = M('PUT', 'tasks/:tid'))) {
    const b = await body();
    await run(env, 'UPDATE hr_tasks SET done_at = ? WHERE id = ? AND account_id = ?', b.done ? now() : 0, Number(r.tid), a.id);
    return json({ ok: true });
  }
  if ((r = M('DELETE', 'tasks/:tid'))) { await run(env, 'DELETE FROM hr_tasks WHERE id = ? AND account_id = ?', Number(r.tid), a.id); return json({ ok: true }); }
  if ((r = M('POST', 'employees/:eid/files'))) {
    const b = await body(), e = await C.getEmp(env, a.id, r.eid);
    if (!e) return json({ error: 'Employee not found' }, 404);
    const id = await R.saveFile(env, a.id, 'employee', e.id, b.file, { kind: b.kind, expires_on: b.expires_on });
    await log(`Uploaded ${b.file && b.file.name} for ${e.name}`);
    return json({ id }, 201);
  }
  if ((r = M('GET', 'files/:fid'))) return R.fileResponse(env, a.id, r.fid);
  if ((r = M('DELETE', 'files/:fid'))) { await run(env, 'DELETE FROM hr_files WHERE id = ? AND account_id = ?', Number(r.fid), a.id); return json({ ok: true }); }

  // attendance
  const team = url.searchParams.get('team') || '';
  const byTeam = x => team ? { ...x, rows: x.rows.filter(r => r.employee.dept === team) } : x;
  if (M('GET', 'attendance')) return json(byTeam(await C.attendanceDay(env, a.id, S, url.searchParams.get('date') || C.todayIn(S.timezone))));
  if (M('PUT', 'attendance')) {
    const b = await body(), n = await C.saveAttendance(env, a.id, b.date, b.rows);
    await log(`Saved attendance for ${b.date} (${n} people)`);
    const absent = (b.rows || []).filter(x => x.status === 'A').length;
    await C.emit(env, a, S, 'attendance.saved', { date: b.date, marked: n, absent });
    return json({ ok: true, saved: n });
  }
  if (M('GET', 'attendance/month')) return json(byTeam(await C.attendanceMonth(env, a.id, S, url.searchParams.get('month') || C.todayIn(S.timezone).slice(0, 7), url.searchParams.get('employee'))));
  if (M('GET', 'attendance.csv')) {
    const x = byTeam(await C.attendanceMonth(env, a.id, S, url.searchParams.get('month') || C.todayIn(S.timezone).slice(0, 7)));
    return csv(C.toCsv([['ID', 'Name', 'Work days', 'Present', 'Late', 'Half days', 'Absent', 'Paid leave', 'Unpaid leave', ...x.days.map(d => d.slice(8))],
      ...x.rows.map(r => [r.employee.code, r.employee.name, r.counts.employed_workdays, r.counts.present, r.counts.late, r.counts.half, r.counts.absent, r.counts.paid_leave, r.counts.unpaid_leave, ...r.days.map(d => d.code || 'P')])]), `attendance-${x.month}.csv`);
  }

  // leave
  if (M('GET', 'leaves')) return json({ leaves: (await C.listLeaves(env, a.id, { status: url.searchParams.get('status') || '' })).filter(l => !team || l.dept === team), types: S.leave_types });
  if (M('POST', 'leaves')) {
    const b = await body(), e = await C.getEmp(env, a.id, b.employee_id);
    if (!e) return json({ error: 'Choose the employee.' }, 400);
    const l = await C.applyLeave(env, a.id, S, e, b, { by: who, approve: true });
    await log(`Added ${typeName(S, l.type)} for ${e.name}: ${l.start_date}${l.end_date !== l.start_date ? ' to ' + l.end_date : ''}`);
    return json({ leave: l }, 201);
  }
  if ((r = M('POST', 'leaves/:lid/decide'))) {
    const b = await body(), l = await C.decideLeave(env, a.id, r.lid, !!b.approve, who, b.note);
    const e = await C.getEmp(env, a.id, l.employee_id);
    if (e && e.email) await HM.leaveDecided(env, a, S, e, l, typeName(S, l.type));
    await log(`${l.status === 'approved' ? 'Approved' : l.status === 'cancelled' ? 'Cancelled' : 'Declined'} ${typeName(S, l.type)} for ${e ? e.name : 'employee'}`);
    await C.emit(env, a, S, 'leave.' + l.status, { employee: e && e.name, email: e && e.email, phone: e && e.phone, type: typeName(S, l.type), start: l.start_date, end: l.end_date, days: l.days });
    return json({ leave: l });
  }

  // recruitment
  if (M('GET', 'jobs')) return json({ jobs: await R.listJobs(env, a.id), careers_url: `${url.origin}/careers#/${a.client_id}` });
  if (M('POST', 'jobs')) { const j = await R.saveJob(env, a.id, await body()); await log(`Created job ${j.title}`); return json({ job: j }, 201); }
  if ((r = M('GET', 'jobs/:jid'))) {
    const j = await R.getJob(env, a.id, r.jid);
    if (!j) return json({ error: 'Job not found' }, 404);
    const counts = Object.fromEntries((await all(env, 'SELECT status, COUNT(*) AS n FROM hr_prospects WHERE job_id = ? GROUP BY status', j.id)).map(x => [x.status, x.n]));
    return json({ job: j, applicants: await R.applicantsOf(env, a.id, j.id), apply_url: `${url.origin}/careers#/${a.client_id}/${j.id}`, sourcing: SO.sourcingOf(j), prospect_counts: counts,
      search_ready: !!(await searchKey(env)), facebook_ready: !!(S.facebook.page_id && S.facebook.token_enc), sources: R.SOURCES });
  }
  if ((r = M('POST', 'jobs/:jid/import'))) {
    const j = await R.getJob(env, a.id, r.jid);
    if (!j) return json({ error: 'Job not found' }, 404);
    const res = await R.importCv(env, a, S, j, await body());
    if (!res.duplicate) await log(`Imported CV for ${j.title}: ${res.applicant.name} (${R.SOURCES[res.applicant.source] || res.applicant.source})`);
    return json(res, res.duplicate ? 200 : 201);
  }
  if ((r = M('POST', 'jobs/:jid/posts'))) { const j = await R.getJob(env, a.id, r.jid); return json({ posts: await SO.makePosts(env, a, S, r.jid, `${url.origin}/careers#/${a.client_id}/${j ? j.id : 0}`) }); }
  if ((r = M('PUT', 'jobs/:jid/sourcing'))) return json({ sourcing: await SO.savePosts(env, a, r.jid, await body()) });
  if ((r = M('POST', 'jobs/:jid/facebook'))) return json({ post: await SO.postFacebook(env, a, S, r.jid) });
  if ((r = M('POST', 'jobs/:jid/find'))) return json(await SO.findCandidates(env, a, S, r.jid));
  if ((r = M('GET', 'jobs/:jid/prospects'))) {
    const j = await R.getJob(env, a.id, r.jid);
    if (!j) return json({ error: 'Job not found' }, 404);
    const apply = `${url.origin}/careers#/${a.client_id}/${j.id}`;
    return json({ prospects: (await SO.prospectsOf(env, a.id, j.id)).map(p => ({ ...p, message: SO.outreach(a, j, p, apply) })), sourcing: SO.sourcingOf(j), search_ready: !!(await searchKey(env)), queries: SO.queriesFor(j, SO.sourcingOf(j)).map(q => q.q) });
  }
  if ((r = M('PUT', 'prospects/:pid'))) return json({ prospect: await SO.setProspect(env, a.id, r.pid, await body()) });
  if ((r = M('PUT', 'jobs/:jid'))) { const j = await R.saveJob(env, a.id, await body(), r.jid); return json({ job: j }); }
  if ((r = M('POST', 'jobs/:jid/applicants'))) {
    const j = await R.getJob(env, a.id, r.jid);
    if (!j) return json({ error: 'Job not found' }, 404);
    const ap = await R.addApplicant(env, a, S, j, await body(), { source: 'hr' });
    return json({ applicant: R.apOut(ap) }, 201);
  }
  if ((r = M('GET', 'applicants/:aid'))) {
    const ap = await R.getAp(env, a.id, r.aid);
    if (!ap) return json({ error: 'Applicant not found' }, 404);
    return json({ applicant: R.apOut(ap), job: await R.getJob(env, a.id, ap.job_id), files: await R.filesOf(env, a.id, 'applicant', ap.id),
      offer_letter: R.offerLetter(a, S, await R.getJob(env, a.id, ap.job_id), ap, { join_date: '{join_date}', basic_gross: 0 }) });
  }
  if ((r = M('PUT', 'applicants/:aid'))) return json({ applicant: R.apOut(await R.setStage(env, a, S, r.aid, await body(), who)) });
  if ((r = M('POST', 'applicants/:aid/screen'))) return json({ applicant: R.apOut(await R.rescreen(env, a, S, r.aid)) });
  if ((r = M('POST', 'applicants/:aid/interview'))) return json({ applicant: R.apOut(await R.scheduleInterview(env, a, S, r.aid, await body(), who)) });
  if ((r = M('POST', 'applicants/:aid/offer'))) return json({ applicant: R.apOut(await R.sendOffer(env, a, S, r.aid, await body(), who)) });
  if ((r = M('POST', 'applicants/:aid/hire'))) { const x = await R.hire(env, a, S, r.aid, who, { limit }, await body()); return json({ employee: C.empOut(x.employee), letter: x.letter }); }
  if ((r = M('POST', 'applicants/:aid/reject'))) { const b = await body(); return json({ applicant: R.apOut(await R.reject(env, a, S, r.aid, who, { send: b.send !== false })) }); }

  // payroll
  if (M('GET', 'payroll')) return json({ runs: (await all(env, 'SELECT * FROM hr_runs WHERE account_id = ? ORDER BY month DESC', a.id)).map(x => ({ ...x, totals: J(x.totals, {}) })), currency: S.currency, this_month: C.todayIn(S.timezone).slice(0, 7) });
  if (M('POST', 'payroll')) { const b = await body(), x = await C.buildRun(env, a, S, b.month); await log(`Prepared payroll for ${b.month}`); return json({ run: { ...x, totals: J(x.totals, {}) } }, 201); }
  if ((r = M('GET', 'payroll/:rid'))) {
    const x = await one(env, 'SELECT * FROM hr_runs WHERE id = ? AND account_id = ?', Number(r.rid), a.id);
    if (!x) return json({ error: 'Payroll not found' }, 404);
    return json({ run: { ...x, totals: J(x.totals, {}) }, slips: await C.slipsOf(env, x.id), currency: S.currency });
  }
  if ((r = M('PUT', 'payroll/:rid/slips/:eid'))) { const x = await C.setAdjust(env, a, S, r.rid, r.eid, (await body()).adjust); return json({ run: { ...x, totals: J(x.totals, {}) } }); }
  if ((r = M('POST', 'payroll/:rid/refresh'))) {
    const x = await one(env, 'SELECT * FROM hr_runs WHERE id = ? AND account_id = ?', Number(r.rid), a.id);
    if (!x) return json({ error: 'Payroll not found' }, 404);
    return json({ run: await C.buildRun(env, a, S, x.month) });
  }
  if ((r = M('POST', 'payroll/:rid/approve'))) {
    const x = await one(env, 'SELECT * FROM hr_runs WHERE id = ? AND account_id = ?', Number(r.rid), a.id);
    if (!x) return json({ error: 'Payroll not found' }, 404);
    if (x.status !== 'draft') return json({ error: 'Already approved.' }, 400);
    await run(env, "UPDATE hr_runs SET status = 'approved', approved_at = ? WHERE id = ?", now(), x.id);
    let sent = 0;
    for (const sl of await C.slipsOf(env, x.id)) if (sl.email) { const res = await HM.payslip(env, a, S, { name: sl.name, email: sl.email }, sl.data, sl.id); if (res && res.ok) sent++; }
    await log(`Approved payroll for ${x.month}; ${sent} payslips emailed`);
    await C.emit(env, a, S, 'payroll.approved', { month: x.month, ...J(x.totals, {}) });
    return json({ ok: true, emailed: sent });
  }
  if ((r = M('POST', 'payroll/:rid/paid'))) {
    await run(env, "UPDATE hr_runs SET status = 'paid', paid_at = ? WHERE id = ? AND account_id = ? AND status = 'approved'", now(), Number(r.rid), a.id);
    await log('Marked payroll as paid');
    return json({ ok: true });
  }
  if ((r = M('DELETE', 'payroll/:rid'))) {
    const x = await one(env, "SELECT * FROM hr_runs WHERE id = ? AND account_id = ? AND status = 'draft'", Number(r.rid), a.id);
    if (!x) return json({ error: 'Only a draft can be deleted.' }, 400);
    await run(env, 'DELETE FROM hr_payslips WHERE run_id = ?', x.id); await run(env, 'DELETE FROM hr_runs WHERE id = ?', x.id);
    return json({ ok: true });
  }
  if ((r = M('GET', 'payroll/:rid/bank.csv'))) {
    const x = await one(env, 'SELECT * FROM hr_runs WHERE id = ? AND account_id = ?', Number(r.rid), a.id);
    if (!x) return json({ error: 'Payroll not found' }, 404);
    const sl = await C.slipsOf(env, x.id);
    return csv(C.toCsv([['ID', 'Name', 'Method', 'Bank', 'Branch', 'Account name', 'Account / wallet number', 'Gross', 'Deductions', 'Net pay'],
      ...sl.map(p => { const b = p.data.employee.bank || {}; return [p.code, p.name, b.method || '', b.bank || '', b.branch || '', b.account_name || p.name, b.account_no || b.mobile || '', p.gross, p.deductions, p.net]; })]), `salary-sheet-${x.month}.csv`);
  }
  if ((r = M('GET', 'payslips/:pid'))) {
    const p = await one(env, 'SELECT p.*, r.month, r.status AS run_status FROM hr_payslips p JOIN hr_runs r ON r.id = p.run_id WHERE p.id = ? AND p.account_id = ?', Number(r.pid), a.id);
    if (!p) return json({ error: 'Payslip not found' }, 404);
    return json({ payslip: { ...p, data: J(p.data, {}) }, company: companyOut(a) });
  }

  // policies + notices
  if (M('GET', 'policies')) {
    const pol = await all(env, 'SELECT * FROM hr_policies WHERE account_id = ? ORDER BY title', a.id);
    const total = (await C.activeEmployees(env, a.id)).length;
    for (const p of pol) p.acked = (await one(env, 'SELECT COUNT(*) AS n FROM hr_acks k JOIN hr_employees e ON e.id = k.employee_id WHERE k.policy_id = ? AND k.version = ? AND e.status != ?', p.id, p.version, 'exited')).n;
    return json({ policies: pol, employees: total });
  }
  if (M('POST', 'policies') || (r = M('PUT', 'policies/:pid'))) {
    const b = await body(), title = String(b.title || '').trim().slice(0, 120), text = String(b.body || '').trim().slice(0, 30000);
    if (!title || !text) return json({ error: 'Add a title and the policy text.' }, 400);
    if (r && r.pid) {
      const cur = await one(env, 'SELECT * FROM hr_policies WHERE id = ? AND account_id = ?', Number(r.pid), a.id);
      if (!cur) return json({ error: 'Policy not found' }, 404);
      const changed = cur.body !== text;
      await run(env, 'UPDATE hr_policies SET title = ?, body = ?, needs_ack = ?, version = ?, updated_at = ? WHERE id = ?', title, text, b.needs_ack === false ? 0 : 1, cur.version + (changed && b.reack !== false ? 1 : 0), now(), cur.id);
      await log(`Updated policy ${title}`);
      return json({ ok: true });
    }
    await run(env, 'INSERT INTO hr_policies(account_id, title, body, needs_ack, updated_at) VALUES(?,?,?,?,?)', a.id, title, text, b.needs_ack === false ? 0 : 1, now());
    await log(`Published policy ${title}`);
    return json({ ok: true }, 201);
  }
  if ((r = M('DELETE', 'policies/:pid'))) { await run(env, 'DELETE FROM hr_policies WHERE id = ? AND account_id = ?', Number(r.pid), a.id); await run(env, 'DELETE FROM hr_acks WHERE policy_id = ?', Number(r.pid)); return json({ ok: true }); }
  if (M('GET', 'notices')) return json({ notices: await all(env, 'SELECT * FROM hr_notices WHERE account_id = ? ORDER BY created_at DESC LIMIT 50', a.id) });
  if (M('POST', 'notices')) {
    const b = await body(), n = { title: String(b.title || '').trim().slice(0, 150), body: String(b.body || '').trim().slice(0, 5000) };
    if (!n.title || !n.body) return json({ error: 'Add a title and the message.' }, 400);
    await run(env, 'INSERT INTO hr_notices(account_id, title, body, created_at) VALUES(?,?,?,?)', a.id, n.title, n.body, now());
    let sent = 0;
    if (b.email !== false) { const to = (await C.activeEmployees(env, a.id)).map(e => e.email).filter(Boolean); for (let i = 0; i < to.length; i += 45) { const x = await HM.notice(env, a, S, to.slice(i, i + 45), n); if (x && x.ok) sent += to.slice(i, i + 45).length; } }
    await log(`Posted notice: ${n.title}`);
    await C.emit(env, a, S, 'notice.posted', n);
    return json({ ok: true, emailed: sent }, 201);
  }
  if ((r = M('DELETE', 'notices/:nid'))) { await run(env, 'DELETE FROM hr_notices WHERE id = ? AND account_id = ?', Number(r.nid), a.id); return json({ ok: true }); }

  if (M('GET', 'reports')) return json(await C.reports(env, a, S, team));
  if (M('GET', 'reports.csv')) {
    const x = await C.reports(env, a, S, team), at = await C.attendanceMonth(env, a.id, S, C.todayIn(S.timezone).slice(0, 7));
    const rows = at.rows.filter(r => !team || r.employee.dept === team);
    return csv(C.toCsv([['ID', 'Name', 'Team', 'Designation', 'Work days', 'Present', 'Late', 'Half days', 'Absent', 'Paid leave', 'Unpaid leave'],
      ...rows.map(r => [r.employee.code, r.employee.name, r.employee.dept, r.employee.designation, r.counts.employed_workdays, r.counts.present, r.counts.late, r.counts.half, r.counts.absent, r.counts.paid_leave, r.counts.unpaid_leave])]), `team-report-${(team || 'all').replace(/\W+/g, '-')}-${x.attendance.month}.csv`);
  }
  return json({ error: 'Not found' }, 404);
}
const companyOut = a => ({ name: a.company, address: [a.address, a.country].filter(Boolean).join(', '), email: a.email, phone: a.phone });

// ================================================================ employees (their own portal)
export const COOKIE = 'bb_team';
const tokenFor = (env, e) => A.makeToken(env, { r: 'e', e: e.id, v: e.pass_salt.slice(0, 10) }, 24 * 60);
export async function hrTeam({ method, rest, url, body, cookie, env, request, hrLive, hrLiveByCode }) {
  const M = matcher(method, rest);
  let r;
  // ---- the company's own app: brand, logo, install manifest (public)
  if ((r = M('GET', 'brand/:code'))) {
    const co = await hrLiveByCode(r.code);
    if (!co) return json({ error: 'This app link is not active. Please contact your HR team.' }, 404);
    const S = await C.getSettings(env, co.id);
    return json({ code: co.client_id, company: co.company, app_name: C.appName(co, S), color: S.brand.color, logo: S.brand.logo ? `/api/team/brand/${co.client_id}/logo?v=${S.brand.logo.length}` : '' });
  }
  if ((r = M('GET', 'brand/:code/logo'))) {
    const co = await one(env, 'SELECT id FROM accounts WHERE client_id = ?', r.code);
    const S = co ? await C.getSettings(env, co.id) : null, m = S && /^data:(image\/[a-z]+);base64,(.+)$/.exec(S.brand.logo || '');
    if (!m) return Response.redirect(new URL('/panel/app-512.png', url), 302);
    return new Response(Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)), { headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=86400' } });
  }
  if ((r = M('GET', 'manifest/:code'))) {
    const co = await hrLiveByCode(r.code);
    const S = co ? await C.getSettings(env, co.id) : null, name = co ? C.appName(co, S) : 'Employee app';
    const icon = co && S.brand.logo ? `/api/team/brand/${co.client_id}/logo?v=${S.brand.logo.length}` : '/panel/app-512.png';
    return new Response(JSON.stringify({ id: `/team/${r.code}`, name, short_name: name.slice(0, 12), description: `${name}: check in, leave and payslips`, start_url: `/team/${r.code}#/`, scope: `/team/${r.code}`,
      display: 'standalone', orientation: 'portrait', background_color: '#f6f5fb', theme_color: S ? S.brand.color : '#5b2be0',
      icons: [{ src: icon, sizes: '512x512', purpose: 'any' }, { src: icon, sizes: '192x192', purpose: 'any' }] }), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } });
  }
  const code = String(request.headers.get('X-Team-Code') || '').trim();
  if (M('POST', 'login')) {
    const b = await body(), email = String(b.email || '').trim().toLowerCase();
    const co = code ? await one(env, 'SELECT id FROM accounts WHERE client_id = ?', code) : null;
    if (code && !co) return json({ error: 'This app link is not active. Please contact your HR team.' }, 404);
    const list = await all(env, `SELECT * FROM hr_employees WHERE email = ? AND login_enabled = 1 AND status != 'exited'${co ? ' AND account_id = ?' : ''}`, email, ...(co ? [co.id] : []));
    for (const e of list) if (await A.verifyPassword(b.password, e.pass_hash, e.pass_salt)) {
      if (!(await hrLive(e.account_id))) return json({ error: 'Your company’s employee app is not active right now. Please contact HR.' }, 403);
      await run(env, 'UPDATE hr_employees SET last_login = ? WHERE id = ?', now(), e.id);
      return json({ ok: true }, 200, { 'Set-Cookie': A.setCookie(COOKIE, await tokenFor(env, e), 60 * 86400) });
    }
    await new Promise(x => setTimeout(x, 600));
    return json({ error: 'Email or password is wrong.' }, 401);
  }
  if (M('POST', 'logout')) return json({ ok: true }, 200, { 'Set-Cookie': A.setCookie(COOKIE, '', 0) });
  if ((r = M('GET', 'invite/:token'))) {
    const e = await one(env, 'SELECT * FROM hr_employees WHERE invite_token = ? AND invite_expires > ?', r.token, now());
    if (!e) return json({ error: 'This link has expired. Ask HR for a new invite.' }, 404);
    const a = await one(env, 'SELECT company, client_id FROM accounts WHERE id = ?', e.account_id);
    if (code && code !== a.client_id) return json({ error: 'This link belongs to another company’s app.' }, 404);
    return json({ name: e.name, email: e.email, company: a.company, code: a.client_id });
  }
  if ((r = M('POST', 'invite/:token'))) {
    const e = await one(env, 'SELECT * FROM hr_employees WHERE invite_token = ? AND invite_expires > ?', r.token, now());
    if (!e) return json({ error: 'This link has expired. Ask HR for a new invite.' }, 404);
    const b = await body(), problem = A.passwordProblem(b.password);
    if (problem) return json({ error: problem }, 400);
    const { hash, salt } = await A.hashPassword(b.password);
    await run(env, "UPDATE hr_employees SET pass_hash = ?, pass_salt = ?, login_enabled = 1, invite_token = '', invite_expires = 0, last_login = ? WHERE id = ?", hash, salt, now(), e.id);
    const e2 = await one(env, 'SELECT * FROM hr_employees WHERE id = ?', e.id);
    return json({ ok: true }, 200, { 'Set-Cookie': A.setCookie(COOKIE, await tokenFor(env, e2), 60 * 86400) });
  }

  // signed in from here
  const tok = await A.readToken(env, cookie, COOKIE);
  const e = tok && tok.r === 'e' ? await one(env, 'SELECT * FROM hr_employees WHERE id = ?', tok.e) : null;
  if (!e || !e.login_enabled || e.status === 'exited' || tok.v !== e.pass_salt.slice(0, 10)) return json({ error: 'Please sign in.' }, 401);
  if (!(await hrLive(e.account_id))) return json({ error: 'Your company’s employee app is not active right now. Please contact HR.' }, 403);
  const a = await one(env, 'SELECT * FROM accounts WHERE id = ?', e.account_id);
  // a phone signed in to one company's app never sees another company
  if (code && code !== a.client_id) return json({ error: 'Please sign in.' }, 401);
  const S = await C.getSettings(env, a.id), today = C.todayIn(S.timezone), year = today.slice(0, 4);
  const mine = await C.teamOf(env, S, e), reports = mine.people;
  const isMgr = reports.length > 0;

  if (M('GET', 'me')) {
    const pol = await all(env, 'SELECT p.id, p.title, p.version, k.version AS acked FROM hr_policies p LEFT JOIN hr_acks k ON k.policy_id = p.id AND k.employee_id = ? WHERE p.account_id = ? AND p.needs_ack = 1', e.id, a.id);
    const mgr = e.manager_id ? await one(env, 'SELECT name FROM hr_employees WHERE id = ?', e.manager_id) : null;
    const todayStatus = C.dayStatus(S, e, today, await one(env, 'SELECT * FROM hr_attendance WHERE employee_id = ? AND date = ?', e.id, today), await C.approvedLeaves(env, a.id, today, today, e.id));
    const ci = S.checkin;
    return json({ employee: C.empOut(e), manager: mgr && mgr.name, company: { ...companyOut(a), code: a.client_id, app_name: C.appName(a, S), color: S.brand.color }, currency: S.currency, today, today_status: todayStatus, teams_led: mine.led,
      checkin: { mode: ci.mode, rec: await C.checkinToday(env, S, e), allow_field: ci.allow_field, allow_branch: ci.allow_branch, needs_location: ci.require_location, needs_wifi: ci.require_ip,
        offices: ci.offices.map(o => o.name), office_start: S.office_start, office_end: S.office_end, late_after_min: S.late_after_min },
      has_letter: !!(await one(env, "SELECT id FROM hr_files WHERE account_id = ? AND owner_type = 'employee' AND owner_id = ? AND kind = 'appointment'", a.id, e.id)),
      balances: await C.balances(env, a.id, S, e, year), leave_types: S.leave_types.map(t => ({ key: t.key, name: t.name })),
      notices: await all(env, 'SELECT * FROM hr_notices WHERE account_id = ? ORDER BY created_at DESC LIMIT 10', a.id),
      policies_to_ack: pol.filter(p => p.acked !== p.version).map(p => ({ id: p.id, title: p.title })), tasks: await all(env, "SELECT * FROM hr_tasks WHERE employee_id = ? AND owner = 'employee' ORDER BY done_at, id", e.id),
      upcoming_leave: (await C.listLeaves(env, a.id, { empId: e.id, from: today })).filter(l => ['pending', 'approved'].includes(l.status)).slice(0, 5),
      holidays: S.holidays.filter(h => h.date >= today).slice(0, 5), is_manager: isMgr,
      pending_approvals: isMgr ? (await one(env, `SELECT COUNT(*) AS n FROM hr_leaves WHERE status = 'pending' AND employee_id IN (${reports.map(() => '?').join(',')})`, ...reports.map(x => x.id))).n : 0 });
  }
  if (M('PUT', 'me')) {
    const b = await body(), cur = C.empOut(e);
    const bank = b.bank ? { ...cur.bank, ...Object.fromEntries(['method', 'bank', 'branch', 'account_name', 'account_no', 'mobile'].map(k => [k, String(b.bank[k] ?? cur.bank[k] ?? '').slice(0, 80)])) } : cur.bank;
    await run(env, 'UPDATE hr_employees SET phone = ?, address = ?, emergency = ?, bank = ?, updated_at = ? WHERE id = ?', String(b.phone ?? e.phone).slice(0, 30), String(b.address ?? e.address).slice(0, 300), String(b.emergency ?? e.emergency).slice(0, 200), JSON.stringify(bank), now(), e.id);
    await C.hrLog(env, a.id, e.name, 'Updated own profile');
    return json({ ok: true });
  }
  if (M('POST', 'password')) {
    const b = await body();
    if (!(await A.verifyPassword(b.current, e.pass_hash, e.pass_salt))) return json({ error: 'Your current password is wrong.' }, 400);
    const problem = A.passwordProblem(b.next);
    if (problem) return json({ error: problem }, 400);
    const { hash, salt } = await A.hashPassword(b.next);
    await run(env, 'UPDATE hr_employees SET pass_hash = ?, pass_salt = ? WHERE id = ?', hash, salt, e.id);
    return json({ ok: true }, 200, { 'Set-Cookie': A.setCookie(COOKIE, await tokenFor(env, { ...e, pass_salt: salt }), 60 * 86400) });
  }
  if (M('GET', 'leaves')) return json({ leaves: await C.listLeaves(env, a.id, { empId: e.id }), balances: await C.balances(env, a.id, S, e, year), types: S.leave_types.map(t => ({ key: t.key, name: t.name })) });
  if (M('POST', 'leaves')) {
    const b = await body(), l = await C.applyLeave(env, a.id, S, e, b);
    const leadId = S.team_leads[e.dept] && S.team_leads[e.dept] !== e.id ? S.team_leads[e.dept] : null;
    const mgr = e.manager_id || leadId ? await one(env, "SELECT * FROM hr_employees WHERE id = ? AND status != 'exited'", e.manager_id || leadId) : null;
    const to = mgr && mgr.email && mgr.login_enabled ? mgr.email : HM.hrEmail(a, S);
    await HM.leaveRequested(env, a, S, to, e, l, typeName(S, l.type));
    await C.hrLog(env, a.id, e.name, `Asked for ${typeName(S, l.type)}: ${l.start_date}${l.end_date !== l.start_date ? ' to ' + l.end_date : ''}`);
    await C.emit(env, a, S, 'leave.requested', { employee: e.name, type: typeName(S, l.type), start: l.start_date, end: l.end_date, days: l.days, reason: l.reason });
    return json({ leave: l }, 201);
  }
  if ((r = M('DELETE', 'leaves/:lid'))) {
    await run(env, "UPDATE hr_leaves SET status = 'cancelled', decided_by = ?, decided_at = ? WHERE id = ? AND employee_id = ? AND status = 'pending'", e.name, now(), Number(r.lid), e.id);
    return json({ ok: true });
  }
  if (M('GET', 'attendance')) {
    const m = url.searchParams.get('month') || today.slice(0, 7), x = await C.attendanceMonth(env, a.id, S, m, e.id);
    const recs = await all(env, 'SELECT date, in_time, out_time, kind, place, note, source FROM hr_attendance WHERE employee_id = ? AND date LIKE ? ORDER BY date DESC', e.id, m + '%');
    return json({ ...x, log: recs, mode: S.checkin.mode });
  }
  if (M('POST', 'checkin')) {
    const b = await body(), x = await C.checkIn(env, a, S, e, b, ipOf(request));
    const what = { office: 'office', field: 'a field visit', branch: 'a branch visit' }[x.rec.kind];
    await C.hrLog(env, a.id, e.name, `Checked in at ${x.rec.in_time} (${what}${x.rec.place ? ': ' + x.rec.place : ''})${x.late ? ', late' : ''}`);
    await C.emit(env, a, S, 'attendance.checkin', { employee: e.name, code: e.code, time: x.rec.in_time, kind: x.rec.kind, place: x.rec.place, note: x.rec.note, late: x.late, location: x.rec.geo.in });
    return json(x);
  }
  if (M('POST', 'checkout')) {
    const b = await body(), x = await C.checkOut(env, a, S, e, b, ipOf(request));
    await C.emit(env, a, S, 'attendance.checkout', { employee: e.name, code: e.code, time: x.rec.out_time, outside_office: x.outside });
    return json(x);
  }
  if (M('GET', 'letter')) {
    const l = await R.letterOf(env, a.id, e.id);
    if (!l) return json({ error: 'No appointment letter yet.' }, 404);
    return json({ text: l.text, at: l.at, company: companyOut(a) });
  }
  if (M('GET', 'payslips')) return json({ payslips: await all(env, "SELECT p.id, r.month, p.gross, p.deductions, p.net FROM hr_payslips p JOIN hr_runs r ON r.id = p.run_id WHERE p.employee_id = ? AND r.status IN ('approved','paid') ORDER BY r.month DESC", e.id), currency: S.currency });
  if ((r = M('GET', 'payslips/:pid'))) {
    const p = await one(env, "SELECT p.*, r.month FROM hr_payslips p JOIN hr_runs r ON r.id = p.run_id WHERE p.id = ? AND p.employee_id = ? AND r.status IN ('approved','paid')", Number(r.pid), e.id);
    if (!p) return json({ error: 'Payslip not found' }, 404);
    return json({ payslip: { ...p, data: J(p.data, {}) }, company: companyOut(a) });
  }
  if (M('GET', 'policies')) return json({ policies: await all(env, 'SELECT p.*, k.version AS acked FROM hr_policies p LEFT JOIN hr_acks k ON k.policy_id = p.id AND k.employee_id = ? WHERE p.account_id = ? ORDER BY p.title', e.id, a.id) });
  if ((r = M('POST', 'policies/:pid/ack'))) {
    const p = await one(env, 'SELECT * FROM hr_policies WHERE id = ? AND account_id = ?', Number(r.pid), a.id);
    if (!p) return json({ error: 'Policy not found' }, 404);
    await run(env, 'INSERT INTO hr_acks(policy_id, employee_id, version, at) VALUES(?,?,?,?) ON CONFLICT(policy_id, employee_id) DO UPDATE SET version = excluded.version, at = excluded.at', p.id, e.id, p.version, now());
    if (!(await one(env, "SELECT COUNT(*) AS n FROM hr_policies p LEFT JOIN hr_acks k ON k.policy_id = p.id AND k.employee_id = ? AND k.version = p.version WHERE p.account_id = ? AND p.needs_ack = 1 AND k.at IS NULL", e.id, a.id)).n)
      await run(env, "UPDATE hr_tasks SET done_at = ? WHERE employee_id = ? AND owner = 'employee' AND done_at = 0 AND title LIKE '%polic%'", now(), e.id);
    return json({ ok: true });
  }
  if ((r = M('POST', 'tasks/:tid'))) { await run(env, "UPDATE hr_tasks SET done_at = ? WHERE id = ? AND employee_id = ? AND owner = 'employee'", (await body()).done ? now() : 0, Number(r.tid), e.id); return json({ ok: true }); }
  if (M('POST', 'ask')) {
    const b = await body();
    if (!String(b.question || '').trim()) return json({ error: 'Type your question.' }, 400);
    const pol = await all(env, 'SELECT title, body FROM hr_policies WHERE account_id = ?', a.id);
    return json(await askHr(env, { company: a.company, policies: pol, balances: await C.balances(env, a.id, S, e, year), question: b.question, name: e.name }));
  }
  if (M('GET', 'files')) return json({ files: await R.filesOf(env, a.id, 'employee', e.id) });
  if ((r = M('GET', 'files/:fid'))) return R.fileResponse(env, a.id, r.fid, f => f.owner_type === 'employee' && f.owner_id === e.id);
  if (M('GET', 'approvals')) {
    if (!isMgr) return json({ leaves: [], team: [], today: [] });
    const ids = reports.map(x => x.id);
    const leaves = (await C.listLeaves(env, a.id, {})).filter(l => ids.includes(l.employee_id)).slice(0, 60);
    const day = await C.attendanceDay(env, a.id, S, today);
    return json({ leaves: leaves.map(l => ({ ...l, type_name: typeName(S, l.type) })), team: reports, teams_led: mine.led,
      today: day.rows.filter(x => ids.includes(x.employee.id)).map(x => ({ name: x.employee.name, designation: x.employee.designation, dept: x.employee.dept, code: x.code, label: x.label, in_time: x.in_time || '', out_time: x.out_time || '', kind: x.kind || '', place: x.place || '' })) });
  }
  if ((r = M('POST', 'approvals/:lid'))) {
    const l0 = await one(env, 'SELECT * FROM hr_leaves WHERE id = ? AND account_id = ?', Number(r.lid), a.id);
    if (!l0 || !reports.some(x => x.id === l0.employee_id)) return json({ error: 'Leave request not found' }, 404);
    const b = await body(), l = await C.decideLeave(env, a.id, l0.id, !!b.approve, e.name, b.note);
    const who = await C.getEmp(env, a.id, l.employee_id);
    if (who && who.email) await HM.leaveDecided(env, a, S, who, l, typeName(S, l.type));
    await C.hrLog(env, a.id, e.name, `${l.status === 'approved' ? 'Approved' : 'Declined'} ${typeName(S, l.type)} for ${who && who.name}`);
    await C.emit(env, a, S, 'leave.' + l.status, { employee: who && who.name, type: typeName(S, l.type), start: l.start_date, end: l.end_date, by: e.name });
    return json({ leave: l });
  }
  return json({ error: 'Not found' }, 404);
}

// ================================================================ careers (public)
export async function hrPublic({ method, rest, body, env, request, hrLiveByCode, limitHit }) {
  const M = matcher(method, rest);
  let r;
  if ((r = M('GET', 'offer/:token'))) {
    const x = await R.offerByToken(env, r.token);
    if (!x) return json({ error: 'This offer link is not valid.' }, 404);
    return json({ company: x.a.company, name: x.ap.name, job: x.job.title, offer: { designation: x.offer.designation, join_date: x.offer.join_date, letter: x.offer.letter, status: x.offer.status, expires: x.offer.expires } });
  }
  if ((r = M('POST', 'offer/:token'))) {
    const b = await body();
    const st = await R.answerOffer(env, r.token, b.answer === 'accept', b.note, aid => C.getSettings(env, aid));
    return json({ status: st });
  }
  const a = rest[0] ? await hrLiveByCode(rest[0]) : null;
  if (!a) return json({ error: 'This careers page is not available.' }, 404);
  const S = await C.getSettings(env, a.id), today = C.todayIn(S.timezone);
  const open = j => j.status === 'open' && (!j.closes_on || j.closes_on >= today);
  const pub = j => ({ id: j.id, title: j.title, dept: j.dept, location: j.location, job_type: j.job_type, salary_range: j.salary_range, closes_on: j.closes_on, description: j.description, requirements: j.requirements });
  if (M('GET', ':code')) return json({ company: a.company, intro: S.careers_intro, jobs: (await all(env, "SELECT * FROM hr_jobs WHERE account_id = ? AND status = 'open' ORDER BY created_at DESC", a.id)).filter(open).map(pub) });
  if ((r = M('GET', ':code/:jid'))) {
    const j = await R.getJob(env, a.id, r.jid);
    if (!j || !open(j)) return json({ error: 'This job is no longer open.' }, 404);
    return json({ company: a.company, job: pub(j) });
  }
  if ((r = M('POST', ':code/:jid/apply'))) {
    if (await limitHit()) return json({ error: 'Too many applications from this network. Please try again later.' }, 429);
    const j = await R.getJob(env, a.id, r.jid);
    if (!j || !open(j)) return json({ error: 'This job is no longer open.' }, 404);
    const b = await body();
    if (b.website) return json({ ok: true }); // honeypot
    if (!b.cv || !b.cv.data) return json({ error: 'Please attach your CV.' }, 400);
    await R.addApplicant(env, a, S, j, b, { source: 'careers' });
    return json({ ok: true }, 201);
  }
  return json({ error: 'Not found' }, 404);
}

// ================================================================ daily automation
// Runs once a day per company (the daily cron): exits, reminders, celebrations, payroll draft, HR digest.
export async function runDaily(env, liveAccounts) {
  const out = [];
  for (const a of liveAccounts) {
    try {
      const S = await C.getSettings(env, a.id), today = C.todayIn(S.timezone);
      const row = await one(env, 'SELECT last_daily FROM hr_settings WHERE account_id = ?', a.id);
      if (row && row.last_daily === today) { out.push({ company: a.company, skipped: 'already ran today' }); continue; }
      await run(env, "INSERT INTO hr_settings(account_id, data, last_daily, updated_at) VALUES(?, '{}', ?, ?) ON CONFLICT(account_id) DO UPDATE SET last_daily = excluded.last_daily", a.id, today, now());
      const emps = await C.listEmployees(env, a.id), done = [];
      // 1. people whose last day has passed leave the company (login closed)
      for (const e of emps.filter(e => e.status === 'notice' && J(e.exit, {}).last_day && J(e.exit, {}).last_day < today)) {
        await C.finishExit(env, a, e); done.push(`${e.name} left (last day ${J(e.exit, {}).last_day})`);
        await C.hrLog(env, a.id, 'Automation', `${e.name} has left; portal access closed`);
        await C.emit(env, a, S, 'employee.exited', { employee: e.name, email: e.email, last_day: J(e.exit, {}).last_day });
      }
      // 2. interview reminders for tomorrow
      const tomorrow = C.addDays(today, 1);
      for (const ap of await all(env, "SELECT * FROM hr_applicants WHERE account_id = ? AND stage = 'interview'", a.id)) {
        const iv = J(ap.interview, {});
        if (iv.date === tomorrow && !iv.reminded) {
          const job = await R.getJob(env, a.id, ap.job_id);
          await HM.interviewInvite(env, a, S, job, ap, iv, true);
          await run(env, 'UPDATE hr_applicants SET interview = ? WHERE id = ?', JSON.stringify({ ...iv, reminded: true }), ap.id);
          done.push(`Reminded ${ap.name} about tomorrow’s interview`);
        }
      }
      // 3. birthdays and work anniversaries
      const act = emps.filter(e => ['probation', 'active', 'notice'].includes(e.status));
      if (S.celebrate) for (const e of act) {
        if (!e.email) continue;
        if (e.dob && e.dob.slice(5) === today.slice(5)) { await HM.celebrate(env, a, S, e, 'birthday'); done.push(`Birthday wishes to ${e.name}`); }
        if (e.join_date.slice(5) === today.slice(5) && e.join_date < today) { const y = +today.slice(0, 4) - +e.join_date.slice(0, 4); if (y > 0) { await HM.celebrate(env, a, S, e, 'anniversary', y); done.push(`Anniversary wishes to ${e.name}`); } }
      }
      // 4. payroll draft 3 days before pay day (for the month being paid)
      let payrollNote = '';
      if (S.payroll.auto_draft && act.length) {
        const payDate = today.slice(0, 8) + String(S.payroll.pay_day).padStart(2, '0');
        const target = S.payroll.pay_day <= 10 ? C.addDays(today.slice(0, 8) + '01', -1).slice(0, 7) : today.slice(0, 7);
        const ex = await one(env, 'SELECT id FROM hr_runs WHERE account_id = ? AND month = ?', a.id, target);
        if (!ex && C.diffDays(today, payDate) <= 3 && C.diffDays(today, payDate) >= 0) {
          const x = await C.buildRun(env, a, S, target);
          payrollNote = `Payroll draft for ${target} is ready (${J(x.totals, {}).people} people). Review and approve it before pay day.`;
          done.push(payrollNote);
          await C.hrLog(env, a.id, 'Automation', `Prepared payroll draft for ${target}`);
        }
      }
      // 5. find new candidates for jobs with automatic search on
      try { for (const t of await SO.dailySourcing(env, a, S)) done.push(t); } catch (e) { /* search is optional */ }
      // 6. the HR digest
      const ov = await C.overview(env, a, S);
      const items = [];
      if (ov.pending_count) items.push(`${ov.pending_count} leave request${ov.pending_count === 1 ? '' : 's'} waiting for approval`);
      if (ov.new_applicants.length) items.push(`${ov.new_applicants.length} new applicant${ov.new_applicants.length === 1 ? '' : 's'} to review`);
      for (const i of ov.interviews.filter(i => i.interview.date === today)) items.push(`Interview today: ${i.name} (${i.title}) at ${i.interview.time}`);
      if (ov.on_leave.length) items.push(`On leave today: ${ov.on_leave.map(x => x.name).join(', ')}`);
      for (const x of ov.attention.slice(0, 8)) items.push(`${x.text} ${x.date}`);
      for (const x of ov.celebrations.filter(c => c.date === today)) items.push(x.text + ' today');
      if (payrollNote) items.push(payrollNote);
      for (const x of done.filter(t => /left|candidates found/.test(t))) items.push(x);
      const h = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      if (items.length) await HM.toHr(env, a, S, `HR today: ${items.length} thing${items.length === 1 ? '' : 's'} to know`, 'digest', `Good morning, ${a.company}`, 'Here is what needs attention today.',
        `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#1d1a3a">${items.map(t => `<li>${h(t)}</li>`).join('')}</ul>`, '/');
      out.push({ company: a.company, done, digest: items.length });
    } catch (e) { out.push({ company: a.company, error: e.message }); }
  }
  return out;
}
