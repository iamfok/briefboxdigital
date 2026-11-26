// Recruitment on autopilot: CVs come in (email, Drive, drop), go to the right position, get screened,
// shortlisted people get an interview slot, HR answers one email at the end of the interview day, and the hire is set up.
import { all, one, run, err, J, now, DATE, todayIn, addDays, isWorkday, hrLog, emit, getEmp, addTasks } from './core.js';
import * as R from './recruit.js';
import * as HM from './mail.js';
import { routeCv } from './ai.js';
import * as A from '../auth.js';

const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const rnd = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join('');

// ---------------------------------------------------------------- CVs for any position
export async function openJobs(env, aid) { return all(env, "SELECT * FROM hr_jobs WHERE account_id = ? AND status = 'open' ORDER BY created_at DESC", aid); }
export async function importAny(env, a, S, b) {
  const jobs = await openJobs(env, a.id);
  if (!jobs.length) throw err('There is no open position. Post a job first, then add CVs.');
  let job = b.job_id ? jobs.find(j => j.id === Number(b.job_id)) : null, route = null;
  if (!job) {
    route = jobs.length === 1 ? { job_id: jobs[0].id, reason: 'The only open position', by: 'only' } : await routeCv(env, jobs, b.cv);
    job = jobs.find(j => j.id === route.job_id) || jobs[0];
  }
  const res = await R.importCv(env, a, S, job, b);
  return { ...res, job: { id: job.id, title: job.title }, route };
}

// ---------------------------------------------------------------- interview slots
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay();
export async function nextSlot(env, a, S, from) {
  const R0 = S.recruit, taken = new Set((await all(env, "SELECT interview FROM hr_applicants WHERE account_id = ? AND stage IN ('interview','shortlisted','offer')", a.id))
    .map(x => J(x.interview, {})).filter(iv => iv.date).map(iv => iv.date + ' ' + iv.time));
  for (let i = 1; i <= 30; i++) {
    const d = addDays(from, i);
    if (!R0.slot_days.includes(dow(d)) || !isWorkday(S, d)) continue;
    for (const t of R0.slot_times) if (!taken.has(d + ' ' + t)) return { date: d, time: t };
  }
  return null;
}
export async function autoInterview(env, a, S, ap, round = 1, who = 'Automation') {
  const slot = await nextSlot(env, a, S, todayIn(S.timezone));
  if (!slot) return null;
  const iv0 = J(ap.interview, {}), history = iv0.date ? [...(iv0.history || []), { round: iv0.round || 1, date: iv0.date, time: iv0.time, rating: iv0.rating, feedback: iv0.feedback, result: iv0.result }] : (iv0.history || []);
  await run(env, 'UPDATE hr_applicants SET interview = ? WHERE id = ?', JSON.stringify({ round, history }), ap.id);
  const x = await R.scheduleInterview(env, a, S, ap.id, { date: slot.date, time: slot.time, mode: S.recruit.mode, where: S.recruit.where, with: '', message: round > 1 ? `This is round ${round} of the interview.` : '' }, who);
  const iv = J(x.interview, {}); iv.round = round; iv.history = history;
  await run(env, 'UPDATE hr_applicants SET interview = ? WHERE id = ?', JSON.stringify(iv), ap.id);
  return { ...slot, round };
}

// ---------------------------------------------------------------- HR's update at the end of the interview day (signed links in the email)
export const actionToken = (env, a, ap, act) => A.makeToken(env, { r: 'iv', a: a.id, ap: ap.id, act }, 24 * 14);
export async function readAction(env, token) { const p = await A.readToken(env, 't=' + token, 't'); return p && p.r === 'iv' ? p : null; }
export async function dayEnd(env, a, S, base) {
  const today = todayIn(S.timezone);
  const aps = (await all(env, "SELECT * FROM hr_applicants WHERE account_id = ? AND stage = 'interview'", a.id)).filter(x => { const iv = J(x.interview, {}); return iv.date === today && !iv.reported; });
  if (!aps.length || !S.recruit.day_end_report) return 0;
  const items = [];
  for (const ap of aps) {
    const job = await R.getJob(env, a.id, ap.job_id), iv = J(ap.interview, {}), round = iv.round || 1;
    const link = async act => `${base}/api/hr-act/${await actionToken(env, a, ap, act)}`;
    items.push({ name: ap.name, job: job.title, time: iv.time, round, last: round >= S.recruit.rounds, score: ap.score,
      next: await link('next'), select: await link('select'), reject: await link('reject') });
    iv.reported = true;
    await run(env, 'UPDATE hr_applicants SET interview = ? WHERE id = ?', JSON.stringify(iv), ap.id);
  }
  await HM.dayEndReport(env, a, S, items);
  await hrLog(env, a.id, 'Automation', `Asked HR for the result of ${items.length} interview${items.length === 1 ? '' : 's'}`);
  return items.length;
}
// HR's answer from the email: next round, select (hire) or not selected
export async function act(env, a, S, p, b, who) {
  const ap = await R.getAp(env, a.id, p.ap);
  if (!ap) throw err('This candidate is no longer in the system.', 404);
  const iv = J(ap.interview, {}), job = await R.getJob(env, a.id, ap.job_id);
  if (ap.stage === 'hired' || ap.stage === 'rejected') return { done: true, message: `${ap.name} is already ${ap.stage === 'hired' ? 'hired' : 'marked as not selected'}.` };
  iv.rating = b.rating ? Math.max(1, Math.min(5, Number(b.rating))) : iv.rating; iv.feedback = str(b.note, 2000) || iv.feedback || ''; iv.by = who;
  if (p.act === 'reject') {
    iv.result = 'not selected'; await run(env, 'UPDATE hr_applicants SET interview = ? WHERE id = ?', JSON.stringify(iv), ap.id);
    await R.reject(env, a, S, ap.id, who, { send: true });
    return { done: true, message: `${ap.name} is marked as not selected. A polite email was sent.` };
  }
  if (p.act === 'next') {
    iv.result = 'next round'; await run(env, 'UPDATE hr_applicants SET interview = ? WHERE id = ?', JSON.stringify(iv), ap.id);
    const slot = await autoInterview(env, a, S, await R.getAp(env, a.id, ap.id), (iv.round || 1) + 1, who);
    if (!slot) { await run(env, "UPDATE hr_applicants SET stage = 'shortlisted' WHERE id = ?", ap.id); return { done: true, message: `${ap.name} moves to the next round. No free interview slot was found: set the date in the HR dashboard.` }; }
    return { done: true, message: `${ap.name} is invited to round ${slot.round} on ${slot.date} at ${slot.time}. The candidate got an email.` };
  }
  if (p.act === 'select') {
    iv.result = 'selected'; await run(env, 'UPDATE hr_applicants SET interview = ? WHERE id = ?', JSON.stringify(iv), ap.id);
    const x = await R.hire(env, a, S, ap.id, who, {}, { designation: b.designation || job.title, dept: b.dept || job.dept, join_date: b.join_date, basic: b.basic, send_letter: true, invite: true });
    const setup = await afterHire(env, a, S, x.employee, who);
    return { done: true, message: `${ap.name} is hired as ${x.employee.designation}. The appointment letter, the app link and the joining documents link were emailed${setup.materials ? ', and the joining checklist went to HR and accounts' : ''}.` };
  }
  throw err('Unknown action.');
}

