// HR emails, sent under the company's own name (replies go to its HR email).
import { sendMail, layout, toText, rows, esc, brand, money } from '../le/mail.js';

const day = d => { if (!d) return '-'; try { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };
export const hrEmail = (a, S) => S.hr_email || a.email;
async function send(env, a, S, to, subject, kind, parts) {
  const B0 = await brand(env), B = { ...B0, name: a.company, textLogo: true, email: hrEmail(a, S), phone: a.phone || '', address: [a.address, a.country].filter(Boolean).join(', '),
    color: (S.brand && S.brand.color) || '', logoUrl: S.brand && S.brand.logo ? `${B0.D}/api/team/brand/${a.client_id}/logo` : '' };
  const html = layout(B, parts);
  return sendMail(env, { to, subject, html, text: toText(html), kind: 'hr-' + kind, from_name: a.company, reply_to: hrEmail(a, S), account_id: a.id });
}
const base = async env => (await brand(env)).D;
const para = t => esc(t).replace(/\n/g, '<br>');
const box = t => `<div style="white-space:pre-wrap;background:#f4f3fb;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.65;color:#1d1a3a">${esc(t)}</div>`;

// ---- candidates
export const applicationReceived = (env, a, S, job, ap) => send(env, a, S, ap.email, `We received your application: ${job.title}`, 'applied', {
  pre: 'Thank you for applying', title: 'Thank you for applying',
  intro: `Hi ${esc(ap.name)}, thank you for applying for <b>${esc(job.title)}</b> at ${esc(a.company)}. We review every application and will contact you if your profile fits the role.`, body: '' });
export const interviewInvite = async (env, a, S, job, ap, iv, reminder = false) => send(env, a, S, ap.email, `${reminder ? 'Reminder: interview tomorrow' : 'Interview invitation'}: ${job.title}`, reminder ? 'interview-reminder' : 'interview', {
  pre: `${day(iv.date)} at ${iv.time}`, title: reminder ? 'Your interview is tomorrow' : 'You are invited to an interview',
  intro: `Hi ${esc(ap.name)}, ${reminder ? 'a quick reminder of your interview' : 'we would like to meet you'} for <b>${esc(job.title)}</b> at ${esc(a.company)}.`,
  body: rows([['Date', esc(day(iv.date))], ['Time', esc(iv.time)], ['Type', esc(iv.mode || 'In person')], ['Where', /^https?:/.test(iv.where || '') ? `<a href="${esc(iv.where)}">${esc(iv.where)}</a>` : esc(iv.where || '-')], ...(iv.with ? [['With', esc(iv.with)]] : [])])
    + (iv.message ? `<p style="font-size:14px;color:#4a4766;margin:14px 0 0">${para(iv.message)}</p>` : '') + `<p style="font-size:13px;color:#8a87a3;margin:14px 0 0">Can't make it? Reply to this email.</p>` });
export const offerSent = async (env, a, S, job, ap, offer, letter) => send(env, a, S, ap.email, `Job offer: ${job.title} at ${a.company}`, 'offer', {
  pre: 'Your offer letter', title: 'Congratulations! Here is your offer',
  intro: `Hi ${esc(ap.name)}, we are happy to offer you the role of <b>${esc(offer.designation || job.title)}</b>. Please read the letter and answer with the button below.`,
  body: box(letter) + (offer.expires ? `<p style="font-size:13px;color:#8a87a3;margin:12px 0 0">Please answer by ${esc(day(offer.expires))}.</p>` : ''),
  cta: { label: 'Accept or decline the offer', href: `${await base(env)}/careers#/offer/${offer.token}` } });
export const rejected = (env, a, S, job, ap) => send(env, a, S, ap.email, `Your application for ${job.title}`, 'rejected', {
  pre: 'An update on your application', title: 'An update on your application',
  intro: `Hi ${esc(ap.name)}, thank you for your interest in <b>${esc(job.title)}</b> at ${esc(a.company)}. After careful review we have decided to move forward with other candidates. We will keep your details and may contact you about future roles. We wish you the very best.`, body: '' });

// ---- HR
export const toHr = async (env, a, S, subject, kind, title, intro, body = '', link = '') => send(env, a, S, hrEmail(a, S), subject, kind, { pre: title, title, intro: esc(intro), body,
  cta: link ? { label: 'Open the HR dashboard', href: `${await base(env)}/portal#${link}` } : null });

// ---- employees
const appOf = (a, S) => (S.brand && S.brand.app_name) || `${a.company} employee app`;
export const invite = async (env, a, S, e, token) => send(env, a, S, e.email, `Set up ${appOf(a, S)}`, 'invite', {
  pre: 'Set your password', title: `Welcome to ${esc(a.company)}`,
  intro: `Hi ${esc(e.name)}, your account in <b>${esc(appOf(a, S))}</b> is ready. Use it to check in, apply for leave, see your attendance and payslips, and read company policies. Open it on your phone and add it to your home screen.`,
  body: rows([['Sign-in email', esc(e.email)], ['Employee ID', esc(e.code)]]) + '<p style="font-size:13px;color:#8a87a3;margin:12px 0 0">The link works for 7 days.</p>',
  cta: { label: 'Set your password', href: `${await base(env)}/team/${a.client_id}#/invite/${token}` } });
export const leaveRequested = async (env, a, S, to, e, l, typeName) => send(env, a, S, to, `Leave request: ${e.name}, ${l.days} day${l.days === 1 ? '' : 's'}`, 'leave-request', {
  pre: `${e.name} asked for ${typeName}`, title: 'A leave request needs your answer',
  intro: `${esc(e.name)} asked for <b>${esc(typeName)}</b>.`,
  body: rows([['Dates', esc(day(l.start_date) + (l.end_date !== l.start_date ? ' – ' + day(l.end_date) : '') + (l.half ? ' (half day)' : ''))], ['Days', esc(l.days)], ['Reason', esc(l.reason || '-')]]),
  cta: { label: 'Approve or decline', href: `${await base(env)}/${to === hrEmail(a, S) ? 'portal' : `team/${a.client_id}#/approvals`}` } });
export const leaveDecided = async (env, a, S, e, l, typeName) => send(env, a, S, e.email, `Your leave is ${l.status}`, 'leave-decided', {
  pre: `${typeName}: ${l.status}`, title: l.status === 'approved' ? 'Your leave is approved' : `Your leave request was ${l.status}`,
  intro: `Hi ${esc(e.name)}, your request for <b>${esc(typeName)}</b> (${esc(day(l.start_date) + (l.end_date !== l.start_date ? ' – ' + day(l.end_date) : ''))}) was <b>${esc(l.status)}</b>${l.decided_by ? ' by ' + esc(l.decided_by) : ''}.${l.note ? ' Note: ' + esc(l.note) : ''}`,
  body: '', cta: { label: 'Open your portal', href: `${await base(env)}/team/${a.client_id}#/leave` } });
export const payslip = async (env, a, S, e, slip, id) => send(env, a, S, e.email, `Your payslip for ${slip.month}`, 'payslip', {
  pre: `Net pay ${money(slip.net, slip.currency)}`, title: `Payslip for ${slip.month}`, intro: `Hi ${esc(e.name)}, your salary for ${esc(slip.month)} has been processed.`,
  body: rows([['Gross pay', esc(money(slip.gross, slip.currency))], ['Deductions', esc(money(slip.deductions_total, slip.currency))], ['Net pay', `<span style="font-size:18px">${esc(money(slip.net, slip.currency))}</span>`]]),
  cta: { label: 'View payslip', href: `${await base(env)}/team/${a.client_id}#/payslip/${id}` } });
export const notice = async (env, a, S, to, n) => send(env, a, S, to, n.title, 'notice', { pre: n.title, title: n.title, intro: para(n.body), body: '',
  cta: { label: 'Open your portal', href: `${await base(env)}/team/${a.client_id}#/` } });
export const exitLetter = (env, a, S, e, ex) => send(env, a, S, e.email, `Your last working day: ${day(ex.last_day)}`, 'exit', {
  pre: 'Next steps before you leave', title: 'Next steps before you leave',
  intro: `Hi ${esc(e.name)}, this confirms that your last working day at ${esc(a.company)} is <b>${esc(day(ex.last_day))}</b>. HR will contact you about handover, returning company items and your final settlement.`, body: '' });
export const celebrate = (env, a, S, e, kind, years) => send(env, a, S, e.email, kind === 'birthday' ? `Happy birthday, ${e.name}!` : `Happy ${years} year${years === 1 ? '' : 's'} at ${a.company}!`, 'celebrate', {
  pre: 'From all of us', title: kind === 'birthday' ? `Happy birthday, ${esc(e.name)}!` : `Happy work anniversary, ${esc(e.name)}!`,
  intro: kind === 'birthday' ? `Everyone at ${esc(a.company)} wishes you a wonderful day and a great year ahead.` : `Thank you for ${years} year${years === 1 ? '' : 's'} with ${esc(a.company)}. We are glad to have you on the team.`, body: '' });
export const shortlisted = (env, a, S, job, ap) => send(env, a, S, ap.email, `You're shortlisted: ${job.title} at ${a.company}`, 'shortlisted', {
  pre: 'Good news about your application', title: 'You are shortlisted',
  intro: `Hi ${esc(ap.name)}, thank you for your interest in <b>${esc(job.title)}</b> at ${esc(a.company)}. Your profile matches what we are looking for, and you are on our shortlist.`,
  body: `<p style="font-size:14px;color:#4a4766;margin:0">Our HR team will contact you soon to arrange an interview. Please keep your phone close, and reply to this email if your number has changed.</p>` });
export const appointment = async (env, a, S, e, letter, token) => send(env, a, S, e.email, `Appointment letter: ${e.designation || 'your new role'} at ${a.company}`, 'appointment', {
  pre: 'Welcome to the team', title: `Welcome to ${esc(a.company)}`,
  intro: `Hi ${esc(e.name)}, congratulations! Here is your appointment letter. ${token ? 'Set up the employee app with the button below: you will use it for attendance, leave and payslips.' : 'You can also read it any time in the employee app.'}`,
  body: box(letter) + rows([['Employee ID', esc(e.code)], ['Sign-in email', esc(e.email)]]) + (token ? '<p style="font-size:13px;color:#8a87a3;margin:12px 0 0">The setup link works for 14 days.</p>' : ''),
  cta: { label: token ? 'Set up the employee app' : 'Open the employee app', href: `${await base(env)}/team/${a.client_id}#/${token ? 'invite/' + token : ''}` } });

// ---- recruitment automation
const btn = (href, label, bg) => `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:9px 14px;border-radius:9px;margin:4px 6px 0 0">${esc(label)}</a>`;
export const dayEndReport = (env, a, S, items) => send(env, a, S, hrEmail(a, S), `Today's interviews: what happened? (${items.length})`, 'day-end', {
  pre: 'One click per candidate', title: 'How did today’s interviews go?',
  intro: `${items.length} interview${items.length === 1 ? '' : 's'} took place today. Choose the result for each candidate. The rest happens by itself: the next round is booked, the hire gets the appointment letter, or the candidate gets a polite email.`,
  body: items.map(x => `<div style="border:1px solid #e6e3f5;border-radius:12px;padding:14px 16px;margin:0 0 12px">
    <div style="font-size:15px;font-weight:700;color:#1d1a3a">${esc(x.name)}</div>
    <div style="font-size:13px;color:#6b6887;margin:2px 0 8px">${esc(x.job)} · round ${x.round} at ${esc(x.time)}${x.score != null ? ' · AI score ' + x.score : ''}</div>
    ${x.last ? '' : btn(x.next, 'Next round', '#2563eb')}${btn(x.select, 'Selected: hire', '#0a7d5a')}${btn(x.reject, 'Not selected', '#b42318')}</div>`).join('')
    + '<p style="font-size:12.5px;color:#8a87a3;margin:6px 0 0">Each button opens a short page where you confirm and can add a note. The links work for 14 days.</p>' });
export const joiningDocs = async (env, a, S, e, token) => send(env, a, S, e.email, `Joining documents for ${a.company}`, 'joining-docs', {
  pre: 'Please upload before your first day', title: 'Your joining documents',
  intro: `Hi ${esc(e.name)}, please upload your signed joining letter (print the appointment letter, sign it and take a clear photo or scan), your NID, a passport-size photo and your certificates before you join on ${esc(day(e.join_date))}.`,
  body: '', cta: { label: 'Upload documents', href: `${await base(env)}/careers#/join/${token}` } });
export const materials = (env, a, S, e, list) => send(env, a, S, [hrEmail(a, S), S.recruit.accounts_email].filter(Boolean).join(','), `Joining checklist: ${e.name}, ${day(e.join_date)}`, 'materials', {
  pre: `${e.name} joins on ${day(e.join_date)}`, title: 'Please get these ready',
  intro: `<b>${esc(e.name)}</b> joins as ${esc(e.designation || '')}${e.dept ? ' in ' + esc(e.dept) : ''} on <b>${esc(day(e.join_date))}</b>. Please arrange:`,
  body: `<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.9;color:#1d1a3a">${list.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` + rows([['Employee ID', esc(e.code)], ['Email', esc(e.email || '-')], ['Phone', esc(e.phone || '-')]]) });

// ---- payroll
export const payrollReport = (env, a, S, to, run, slips, totals, draft) => send(env, a, S, to, `${draft ? 'Draft payroll' : 'Payroll'} for ${run.month}: net ${money(totals.net, S.currency)}`, 'payroll-report', {
  pre: `${totals.people} people · net ${money(totals.net, S.currency)}`, title: `${draft ? 'Draft payroll' : 'Payroll'} · ${esc(run.month)}`,
  intro: `${draft ? 'For review: this payroll is not approved yet.' : 'This payroll is approved.'} Totals by team and the full list are below.`,
  body: rows([['People', esc(totals.people)], ['Gross', esc(money(totals.gross, S.currency))], ['Deductions', esc(money(totals.deductions, S.currency))], ['Net pay', `<b style="font-size:17px">${esc(money(totals.net, S.currency))}</b>`]])
    + `<h3 style="font-size:14px;margin:18px 0 6px;color:#1d1a3a">By team</h3>` + rows(Object.entries(slips.reduce((o, p) => { const k = p.dept || 'No team'; o[k] = (o[k] || 0) + p.net; return o; }, {})).map(([k, v]) => [esc(k), esc(money(v, S.currency))]))
    + `<h3 style="font-size:14px;margin:18px 0 6px;color:#1d1a3a">Everyone</h3><table role="presentation" width="100%" style="border-collapse:collapse;font-size:12.5px">
      <tr style="color:#6b6887;text-align:left"><th style="padding:6px 4px">Name</th><th style="padding:6px 4px">Team</th><th style="padding:6px 4px;text-align:right">Gross</th><th style="padding:6px 4px;text-align:right">Deductions</th><th style="padding:6px 4px;text-align:right">Net</th></tr>
      ${slips.map(p => `<tr style="border-top:1px solid #eee"><td style="padding:6px 4px">${esc(p.name)}</td><td style="padding:6px 4px">${esc(p.dept || '')}</td><td style="padding:6px 4px;text-align:right">${esc(Number(p.gross).toLocaleString('en-US'))}</td><td style="padding:6px 4px;text-align:right">${esc(Number(p.deductions).toLocaleString('en-US'))}</td><td style="padding:6px 4px;text-align:right"><b>${esc(Number(p.net).toLocaleString('en-US'))}</b></td></tr>`).join('')}</table>` });
