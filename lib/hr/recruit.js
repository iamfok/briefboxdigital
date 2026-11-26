// Recruitment: jobs → applications (AI screened) → interview → offer (candidate accepts online) → hire (becomes an employee).
import { all, one, run, err, J, now, DATE, todayIn, saveEmployee, getEmp, hrLog, emit, grossOf } from './core.js';
const rnd2 = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join('');
import { screen, readCv } from './ai.js';
import * as HM from './mail.js';

const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const STAGES = ['new', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'];
const rnd = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join('');
export const fill = (tpl, v) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => v[k] != null && v[k] !== '' ? String(v[k]) : m);

// ---------------------------------------------------------------- files (CVs and employee documents), stored in D1
export const FILE_MAX = 1200000;
const TYPES = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
export async function saveFile(env, aid, ownerType, ownerId, f, { kind = 'other', expires_on = '' } = {}) {
  if (!f || !f.data) throw err('Choose a file.');
  if (!TYPES[f.type]) throw err('Upload a PDF, Word file or image.');
  const size = Math.floor(String(f.data).length * 3 / 4);
  if (size > FILE_MAX) throw err('The file is larger than 1.2 MB. Please upload a smaller file.');
  if (!/^[A-Za-z0-9+/=]+$/.test(f.data)) throw err('The file could not be read.');
  const r = await run(env, 'INSERT INTO hr_files(account_id, owner_type, owner_id, kind, name, type, size, data, expires_on, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    aid, ownerType, ownerId, str(kind, 30) || 'other', str(f.name, 120) || 'file.' + TYPES[f.type], f.type, size, f.data, DATE.test(expires_on || '') ? expires_on : '', now());
  return r.meta.last_row_id;
}
// Employee photo: an image up to 400 KB, shown in HR and in the app.
export async function setPhoto(env, aid, empId, f) {
  if (!f || !f.data || !/^image\/(png|jpeg|webp)$/.test(f.type || '')) throw err('Upload the photo as JPG, PNG or WebP.');
  if (String(f.data).length * 3 / 4 > 400000) throw err('The photo is larger than 400 KB. Please use a smaller photo.');
  const old = await one(env, 'SELECT photo_id FROM hr_employees WHERE id = ? AND account_id = ?', empId, aid);
  if (old && old.photo_id) await run(env, "DELETE FROM hr_files WHERE id = ? AND kind = 'photo'", old.photo_id);
  const id = await saveFile(env, aid, 'employee', empId, { ...f, name: f.name || 'photo' }, { kind: 'photo' });
  await run(env, 'UPDATE hr_employees SET photo_id = ? WHERE id = ?', id, empId);
  return id;
}
export const filesOf = (env, aid, type, id) => all(env, 'SELECT id, kind, name, type, size, expires_on, created_at FROM hr_files WHERE account_id = ? AND owner_type = ? AND owner_id = ? ORDER BY created_at DESC', aid, type, id);
export async function fileResponse(env, aid, fid, check) {
  const f = await one(env, 'SELECT * FROM hr_files WHERE id = ? AND account_id = ?', Number(fid), aid);
  if (!f || (check && !check(f))) return new Response('Not found', { status: 404 });
  const bin = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
  return new Response(bin, { headers: { 'Content-Type': f.type, 'Content-Disposition': `inline; filename="${f.name.replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}

// ---------------------------------------------------------------- jobs
export const jobOut = j => j && ({ ...j });
export async function listJobs(env, aid) {
  return all(env, `SELECT j.*, (SELECT COUNT(*) FROM hr_applicants a WHERE a.job_id = j.id) AS applicants,
    (SELECT COUNT(*) FROM hr_applicants a WHERE a.job_id = j.id AND a.stage = 'new') AS new_count FROM hr_jobs j WHERE j.account_id = ? ORDER BY CASE j.status WHEN 'open' THEN 0 ELSE 1 END, j.created_at DESC`, aid);
}
export const getJob = (env, aid, id) => one(env, 'SELECT * FROM hr_jobs WHERE id = ? AND account_id = ?', Number(id), aid);
export async function saveJob(env, aid, b, id) {
  const cur = id ? await getJob(env, aid, id) : null;
  if (id && !cur) throw err('Job not found', 404);
  const v = { title: str(b.title ?? (cur && cur.title), 120), dept: str(b.dept ?? (cur && cur.dept), 60), location: str(b.location ?? (cur && cur.location), 80),
    job_type: str(b.job_type ?? (cur && cur.job_type) ?? 'Full-time', 30), description: str(b.description ?? (cur && cur.description), 8000), requirements: str(b.requirements ?? (cur && cur.requirements), 6000),
    salary_range: str(b.salary_range ?? (cur && cur.salary_range), 80), closes_on: str(b.closes_on ?? (cur && cur.closes_on), 10), status: ['open', 'closed', 'draft'].includes(b.status) ? b.status : (cur ? cur.status : 'open') };
  if (!v.title) throw err('Add the job title.');
  if (v.closes_on && !DATE.test(v.closes_on)) throw err('The closing date looks like 2026-12-31.');
  if (cur) {
    await run(env, 'UPDATE hr_jobs SET title=?, dept=?, location=?, job_type=?, description=?, requirements=?, salary_range=?, closes_on=?, status=?, updated_at=? WHERE id=?',
      v.title, v.dept, v.location, v.job_type, v.description, v.requirements, v.salary_range, v.closes_on, v.status, now(), cur.id);
    return getJob(env, aid, cur.id);
  }
  const r = await run(env, 'INSERT INTO hr_jobs(account_id, title, dept, location, job_type, description, requirements, salary_range, closes_on, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    aid, v.title, v.dept, v.location, v.job_type, v.description, v.requirements, v.salary_range, v.closes_on, v.status, now(), now());
  return getJob(env, aid, r.meta.last_row_id);
}

// ---------------------------------------------------------------- applicants
export const apOut = x => x && ({ ...x, ai: J(x.ai, {}), interview: J(x.interview, {}), offer: { ...J(x.offer, {}), token: undefined }, offer_token: undefined });
export const getAp = (env, aid, id) => one(env, 'SELECT * FROM hr_applicants WHERE id = ? AND account_id = ?', Number(id), aid);
export const applicantsOf = async (env, aid, jobId) => (await all(env, 'SELECT * FROM hr_applicants WHERE account_id = ? AND job_id = ? ORDER BY CASE WHEN score IS NULL THEN 1 ELSE 0 END, score DESC, created_at DESC', aid, Number(jobId))).map(apOut);
export async function addApplicant(env, a, S, job, b, { source = 'careers' } = {}) {
  const v = { name: str(b.name, 100), email: str(b.email, 120).toLowerCase(), phone: str(b.phone, 30), experience: Math.max(0, Math.min(60, Number(b.experience) || 0)),
    current_role: str(b.current_role, 120), expected_salary: str(b.expected_salary, 60), link: str(b.link, 300), cover: str(b.cover, 5000) };
  if (!v.name) throw err('Add your name.');
  if (!EMAIL.test(v.email)) throw err('Add a valid email.');
  const dup = await one(env, 'SELECT id FROM hr_applicants WHERE job_id = ? AND email = ?', job.id, v.email);
  if (dup) throw err('You have already applied for this job with this email.');
  const r = await run(env, `INSERT INTO hr_applicants(account_id, job_id, name, email, phone, experience, current_role, expected_salary, link, cover, source, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    a.id, job.id, v.name, v.email, v.phone, v.experience, v.current_role, v.expected_salary, v.link, v.cover, source, now(), now());
  const id = r.meta.last_row_id;
  if (b.cv && b.cv.data) await saveFile(env, a.id, 'applicant', id, b.cv, { kind: 'cv' });
  const screened = await rescreen(env, a, S, id);
  if (source === 'careers') await afterScreen(env, a, S, job, screened);
  await hrLog(env, a.id, source === 'careers' ? v.name : 'HR', `New application for ${job.title}: ${v.name}`);
  const ap = await getAp(env, a.id, id);
  await emit(env, a, S, 'applicant.created', { job: job.title, applicant: apOut(ap) });
  return ap;
}
// Every candidate hears back: shortlisted → "you're shortlisted", otherwise "we received your CV" (or a polite no, if HR turned that on).
export async function afterScreen(env, a, S, job, ap) {
  if (!ap.email) return 'no email';
  if (ap.stage === 'shortlisted' && S.recruit.auto_interview) {
    // book the first free interview slot; the invite email replaces the "shortlisted" email
    const { autoInterview } = await import('./pipeline.js');
    const slot = await autoInterview(env, a, S, ap, 1);
    if (slot) return 'interview booked';
  }
  if (ap.stage === 'shortlisted' && S.notify_shortlist) { await HM.shortlisted(env, a, S, job, ap); return 'shortlisted'; }
  if (S.auto_regret && ap.score != null && ap.score < 45 && ap.stage === 'new') {
    await run(env, "UPDATE hr_applicants SET stage = 'rejected', updated_at = ? WHERE id = ?", now(), ap.id);
    if (S.notify_candidates) await HM.rejected(env, a, S, job, ap);
    return 'not selected';
  }
  if (S.notify_candidates) await HM.applicationReceived(env, a, S, job, ap);
  return 'received';
}
// HR uploads CVs collected from Bdjobs, Facebook, LinkedIn, email… one file per call.
export const SOURCES = { bdjobs: 'Bdjobs', facebook: 'Facebook', linkedin: 'LinkedIn', email: 'Email', drive: 'Google Drive', referral: 'Referral', walkin: 'Walk-in', hr: 'Other' };
export async function importCv(env, a, S, job, b) {
  const source = SOURCES[b.source] ? b.source : 'hr';
  if (!b.cv || !b.cv.data) throw err('Choose a CV file.');
  const info = await readCv(env, b.cv, b.cv.name);
  const email = EMAIL.test(info.email || '') ? info.email : '';
  if (email) {
    const dup = await one(env, 'SELECT id, name FROM hr_applicants WHERE job_id = ? AND email = ?', job.id, email);
    if (dup) return { duplicate: true, name: dup.name, id: dup.id };
  }
  const name = str(info.name, 100) || 'Unnamed candidate';
  const r = await run(env, `INSERT INTO hr_applicants(account_id, job_id, name, email, phone, experience, current_role, link, cover, source, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    a.id, job.id, name, email, str(info.phone, 30), info.experience || 0, str(info.current_role, 120), str(b.link, 300), str(b.note, 2000), source, now(), now());
  const id = r.meta.last_row_id;
  await saveFile(env, a.id, 'applicant', id, b.cv, { kind: 'cv' });
  if (b.prospect_id) await run(env, "UPDATE hr_prospects SET status = 'cv_received', applicant_id = ?, updated_at = ? WHERE id = ? AND account_id = ?", id, now(), Number(b.prospect_id), a.id);
  const ap = await rescreen(env, a, S, id);
  const emailed = b.email === false ? 'not sent' : await afterScreen(env, a, S, job, ap);
  const fin = await getAp(env, a.id, id);
  await emit(env, a, S, 'applicant.created', { job: job.title, source, applicant: apOut(fin) });
  return { applicant: apOut(fin), emailed, read_by: info.by };
}
export async function rescreen(env, a, S, id) {
  const ap = await getAp(env, a.id, id);
  if (!ap) throw err('Applicant not found', 404);
  const job = await getJob(env, a.id, ap.job_id);
  const cv = await one(env, "SELECT type, data FROM hr_files WHERE account_id = ? AND owner_type = 'applicant' AND owner_id = ? AND kind = 'cv' ORDER BY id DESC", a.id, ap.id);
  const res = await screen(env, job, ap, cv);
  // AI only suggests: a high score moves a new applicant to "shortlisted"; nobody is rejected automatically.
  const stage = ap.stage === 'new' && S.ai_shortlist > 0 && res.score >= S.ai_shortlist ? 'shortlisted' : ap.stage;
  await run(env, 'UPDATE hr_applicants SET ai = ?, score = ?, stage = ?, updated_at = ? WHERE id = ?', JSON.stringify({ ...res, at: now() }), res.score, stage, now(), ap.id);
  return getAp(env, a.id, ap.id);
}
export async function setStage(env, a, S, id, b, who) {
  const ap = await getAp(env, a.id, id);
  if (!ap) throw err('Applicant not found', 404);
  const sets = [], vals = [];
  if (b.stage) { if (!STAGES.includes(b.stage) || b.stage === 'hired') throw err('Use the Hire button to hire.'); sets.push('stage = ?'); vals.push(b.stage); }
  if ('notes' in b) { sets.push('notes = ?'); vals.push(str(b.notes, 5000)); }
  if (b.feedback) { const iv = J(ap.interview, {}); iv.rating = Math.max(1, Math.min(5, Number(b.feedback.rating) || 3)); iv.feedback = str(b.feedback.text, 3000); iv.by = who; sets.push('interview = ?'); vals.push(JSON.stringify(iv)); }
  for (const k of ['name', 'phone', 'current_role']) if (k in b) { sets.push(k + ' = ?'); vals.push(str(b[k], 120)); }
  if ('email' in b) { const em = str(b.email, 120).toLowerCase(); if (em && !EMAIL.test(em)) throw err('That email is not valid.'); sets.push('email = ?'); vals.push(em); }
  if (!sets.length) return ap;
  await run(env, `UPDATE hr_applicants SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...vals, now(), ap.id);
  if (b.stage && b.stage !== ap.stage) await emit(env, a, S, 'applicant.stage', { applicant: ap.name, email: ap.email, from: ap.stage, to: b.stage });
  return getAp(env, a.id, ap.id);
}
export async function scheduleInterview(env, a, S, id, b, who) {
  const ap = await getAp(env, a.id, id);
  if (!ap) throw err('Applicant not found', 404);
  if (!DATE.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.time || '')) throw err('Choose the interview date and time.');
  const iv = { ...J(ap.interview, {}), date: b.date, time: b.time, mode: str(b.mode, 30) || 'In person', where: str(b.where, 300), with: str(b.with, 120), message: str(b.message, 1000), reminded: false, set_by: who };
  await run(env, "UPDATE hr_applicants SET stage = 'interview', interview = ?, updated_at = ? WHERE id = ?", JSON.stringify(iv), now(), ap.id);
  const job = await getJob(env, a.id, ap.job_id);
  if (b.send !== false) await HM.interviewInvite(env, a, S, job, ap, iv);
  await hrLog(env, a.id, who, `Interview set for ${ap.name} (${job.title}) on ${new Date(iv.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}, ${iv.time}`);
  await emit(env, a, S, 'applicant.interview', { applicant: ap.name, email: ap.email, phone: ap.phone, job: job.title, ...iv });
  return getAp(env, a.id, ap.id);
}
export function offerLetter(a, S, job, ap, o) {
  return fill(S.letters.offer, { name: ap.name, designation: o.designation || job.title, company: a.company, join_date: o.join_date, dept: o.dept || job.dept,
    salary: `${S.currency} ${Number(o.basic_gross || 0).toLocaleString('en-US')}`, probation_months: S.probation_months, date: todayIn(S.timezone) });
}
export async function sendOffer(env, a, S, id, b, who) {
  const ap = await getAp(env, a.id, id);
  if (!ap) throw err('Applicant not found', 404);
  const job = await getJob(env, a.id, ap.job_id);
  if (!DATE.test(b.join_date || '')) throw err('Choose the joining date.');
  const basic = Math.max(0, Number(b.basic) || 0);
  if (!basic) throw err('Add the basic salary.');
  const token = rnd();
  const o = { designation: str(b.designation, 80) || job.title, dept: str(b.dept, 60) || job.dept, join_date: b.join_date, basic, basic_gross: grossOf(S, { basic, extra: [] }).gross,
    expires: DATE.test(b.expires || '') ? b.expires : '', sent_at: now(), status: 'sent', token, by: who };
  o.letter = str(b.letter, 6000) || offerLetter(a, S, job, ap, o);
  await run(env, "UPDATE hr_applicants SET stage = 'offer', offer = ?, offer_token = ?, updated_at = ? WHERE id = ?", JSON.stringify(o), token, now(), ap.id);
  await HM.offerSent(env, a, S, job, ap, o, o.letter);
  await hrLog(env, a.id, who, `Offer sent to ${ap.name} for ${job.title}`);
  await emit(env, a, S, 'applicant.offer', { applicant: ap.name, email: ap.email, phone: ap.phone, job: job.title, join_date: o.join_date });
  return getAp(env, a.id, ap.id);
}
// The candidate opens the offer link and accepts or declines.
export async function offerByToken(env, token) {
  if (!/^[a-f0-9]{36}$/.test(String(token || ''))) return null;
  const ap = await one(env, 'SELECT * FROM hr_applicants WHERE offer_token = ?', token);
  if (!ap) return null;
  const a = await one(env, 'SELECT id, company, client_id, email, phone, address, country FROM accounts WHERE id = ?', ap.account_id);
  const job = await getJob(env, ap.account_id, ap.job_id);
  return { ap, a, job, offer: J(ap.offer, {}) };
}
export async function answerOffer(env, token, accept, note, getS) {
  const x = await offerByToken(env, token);
  if (!x) throw err('This offer link is not valid.', 404);
  if (x.offer.status !== 'sent') throw err('This offer was already answered.');
  if (x.offer.expires && x.offer.expires < todayIn('Asia/Dhaka')) throw err('This offer has expired. Please contact us.');
  const o = { ...x.offer, status: accept ? 'accepted' : 'declined', answered_at: now(), answer_note: str(note, 1000) };
  await run(env, 'UPDATE hr_applicants SET offer = ?, stage = ?, updated_at = ? WHERE id = ?', JSON.stringify(o), accept ? 'offer' : 'rejected', now(), x.ap.id);
  const S = await getS(x.a.id);
  await HM.toHr(env, x.a, S, `Offer ${o.status}: ${x.ap.name} (${x.job.title})`, 'offer-answer', `Offer ${o.status}`,
    `${x.ap.name} ${o.status} the offer for ${x.job.title}.${o.answer_note ? ' Note: ' + o.answer_note : ''}${accept ? ' Open the applicant and click Hire to create the employee.' : ''}`);
  await hrLog(env, x.a.id, x.ap.name, `Offer ${o.status} for ${x.job.title}`);
  await emit(env, x.a, S, 'applicant.offer_' + o.status, { applicant: x.ap.name, email: x.ap.email, job: x.job.title });
  return o.status;
}
// HR decides after the interview: hire with the job details. The person becomes an employee and gets the appointment letter.
export async function hire(env, a, S, id, who, { limit = 0 } = {}, b = {}) {
  const ap = await getAp(env, a.id, id);
  if (!ap) throw err('Applicant not found', 404);
  if (ap.employee_id) throw err('Already hired.');
  const job = await getJob(env, a.id, ap.job_id), o = J(ap.offer, {});
  const email = str(b.email ?? ap.email, 120).toLowerCase();
  const e = await saveEmployee(env, a, S, { name: str(b.name, 100) || ap.name, email, phone: str(b.phone ?? ap.phone, 30), dept: str(b.dept, 60) || o.dept || job.dept,
    designation: str(b.designation, 80) || o.designation || job.title, join_date: DATE.test(b.join_date || '') ? b.join_date : o.join_date || todayIn(S.timezone),
    emp_type: b.emp_type, manager_id: b.manager_id, salary: { basic: Number(b.basic) > 0 ? Number(b.basic) : o.basic || 0, extra: [] }, applicant_id: ap.id }, null, { limit });
  await run(env, "UPDATE hr_applicants SET stage = 'hired', employee_id = ?, updated_at = ? WHERE id = ?", e.id, now(), ap.id);
  // the CV moves to the employee's documents
  await run(env, "INSERT INTO hr_files(account_id, owner_type, owner_id, kind, name, type, size, data, expires_on, created_at) SELECT account_id, 'employee', ?, 'cv', name, type, size, data, '', created_at FROM hr_files WHERE account_id = ? AND owner_type = 'applicant' AND owner_id = ?", e.id, a.id, ap.id);
  await hrLog(env, a.id, who, `Hired ${ap.name} as ${e.designation}`);
  await emit(env, a, S, 'employee.hired', { employee: e.name, email: e.email, phone: e.phone, designation: e.designation, join_date: e.join_date });
  let letter = null;
  if (b.send_letter !== false) letter = await sendAppointment(env, a, S, e, who, { text: b.letter, invite: b.invite !== false });
  return { employee: await getEmp(env, a.id, e.id), letter };
}
// ---------------------------------------------------------------- appointment letter
const day = d => { try { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); } catch (x) { return d; } };
const to12 = t => { const h = +t.slice(0, 2), m = t.slice(3); return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`; };
export async function appointmentText(env, a, S, e) {
  const mgr = e.manager_id ? await one(env, 'SELECT name, designation FROM hr_employees WHERE id = ?', e.manager_id) : null;
  const g = grossOf(S, J(e.salary, {}));
  return fill(S.letters.appointment, { name: e.name, designation: e.designation || '', dept: e.dept || '', company: a.company, join_date: day(e.join_date), date: day(todayIn(S.timezone)),
    salary: `${S.currency} ${Number(g.gross || 0).toLocaleString('en-US')} (basic ${S.currency} ${Number(g.basic || 0).toLocaleString('en-US')})`, probation_months: S.probation_months,
    office_hours: `${to12(S.office_start)} to ${to12(S.office_end)}`, manager: mgr ? `${mgr.name}${mgr.designation ? ', ' + mgr.designation : ''}` : 'your line manager', code: e.code });
}
const b64 = t => { const u = new TextEncoder().encode(t); let s2 = ''; for (let i = 0; i < u.length; i += 8192) s2 += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s2); };
export async function letterOf(env, aid, empId) {
  const f = await one(env, "SELECT id, data, created_at FROM hr_files WHERE account_id = ? AND owner_type = 'employee' AND owner_id = ? AND kind = 'appointment' ORDER BY id DESC", aid, empId);
  if (!f) return null;
  return { id: f.id, at: f.created_at, text: new TextDecoder().decode(Uint8Array.from(atob(f.data), c => c.charCodeAt(0))) };
}
export async function sendAppointment(env, a, S, e, who, { text, invite = true } = {}) {
  const body = str(text, 8000) || await appointmentText(env, a, S, e);
  await run(env, "DELETE FROM hr_files WHERE account_id = ? AND owner_type = 'employee' AND owner_id = ? AND kind = 'appointment'", a.id, e.id);
  const data = b64(body);
  await run(env, 'INSERT INTO hr_files(account_id, owner_type, owner_id, kind, name, type, size, data, expires_on, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    a.id, 'employee', e.id, 'appointment', `Appointment letter - ${e.name}.txt`, 'text/plain', body.length, data, '', now());
  let token = '';
  if (invite && e.email && !e.login_enabled) { token = rnd2(); await run(env, 'UPDATE hr_employees SET invite_token = ?, invite_expires = ? WHERE id = ?', token, now() + 14 * 864e5, e.id); }
  const sent = e.email ? await HM.appointment(env, a, S, e, body, token) : null;
  await hrLog(env, a.id, who, `Appointment letter ${sent && sent.ok ? 'emailed' : 'saved'} for ${e.name}`);
  return { text: body, emailed: !!(sent && sent.ok), email_error: sent && sent.error, invited: !!token };
}
export async function reject(env, a, S, id, who, { send = true } = {}) {
  const ap = await getAp(env, a.id, id);
  if (!ap) throw err('Applicant not found', 404);
  await run(env, "UPDATE hr_applicants SET stage = 'rejected', updated_at = ? WHERE id = ?", now(), ap.id);
  const job = await getJob(env, a.id, ap.job_id);
  if (send && S.notify_candidates) await HM.rejected(env, a, S, job, ap);
  await hrLog(env, a.id, who, `Not moving forward with ${ap.name} (${job.title})`);
  return getAp(env, a.id, ap.id);
}
export { getEmp };