// ---------------------------------------------------------------- after the hire: joining documents + materials list
export async function afterHire(env, a, S, e, who = 'Automation') {
  const token = rnd();
  await run(env, 'UPDATE hr_employees SET join_token = ? WHERE id = ?', token, e.id);
  if (e.email) await HM.joiningDocs(env, a, S, e, token);
  const list = S.recruit.materials || [];
  if (list.length) {
    await addTasks(env, a.id, e, 'onboarding', list.map(m => 'Prepare: ' + m), e.join_date);
    await HM.materials(env, a, S, e, list);
  }
  await hrLog(env, a.id, who, `Joining set up for ${e.name}: documents link and checklist sent`);
  await emit(env, a, S, 'employee.joining', { employee: e.name, designation: e.designation, join_date: e.join_date, materials: list });
  return { materials: list.length, token };
}
export const JOIN_KINDS = { joining_letter: 'Signed joining letter', nid: 'NID (both sides)', photo: 'Passport-size photo', certificates: 'Educational certificates', other: 'Other document' };
export async function joinInfo(env, token) {
  if (!/^[a-f0-9]{36}$/.test(token || '')) return null;
  const e = await one(env, "SELECT * FROM hr_employees WHERE join_token = ? AND status != 'exited'", token);
  if (!e) return null;
  const a = await one(env, 'SELECT * FROM accounts WHERE id = ?', e.account_id);
  const files = await all(env, "SELECT kind, name FROM hr_files WHERE account_id = ? AND owner_type = 'employee' AND owner_id = ?", a.id, e.id);
  return { e, a, files };
}
export async function joinSubmit(env, token, b) {
  const x = await joinInfo(env, token);
  if (!x) throw err('This link is not valid any more. Please contact HR.', 404);
  const { e, a } = x, S0 = await import('./core.js').then(m => m.getSettings(env, a.id));
  const files = (b.files || []).slice(0, 10);
  if (!files.length && !x.files.some(f => f.kind === 'joining_letter')) throw err('Upload your signed joining letter.');
  for (const f of files) {
    const kind = JOIN_KINDS[f.kind] ? f.kind : 'other';
    if (kind === 'photo' && /^image\//.test(f.type || '')) await R.setPhoto(env, a.id, e.id, f); else await R.saveFile(env, a.id, 'employee', e.id, f, { kind });
  }
  const sets = [], vals = [];
  if (b.blood_group) { sets.push('blood_group = ?'); vals.push(str(b.blood_group, 4)); }
  if (b.nid) { sets.push('nid = ?'); vals.push(str(b.nid, 30).replace(/[^0-9A-Za-z]/g, '')); }
  if (b.emergency) { sets.push('emergency = ?'); vals.push(str(b.emergency, 200)); }
  if (b.address) { sets.push('address = ?'); vals.push(str(b.address, 300)); }
  if (sets.length) await run(env, `UPDATE hr_employees SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...vals, now(), e.id);
  await run(env, "UPDATE hr_tasks SET done_at = ? WHERE employee_id = ? AND done_at = 0 AND (title LIKE 'Collect ID%' OR title LIKE '%joining%')", now(), e.id);
  await hrLog(env, a.id, e.name, `Sent joining documents (${files.length} file${files.length === 1 ? '' : 's'})`);
  await HM.toHr(env, a, S0, `${e.name} sent the joining documents`, 'joining-docs', 'Joining documents received', `${e.name} (${e.designation}) uploaded: ${files.map(f => JOIN_KINDS[f.kind] || 'a document').join(', ') || 'details only'}. Open the employee profile to check them.`);
  await emit(env, a, S0, 'employee.documents', { employee: e.name, files: files.map(f => f.kind) });
  return { ok: true };
}
