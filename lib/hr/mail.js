// HR emails, sent under the company's own name (replies go to its HR email).
import { sendMail, layout, toText, rows, esc, brand, money } from '../le/mail.js';

const day = d => { if (!d) return '-'; try { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };
export const hrEmail = (a, S) => S.hr_email || a.email;
async function send(env, a, S, to, subject, kind, parts) {
  const B0 = await brand(env), B = { ...B0, name: a.company, textLogo: true, email: hrEmail(a, S), phone: a.phone || '', address: [a.address, a.country].filter(Boolean).join(', ') };
  const html = layout(B, parts);
  return sendMail(env, { to, subject, html, text: toText(html), kind: 'hr-' + kind, from_name: a.company, reply_to: hrEmail(a, S) });
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
export const invite = async (env, a, S, e, token) => send(env, a, S, e.email, `Your ${a.company} employee portal`, 'invite', {
  pre: 'Set your password', title: `Welcome to ${esc(a.company)}`,
  intro: `Hi ${esc(e.name)}, your employee portal is ready. Use it to apply for leave, see your attendance and payslips, and read company policies.`,
  body: rows([['Sign-in email', esc(e.email)], ['Employee ID', esc(e.code)]]) + '<p style="font-size:13px;color:#8a87a3;margin:12px 0 0">The link works for 7 days.</p>',
  cta: { label: 'Set your password', href: `${await base(env)}/team#/invite/${token}` } });
export const leaveRequested = async (env, a, S, to, e, l, typeName) => send(env, a, S, to, `Leave request: ${e.name}, ${l.days} day${l.days === 1 ? '' : 's'}`, 'leave-request', {
  pre: `${e.name} asked for ${typeName}`, title: 'A leave request needs your answer',
  intro: `${esc(e.name)} asked for <b>${esc(typeName)}</b>.`,
  body: rows([['Dates', esc(day(l.start_date) + (l.end_date !== l.start_date ? ' – ' + day(l.end_date) : '') + (l.half ? ' (half day)' : ''))], ['Days', esc(l.days)], ['Reason', esc(l.reason || '-')]]),
  cta: { label: 'Approve or decline', href: `${await base(env)}/${to === hrEmail(a, S) ? 'portal' : 'team#/approvals'}` } });
export const leaveDecided = async (env, a, S, e, l, typeName) => send(env, a, S, e.email, `Your leave is ${l.status}`, 'leave-decided', {
  pre: `${typeName}: ${l.status}`, title: l.status === 'approved' ? 'Your leave is approved' : `Your leave request was ${l.status}`,
  intro: `Hi ${esc(e.name)}, your request for <b>${esc(typeName)}</b> (${esc(day(l.start_date) + (l.end_date !== l.start_date ? ' – ' + day(l.end_date) : ''))}) was <b>${esc(l.status)}</b>${l.decided_by ? ' by ' + esc(l.decided_by) : ''}.${l.note ? ' Note: ' + esc(l.note) : ''}`,
  body: '', cta: { label: 'Open your portal', href: `${await base(env)}/team#/leave` } });
export const payslip = async (env, a, S, e, slip, id) => send(env, a, S, e.email, `Your payslip for ${slip.month}`, 'payslip', {
  pre: `Net pay ${money(slip.net, slip.currency)}`, title: `Payslip for ${slip.month}`, intro: `Hi ${esc(e.name)}, your salary for ${esc(slip.month)} has been processed.`,
  body: rows([['Gross pay', esc(money(slip.gross, slip.currency))], ['Deductions', esc(money(slip.deductions_total, slip.currency))], ['Net pay', `<span style="font-size:18px">${esc(money(slip.net, slip.currency))}</span>`]]),
  cta: { label: 'View payslip', href: `${await base(env)}/team#/payslip/${id}` } });
export const notice = async (env, a, S, to, n) => send(env, a, S, to, n.title, 'notice', { pre: n.title, title: n.title, intro: para(n.body), body: '',
  cta: { label: 'Open your portal', href: `${await base(env)}/team#/` } });
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
  cta: { label: token ? 'Set up the employee app' : 'Open the employee app', href: `${await base(env)}/team#/${token ? 'invite/' + token : ''}` } });
