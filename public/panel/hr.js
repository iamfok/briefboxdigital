/* HR automation inside the client portal: the HR team's dashboard.
   Routes: #/a/<sub>/hr/<section>/<id>/<view> */
(() => {
'use strict';
const { $, $$, esc, toast, fmtDate, fmtDateTime, money, busy, field, area } = UI;
const D = s => { if (!s) return '-'; const d = new Date(s + 'T00:00:00Z'); return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const DS = s => { if (!s) return ''; const d = new Date(s + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const pill = (t, tone) => `<span class="pill ${tone || ''}">${esc(t)}</span>`;
const EMP = { probation: ['Probation', 'info'], active: ['Active', 'good'], notice: ['Leaving', 'warn'], exited: ['Left', ''] };
const empPill = s => pill(...(EMP[s] || [s, '']));
const LV = { pending: ['Waiting', 'warn'], approved: ['Approved', 'good'], rejected: ['Declined', 'bad'], cancelled: ['Cancelled', ''] };
const lvPill = s => pill(...(LV[s] || [s, '']));
const STG = { new: 'New', shortlisted: 'Shortlisted', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Not selected' };
const RUN = { draft: ['Draft', 'warn'], approved: ['Approved', 'info'], paid: ['Paid', 'good'] };
const ATT = { P: 'Present', L: 'Late', H: 'Half day', A: 'Absent' };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SECTIONS = [['overview', 'Overview'], ['recruit', 'Recruitment'], ['employees', 'Employees'], ['teams', 'Teams'], ['attendance', 'Attendance'], ['leave', 'Leave'], ['payroll', 'Payroll'], ['policies', 'Policies & notices'], ['reports', 'Reports'], ['settings', 'Settings']];
const scoreTone = n => n == null ? '' : n >= 70 ? 'good' : n >= 45 ? 'info' : 'bad';
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const av = (n, photo) => photo ? `<img class="hav ph" src="${X.raw}files/${photo}" alt="">` : `<span class="hav" aria-hidden="true">${esc(initials(n))}</span>`;
const BLOODS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const fileToB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
async function pickFile(input) {
  const f = input.files && input.files[0];
  if (!f) return null;
  if (f.size > 1200000) throw new Error('The file is larger than 1.2 MB.');
  return { name: f.name, type: f.type, data: await fileToB64(f) };
}
const today = () => new Date().toLocaleDateString('en-CA');
const thisMonth = () => today().slice(0, 7);
const addM = (m, k) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1)); return d.toISOString().slice(0, 7); };
const addD = (s, k) => new Date(Date.parse(s + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
const monthName = m => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(l)}</option>`;

let X = null; // { api, sid, base, el, S, cur }
const TEAMKEY = 'hr-team';
const teamQ = (sep = '?') => X.team ? `${sep}team=${encodeURIComponent(X.team)}` : '';
const teamBar = (what) => `<div class="hteambar"><label>Team <select id="teamsel" aria-label="Team"><option value="">All teams</option>${X.S.departments.map(d => opt(d, d, X.team)).join('')}</select></label>${X.team ? `<span class="muted small">Showing ${esc(what)} for <b>${esc(X.team)}</b> only</span>` : ''}</div>`;
const bindTeam = again => { const t = $('#teamsel'); if (t) t.onchange = () => { X.team = t.value; try { sessionStorage.setItem(TEAMKEY, X.team); } catch (e) {} again(); }; };

window.HRApp = {
  async mount(el, { api, sub, parts }) {
    let team0 = ''; try { team0 = sessionStorage.getItem(TEAMKEY) || ''; } catch (e) {}
    X = { api: (p, o) => api(`/me/s/${sub.id}/hr/${p}`, o), raw: `/api/me/s/${sub.id}/hr/`, sid: sub.id, base: `#/a/${sub.id}/hr`, el, S: null, team: team0 };
    const section = SECTIONS.some(s => s[0] === parts[0]) ? parts[0] : 'overview';
    el.innerHTML = `<nav class="hnav" aria-label="HR">${SECTIONS.map(([k, l]) => `<a href="${X.base}/${k}" ${k === section ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav><div id="hrv" class="hrv"><div class="skel"><div class="sk"></div><div class="sk"></div></div></div>`;
    X.v = $('#hrv', el);
    try {
      if (!X.S) X.S = (await X.api('settings')).settings;
      if (X.team && !X.S.departments.includes(X.team)) X.team = '';
      await ({ overview, recruit, employees, teams, attendance, leave, payroll, policies, reports, settings }[section])(parts.slice(1));
    } catch (e) { if (!e.auth) X.v.innerHTML = `<div class="note bad"><b>Something went wrong.</b> ${esc(e.message)}</div>`; }
  },
};
const go = h => { location.hash = X.base + '/' + h; };
const head = (title, sub, actions = '') => `<div class="hhead"><div><h2>${title}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="row-end">${actions}</div></div>`;
const cur = n => money(n, X.S.currency);
const empOpts = (list, sel, blank = 'Choose…') => `<option value="">${blank}</option>` + list.filter(e => e.status !== 'exited').map(e => opt(e.id, `${e.name}${e.designation ? ' · ' + e.designation : ''}`, sel)).join('');
const errLine = id => `<span class="error" id="${id}" role="alert"></span>`;
const fail = (id, e) => { const x = $('#' + id); if (x) x.textContent = e.message; else toast(e.message); };

// ================================================================ overview
async function overview() {
  const o = await X.api('overview');
  const kpi = (v, l, s, href, tone = '') => `<a class="hk ${tone}" href="${href}"><span>${l}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</a>`;
  const presentTxt = !o.workday ? (o.holiday || 'Weekend') : o.marked ? `${o.present}` : 'Not marked';
  X.v.innerHTML = `
    ${head(`HR today · ${esc(D(o.today))}`, `${o.employees} employee${o.employees === 1 ? '' : 's'} · ${o.open_jobs} open job${o.open_jobs === 1 ? '' : 's'}`,
      `<a class="btn" href="${X.base}/attendance">Mark attendance</a><a class="btn" href="${X.base}/employees/new">Add employee</a><a class="btn primary" href="${X.base}/recruit/new">Post a job</a>`)}
    <div class="hkpis rise" style="--i:0">
      ${kpi(o.employees, 'Employees', `${o.probation} on probation${o.notice ? ` · ${o.notice} leaving` : ''}`, `${X.base}/employees`)}
      ${kpi(presentTxt, 'Present today', o.workday && o.marked ? `${o.absent} absent · ${o.late} late` : o.workday ? `${o.unmarked} not marked yet` : 'Day off', `${X.base}/attendance`, o.workday && !o.marked ? 'warn' : '')}
      ${kpi(o.on_leave.length, 'On leave today', o.on_leave.slice(0, 2).map(x => esc(x.name)).join(', '), `${X.base}/leave`)}
      ${kpi(o.pending_count, 'Leave to approve', o.pending_count ? 'needs your answer' : 'all answered', `${X.base}/leave`, o.pending_count ? 'warn' : '')}
      ${kpi(o.new_applicants.length, 'New applicants', `${o.open_jobs} open job${o.open_jobs === 1 ? '' : 's'}`, `${X.base}/recruit`, o.new_applicants.length ? 'act' : '')}
      ${kpi(o.payroll ? (RUN[o.payroll.status] || [o.payroll.status])[0] : 'Not started', 'Payroll ' + monthName(o.today.slice(0, 7)).split(' ')[0], o.payroll ? cur(o.payroll.totals.net || 0) + ' net' : '', `${X.base}/payroll`)}
    </div>
    <div class="hgrid rise" style="--i:1">
      <section class="hcard"><h3>Needs attention</h3>
        ${o.pending_leaves.length || o.attention.length || o.tasks.length || o.new_applicants.length ? `<ul class="hlist">
          ${o.pending_leaves.map(l => `<li>${av(l.employee_name)}<div><b>${esc(l.employee_name)}</b> asked for ${esc(typeName(l.type))}<small>${esc(DS(l.start_date))}${l.end_date !== l.start_date ? ' – ' + esc(DS(l.end_date)) : ''} · ${l.days} day${l.days === 1 ? '' : 's'}${l.reason ? ' · ' + esc(l.reason) : ''}</small></div>
            <span class="row-end"><button class="btn small" data-dec="${l.id}" data-ok="0">Decline</button><button class="btn small primary" data-dec="${l.id}" data-ok="1">Approve</button></span></li>`).join('')}
          ${o.new_applicants.slice(0, 5).map(a => `<li>${av(a.name)}<div><b>${esc(a.name)}</b> applied for ${esc(a.title)}<small>AI score ${a.score ?? '-'}</small></div><a class="btn small" href="${X.base}/recruit/applicant/${a.id}">Review</a></li>`).join('')}
          ${o.attention.map(x => `<li><span class="hdot ${x.kind}"></span><div>${esc(x.text)} <b>${esc(D(x.date))}</b></div><a class="btn small" href="${X.base}/${x.run_id ? `payroll/${x.run_id}` : `employees/${x.employee_id}`}">Open</a></li>`).join('')}
          ${o.tasks.map(t => `<li><input type="checkbox" data-task="${t.id}" aria-label="Done"><div>${esc(t.title)}<small>${esc(t.emp)} · ${t.kind}${t.due ? ' · due ' + esc(DS(t.due)) : ''}</small></div><a class="btn small ghost" href="${X.base}/employees/${t.employee_id}/tasks">Open</a></li>`).join('')}
          ${o.tasks_open > o.tasks.length ? `<li><span></span><div class="muted">${o.tasks_open - o.tasks.length} more onboarding and exit tasks in employee profiles</div></li>` : ''}
        </ul>` : '<p class="muted">Nothing needs your attention. Nice.</p>'}
      </section>
      <section class="hcard"><h3>Coming up</h3>
        ${o.interviews.length || o.celebrations.length || o.holidays.length ? `<ul class="hlist">
          ${o.interviews.map(i => `<li><span class="hdate">${esc(DS(i.interview.date))}</span><div><b>Interview: ${esc(i.name)}</b><small>${esc(i.title)} · ${esc(i.interview.time)} · ${esc(i.interview.mode || '')}</small></div></li>`).join('')}
          ${o.celebrations.map(c => `<li><span class="hdate">${esc(DS(c.date))}</span><div>${esc(c.text)}</div></li>`).join('')}
          ${o.holidays.map(h => `<li><span class="hdate">${esc(DS(h.date))}</span><div>Holiday: ${esc(h.name)}</div></li>`).join('')}
        </ul>` : '<p class="muted">No interviews, birthdays or holidays in the next two weeks.</p>'}
        <h3 style="margin-top:22px">Recent activity</h3>
        ${o.log.length ? `<ul class="hlog">${o.log.map(l => `<li><span>${esc(fmtDateTime(l.at))}</span>${esc(l.text)}</li>`).join('')}</ul>` : '<p class="muted">No activity yet.</p>'}
      </section>
    </div>
    ${!o.employees ? `<section class="hcard hstart rise" style="--i:2"><h3>Get started in 3 steps</h3><ol>
      <li><a href="${X.base}/settings">Check your settings</a>: work days, holidays, leave types and payroll.</li>
      <li><a href="${X.base}/employees/new">Add your employees</a> and invite them to their portal.</li>
      <li><a href="${X.base}/recruit/new">Post a job</a>: share the careers link and AI screens every CV.</li></ol></section>` : ''}`;
  $$('[data-dec]', X.v).forEach(b => b.onclick = () => busy(b, async () => {
    try { await X.api(`leaves/${b.dataset.dec}/decide`, { method: 'POST', body: { approve: b.dataset.ok === '1' } }); toast(b.dataset.ok === '1' ? 'Approved. The employee was emailed.' : 'Declined'); overview(); } catch (e) { toast(e.message); }
  }));
  $$('[data-task]', X.v).forEach(c => c.onchange = async () => { try { await X.api(`tasks/${c.dataset.task}`, { method: 'PUT', body: { done: c.checked } }); toast('Task done'); } catch (e) { toast(e.message); } });
}
const typeName = k => ((X.S.leave_types || []).find(t => t.key === k) || {}).name || k;

// ================================================================ employees
async function employees(p) {
  if (p[0] === 'new') return employeeForm(null);
  if (p[0]) return employeeView(p[0], p[1] || 'details');
  const r = await X.api('employees');
  const list = r.employees;
  X.v.innerHTML = `${head('Employees', `${list.filter(e => e.status !== 'exited').length} people${r.limit ? ` · your plan covers ${r.limit}` : ''}`,
    `<a class="btn" href="${X.raw}employees.csv">Download CSV</a><a class="btn primary" href="${X.base}/employees/new">Add employee</a>`)}
    <div class="hfilters"><input type="search" id="q" placeholder="Search name, email, designation" aria-label="Search employees">
      <select id="fd" aria-label="Team"><option value="">All teams</option>${[...new Set([...X.S.departments, ...list.map(e => e.dept).filter(Boolean)])].map(d => opt(d, d, X.team)).join('')}</select>
      <select id="fs" aria-label="Status"><option value="">Current staff</option>${Object.entries(EMP).map(([k, v]) => opt(k, v[0])).join('')}<option value="all">Everyone</option></select></div>
    <div class="hcard flush"><div class="scroll"><table class="t ht"><thead><tr><th>Name</th><th>Team</th><th>Joined</th><th>Status</th><th>Portal</th></tr></thead><tbody id="et"></tbody></table></div></div>`;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), fd = $('#fd').value, fs = $('#fs').value;
    const rows = list.filter(e => (!q || [e.name, e.email, e.designation, e.code].join(' ').toLowerCase().includes(q)) && (!fd || e.dept === fd) && (fs === 'all' || (fs ? e.status === fs : e.status !== 'exited')));
    $('#et').innerHTML = rows.map(e => `<tr class="link" data-href="${X.base}/employees/${e.id}" tabindex="0"><td><div class="hwho">${av(e.name, e.photo)}<div><b>${esc(e.name)}</b><small>${esc(e.code)} · ${esc(e.designation || '-')}</small></div></div></td>
      <td>${esc(e.dept || '-')}</td><td>${esc(D(e.join_date))}</td><td>${empPill(e.status)}</td><td>${e.has_login ? pill('Active', 'good') : e.invited ? pill('Invited', 'info') : '<span class="muted">-</span>'}</td></tr>`).join('')
      || `<tr><td colspan="5" class="muted" style="padding:24px;text-align:center">${list.length ? 'No one matches.' : 'No employees yet. Add your first one.'}</td></tr>`;
    $$('#et tr[data-href]').forEach(t => { t.onclick = () => { location.hash = t.dataset.href; }; t.onkeydown = e => { if (e.key === 'Enter') location.hash = t.dataset.href; }; });
  };
  ['q', 'fd', 'fs'].forEach(id => $('#' + id).oninput = draw); draw();
}
async function employeeForm(id, data) {
  const all = (await X.api('employees')).employees;
  const e = data || { emp_type: 'full-time', salary: { basic: '', extra: [] }, bank: {} };
  const S = X.S;
  X.v.innerHTML = `${head(id ? 'Edit ' + esc(e.name) : 'Add employee', id ? '' : 'Onboarding tasks are created automatically. Invite them to their portal after saving.')}
    <form id="ef" class="hform">
      <section class="section"><header><h2>Person</h2></header><div class="stack">
        <div class="grid2">${field('Full name', 'name', e.name, { attrs: 'required' })}${field('Email', 'email', e.email, { type: 'email', hint: 'needed for the employee app and payslips' })}</div>
        <div class="grid3">${field('Phone', 'phone', e.phone)}${field('Date of birth', 'dob', e.dob, { type: 'date' })}
          <label class="field"><span class="lab">Gender</span><select name="gender">${['', 'Female', 'Male', 'Other'].map(g => opt(g, g || 'Prefer not to say', e.gender)).join('')}</select></label></div>
        <div class="grid3"><label class="field"><span class="lab">Blood group</span><select name="blood_group">${['', ...BLOODS].map(g => opt(g, g || 'Not known', e.blood_group)).join('')}</select></label>
          ${field('NID number', 'nid', e.nid, { attrs: 'inputmode="numeric"' })}${field('LinkedIn', 'linkedin', e.linkedin, { ph: 'https://www.linkedin.com/in/…' })}</div>
        <div class="grid2">${area('Address', 'address', e.address)}${area('Emergency contact', 'emergency', e.emergency, { ph: 'Name, relation, phone' })}</div>
      </div></section>
      <section class="section"><header><h2>Job</h2></header><div class="stack">
        <div class="grid3"><label class="field"><span class="lab">Department</span><input name="dept" list="depts" value="${esc(e.dept || '')}"><datalist id="depts">${S.departments.map(d => `<option>${esc(d)}</option>`).join('')}</datalist></label>
          ${field('Designation', 'designation', e.designation)}
          <label class="field"><span class="lab">Reports to</span><select name="manager_id">${empOpts(all.filter(x => String(x.id) !== String(id)), e.manager_id, 'No manager')}</select></label></div>
        <div class="grid3"><label class="field"><span class="lab">Type</span><select name="emp_type">${['full-time', 'part-time', 'contract', 'intern'].map(t => opt(t, t[0].toUpperCase() + t.slice(1), e.emp_type)).join('')}</select></label>
          ${field('Joining date', 'join_date', e.join_date || today(), { type: 'date' })}${field('Employee ID', 'code', e.code, { hint: id ? '' : 'leave empty for automatic' })}</div>
        <div class="grid3">${field('Probation ends', 'probation_end', e.probation_end, { type: 'date', hint: id ? '' : `empty = ${S.probation_months} months after joining` })}${field('Contract ends', 'contract_end', e.contract_end, { type: 'date', hint: 'for fixed-term contracts' })}
          ${id ? `<label class="field"><span class="lab">Status</span><select name="status">${['probation', 'active'].map(s => opt(s, EMP[s][0], e.status)).join('')}${e.status === 'notice' ? opt('notice', 'Leaving', 'notice') : ''}</select></label>` : ''}</div>
      </div></section>
      <section class="section"><header><h2>Salary</h2><p>Gross = basic + the allowances in Settings + extras below.</p></header><div class="stack">
        <div class="grid3">${field(`Basic salary (${S.currency} / month)`, 'basic', e.salary.basic, { type: 'number', attrs: 'min="0" step="any"' })}<div class="field"><span class="lab">Gross</span><b id="gross" class="hbig">-</b></div></div>
        <div id="extra"></div><button type="button" class="btn small" id="addx">+ Extra allowance</button>
      </div></section>
      <section class="section"><header><h2>Salary payment</h2></header><div class="stack">
        <div class="grid3"><label class="field"><span class="lab">Paid by</span><select name="b_method">${['', 'Bank', 'bKash', 'Nagad', 'Cash', 'Cheque'].map(x => opt(x, x || 'Choose…', e.bank.method)).join('')}</select></label>
          ${field('Bank name', 'b_bank', e.bank.bank)}${field('Branch', 'b_branch', e.bank.branch)}</div>
        <div class="grid3">${field('Account name', 'b_account_name', e.bank.account_name)}${field('Account number', 'b_account_no', e.bank.account_no)}${field('Mobile wallet number', 'b_mobile', e.bank.mobile)}</div>
      </div></section>
      ${id ? '' : `<label class="check"><input type="checkbox" name="send_letter" checked> Email the appointment letter and the employee app setup link (needs an email)</label>`}
      <div class="savebar">${errLine('eErr')}<a class="btn" href="${X.base}/employees${id ? '/' + id : ''}">Cancel</a><button class="btn primary" type="submit">${id ? 'Save changes' : 'Add employee'}</button></div>
    </form>`;
  const ex = $('#extra'), f = $('#ef');
  const xrow = (x = {}) => { const d = document.createElement('div'); d.className = 'grid3 xrow'; d.innerHTML = `${field('Allowance name', 'x_name', x.name)}${field('Amount', 'x_amount', x.amount, { type: 'number', attrs: 'min="0" step="any"' })}<div class="field"><span class="lab">&nbsp;</span><button type="button" class="btn small ghost">Remove</button></div>`; $('button', d).onclick = () => { d.remove(); gross(); }; ex.append(d); };
  (e.salary.extra || []).forEach(xrow);
  $('#addx').onclick = () => xrow();
  const gross = () => {
    const b = Number(f.elements.basic.value) || 0;
    const g = b + S.payroll.components.reduce((s, c) => s + (c.type === 'percent' ? b * c.value / 100 : c.value), 0) + $$('.xrow', ex).reduce((s, r) => s + (Number($('[name=x_amount]', r).value) || 0), 0);
    $('#gross').textContent = b ? cur(Math.round(g * 100) / 100) : '-';
  };
  f.addEventListener('input', gross); gross();
  f.onsubmit = async ev => {
    ev.preventDefault(); $('#eErr').textContent = '';
    const v = Object.fromEntries(new FormData(f));
    if (!id) v.send_letter = !!v.send_letter && !!v.email;
    const body = { ...Object.fromEntries(Object.entries(v).filter(([k]) => !/^(b_|x_|basic$)/.test(k))),
      salary: { basic: Number(v.basic) || 0, extra: $$('.xrow', ex).map(r => ({ name: $('[name=x_name]', r).value, amount: Number($('[name=x_amount]', r).value) || 0 })).filter(x => x.name) },
      bank: { method: v.b_method, bank: v.b_bank, branch: v.b_branch, account_name: v.b_account_name, account_no: v.b_account_no, mobile: v.b_mobile } };
    await busy($('button[type=submit]', f), async () => {
      try {
        const r = await X.api(id ? `employees/${id}` : 'employees', { method: id ? 'PUT' : 'POST', body });
        toast(id ? 'Saved' : `${r.employee.name} added.${r.letter ? (r.letter.emailed ? ' Appointment letter emailed.' : ' Letter saved; email not sent.') : ''}`); go(`employees/${r.employee.id}`);
      } catch (e2) { fail('eErr', e2); }
    });
  };
}
async function employeeView(id, tab) {
  if (tab === 'edit') { const r = await X.api(`employees/${id}`); return employeeForm(id, r.employee); }
  if (tab === 'letter') return experienceLetter(id);
  if (tab === 'letter-appointment') return appointmentLetter(id);
  const r = await X.api(`employees/${id}`), e = r.employee, S = X.S;
  const tabs = [['details', 'Details'], ['leave', 'Leave'], ['tasks', 'Onboarding & exit'], ['docs', 'Documents'], ['notes', 'Notes'], ['pay', 'Payslips']];
  const ex = e.exit || {};
  X.v.innerHTML = `<a class="muted small" href="${X.base}/employees">← All employees</a>
    <div class="hprof"><label class="hphoto" title="Change photo">${e.photo ? `<img class="hav big ph" src="${X.raw}files/${e.photo}" alt="">` : `<span class="hav big" aria-hidden="true">${esc(initials(e.name))}</span>`}<span class="hpcam">Photo</span><input type="file" id="phf" accept="image/png,image/jpeg,image/webp" hidden></label>
      <div><h2>${esc(e.name)}</h2><p class="muted">${esc(e.designation || 'No designation')}${e.dept ? ' · ' + esc(e.dept) : ''} · ${esc(e.code)}</p>
        <p class="hmeta">${empPill(e.status)} ${e.has_login ? pill('Portal active', 'good') : e.invited ? pill('Invited', 'info') : ''} <span>Joined ${esc(D(e.join_date))}</span>
          ${e.status === 'probation' && e.probation_end ? `<span>Probation until ${esc(D(e.probation_end))}</span>` : ''}${e.status === 'notice' ? `<span>Last day ${esc(D(ex.last_day))}</span>` : ''}</p></div>
      <div class="row-end">
        ${e.status !== 'exited' ? `<a class="btn small" href="${X.base}/employees/${e.id}/edit">Edit</a>` : ''}
        ${e.status !== 'exited' && e.email && !e.has_login ? `<button class="btn small" id="inv">${e.invited ? 'Send invite again' : 'Invite to the app'}</button>` : ''}
        ${e.status !== 'exited' && e.email ? `<button class="btn small ghost" id="setpw">${e.has_login ? 'Reset app password' : 'Set app password'}</button>` : ''}
        ${e.status === 'probation' ? '<button class="btn small" id="conf">Confirm (end probation)</button>' : ''}
        ${e.self_edited ? '<button class="btn small ghost" id="unlock" title="The employee already filled in their profile">Allow one more edit</button>' : ''}
        ${e.status !== 'exited' ? `<a class="btn small" href="${X.base}/employees/${e.id}/letter-appointment">Appointment letter</a>` : ''}
        ${e.status === 'notice' || e.status === 'exited' ? `<a class="btn small" href="${X.base}/employees/${e.id}/letter">Experience letter</a>` : ''}
        ${e.status === 'notice' ? '<button class="btn small" id="cex">Cancel exit</button>' : ''}
        ${['probation', 'active'].includes(e.status) ? '<button class="btn small danger" id="exit">Start exit</button>' : ''}
      </div></div>
    <div id="exbox"></div>
    <nav class="tabs subtabs">${tabs.map(([k, l]) => `<a href="${X.base}/employees/${e.id}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div id="et2"></div>`;
  const bind = (sel, fn) => { const b = $(sel); if (b) b.onclick = () => busy(b, fn); };
  bind('#inv', async () => { try { const x = await X.api(`employees/${e.id}/invite`, { method: 'POST' }); if (x.emailed) toast('Invite emailed to ' + e.email); else { prompt(x.held ? 'Test mode: the email is in the Outbox and was not sent. Copy the set-password link:' : 'Email could not be sent (' + (x.email_error || 'email is off') + '). Copy this link and send it yourself:', x.link); } employeeView(id, tab); } catch (er) { toast(er.message); } });
  bind('#setpw', async () => { const pw = prompt(`Set an app password for ${e.name} (8+ characters, letters and numbers). Give it to them; they sign in with ${e.email}.`, ''); if (!pw) return;
    try { const x = await X.api(`employees/${e.id}/password`, { method: 'POST', body: { password: pw } }); prompt('Password set. App link:', x.link); employeeView(id, tab); } catch (er) { toast(er.message); } });
  bind('#unlock', async () => { try { await X.api(`employees/${e.id}/unlock`, { method: 'POST' }); toast(`${e.name} can edit their profile once more`); employeeView(id, tab); } catch (er) { toast(er.message); } });
  $('#phf').onchange = async () => { const fl = $('#phf').files[0]; if (!fl) return; if (fl.size > 400000) return toast('The photo is larger than 400 KB.');
    try { await X.api(`employees/${e.id}/photo`, { method: 'POST', body: { photo: { name: fl.name, type: fl.type, data: await fileToB64(fl) } } }); toast('Photo saved'); employeeView(id, tab); } catch (er) { toast(er.message); } };
  bind('#conf', async () => { if (!confirm(`Confirm ${e.name} as a permanent employee?`)) return; try { await X.api(`employees/${e.id}/confirm`, { method: 'POST' }); toast('Confirmed'); employeeView(id, tab); } catch (er) { toast(er.message); } });
  bind('#cex', async () => { if (!confirm('Cancel the exit and keep this employee?')) return; try { await X.api(`employees/${e.id}/cancel-exit`, { method: 'POST' }); toast('Exit cancelled'); employeeView(id, tab); } catch (er) { toast(er.message); } });
  const exb = $('#exit');
  if (exb) exb.onclick = () => {
    $('#exbox').innerHTML = `<form class="hcard hform" id="xf"><h3>Start exit for ${esc(e.name)}</h3><p class="muted">Offboarding tasks are created, and on the last day the automation closes their portal access.</p>
      <div class="grid3"><label class="field"><span class="lab">Reason</span><select name="type">${['resignation', 'termination', 'contract end', 'retirement', 'other'].map(t => opt(t, t[0].toUpperCase() + t.slice(1))).join('')}</select></label>
        ${field('Notice date', 'notice_date', today(), { type: 'date' })}${field('Last working day', 'last_day', addD(today(), S.notice_days), { type: 'date', hint: `notice period: ${S.notice_days} days` })}</div>
      ${area('Details (private)', 'reason', '')}
      <label class="check"><input type="checkbox" name="notify" checked> Email the employee their last-day confirmation</label>
      <div class="row-end">${errLine('xErr')}<button type="button" class="btn" id="xc">Cancel</button><button class="btn danger" type="submit">Start exit</button></div></form>`;
    $('#xc').onclick = () => { $('#exbox').innerHTML = ''; };
    $('#xf').onsubmit = async ev => { ev.preventDefault(); const v = Object.fromEntries(new FormData(ev.target)); v.notify = !!v.notify;
      await busy($('#xf button[type=submit]'), async () => { try { await X.api(`employees/${e.id}/exit`, { method: 'POST', body: v }); toast('Exit started'); employeeView(id, 'tasks'); } catch (er) { fail('xErr', er); } }); };
  };
  const el = $('#et2');
  if (tab === 'details') {
    const b = e.bank || {};
    const dl = rows => `<dl class="facts">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v || '<span class="muted">-</span>'}</dd></div>`).join('')}</dl>`;
    el.innerHTML = `<div class="hgrid">
      <section class="hcard"><h3>Contact</h3>${dl([['Email', esc(e.email)], ['Phone', esc(e.phone)], ['Date of birth', esc(D(e.dob))], ['Gender', esc(e.gender)], ['Blood group', esc(e.blood_group)], ['NID', esc(e.nid)],
        ['LinkedIn', e.linkedin ? `<a href="${esc(e.linkedin)}" target="_blank" rel="noopener">${esc(e.linkedin.replace(/^https:\/\/(www\.)?/, ''))}</a>` : ''], ['Address', esc(e.address)], ['Emergency contact', esc(e.emergency)]])}
        ${e.self_edited ? '<p class="muted small">The employee filled this in from the app; only HR can change it now.</p>' : ''}</section>
      <section class="hcard"><h3>Job</h3>${dl([['Department', esc(e.dept)], ['Designation', esc(e.designation)], ['Type', esc(e.emp_type)], ['Joined', esc(D(e.join_date))], ['Probation ends', esc(D(e.probation_end))], ['Contract ends', esc(D(e.contract_end))]])}</section>
      <section class="hcard"><h3>Salary</h3><table class="t"><tbody>${r.gross.parts.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${cur(x.amount)}</td></tr>`).join('')}<tr class="tot"><td>Gross / month</td><td class="n">${cur(r.gross.gross)}</td></tr></tbody></table></section>
      <section class="hcard"><h3>Salary payment</h3>${dl([['Method', esc(b.method)], ['Bank', esc([b.bank, b.branch].filter(Boolean).join(', '))], ['Account', esc([b.account_name, b.account_no].filter(Boolean).join(' · '))], ['Mobile wallet', esc(b.mobile)]])}</section>
      ${r.acks.length ? `<section class="hcard"><h3>Policies</h3><ul class="hlist two">${r.acks.map(a => `<li><div>${esc(a.title)}</div>${a.at ? pill('Accepted ' + fmtDate(a.at), 'good') : pill('Not yet', 'warn')}</li>`).join('')}</ul></section>` : ''}
      ${r.settlement ? `<section class="hcard"><h3>Final settlement</h3><table class="t"><tbody>
        <tr><td>Salary for ${esc(r.settlement.month)} (until ${esc(D(r.settlement.last_day))})</td><td class="n">${cur(r.settlement.salary.net)}</td></tr>
        <tr><td>Unused annual leave (${r.settlement.leave_left} days)</td><td class="n">${cur(r.settlement.encashment)}</td></tr>
        <tr class="tot"><td>Estimated total</td><td class="n">${cur(r.settlement.total)}</td></tr></tbody></table><p class="muted small">Based on attendance so far. Add other dues or deductions in that month’s payroll.</p></section>` : ''}
    </div>`;
  }
  if (tab === 'leave') {
    el.innerHTML = `<div class="hbal">${r.balances.map(b => `<div class="hk"><span>${esc(b.name)}</span><b>${b.left == null ? '∞' : b.left}</b><small>${b.kind === "alternate" || b.kind === "roster" ? `${b.entitled} earned${b.earned && b.earned.length && b.kind === "roster" ? " (" + b.earned.map(m => monthName(m).split(" ")[0]).join(", ") + ")" : ""}` : b.entitled == null ? 'no fixed limit' : `of ${b.entitled}${b.carried ? ` (incl. ${b.carried} carried)` : ''}`} · ${b.used} used${b.pending ? ` · ${b.pending} waiting` : ''}</small></div>`).join('')}</div>
      <section class="hcard"><div class="hhead"><h3>Leave history</h3><button class="btn small" id="addl">Add leave</button></div><div id="lf"></div>
      ${leaveTable(r.leaves, false)}</section>`;
    $('#addl').onclick = () => leaveForm($('#lf'), [e], e.id, () => employeeView(id, 'leave'));
    bindLeave(el, () => employeeView(id, 'leave'));
  }
  if (tab === 'tasks') {
    const grp = k => r.tasks.filter(t => t.kind === k);
    const list = (k, title) => `<section class="hcard"><h3>${title} <span class="muted small">${grp(k).filter(t => t.done_at).length} of ${grp(k).length} done</span></h3>
      ${grp(k).length ? `<ul class="htasks">${grp(k).map(t => `<li class="${t.done_at ? 'done' : ''}"><label><input type="checkbox" data-t="${t.id}" ${t.done_at ? 'checked' : ''} ${t.owner === 'employee' ? 'disabled' : ''}> ${esc(t.title)}</label>
        <small>${t.owner === 'employee' ? 'done by the employee' : 'HR'}${t.due ? ' · due ' + esc(DS(t.due)) : ''}</small><button class="icon-x" data-td="${t.id}" aria-label="Delete task">×</button></li>`).join('')}</ul>` : '<p class="muted">No tasks.</p>'}
      <form class="row-end addt" data-k="${k}"><input name="title" placeholder="Add a task" aria-label="New task"><button class="btn small">Add</button></form></section>`;
    el.innerHTML = `<div class="hgrid">${list('onboarding', 'Onboarding')}${e.status === 'notice' || e.status === 'exited' || grp('offboarding').length ? list('offboarding', 'Offboarding') : `<section class="hcard"><h3>Offboarding</h3><p class="muted">Starts when you click <b>Start exit</b>. Tasks: ${S.offboarding.map(esc).join(', ')}.</p></section>`}</div>`;
    $$('[data-t]', el).forEach(c => c.onchange = async () => { try { await X.api(`tasks/${c.dataset.t}`, { method: 'PUT', body: { done: c.checked } }); c.closest('li').classList.toggle('done', c.checked); } catch (er) { toast(er.message); } });
    $$('[data-td]', el).forEach(b => b.onclick = async () => { try { await X.api(`tasks/${b.dataset.td}`, { method: 'DELETE' }); employeeView(id, 'tasks'); } catch (er) { toast(er.message); } });
    $$('.addt', el).forEach(f => f.onsubmit = async ev => { ev.preventDefault(); const t = f.elements.title.value.trim(); if (!t) return; try { await X.api(`employees/${e.id}/tasks`, { method: 'POST', body: { title: t, kind: f.dataset.k } }); employeeView(id, 'tasks'); } catch (er) { toast(er.message); } });
  }
  if (tab === 'docs') {
    el.innerHTML = `<section class="hcard"><h3>Documents</h3>
      ${r.files.length ? `<table class="t"><thead><tr><th>Name</th><th>Type</th><th>Expires</th><th></th></tr></thead><tbody>${r.files.map(f => `<tr><td><a href="${X.raw}files/${f.id}" target="_blank" rel="noopener">${esc(f.name)}</a><div class="muted small">${Math.round(f.size / 1024)} KB · ${fmtDate(f.created_at)}</div></td>
        <td>${esc(f.kind)}</td><td>${f.expires_on ? esc(D(f.expires_on)) : '-'}</td><td class="n"><button class="btn small ghost" data-fd="${f.id}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No documents yet.</p>'}
      <form id="uf" class="hform" style="margin-top:18px"><div class="grid3"><label class="field"><span class="lab">File (PDF, Word or image, max 1.2 MB)</span><input type="file" name="file" required accept=".pdf,.doc,.docx,image/*"></label>
        <label class="field"><span class="lab">Type</span><select name="kind">${['contract', 'id', 'certificate', 'cv', 'photo', 'other'].map(k => opt(k, k[0].toUpperCase() + k.slice(1))).join('')}</select></label>
        ${field('Expires on', 'expires_on', '', { type: 'date', hint: 'we remind you 30 days before' })}</div>
        <div class="row-end">${errLine('uErr')}<button class="btn primary">Upload</button></div></form></section>`;
    $('#uf').onsubmit = async ev => { ev.preventDefault(); const f = ev.target;
      await busy($('button', f), async () => { try { const file = await pickFile(f.elements.file); await X.api(`employees/${e.id}/files`, { method: 'POST', body: { file, kind: f.elements.kind.value, expires_on: f.elements.expires_on.value } }); toast('Uploaded'); employeeView(id, 'docs'); } catch (er) { fail('uErr', er); } }); };
    $$('[data-fd]', el).forEach(b => b.onclick = async () => { if (!confirm('Delete this document?')) return; try { await X.api(`files/${b.dataset.fd}`, { method: 'DELETE' }); employeeView(id, 'docs'); } catch (er) { toast(er.message); } });
  }
  if (tab === 'notes') {
    const K = { note: ['Note', ''], warning: ['Warning', 'bad'], appreciation: ['Appreciation', 'good'], review: ['Review', 'info'] };
    el.innerHTML = `<section class="hcard"><form id="nf" class="hform"><div class="grid3"><label class="field"><span class="lab">Type</span><select name="kind">${Object.entries(K).map(([k, v]) => opt(k, v[0])).join('')}</select></label></div>
      ${area('Note (private to HR)', 'text', '', { ph: 'e.g. Quarterly review: met sales target, needs to improve reporting.' })}<div class="row-end">${errLine('nErr')}<button class="btn primary">Save note</button></div></form>
      <ul class="hnotes">${r.notes.map(n => `<li>${pill(...K[n.kind] || [n.kind])}<p>${esc(n.text)}</p><small>${esc(n.by_name)} · ${fmtDateTime(n.created_at)}</small></li>`).join('') || '<li class="muted">No notes yet. Record reviews, appreciation and warnings here.</li>'}</ul></section>`;
    $('#nf').onsubmit = async ev => { ev.preventDefault(); await busy($('#nf button'), async () => { try { await X.api(`employees/${e.id}/notes`, { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); employeeView(id, 'notes'); } catch (er) { fail('nErr', er); } }); };
  }
  if (tab === 'pay') {
    el.innerHTML = `<section class="hcard"><h3>Payslips</h3>${r.payslips.length ? `<table class="t"><thead><tr><th>Month</th><th>Status</th><th class="n">Net pay</th></tr></thead><tbody>${r.payslips.map(p => `<tr class="link" data-href="${X.base}/payroll/slip/${p.id}"><td>${esc(monthName(p.month))}</td><td>${pill(...(RUN[p.status] || [p.status]))}</td><td class="n">${cur(p.net)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No payroll yet.</p>'}</section>`;
    $$('tr[data-href]', el).forEach(t => t.onclick = () => { location.hash = t.dataset.href; });
  }
}
async function appointmentLetter(id) {
  const r = await X.api(`employees/${id}/appointment`), e = r.employee;
  const text = r.saved ? r.saved.text : r.draft;
  X.v.innerHTML = `<div class="noprint hhead"><a class="muted small" href="${X.base}/employees/${id}">← ${esc(e.name)}</a><div class="row-end">
      ${r.saved ? `<span class="muted small">Sent ${fmtDateTime(r.saved.at)}</span>` : '<span class="pill warn">Not sent yet</span>'}<button class="btn" id="aled">Edit</button><button class="btn" onclick="window.print()">Print or save PDF</button><button class="btn primary" id="alsend">${r.saved ? 'Send again' : 'Email the letter'}</button></div></div>
    <div id="aledit" class="noprint" hidden><form class="hform hcard soft" id="alf">${area('Letter text (your template is in Settings → Letters)', 'text', text, { cls: 'tall' })}<div class="row-end">${errLine('alErr')}<button type="button" class="btn" id="alprev">Preview</button></div></form></div>
    <article class="invdoc letter"><header class="ih"><div><h2>${esc(r.company.name)}</h2><p class="muted">${esc(r.company.address || '')}</p></div><div class="ir"><p>${esc(r.company.email || '')}</p><p>${esc(r.company.phone || '')}</p></div></header>
      <h1 style="font-size:22px;margin-bottom:18px">Appointment letter</h1><div class="ltext" id="altext">${esc(text).replace(/\n/g, '<br>')}</div>
      <div class="sign"><span></span>Authorised signature</div></article>`;
  $('#aled').onclick = () => { $('#aledit').hidden = !$('#aledit').hidden; };
  $('#alprev').onclick = () => { $('#altext').innerHTML = esc($('#alf').elements.text.value).replace(/\n/g, '<br>'); };
  $('#alsend').onclick = ev => busy(ev.target, async () => {
    if (!e.email) return toast('Add the employee’s email first.');
    if (!confirm(`Email the appointment letter to ${e.email}?`)) return;
    try { const x = await X.api(`employees/${id}/appointment`, { method: 'POST', body: { text: $('#alf').elements.text.value } }); toast(x.emailed ? 'Emailed' : 'Saved, but the email failed: ' + (x.email_error || '')); appointmentLetter(id); } catch (er) { toast(er.message); }
  });
}
async function experienceLetter(id) {
  const r = await X.api(`employees/${id}`), e = r.employee, S = X.S, ex = e.exit || {};
  const v = { name: e.name, company: '', designation: e.designation, dept: e.dept, join_date: D(e.join_date), last_day: D(ex.last_day || today()) };
  const me = await UI.makeApi('/api', () => {})('/me').catch(() => ({ account: {} }));
  v.company = me.account.company || '';
  const text = S.letters.experience.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
  X.v.innerHTML = `<div class="noprint hhead"><a class="muted small" href="${X.base}/employees/${id}">← ${esc(e.name)}</a><div class="row-end"><button class="btn primary" onclick="window.print()">Print or save PDF</button></div></div>
    <article class="invdoc letter"><header class="ih"><div><h2>${esc(v.company)}</h2><p class="muted">${esc(me.account.address || '')}</p></div><div class="ir"><p>${esc(D(today()))}</p></div></header>
      <h1 style="font-size:22px;margin-bottom:18px">Experience certificate</h1><div class="ltext">${esc(text).replace(/\n/g, '<br>')}</div>
      <div class="sign"><span></span>Authorised signature</div></article>`;
}

// ================================================================ leave
const leaveTable = (list, withName = true) => list.length ? `<div class="scroll"><table class="t"><thead><tr>${withName ? '<th>Employee</th>' : ''}<th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th></th></tr></thead><tbody>
  ${list.map(l => `<tr>${withName ? `<td><a href="${X.base}/employees/${l.employee_id}">${esc(l.employee_name)}</a><div class="muted small">${esc(l.dept || '')}</div></td>` : ''}<td>${esc(typeName(l.type))}${l.reason ? `<div class="muted small">${esc(l.reason)}</div>` : ''}</td>
    <td>${esc(DS(l.start_date))}${l.end_date !== l.start_date ? ' – ' + esc(D(l.end_date)) : ', ' + l.start_date.slice(0, 4)}${l.half ? ' (half)' : ''}</td><td>${l.days}</td><td>${lvPill(l.status)}${l.decided_by ? `<div class="muted small">by ${esc(l.decided_by)}</div>` : ''}</td>
    <td class="n">${l.status === 'pending' ? `<button class="btn small" data-dec="${l.id}" data-ok="0">Decline</button> <button class="btn small primary" data-dec="${l.id}" data-ok="1">Approve</button>` : l.status === 'approved' ? `<button class="btn small ghost" data-dec="${l.id}" data-ok="0">Cancel</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="muted">No leave here.</p>';
function bindLeave(root, again) {
  $$('[data-dec]', root).forEach(b => b.onclick = () => busy(b, async () => {
    const ok = b.dataset.ok === '1';
    const note = ok ? '' : prompt('Reason (optional, sent to the employee):', '') ?? null;
    if (note === null) return;
    try { await X.api(`leaves/${b.dataset.dec}/decide`, { method: 'POST', body: { approve: ok, note } }); toast(ok ? 'Approved. The employee was emailed.' : 'Done. The employee was emailed.'); again(); } catch (e) { toast(e.message); }
  }));
}
function leaveForm(box, emps, empId, after) {
  box.innerHTML = `<form class="hform hcard soft" id="lfm"><div class="grid3"><label class="field"><span class="lab">Employee</span><select name="employee_id" required>${empOpts(emps, empId)}</select></label>
    <label class="field"><span class="lab">Type</span><select name="type">${X.S.leave_types.map(t => opt(t.key, t.name)).join('')}</select></label><label class="check" style="align-self:end"><input type="checkbox" name="half"> Half day</label></div>
    <div class="grid3">${field('From', 'start_date', today(), { type: 'date' })}${field('To', 'end_date', today(), { type: 'date' })}${field('Reason', 'reason', '')}</div>
    <div class="row-end">${errLine('lErr')}<button type="button" class="btn" id="lc">Cancel</button><button class="btn primary">Add approved leave</button></div></form>`;
  $('#lc').onclick = () => { box.innerHTML = ''; };
  $('#lfm').onsubmit = async ev => { ev.preventDefault(); const v = Object.fromEntries(new FormData(ev.target)); v.half = !!v.half;
    await busy($('#lfm button:last-child'), async () => { try { await X.api('leaves', { method: 'POST', body: v }); toast('Leave added'); after(); } catch (e) { fail('lErr', e); } }); };
}
async function leave(p) {
  const st = ['pending', 'approved', ''].includes(p[0] ?? 'pending') ? (p[0] ?? 'pending') : 'pending';
  const [r, em] = await Promise.all([X.api('leaves' + (st ? '?status=' + st : '') + teamQ(st ? '&' : '?')), X.api('employees')]);
  X.v.innerHTML = `${head('Leave', 'Employees apply in their portal. Managers approve their team; you can approve anyone.', '<button class="btn primary" id="addl">Add leave for someone</button>')}
    ${teamBar('leave')}<div id="lf"></div>
    <nav class="hpills">${[['pending', 'Waiting'], ['approved', 'Approved'], ['all', 'All']].map(([k, l]) => `<a href="${X.base}/leave/${k === 'all' ? '' : k}" ${(k === 'all' ? '' : k) === st ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <section class="hcard flush">${leaveTable(r.leaves)}</section>`;
  $('#addl').onclick = () => leaveForm($('#lf'), em.employees, '', () => leave(p));
  bindLeave(X.v, () => leave(p));
  bindTeam(() => leave(p));
}

// ================================================================ attendance
async function attendance(p) {
  if (p[0] === 'month') return attendanceMonth(p[1] || thisMonth());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p[0] || '') ? p[0] : today();
  const r = await X.api('attendance?date=' + date + teamQ('&'));
  const off = !r.workday;
  const app = X.S.checkin && X.S.checkin.mode === 'app';
  const where = x => { if (x.source !== 'app') return ''; const g = x.geo || {}, i = g.in || {}, o = g.out || {}; const map = q => q && q.lat != null ? ` <a href="https://maps.google.com/?q=${q.lat},${q.lng}" target="_blank" rel="noopener">map</a>` : '';
    return `<div class="appin">📱 ${x.kind === 'field' ? '<b>Field visit</b>' : x.kind === 'branch' ? '<b>Branch visit</b>' : 'Office'}${x.place ? ' · ' + esc(x.place) : ''}${x.kind === 'office' && i.distance != null ? ` · ${i.distance} m` : ''}${map(i)}${o.outside ? ` · <span class="bad">checked out outside${map(o)}</span>` : ''}</div>`; };
  X.v.innerHTML = `${head('Attendance', app ? 'Employees check in from the app: office check-in only works inside the office; field and branch visits need a note. No check-in on a past work day counts as absent. You can correct any day here.' : 'Mark only the exceptions: anyone left empty counts as present. Leave, holidays and weekends fill in by themselves.',
    `<a class="btn" href="${X.base}/attendance/month/${date.slice(0, 7)}">Month view</a>`)}
    ${teamBar('attendance')}
    <div class="hdaybar"><a class="btn small" href="${X.base}/attendance/${addD(date, -1)}" aria-label="Previous day">‹</a><input type="date" id="dt" value="${date}" aria-label="Date"><a class="btn small" href="${X.base}/attendance/${addD(date, 1)}" aria-label="Next day">›</a>
      <b>${new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}</b>${off ? pill(r.holiday || 'Weekend', 'info') : ''}
      <span class="row-end"><button class="btn small" id="allp" ${off ? 'disabled' : ''}>Mark everyone present</button></span></div>
    <form id="af" class="hcard flush"><div class="scroll"><table class="t ht att"><thead><tr><th>Employee</th><th>Status</th><th>In</th><th>Out</th><th>Note</th></tr></thead><tbody>
      ${r.rows.map(x => { const locked = ['LV', 'HO', 'WE', '-'].includes(x.code); return `<tr data-e="${x.employee.id}"><td><div class="hwho">${av(x.employee.name, x.employee.photo)}<div><b>${esc(x.employee.name)}</b><small>${esc(x.employee.designation || '')}</small>${where(x)}</div></div></td>
        <td>${locked ? pill(x.label, x.code === 'LV' ? 'info' : '') : `<div class="seg" role="radiogroup" aria-label="Status for ${esc(x.employee.name)}">${Object.entries(ATT).map(([k, l]) => `<label class="s-${k}"><input type="radio" name="s${x.employee.id}" value="${k}" ${x.code === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}<label class="s-0"><input type="radio" name="s${x.employee.id}" value="" ${!x.code ? 'checked' : ''}><span title="Not marked: counts as present">–</span></label></div>`}</td>
        <td>${locked ? '' : `<input type="time" name="i${x.employee.id}" value="${esc(x.in_time || '')}" aria-label="In time">`}</td><td>${locked ? '' : `<input type="time" name="o${x.employee.id}" value="${esc(x.out_time || '')}" aria-label="Out time">`}</td>
        <td>${locked ? '' : `<input name="n${x.employee.id}" value="${esc(x.note || '')}" aria-label="Note" placeholder="Optional">`}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted" style="padding:24px;text-align:center">No employees on this date.</td></tr>'}
    </tbody></table></div><div class="savebar">${errLine('aErr')}<button class="btn primary" ${off ? 'disabled' : ''}>Save attendance</button></div></form>`;
  $('#dt').onchange = ev => go('attendance/' + ev.target.value);
  bindTeam(() => attendance(p));
  $('#allp').onclick = () => $$('#af tr[data-e]').forEach(tr => { const r2 = $('input[value="P"]', tr); if (r2 && !$('input:checked', tr)?.value) r2.checked = true; });
  $('#af').onsubmit = async ev => {
    ev.preventDefault();
    const f = ev.target, rows = $$('tr[data-e]', f).filter(tr => $('input[type=radio]', tr)).map(tr => { const id = tr.dataset.e; return { employee_id: +id, status: ($(`input[name=s${id}]:checked`, tr) || {}).value || '', in_time: f.elements['i' + id].value, out_time: f.elements['o' + id].value, note: f.elements['n' + id].value }; });
    await busy($('button.primary', f), async () => { try { const x = await X.api('attendance', { method: 'PUT', body: { date, rows } }); toast(`Saved (${x.saved} marked)`); } catch (e) { fail('aErr', e); } });
  };
}
async function attendanceMonth(m) {
  const r = await X.api('attendance/month?month=' + m + teamQ('&'));
  const cls = c => ({ P: 'p', L: 'l', H: 'h', A: 'a', LV: 'lv', HO: 'ho', WE: 'we', '-': 'na', '': 'p0' }[c] || '');
  const short = d => ({ P: 'P', L: 'L', H: '½', A: 'A', LV: 'LV', HO: 'H', WE: '', '-': '', '': '·' }[d.code] ?? d.code);
  X.v.innerHTML = `${head('Attendance · ' + monthName(m), 'P present · L late · ½ half day · A absent · LV leave · H holiday · · not marked (counts as present)',
    `<a class="btn" href="${X.base}/attendance">Mark a day</a><a class="btn" href="${X.raw}attendance.csv?month=${m}">Download CSV</a>`)}
    <div class="hdaybar"><a class="btn small" href="${X.base}/attendance/month/${addM(m, -1)}">‹ ${esc(monthName(addM(m, -1)).split(' ')[0])}</a><b>${esc(monthName(m))}</b><a class="btn small" href="${X.base}/attendance/month/${addM(m, 1)}">${esc(monthName(addM(m, 1)).split(' ')[0])} ›</a></div>
    <section class="hcard flush"><div class="scroll"><table class="t amon"><thead><tr><th>Employee</th>${r.days.map(d => `<th class="${[5, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay()) ? 'we' : ''}">${+d.slice(8)}</th>`).join('')}<th>Present</th><th>Late</th><th>Absent</th><th>Leave</th></tr></thead><tbody>
      ${r.rows.map(x => `<tr><td><a href="${X.base}/employees/${x.employee.id}">${esc(x.employee.name)}</a></td>${x.days.map(d => `<td class="c ${cls(d.code)}" title="${esc(d.date + ': ' + d.label)}"><a href="${X.base}/attendance/${d.date}">${short(d)}</a></td>`).join('')}
        <td class="n">${x.counts.present}</td><td class="n">${x.counts.late}</td><td class="n">${x.counts.absent + x.counts.half * 0.5}</td><td class="n">${x.counts.paid_leave + x.counts.unpaid_leave}</td></tr>`).join('') || `<tr><td colspan="${r.days.length + 5}" class="muted">No employees this month.</td></tr>`}
    </tbody></table></div></section>`;
}

// ================================================================ recruitment
async function recruit(p) {
  if (p[0] === 'new') return jobForm(null);
  if (p[0] === 'applicant') return applicant(p[1], p[2]);
  if (p[0] && p[1] === 'edit') { const r = await X.api('jobs/' + p[0]); return jobForm(p[0], r.job); }
  if (p[0]) return job(p[0], ['find', 'post', 'import'].includes(p[1]) ? p[1] : 'board');
  const r = await X.api('jobs');
  X.v.innerHTML = `${head('Recruitment', 'Share your careers page. Every application is screened by AI; you decide who moves forward.', `<a class="btn primary" href="${X.base}/recruit/new">Post a job</a>`)}
    <div class="hcopy"><span>Your careers page</span><code>${esc(r.careers_url)}</code><button class="btn small" data-copy="${esc(r.careers_url)}">Copy link</button><a class="btn small" href="${esc(r.careers_url)}" target="_blank" rel="noopener">Open</a></div>
    <section class="hcard soft hdrop"><div><h3>Drop CVs for any position</h3><p class="muted small">Drop a pile of CVs (PDF, Word or photo). Each one goes to the position it fits best, is screened, and the candidate is emailed${X.S.recruit.auto_interview ? ' or booked for an interview' : ''}. CVs from Gmail or Google Drive arrive the same way through n8n (<a href="${X.base}/settings/hook">Automation key</a>).</p></div>
      <label class="btn primary" for="anycv">Choose CVs</label><input type="file" id="anycv" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" hidden><ul class="hlist" id="anyres"></ul></section>
    <div class="hjobs">${r.jobs.map(j => `<a class="hjob" href="${X.base}/recruit/${j.id}"><div><b>${esc(j.title)}</b><small>${esc([j.dept, j.location, j.job_type].filter(Boolean).join(' · '))}</small></div>
      ${pill(j.status === 'open' ? 'Open' : j.status === 'draft' ? 'Draft' : 'Closed', j.status === 'open' ? 'good' : '')}<div class="hjn"><b>${j.applicants}</b><span>applicants</span></div>${j.new_count ? `<span class="pill act">${j.new_count} new</span>` : ''}</a>`).join('')
      || '<div class="empty">No jobs yet. Post your first job and share the careers link.</div>'}</div>`;
  bindCopy();
  $('#anycv').onchange = async () => {
    const ul = $('#anyres'), files = [...$('#anycv').files].slice(0, 50); ul.innerHTML = '';
    for (const file of files) {
      const li = document.createElement('li'); li.innerHTML = `<span class="hdot info"></span><div>${esc(file.name)} <span class="muted small">reading…</span></div>`; ul.appendChild(li);
      try {
        if (file.size > 1200000) throw new Error('larger than 1.2 MB');
        const x = await X.api('recruit/import', { method: 'POST', body: { source: 'hr', cv: { name: file.name, type: file.type || (/\.docx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ''), data: await fileToB64(file) } } });
        if (x.duplicate) li.innerHTML = `<span class="hdot"></span><div>${esc(file.name)} <span class="muted small">already here as ${esc(x.name)}</span></div>`;
        else { const a = x.applicant; li.innerHTML = `<span class="hdot ${a.stage === 'rejected' ? 'bad' : ['shortlisted', 'interview'].includes(a.stage) ? 'good' : 'info'}"></span><div><a href="${X.base}/recruit/applicant/${a.id}"><b>${esc(a.name)}</b></a> → <b>${esc(x.job.title)}</b> <span class="score ${scoreTone(a.score)}">${a.score ?? '-'}</span> <span class="muted small">${esc(STG[a.stage])}${x.route && x.route.reason ? ' · ' + esc(x.route.reason) : ''}</span></div>`; }
      } catch (e) { li.innerHTML = `<span class="hdot bad"></span><div>${esc(file.name)} <span class="error">${esc(e.message)}</span></div>`; }
    }
    toast('Done. Refresh to see the counts.');
  };
}
const bindCopy = () => $$('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copied'); } catch (e) { prompt('Copy this link:', b.dataset.copy); } });
function jobForm(id, j = { job_type: 'Full-time', status: 'open' }) {
  X.v.innerHTML = `${head(id ? 'Edit job' : 'Post a job', 'Clear requirements help the AI score candidates fairly.')}
    <form id="jf" class="hform"><section class="section"><header><h2>The job</h2></header><div class="stack">
      <div class="grid2">${field('Job title', 'title', j.title, { attrs: 'required' })}<label class="field"><span class="lab">Department</span><input name="dept" list="depts" value="${esc(j.dept || '')}"><datalist id="depts">${X.S.departments.map(d => `<option>${esc(d)}</option>`).join('')}</datalist></label></div>
      <div class="grid3">${field('Location', 'location', j.location, { ph: 'Dhaka / Remote' })}<label class="field"><span class="lab">Type</span><select name="job_type">${['Full-time', 'Part-time', 'Contract', 'Internship'].map(t => opt(t, t, j.job_type)).join('')}</select></label>${field('Salary range (optional)', 'salary_range', j.salary_range, { ph: 'BDT 30,000–40,000' })}</div>
      ${area('About the role', 'description', j.description, { ph: 'What the person will do, the team, why join.' })}
      ${area('Requirements (the AI scores against these)', 'requirements', j.requirements, { ph: 'One per line: 2+ years in B2B sales, good English, CRM experience…' })}
      <div class="grid3">${field('Closes on (optional)', 'closes_on', j.closes_on, { type: 'date' })}<label class="field"><span class="lab">Status</span><select name="status">${[['open', 'Open: shown on careers page'], ['draft', 'Draft: hidden'], ['closed', 'Closed']].map(([v, l]) => opt(v, l, j.status)).join('')}</select></label></div>
    </div></section><div class="savebar">${errLine('jErr')}<a class="btn" href="${X.base}/recruit${id ? '/' + id : ''}">Cancel</a><button class="btn primary">${id ? 'Save job' : 'Publish job'}</button></div></form>`;
  $('#jf').onsubmit = async ev => { ev.preventDefault(); await busy($('#jf button.primary'), async () => { try { const r = await X.api(id ? 'jobs/' + id : 'jobs', { method: id ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(ev.target)) }); toast('Saved'); go('recruit/' + r.job.id); } catch (e) { fail('jErr', e); } }); };
}
async function job(id, tab = 'board') {
  const r = await X.api('jobs/' + id), j = r.job, sc = r.sourcing || {}, pc = r.prospect_counts || {};
  const tabs = [['board', `Applicants <span>${r.applicants.length}</span>`], ['find', `Find candidates${Object.values(pc).reduce((x, y) => x + y, 0) ? ` <span>${Object.values(pc).reduce((x, y) => x + y, 0)}</span>` : ''}`], ['post', 'Post the job'], ['import', 'Import CVs']];
  X.v.innerHTML = `<a class="muted small" href="${X.base}/recruit">← All jobs</a>
    ${head(esc(j.title), esc([j.dept, j.location, j.job_type].filter(Boolean).join(' · ')) + ' · ' + r.applicants.length + ' applicants', `<a class="btn" href="${X.base}/recruit/${j.id}/edit">Edit job</a>`)}
    <nav class="htabs" aria-label="Job">${tabs.map(([k, l]) => `<a href="${X.base}/recruit/${j.id}${k === 'board' ? '' : '/' + k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav><div id="jt"></div>`;
  const el = $('#jt');
  if (tab === 'board') return jobBoard(el, r);
  if (tab === 'find') return jobFind(el, r);
  if (tab === 'post') return jobPost(el, r);
  return jobImport(el, r);
}
function jobBoard(el, r) {
  const j = r.job, id = j.id, cols = ['new', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'];
  const SRC = r.sources || {};
  el.innerHTML = `<div class="hcopy"><span>Apply link</span><code>${esc(r.apply_url)}</code><button class="btn small" data-copy="${esc(r.apply_url)}">Copy</button><button class="btn small" id="adda">Add one applicant</button><a class="btn small" href="${X.base}/recruit/${id}/import">Import CVs</a></div>
    <div id="af2"></div>
    <div class="kanban">${cols.map(c => { const list = r.applicants.filter(a => a.stage === c); return `<section class="kcol k-${c}"><h3>${STG[c]} <span>${list.length}</span></h3>
      ${list.map(a => `<a class="kcard" href="${X.base}/recruit/applicant/${a.id}"><div class="kt"><b>${esc(a.name)}</b>${a.score != null ? `<span class="score ${scoreTone(a.score)}" title="AI score">${a.score}</span>` : ''}</div>
        <small>${esc(a.current_role || '')}${a.experience ? ` · ${a.experience} yrs` : ''}</small>${a.ai && a.ai.summary ? `<p>${esc(a.ai.summary.slice(0, 110))}${a.ai.summary.length > 110 ? '…' : ''}</p>` : ''}
        <small class="ksrc">${esc(a.source === 'careers' ? 'Careers page' : SRC[a.source] || 'Added by HR')}${a.email ? '' : ' · <b class="bad">no email</b>'}</small>
        ${a.stage === 'interview' && a.interview.date ? `<small class="kd">📅 ${esc(DS(a.interview.date))} ${esc(a.interview.time)}${a.interview.round > 1 ? ' · round ' + a.interview.round : ''}</small>` : ''}${a.stage === 'offer' && a.offer.status ? `<small class="kd">Offer ${esc(a.offer.status)}</small>` : ''}</a>`).join('') || '<p class="muted small">None</p>'}</section>`; }).join('')}</div>`;
  bindCopy();
  $('#adda').onclick = () => {
    $('#af2').innerHTML = `<form class="hform hcard soft" id="apf"><h3>Add one applicant</h3>
      <div class="grid3">${field('Name', 'name', '', { attrs: 'required' })}${field('Email', 'email', '', { type: 'email', attrs: 'required' })}${field('Phone', 'phone', '')}</div>
      <div class="grid3">${field('Years of experience', 'experience', '', { type: 'number', attrs: 'min="0" step="0.5"' })}${field('Current role', 'current_role', '')}<label class="field"><span class="lab">CV (PDF or Word, max 1.2 MB)</span><input type="file" name="cv" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"></label></div>
      ${area('Notes or cover letter', 'cover', '')}<div class="row-end">${errLine('apErr')}<button type="button" class="btn" id="apc">Cancel</button><button class="btn primary">Add and screen</button></div></form>`;
    $('#apc').onclick = () => { $('#af2').innerHTML = ''; };
    $('#apf').onsubmit = async ev => { ev.preventDefault(); const f = ev.target, v = Object.fromEntries(new FormData(f)); delete v.cv;
      await busy($('#apf button.primary'), async () => { try { v.cv = await pickFile(f.elements.cv); const x = await X.api(`jobs/${id}/applicants`, { method: 'POST', body: v }); toast('Added and screened'); go('recruit/applicant/' + x.applicant.id); } catch (e) { fail('apErr', e); } }); };
  };
}
const PST = { new: ['New', ''], contacted: ['Contacted', 'info'], replied: ['Replied', 'act'], cv_received: ['CV received', 'good'], not_interested: ['Not interested', 'bad'] };
async function jobFind(el, r0) {
  const j = r0.job, id = j.id;
  const r = await X.api(`jobs/${id}/prospects`), sc = r.sourcing || {};
  const list = r.prospects;
  el.innerHTML = `<section class="hcard soft hfind"><div><h3>Find people who match this job</h3>
      <p class="muted">Searches public LinkedIn profiles (people marked <b>Open to work</b> first) and public Facebook posts for <b>${esc(j.title)}</b>${(sc.location || j.location) ? ' in ' + esc(sc.location || j.location) : ''}. AI ranks them against your requirements. Then contact them with the ready message and ask for their CV.</p></div>
    <form id="ff" class="hform"><div class="grid3">${field('Extra keywords (optional)', 'keywords', sc.keywords, { ph: 'e.g. FMCG "B2B" CRM' })}${field('Location', 'location', sc.location || j.location, { ph: 'Dhaka' })}
      <label class="check" style="align-self:end"><input type="checkbox" name="auto" ${sc.auto ? 'checked' : ''}> Search again every morning</label></div>
      <div class="row-end">${errLine('fErr')}<span class="muted small">${sc.last_run ? `Last search ${fmtDateTime(sc.last_run)}: ${sc.last_found} new` : ''}</span><button type="button" class="btn" id="fsave">Save</button><button class="btn primary" ${r.search_ready ? '' : 'disabled'}>Search now</button></div>
      ${r.search_ready ? '' : '<p class="note warn small">Candidate search is not switched on for your account yet. Contact Briefbox support.</p>'}</form></section>
    ${list.length ? `<div class="pfilter row">${['all', ...Object.keys(PST)].map(k => `<button class="chip ${k === 'all' ? 'on' : ''}" data-f="${k}">${k === 'all' ? 'All' : PST[k][0]} <span>${k === 'all' ? list.length : list.filter(p => p.status === k).length}</span></button>`).join('')}</div>
    <section class="hcard flush"><div class="scroll"><table class="t plist"><thead><tr><th>Person</th><th>Fit</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(p => `<tr data-st="${p.status}"><td><div class="pn"><a href="${esc(p.url)}" target="_blank" rel="noopener"><b>${esc(p.name)}</b></a>${p.open_to_work ? pill('Open to work', 'good') : ''}${pill(p.source === 'facebook' ? 'Facebook' : 'LinkedIn', '')}</div>
          <div class="muted small">${esc(p.headline)}</div>${p.snippet ? `<div class="muted small clip">${esc(p.snippet)}</div>` : ''}</td>
        <td><span class="score ${scoreTone(p.score)}">${p.score ?? '-'}</span><div class="muted small">${esc(p.reason || '')}</div></td>
        <td><select data-ps="${p.id}" aria-label="Status">${Object.entries(PST).map(([k, v]) => opt(k, v[0], p.status)).join('')}</select>${p.applicant_id ? `<div><a class="small" href="${X.base}/recruit/applicant/${p.applicant_id}">Open applicant</a></div>` : ''}</td>
        <td class="n nowrap"><button class="btn small" data-msg="${p.id}">Copy message</button> <a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener">Open profile</a> ${p.applicant_id ? '' : `<button class="btn small primary" data-cv="${p.id}">Add CV</button>`}</td></tr>`).join('')}
    </tbody></table></div></section>` : `<div class="empty">${sc.last_run ? 'No matching people found yet. Try other keywords or a wider location.' : 'Click <b>Search now</b> to find people for this job.'}</div>`}
    <input type="file" id="pcv" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" hidden>`;
  const f = $('#ff'), vals = () => { const v = Object.fromEntries(new FormData(f)); return { keywords: v.keywords, location: v.location, auto: !!v.auto }; };
  $('#fsave').onclick = ev => busy(ev.target, async () => { try { await X.api(`jobs/${id}/sourcing`, { method: 'PUT', body: vals() }); toast('Saved'); } catch (e) { fail('fErr', e); } });
  f.onsubmit = async ev => { ev.preventDefault(); await busy($('#ff button.primary'), async () => { try { await X.api(`jobs/${id}/sourcing`, { method: 'PUT', body: vals() }); const x = await X.api(`jobs/${id}/find`, { method: 'POST' }); toast(`${x.found} new people found · ${x.runs_left} searches left today`); job(id, 'find'); } catch (e) { fail('fErr', e); } }); };
  $$('[data-f]', el).forEach(b => b.onclick = () => { $$('[data-f]', el).forEach(x => x.classList.toggle('on', x === b)); $$('tr[data-st]', el).forEach(t => { t.hidden = b.dataset.f !== 'all' && t.dataset.st !== b.dataset.f; }); });
  $$('[data-ps]', el).forEach(sel => sel.onchange = async () => { try { await X.api('prospects/' + sel.dataset.ps, { method: 'PUT', body: { status: sel.value } }); sel.closest('tr').dataset.st = sel.value; toast('Updated'); } catch (e) { toast(e.message); } });
  $$('[data-msg]', el).forEach(b => b.onclick = async () => { const p = list.find(x => String(x.id) === b.dataset.msg); try { await navigator.clipboard.writeText(p.message); toast('Message copied. Paste it in LinkedIn or Messenger.'); } catch (e) { prompt('Copy this message:', p.message); }
    if (p.status === 'new') { await X.api('prospects/' + p.id, { method: 'PUT', body: { status: 'contacted' } }).catch(() => {}); const s2 = $(`[data-ps="${p.id}"]`, el); if (s2) s2.value = 'contacted'; p.status = 'contacted'; } });
  let target = null;
  $$('[data-cv]', el).forEach(b => b.onclick = () => { target = list.find(x => String(x.id) === b.dataset.cv); $('#pcv').value = ''; $('#pcv').click(); });
  $('#pcv').onchange = async () => {
    if (!target) return;
    try { const cv = await pickFile($('#pcv')); toast('Reading the CV…'); const x = await X.api(`jobs/${id}/import`, { method: 'POST', body: { source: target.source, link: target.url, prospect_id: target.id, cv } });
      if (x.duplicate) toast(`${x.name} is already an applicant.`); else { toast('Added and screened'); go('recruit/applicant/' + x.applicant.id); } } catch (e) { toast(e.message); }
  };
}
async function jobPost(el, r) {
  const j = r.job, id = j.id, sc = r.sourcing || {}, P = sc.posts;
  const url = r.apply_url, enc = encodeURIComponent(url);
  const card = (k, name, extra) => `<section class="hcard post"><div class="ph"><h3>${name}</h3><div class="row">${extra}<button class="btn small" data-cp="${k}">Copy text</button></div></div><textarea name="${k}" rows="12" aria-label="${name} post">${esc((P || {})[k] || '')}</textarea></section>`;
  el.innerHTML = `<section class="hcard soft"><h3>Post this job everywhere</h3><p class="muted">AI writes a post for each site from your job details. Edit if you like, then post. Every post links to your apply page, so all CVs land here and get screened.</p>
      <div class="row-end">${errLine('poErr')}${P ? `<span class="muted small">Written ${fmtDateTime(P.at)}${P.by === 'template' ? ' from a template (add an AI key for better posts)' : ''}</span>` : ''}<button class="btn ${P ? '' : 'primary'}" id="gen">${P ? 'Write again' : 'Write the posts'}</button>${P ? '<button class="btn primary" id="psave">Save changes</button>' : ''}</div></section>
    ${P ? `<form id="pof" class="hposts">
      ${card('linkedin', 'LinkedIn', `<a class="btn small" href="https://www.linkedin.com/sharing/share-offsite/?url=${enc}" target="_blank" rel="noopener">Share on LinkedIn</a>`)}
      ${card('facebook', 'Facebook', `${r.facebook_ready ? `<button type="button" class="btn small primary" id="fbp">${sc.fb_post ? 'Post again to your page' : 'Post to your Facebook page'}</button>` : `<a class="btn small" href="${X.base}/settings/fb" title="Connect your page in Settings">Connect your page</a>`}<a class="btn small" href="https://www.facebook.com/sharer/sharer.php?u=${enc}" target="_blank" rel="noopener">Share</a>`)}
      ${card('bdjobs', 'Bdjobs', `<a class="btn small" href="https://www.bdjobs.com/" target="_blank" rel="noopener">Open Bdjobs</a>`)}
    </form>
    <p class="muted small">${sc.fb_post ? `Posted on Facebook ${fmtDateTime(sc.fb_post.at)}. ` : ''}Bdjobs has no automatic posting: paste the text in your Bdjobs employer account, then download the CVs from Bdjobs and use <a href="${X.base}/recruit/${id}/import">Import CVs</a>. If you set a webhook in Settings, your n8n also gets these posts (event <code>job.published</code>) and can publish them automatically.</p>` : ''}`;
  $('#gen').onclick = ev => busy(ev.target, async () => { try { await X.api(`jobs/${id}/posts`, { method: 'POST' }); toast('Posts written'); job(id, 'post'); } catch (e) { fail('poErr', e); } });
  if (!P) return;
  $$('[data-cp]', el).forEach(b => b.onclick = async () => { const t = $(`textarea[name="${b.dataset.cp}"]`, el).value; try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { prompt('Copy:', t); } });
  const save = () => X.api(`jobs/${id}/sourcing`, { method: 'PUT', body: Object.fromEntries(new FormData($('#pof'))) });
  $('#psave').onclick = ev => busy(ev.target, async () => { try { await save(); toast('Saved'); } catch (e) { fail('poErr', e); } });
  const fb = $('#fbp');
  if (fb) fb.onclick = () => busy(fb, async () => { try { await save(); await X.api(`jobs/${id}/facebook`, { method: 'POST' }); toast('Posted on your Facebook page'); job(id, 'post'); } catch (e) { toast(e.message); } });
}
function jobImport(el, r) {
  const j = r.job, id = j.id, SRC = r.sources || {};
  el.innerHTML = `<section class="hcard soft"><h3>Import CVs</h3><p class="muted">Upload CVs you collected from Bdjobs, Facebook, LinkedIn, email or walk-ins. For each file the AI reads the name, email and phone, scores it against this job, shortlists strong matches (score ${X.S.ai_shortlist}+) and emails every candidate.</p>
    <form id="imf" class="hform"><div class="grid3"><label class="field"><span class="lab">Where did these CVs come from?</span><select name="source">${Object.entries(SRC).map(([k, v]) => opt(k, v, 'bdjobs')).join('')}</select></label>
      <label class="field"><span class="lab">CV files (PDF, Word or photo; up to 50, max 1.2 MB each)</span><input type="file" name="files" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" required></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="email" checked> Email the candidates</label></div>
      <div class="row-end">${errLine('imErr')}<button class="btn primary">Import and screen</button></div></form></section>
    <section class="hcard" id="imres" hidden><h3>Results</h3><ul class="hlist" id="iml"></ul></section>`;
  $('#imf').onsubmit = async ev => {
    ev.preventDefault();
    const f = ev.target, files = [...f.elements.files.files].slice(0, 50), source = f.elements.source.value, email = f.elements.email.checked;
    if (!files.length) return fail('imErr', new Error('Choose the CV files.'));
    $('#imres').hidden = false; const ul = $('#iml'); ul.innerHTML = '';
    const btn = $('#imf button.primary'); btn.disabled = true;
    let added = 0;
    for (const [i, file] of files.entries()) {
      btn.textContent = `Reading ${i + 1} of ${files.length}…`;
      const li = document.createElement('li'); li.innerHTML = `<span class="hdot info"></span><div>${esc(file.name)} <span class="muted small">reading…</span></div>`; ul.appendChild(li);
      try {
        if (file.size > 1200000) throw new Error('larger than 1.2 MB');
        const cv = { name: file.name, type: file.type || (/\.docx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ''), data: await fileToB64(file) };
        const x = await X.api(`jobs/${id}/import`, { method: 'POST', body: { source, cv, email } });
        if (x.duplicate) li.innerHTML = `<span class="hdot"></span><div>${esc(file.name)} <span class="muted small">already here as ${esc(x.name)}</span></div>`;
        else { added++; const a = x.applicant; li.innerHTML = `<span class="hdot ${a.stage === 'shortlisted' ? 'good' : a.stage === 'rejected' ? 'bad' : 'info'}"></span><div><a href="${X.base}/recruit/applicant/${a.id}"><b>${esc(a.name)}</b></a> <span class="score ${scoreTone(a.score)}">${a.score ?? '-'}</span> <span class="muted small">${esc(STG[a.stage])}${a.email ? ' · ' + esc(a.email) : ' · no email found, open to add it'}${x.emailed && a.email ? ' · emailed' : ''}</span></div>`; }
      } catch (e) { li.innerHTML = `<span class="hdot bad"></span><div>${esc(file.name)} <span class="error">${esc(e.message)}</span></div>`; }
    }
    btn.disabled = false; btn.textContent = 'Import and screen';
    toast(`${added} CV${added === 1 ? '' : 's'} imported`);
  };
}
async function applicant(id, view) {
  const r = await X.api('applicants/' + id), a = r.applicant, j = r.job, ai = a.ai || {}, iv = a.interview || {}, of = a.offer || {};
  const cv = r.files.find(f => f.kind === 'cv');
  const ring = n => `<div class="ring ${scoreTone(n)}" style="--v:${n || 0}"><b>${n ?? '-'}</b><span>AI score</span></div>`;
  X.v.innerHTML = `<a class="muted small" href="${X.base}/recruit/${j.id}">← ${esc(j.title)}</a>
    <div class="hprof"><span class="hav big" aria-hidden="true">${esc(initials(a.name))}</span><div><h2>${esc(a.name)}</h2><p class="muted">${esc(a.current_role || 'Applicant')} · ${a.experience} years · applied ${fmtDate(a.created_at)}${a.source === 'hr' ? ' (added by HR)' : ''}</p>
      <p class="hmeta">${pill(STG[a.stage], a.stage === 'hired' ? 'good' : a.stage === 'rejected' ? 'bad' : 'info')}${a.email ? `<span>${esc(a.email)}</span>` : '<span class="bad">No email yet</span>'}${a.source && !['careers', 'hr'].includes(a.source) ? `<span>From ${esc(a.source === 'bdjobs' ? 'Bdjobs' : a.source[0].toUpperCase() + a.source.slice(1))}</span>` : ''}${a.phone ? `<span>${esc(a.phone)}</span>` : ''}${a.expected_salary ? `<span>Expects ${esc(a.expected_salary)}</span>` : ''}</p></div>
      <div class="row-end"><button class="btn small ghost" data-v="edit">Edit details</button>${cv ? `<a class="btn small" href="${X.raw}files/${cv.id}" target="_blank" rel="noopener">Open CV</a>` : ''}${a.link ? `<a class="btn small" href="${esc(a.link)}" target="_blank" rel="noopener">Profile</a>` : ''}</div></div>
    <div class="hgrid">
      <section class="hcard"><div class="aihead">${ring(a.score)}<div><h3>AI screening ${ai.verdict ? pill(ai.verdict === 'strong' ? 'Strong match' : ai.verdict === 'possible' ? 'Possible match' : 'Weak match', scoreTone(a.score)) : ''}</h3>
        <p>${esc(ai.summary || 'Not screened yet.')}</p><small class="muted">${ai.by === 'rules' ? 'Scored by keyword rules (add an AI key for full CV reading).' : ai.by === 'ai' ? 'Read by AI, including the CV.' : ''}${ai.note ? ' ' + esc(ai.note) : ''}</small></div></div>
        <div class="grid2 aicols"><div><h4>Strengths</h4><ul>${(ai.strengths || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li class="muted">-</li>'}</ul></div><div><h4>Gaps</h4><ul>${(ai.gaps || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li class="muted">-</li>'}</ul></div></div>
        ${(ai.questions || []).length ? `<h4>Suggested interview questions</h4><ol>${ai.questions.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
        <div class="row-end"><button class="btn small" id="rs">Screen again</button></div></section>
      <section class="hcard"><h3>Next step</h3><div id="act"></div>
        ${(iv.history || []).map(h => `<div class="hbox"><b>Round ${h.round}</b> ${esc(D(h.date))} · ${esc(h.result || 'done')}${h.rating ? ` · ${'★'.repeat(h.rating)}${'☆'.repeat(5 - h.rating)}` : ''}${h.feedback ? ': ' + esc(h.feedback) : ''}</div>`).join('')}
        ${iv.date ? `<div class="hbox"><b>Interview${iv.round ? ' round ' + iv.round : ''}</b> ${esc(D(iv.date))} at ${esc(iv.time)} · ${esc(iv.mode || '')}${iv.where ? ' · ' + esc(iv.where) : ''}${iv.rating ? `<br>Rating ${'★'.repeat(iv.rating)}${'☆'.repeat(5 - iv.rating)} by ${esc(iv.by || '')}: ${esc(iv.feedback || '')}` : ''}</div>` : ''}
        ${of.sent_at ? `<div class="hbox"><b>Offer</b> ${esc(of.designation)} · joins ${esc(D(of.join_date))} · basic ${cur(of.basic)} · ${pill(of.status, of.status === 'accepted' ? 'good' : of.status === 'declined' ? 'bad' : 'info')}${of.answer_note ? `<br>“${esc(of.answer_note)}”` : ''}</div>` : ''}
        ${a.cover ? `<h4>Cover note</h4><p class="pre">${esc(a.cover)}</p>` : ''}
        <h4>Notes</h4><textarea id="nt" rows="3" aria-label="Notes">${esc(a.notes)}</textarea><div class="row-end"><button class="btn small" id="sn">Save notes</button></div></section>
    </div>`;
  const act = $('#act');
  const btns = [];
  if (['new', 'shortlisted'].includes(a.stage)) btns.push('<button class="btn primary" data-v="interview">Schedule interview</button>');
  if (a.stage === 'new') btns.push('<button class="btn" data-st="shortlisted">Shortlist</button>');
  if (a.stage === 'interview') btns.push('<button class="btn primary" data-v="hire">Hire</button><button class="btn" data-v="feedback">Interview feedback</button><button class="btn" data-v="interview">Reschedule</button><button class="btn" data-v="offer">Send offer first</button>');
  if (a.stage === 'offer') btns.push(`<button class="btn primary" data-v="hire" ${of.status === 'declined' ? 'disabled' : ''}>Hire ${of.status === 'accepted' ? '(offer accepted)' : ''}</button><button class="btn" data-v="offer">Send a new offer</button>`);
  if (a.stage === 'shortlisted') btns.push('<button class="btn" data-v="hire">Hire directly</button>');
  if (!['hired', 'rejected'].includes(a.stage)) btns.push('<button class="btn ghost danger" id="rej">Not selected</button>');
  if (a.stage === 'rejected') btns.push('<button class="btn" data-st="shortlisted">Move back to shortlist</button>');
  if (a.stage === 'hired') btns.push(`<a class="btn primary" href="${X.base}/employees/${a.employee_id}">Open employee</a>`);
  act.innerHTML = `<div class="row">${btns.join('')}</div><div id="pane"></div>`;
  const pane = $('#pane');
  $$('[data-st]', act).forEach(b => b.onclick = () => busy(b, async () => { try { await X.api('applicants/' + id, { method: 'PUT', body: { stage: b.dataset.st } }); applicant(id); } catch (e) { toast(e.message); } }));
  $('#rs').onclick = ev => busy(ev.target, async () => { try { await X.api(`applicants/${id}/screen`, { method: 'POST' }); toast('Screened again'); applicant(id); } catch (e) { toast(e.message); } });
  $('#sn').onclick = ev => busy(ev.target, async () => { try { await X.api('applicants/' + id, { method: 'PUT', body: { notes: $('#nt').value } }); toast('Notes saved'); } catch (e) { toast(e.message); } });
  const rej = $('#rej');
  if (rej) rej.onclick = () => busy(rej, async () => { if (!confirm(`Mark ${a.name} as not selected? A polite email is sent to them.`)) return; try { await X.api(`applicants/${id}/reject`, { method: 'POST', body: {} }); toast('Updated and emailed'); applicant(id); } catch (e) { toast(e.message); } });
  $$('[data-v]', X.v).forEach(b => b.onclick = async () => {
    const v = b.dataset.v;
    if (v === 'interview') pane.innerHTML = `<form class="hform soft" id="pf"><div class="grid3">${field('Date', 'date', iv.date || addD(today(), 2), { type: 'date' })}${field('Time', 'time', iv.time || '11:00', { type: 'time' })}<label class="field"><span class="lab">Type</span><select name="mode">${['In person', 'Online', 'Phone'].map(m => opt(m, m, iv.mode)).join('')}</select></label></div>
      <div class="grid2">${field('Where / meeting link', 'where', iv.where, { ph: 'Office address or Google Meet link' })}${field('Interviewer', 'with', iv.with)}</div>${area('Message to the candidate (optional)', 'message', '')}
      <div class="row-end">${errLine('pErr')}<button class="btn primary">Schedule and email the candidate</button></div><p class="muted small">They get a reminder the day before.</p></form>`;
    if (v === 'edit') pane.innerHTML = `<form class="hform soft" id="pf"><h4>Candidate details</h4><div class="grid3">${field('Name', 'name', a.name)}${field('Email', 'email', a.email, { type: 'email' })}${field('Phone', 'phone', a.phone)}</div>${field('Current role', 'current_role', a.current_role)}<div class="row-end">${errLine('pErr')}<button class="btn primary">Save details</button></div></form>`;
    if (v === 'hire') {
      const emps = (await X.api('employees')).employees;
      pane.innerHTML = `<form class="hform soft" id="pf"><h4>Hire ${esc(a.name)}</h4><p class="muted small">They become an employee with a profile and onboarding tasks. The appointment letter is emailed with a link to set up the employee app.</p>
        <div class="grid3">${field('Designation', 'designation', of.designation || j.title, { attrs: 'required' })}<label class="field"><span class="lab">Department</span><select name="dept">${X.S.departments.map(d => opt(d, d, of.dept || j.dept)).join('')}<option value="">Other</option></select></label>${field('Joining date', 'join_date', of.join_date || addD(today(), 14), { type: 'date', attrs: 'required' })}</div>
        <div class="grid3">${field(`Basic salary (${X.S.currency})`, 'basic', of.basic || '', { type: 'number', attrs: 'min="0" required' })}<label class="field"><span class="lab">Reports to</span><select name="manager_id">${empOpts(emps, '', 'No manager')}</select></label>
          <label class="field"><span class="lab">Type</span><select name="emp_type">${[['full-time', 'Full-time'], ['part-time', 'Part-time'], ['contract', 'Contract'], ['intern', 'Intern']].map(([k, l]) => opt(k, l, 'full-time')).join('')}</select></label></div>
        <div class="grid2">${field('Email', 'email', a.email, { type: 'email', hint: 'the employee signs in to the app with this' })}${field('Phone', 'phone', a.phone)}</div>
        <label class="check"><input type="checkbox" name="send_letter" checked> Email the appointment letter and the app setup link</label>
        <div class="row-end">${errLine('pErr')}<button class="btn primary">Hire and send the letter</button></div></form>`;
    }
    if (v === 'feedback') pane.innerHTML = `<form class="hform soft" id="pf"><label class="field"><span class="lab">Rating</span><select name="rating">${[5, 4, 3, 2, 1].map(n => opt(n, '★'.repeat(n) + ' ' + n, iv.rating || 3)).join('')}</select></label>${area('Feedback', 'text', iv.feedback || '')}<div class="row-end">${errLine('pErr')}<button class="btn primary">Save feedback</button></div></form>`;
    if (v === 'offer') pane.innerHTML = `<form class="hform soft" id="pf"><div class="grid3">${field('Designation', 'designation', of.designation || j.title)}${field('Joining date', 'join_date', of.join_date || addD(today(), 14), { type: 'date' })}${field(`Basic salary (${X.S.currency})`, 'basic', of.basic || '', { type: 'number', attrs: 'min="0" required' })}</div>
      <div class="grid3">${field('Answer by (optional)', 'expires', '', { type: 'date' })}</div>${area('Offer letter (from your template; edit if needed)', 'letter', r.offer_letter, { cls: 'tall' })}
      <div class="row-end">${errLine('pErr')}<button class="btn primary">Send offer by email</button></div><p class="muted small">The candidate accepts or declines online. You get an email.</p></form>`;
    $('#pf').onsubmit = async ev => {
      ev.preventDefault(); const body = Object.fromEntries(new FormData(ev.target));
      if (v === 'offer') body.letter = body.letter.replace('{join_date}', body.join_date).replace(/\{salary\}|[A-Z]{3} 0\b/, X.S.currency + ' ' + body.basic);
      await busy($('#pf button.primary'), async () => {
        try {
          if (v === 'hire') {
            body.send_letter = !!body.send_letter;
            const x = await X.api(`applicants/${id}/hire`, { method: 'POST', body });
            toast(x.letter ? (x.letter.emailed ? 'Hired. Appointment letter emailed.' : 'Hired. The letter is saved; email could not be sent.') : 'Hired');
            return go('employees/' + x.employee.id + '/letter-appointment');
          }
          if (v === 'edit') { await X.api('applicants/' + id, { method: 'PUT', body }); toast('Saved'); return applicant(id); }
          if (v === 'feedback') await X.api('applicants/' + id, { method: 'PUT', body: { feedback: body } });
          else await X.api(`applicants/${id}/${v}`, { method: 'POST', body });
          toast(v === 'feedback' ? 'Feedback saved' : 'Sent to the candidate'); applicant(id);
        } catch (e) { fail('pErr', e); }
      });
    };
  });
}

// ================================================================ payroll
async function payroll(p) {
  if (p[0] === 'slip') return payslipView(p[1]);
  if (p[0]) return runView(p[0]);
  const r = await X.api('payroll');
  const S = X.S;
  X.v.innerHTML = `${head('Payroll', `Salary = structure in each profile + attendance + one-off bonuses or deductions. Pay day: ${S.payroll.pay_day}${S.payroll.auto_draft ? ' · a draft is prepared automatically 3 days before' : ''}.`)}
    <form class="hdaybar" id="pr"><label>Month <input type="month" name="month" value="${esc(r.this_month)}" aria-label="Month"></label><button class="btn primary">Prepare payroll</button>${errLine('prErr')}</form>
    <section class="hcard flush">${r.runs.length ? `<table class="t"><thead><tr><th>Month</th><th>People</th><th class="n">Gross</th><th class="n">Deductions</th><th class="n">Net pay</th><th>Status</th></tr></thead><tbody>
      ${r.runs.map(x => `<tr class="link" data-href="${X.base}/payroll/${x.id}"><td><b>${esc(monthName(x.month))}</b></td><td>${x.totals.people || 0}</td><td class="n">${cur(x.totals.gross || 0)}</td><td class="n">${cur(x.totals.deductions || 0)}</td><td class="n"><b>${cur(x.totals.net || 0)}</b></td><td>${pill(...RUN[x.status])}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="padding:22px">No payroll yet. Choose a month and click Prepare payroll.</p>'}</section>`;
  $$('tr[data-href]').forEach(t => t.onclick = () => { location.hash = t.dataset.href; });
  $('#pr').onsubmit = async ev => { ev.preventDefault(); await busy($('#pr button'), async () => { try { const x = await X.api('payroll', { method: 'POST', body: { month: ev.target.elements.month.value } }); go('payroll/' + x.run.id); } catch (e) { fail('prErr', e); } }); };
}
async function runView(id) {
  const r = await X.api('payroll/' + id), x = r.run, t = x.totals, draft = x.status === 'draft';
  X.v.innerHTML = `<a class="muted small" href="${X.base}/payroll">← Payroll</a>
    ${head('Payroll · ' + esc(monthName(x.month)), pill(...RUN[x.status]).replace(/^/, '') + (x.approved_at ? ` approved ${fmtDate(x.approved_at)}` : '') + (x.paid_at ? ` · paid ${fmtDate(x.paid_at)}` : ''),
      `${draft ? '<button class="btn" id="rf">Refresh from attendance</button><button class="btn ghost danger" id="del">Delete draft</button><button class="btn primary" id="ap">Approve payroll</button>' : ''}
       ${x.status === 'approved' ? '<button class="btn primary" id="pd">Mark as paid</button>' : ''}<button class="btn" id="rep">${x.reported_at ? 'Send report again' : 'Send report'}</button><a class="btn" href="${X.raw}payroll/${x.id}/bank.csv">Salary sheet (CSV)</a>`)}
    <p class="muted small" style="margin:-6px 0 14px">${X.S.payroll_recipients.length ? `The report goes to: ${X.S.payroll_recipients.map(esc).join(', ')}` : `Choose who gets the payroll report in <a href="${X.base}/settings">Settings → Payroll</a>`}${x.reported_at ? ` · last sent ${fmtDateTime(x.reported_at)}` : ''}. Employees get their payslip only when you send it.</p>
    <div class="hkpis">${[['People', t.people], ['Gross', cur(t.gross)], ['Deductions', cur(t.deductions)], ['Net pay', cur(t.net)]].map(([l, v]) => `<div class="hk"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
    <section class="hcard flush"><div class="scroll"><table class="t"><thead><tr><th>Employee</th><th>Paid days</th><th class="n">Gross</th><th class="n">Deductions</th><th class="n">Net pay</th><th></th></tr></thead><tbody>
      ${r.slips.map(s => { const d = s.data.days || {}; return `<tr><td><b>${esc(s.name)}</b><div class="muted small">${esc(s.code)} · ${esc(s.dept || '')}</div></td>
        <td>${Math.round((d.workdays - d.unpaid_days) * 10) / 10} / ${d.workdays}${d.unpaid_days ? `<div class="muted small">${d.unpaid_days} unpaid: ${[d.absent && d.absent + ' absent', d.half && d.half + ' half day', d.late_deduct_days && d.late + ' late', d.unpaid_leave && d.unpaid_leave + ' unpaid leave', (d.workdays - d.employed_workdays) && (d.workdays - d.employed_workdays) + ' not employed'].filter(Boolean).join(', ')}</div>` : ''}</td>
        <td class="n">${cur(s.gross)}</td><td class="n">${cur(s.deductions)}</td><td class="n"><b>${cur(s.net)}</b></td>
        <td class="n nowrap"><a class="btn small" href="${X.base}/payroll/slip/${s.id}">Payslip</a>${draft ? ` <button class="btn small" data-adj="${s.employee_id}">Bonus / deduction</button>` : ` <button class="btn small ${s.requested_at ? 'primary' : ''}" data-send="${s.id}" title="${s.requested_at ? 'Asked for it' : ''}">${s.released ? 'Send again' : s.requested_at ? 'Asked: send payslip' : 'Send payslip'}</button>`}</td></tr>
        ${draft ? `<tr class="adjrow" id="adj${s.employee_id}" hidden><td colspan="6"></td></tr>` : ''}`; }).join('') || '<tr><td colspan="6" class="muted">No employees in this month.</td></tr>'}
    </tbody></table></div></section>`;
  const b = (id2, fn) => { const el = $('#' + id2); if (el) el.onclick = () => busy(el, fn); };
  b('rf', async () => { try { await X.api(`payroll/${id}/refresh`, { method: 'POST' }); toast('Updated from the latest attendance and leave'); runView(id); } catch (e) { toast(e.message); } });
  b('del', async () => { if (!confirm('Delete this draft?')) return; try { await X.api('payroll/' + id, { method: 'DELETE' }); go('payroll'); } catch (e) { toast(e.message); } });
  b('ap', async () => { if (!confirm(`Approve payroll for ${monthName(x.month)}? It can no longer be changed. Nothing is emailed to employees.`)) return; try { await X.api(`payroll/${id}/approve`, { method: 'POST' }); toast('Approved and saved'); runView(id); } catch (e) { toast(e.message); } });
  b('rep', async () => { try { const y = await X.api(`payroll/${id}/report`, { method: 'POST' }); toast(`Report ${y.held ? 'saved in the Outbox (test mode)' : 'sent'} to ${y.to.length} ${y.to.length === 1 ? 'person' : 'people'}`); runView(id); } catch (e) { toast(e.message); } });
  $$('[data-send]').forEach(btn => btn.onclick = () => busy(btn, async () => { try { const y = await X.api(`payslips/${btn.dataset.send}/send`, { method: 'POST' }); toast(y.held ? 'Payslip saved in the Outbox (test mode); the employee can now see it in the app' : 'Payslip sent'); runView(id); } catch (e) { toast(e.message); } }));
  b('pd', async () => { try { await X.api(`payroll/${id}/paid`, { method: 'POST' }); toast('Marked as paid'); runView(id); } catch (e) { toast(e.message); } });
  $$('[data-adj]').forEach(btn => btn.onclick = () => {
    const eid = btn.dataset.adj, row = $('#adj' + eid), s = r.slips.find(z => String(z.employee_id) === eid);
    row.hidden = !row.hidden; if (row.hidden) return;
    const line = (x2 = {}) => `<div class="grid3 arow">${field('Name', 'an', x2.name, { ph: 'Sales bonus / Advance' })}<label class="field"><span class="lab">Type</span><select name="ak">${opt('earning', 'Add to pay', x2.kind)}${opt('deduction', 'Deduct', x2.kind)}</select></label>${field('Amount', 'aa', x2.amount, { type: 'number', attrs: 'min="0" step="any"' })}</div>`;
    row.firstElementChild.innerHTML = `<form class="hform soft"><div class="alist">${(s.adjust.length ? s.adjust : [{}]).map(line).join('')}</div><div class="row-end"><button type="button" class="btn small ghost" data-more>+ Another</button><button class="btn small primary">Save</button></div></form>`;
    const f = $('form', row.firstElementChild);
    $('[data-more]', f).onclick = () => $('.alist', f).insertAdjacentHTML('beforeend', line());
    f.onsubmit = async ev => { ev.preventDefault(); const adjust = $$('.arow', f).map(z => ({ name: $('[name=an]', z).value, kind: $('[name=ak]', z).value, amount: Number($('[name=aa]', z).value) || 0 })).filter(z => z.name && z.amount);
      try { await X.api(`payroll/${id}/slips/${eid}`, { method: 'PUT', body: { adjust } }); toast('Saved'); runView(id); } catch (e) { toast(e.message); } };
  });
}
async function payslipView(pid) {
  const r = await X.api('payslips/' + pid);
  X.v.innerHTML = `<div class="noprint hhead"><a class="muted small" href="javascript:history.back()">← Back</a><button class="btn primary" onclick="window.print()">Print or save PDF</button></div>` + window.HRPayslip(r.payslip, r.company);
}
window.HRPayslip = (p, co) => {
  const d = p.data, e = d.employee || {}, c = x => money(x, d.currency), days = d.days || {};
  return `<article class="invdoc slip"><header class="ih"><div><h2>${esc(co.name)}</h2><p class="muted">${esc(co.address || '')}</p></div><div class="ir"><h1>Payslip</h1><p><b>${esc(new Date(p.month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</b></p></div></header>
    <div class="iparties"><div><span class="lab">Employee</span><b>${esc(e.name)}</b><p>${esc(e.code)} · ${esc(e.designation || '')}<br>${esc(e.dept || '')}</p></div>
      <div><span class="lab">Attendance</span><p>Work days ${days.workdays} · present ${days.present}<br>Leave ${(days.paid_leave || 0) + (days.unpaid_leave || 0)} · absent ${days.absent} · late ${days.late}<br>Unpaid days ${days.unpaid_days}</p></div>
      <div><span class="lab">Paid to</span><p>${esc([e.bank && e.bank.method, e.bank && e.bank.bank, e.bank && (e.bank.account_no || e.bank.mobile)].filter(Boolean).join(' · ') || '-')}</p></div></div>
    <div class="slipcols"><table class="t"><thead><tr><th>Earnings</th><th class="n">Amount</th></tr></thead><tbody>${d.earnings.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${c(x.amount)}</td></tr>`).join('')}<tr class="tot"><td>Gross</td><td class="n">${c(d.gross)}</td></tr></tbody></table>
      <table class="t"><thead><tr><th>Deductions</th><th class="n">Amount</th></tr></thead><tbody>${d.deductions.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${c(x.amount)}</td></tr>`).join('') || '<tr><td class="muted">None</td><td></td></tr>'}<tr class="tot"><td>Total</td><td class="n">${c(d.deductions_total)}</td></tr></tbody></table></div>
    <div class="itotal"><span>Net pay</span><b>${c(d.net)}</b></div><footer class="ifoot">This is a computer-generated payslip from ${esc(co.name)}.</footer></article>`;
};

// ================================================================ policies + notices
async function policies(p) {
  const [r, n] = await Promise.all([X.api('policies'), X.api('notices')]);
  const edit = p[0] === 'edit' ? r.policies.find(x => String(x.id) === p[1]) : p[0] === 'new' ? {} : null;
  if (edit) {
    X.v.innerHTML = `<a class="muted small" href="${X.base}/policies">← Policies</a>${head(edit.id ? 'Edit policy' : 'New policy', 'Employees read it in their portal, and the AI HR assistant answers questions from it.')}
      <form id="pf" class="hform"><div class="stack">${field('Title', 'title', edit.title, { attrs: 'required', ph: 'Leave policy' })}${area('Policy text', 'body', edit.body, { cls: 'tall', ph: 'Write it in short paragraphs. Leave a blank line between topics.' })}
        <label class="check"><input type="checkbox" name="needs_ack" ${edit.needs_ack === 0 ? '' : 'checked'}> Employees must read and accept it</label>
        ${edit.id ? '<label class="check"><input type="checkbox" name="reack" checked> If the text changed, ask everyone to accept again</label>' : ''}</div>
        <div class="savebar">${errLine('pErr')}${edit.id ? '<button type="button" class="btn ghost danger" id="pdel">Delete</button>' : ''}<button class="btn primary">${edit.id ? 'Save policy' : 'Publish policy'}</button></div></form>`;
    $('#pf').onsubmit = async ev => { ev.preventDefault(); const f = ev.target, body = { title: f.elements.title.value, body: f.elements.body.value, needs_ack: f.elements.needs_ack.checked, reack: f.elements.reack ? f.elements.reack.checked : true };
      await busy($('#pf button.primary'), async () => { try { await X.api(edit.id ? 'policies/' + edit.id : 'policies', { method: edit.id ? 'PUT' : 'POST', body }); toast('Published'); go('policies'); } catch (e) { fail('pErr', e); } }); };
    const del = $('#pdel'); if (del) del.onclick = async () => { if (!confirm('Delete this policy?')) return; await X.api('policies/' + edit.id, { method: 'DELETE' }); go('policies'); };
    return;
  }
  X.v.innerHTML = `${head('Policies & notices', '', `<a class="btn primary" href="${X.base}/policies/new">New policy</a>`)}
    <div class="hgrid"><section class="hcard"><h3>Company policies</h3>
      ${r.policies.length ? `<ul class="hlist">${r.policies.map(x => `<li><div><b>${esc(x.title)}</b><small>Updated ${fmtDate(x.updated_at)} · version ${x.version}</small></div>
        ${x.needs_ack ? `<div class="ackbar" title="${x.acked} of ${r.employees} accepted"><i><span style="width:${r.employees ? Math.round(x.acked / r.employees * 100) : 0}%"></span></i><small>${x.acked}/${r.employees} accepted</small></div>` : '<small class="muted">for reading</small>'}
        <a class="btn small" href="${X.base}/policies/edit/${x.id}">Edit</a></li>`).join('')}</ul>` : `<p class="muted">No policies yet. Start with: leave policy, office hours and attendance, code of conduct, salary and benefits.</p>`}</section>
    <section class="hcard"><h3>Post a notice</h3><form id="nf" class="hform">${field('Title', 'title', '', { attrs: 'required', ph: 'Office closed on Friday' })}${area('Message', 'body', '')}
      <label class="check"><input type="checkbox" name="email" checked> Also email every employee</label><div class="row-end">${errLine('nErr')}<button class="btn primary">Post notice</button></div></form>
      <ul class="hnotes">${n.notices.map(x => `<li><b>${esc(x.title)}</b><p>${esc(x.body)}</p><small>${fmtDateTime(x.created_at)} · <button class="linkbtn" data-nd="${x.id}">Remove</button></small></li>`).join('')}</ul></section></div>`;
  $('#nf').onsubmit = async ev => { ev.preventDefault(); const f = ev.target; await busy($('#nf button'), async () => { try { const x = await X.api('notices', { method: 'POST', body: { title: f.elements.title.value, body: f.elements.body.value, email: f.elements.email.checked } }); toast(`Posted${x.emailed ? `, emailed to ${x.emailed}` : ''}`); policies([]); } catch (e) { fail('nErr', e); } }); };
  $$('[data-nd]').forEach(b => b.onclick = async () => { await X.api('notices/' + b.dataset.nd, { method: 'DELETE' }); policies([]); });
}

// ================================================================ reports
async function reports() {
  const r = await X.api('reports' + teamQ());
  const hb = (rows, label = x => x.k, val = x => x.n, fmt = v => v) => { const max = Math.max(1, ...rows.map(val)); return rows.length ? `<div class="hbars">${rows.map(x => `<div class="hb"><span>${esc(label(x))}</span><div><i style="width:${Math.round(val(x) / max * 100)}%"></i></div><b>${fmt(val(x))}</b></div>`).join('')}</div>` : '<p class="muted">No data yet.</p>'; };
  const last = r.payroll[r.payroll.length - 1];
  const maxF = Math.max(1, ...r.flow.map(f => Math.max(f.joined, f.left)));
  X.v.innerHTML = `${head(X.team ? `${esc(X.team)} team report` : 'Reports', 'Live numbers from your HR data.', `<a class="btn" href="${X.raw}reports.csv${teamQ()}">Download attendance (CSV)</a>`)}
    ${teamBar('the report')}
    <div class="hkpis">${[['Headcount', r.headcount], ['Attrition (12 months)', r.attrition + '%'], [`Attendance ${monthName(r.attendance.month).split(' ')[0]}`, r.attendance.rate == null ? '-' : r.attendance.rate + '%'], ['Last payroll', last ? cur(last.net || 0) : '-']].map(([l, v]) => `<div class="hk"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
    <div class="hgrid">
      <section class="hcard"><h3>People by department</h3>${hb(r.by_dept)}</section>
      <section class="hcard"><h3>Joiners and leavers, last 12 months</h3><div class="flow">${r.flow.map(f => `<div class="fm" title="${f.month}: ${f.joined} joined, ${f.left} left"><div class="fb"><i class="j" style="height:${f.joined / maxF * 100}%"></i><i class="l" style="height:${f.left / maxF * 100}%"></i></div><span>${new Date(f.month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span></div>`).join('')}</div>
        <p class="legend"><span class="j"></span>Joined <span class="l"></span>Left</p></section>
      <section class="hcard"><h3>Payroll cost (net)</h3>${hb(r.payroll, x => monthName(x.month), x => x.net || 0, v => cur(v))}</section>
      <section class="hcard"><h3>Leave taken this year (days)</h3>${hb(r.leave, x => x.name, x => x.days)}</section>
      <section class="hcard"><h3>Attendance this month</h3>${hb([{ k: 'Present days', n: r.attendance.present || 0 }, { k: 'Late', n: r.attendance.late || 0 }, { k: 'Absent', n: r.attendance.absent || 0 }, { k: 'Paid leave', n: r.attendance.paid_leave || 0 }, { k: 'Unpaid leave', n: r.attendance.unpaid_leave || 0 }])}</section>
      <section class="hcard"><h3>Recruitment</h3>${hb(['new', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'].map(s => ({ k: STG[s], n: (r.funnel.find(f => f.stage === s) || {}).n || 0 })))}</section>
      <section class="hcard"><h3>Employment type</h3>${hb(r.by_type)}</section>
    </div>
    ${r.people ? `<section class="hcard flush" style="margin-top:16px"><div class="scroll"><table class="t"><thead><tr><th>${esc(X.team)} team, ${esc(monthName(r.attendance.month))}</th><th class="n">Work days</th><th class="n">Present</th><th class="n">Late</th><th class="n">Absent</th><th class="n">Leave</th></tr></thead><tbody>
      ${r.people.map(x => `<tr class="link" data-href="${X.base}/employees/${x.id}"><td><b>${esc(x.name)}</b><div class="muted small">${esc(x.designation || '')}</div></td><td class="n">${x.employed_workdays}</td><td class="n">${x.present}</td><td class="n">${x.late}</td><td class="n">${x.absent}</td><td class="n">${x.paid_leave + x.unpaid_leave}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No one in this team.</td></tr>'}</tbody></table></div></section>` : ''}`;
  bindTeam(reports);
  $$('tr[data-href]', X.v).forEach(t => t.onclick = () => { location.hash = t.dataset.href; });
}

// ================================================================ teams
async function teams() {
  const [r, em] = await Promise.all([X.api('teams'), X.api('employees')]);
  const people = em.employees.filter(e => e.status !== 'exited'), rosterType = X.S.leave_types.some(t => t.kind === 'roster');
  X.v.innerHTML = `${head('Teams', 'Each team can have up to 3 leads. Leads see the team in the app and approve its leave. Put people in a team from their profile (Department).', '<button class="btn primary" id="addt">Add a team</button>')}
    <div class="hteams">${r.teams.map(t => `<section class="hcard hteam">
      <div class="tt"><h3>${esc(t.name)}</h3><span class="muted small">${t.members} ${t.members === 1 ? 'person' : 'people'}</span></div>
      <div class="field"><span class="lab">Team leads (up to 3)</span><div class="leadchips">${t.leads.map(l => `<span class="chip on">${esc(l.name)}<button type="button" class="cx" data-unlead="${esc(t.name)}" data-id="${l.id}" aria-label="Remove ${esc(l.name)}">×</button></span>`).join('') || '<span class="muted small">No lead yet</span>'}</div>
        ${t.leads.length < 3 ? `<select data-lead="${esc(t.name)}" aria-label="Add a team lead"><option value="">+ Add a lead…</option>${people.filter(e => !t.leads.some(l => l.id === e.id)).sort((x, y) => (y.dept === t.name) - (x.dept === t.name)).map(e => opt(e.id, `${e.name}${e.dept !== t.name ? ' (' + (e.dept || 'no team') + ')' : ''}`)).join('')}</select>` : ''}</div>
      ${rosterType ? `<label class="check"><input type="checkbox" data-roster="${esc(t.name)}" ${t.roster ? 'checked' : ''} ${X.S.roster.on ? '' : 'disabled'}> Roster leave for this team${X.S.roster.on ? '' : ' (turn the rule on in Settings)'}</label>` : ''}
      <div class="tstats"><div><b>${t.today.checked_in}</b><span>in today</span></div><div class="${t.today.late ? 'warn' : ''}"><b>${t.today.late}</b><span>late</span></div><div class="${t.today.absent ? 'bad' : ''}"><b>${t.today.absent}</b><span>absent</span></div><div><b>${t.today.on_leave}</b><span>on leave</span></div></div>
      <ul class="tlist"><li><span>Attendance this month</span><b>${t.month.rate == null ? '-' : t.month.rate + '%'}</b></li><li><span>Late days this month</span><b>${t.month.late || 0}</b></li><li><span>Leave waiting</span><b>${t.pending_leave}</b></li><li><span>Open jobs</span><b>${t.open_jobs}</b></li>${r.payroll_month ? `<li><span>Net pay, ${esc(monthName(r.payroll_month))}</span><b>${cur(t.payroll_net)}</b></li>` : ''}</ul>
      <div class="row"><button class="btn small" data-rep="${esc(t.name)}">Team report</button><button class="btn small ghost" data-att="${esc(t.name)}">Attendance</button><button class="btn small ghost" data-lv="${esc(t.name)}">Leave</button></div></section>`).join('') || '<div class="empty">No teams yet. Add your first team, for example Sales, Marketing or Admin.</div>'}</div>`;
  $('#addt').onclick = async () => {
    const n = (prompt('Team name (for example Marketing):', '') || '').trim(); if (!n) return;
    if (X.S.departments.includes(n)) return toast('That team already exists.');
    try { X.S = (await X.api('settings', { method: 'PUT', body: { departments: [...X.S.departments, n] } })).settings; toast('Team added'); teams(); } catch (e) { toast(e.message); }
  };
  const saveLeads = async (team, ids, msg) => { try { X.S = (await X.api('settings', { method: 'PUT', body: { team_leads: { [team]: ids } } })).settings; toast(msg); teams(); } catch (e) { toast(e.message); } };
  $$('[data-lead]', X.v).forEach(sel => sel.onchange = () => { if (!sel.value) return; saveLeads(sel.dataset.lead, [...(X.S.team_leads[sel.dataset.lead] || []), Number(sel.value)], 'Team lead added'); });
  $$('[data-unlead]', X.v).forEach(b => b.onclick = () => saveLeads(b.dataset.unlead, (X.S.team_leads[b.dataset.unlead] || []).filter(x => x !== Number(b.dataset.id)), 'Team lead removed'));
  $$('[data-roster]', X.v).forEach(c => c.onchange = async () => {
    const all0 = r.teams.map(t => t.name), cur0 = X.S.roster.teams.length ? X.S.roster.teams : all0;
    const next = c.checked ? [...new Set([...cur0, c.dataset.roster])] : cur0.filter(x => x !== c.dataset.roster);
    try { X.S = (await X.api('settings', { method: 'PUT', body: { roster: { teams: next.length === all0.length ? [] : next.length ? next : ['(none)'] } } })).settings; toast(c.checked ? 'Roster leave on for ' + c.dataset.roster : 'Roster leave off for ' + c.dataset.roster); } catch (e) { toast(e.message); }
  });
  const pick = (t, h) => { X.team = t; try { sessionStorage.setItem(TEAMKEY, t); } catch (e) {} go(h); };
  $$('[data-rep]', X.v).forEach(b => b.onclick = () => pick(b.dataset.rep, 'reports'));
  $$('[data-att]', X.v).forEach(b => b.onclick = () => pick(b.dataset.att, 'attendance'));
  $$('[data-lv]', X.v).forEach(b => b.onclick = () => pick(b.dataset.lv, 'leave/'));
}

// ================================================================ settings
async function settings(p = []) {
  if (p[0] === 'outbox') return outbox(p[1]);
  const r = await X.api('settings'), S = r.settings;
  const rowsEd = (id, items, cols, blank) => `<div class="led" id="${id}" data-cols='${JSON.stringify(cols)}'>${items.map(it => ledRow(cols, it)).join('')}</div><button type="button" class="btn small" data-addrow="${id}" data-blank='${JSON.stringify(blank)}'>+ Add</button>`;
  X.v.innerHTML = `${head('HR settings', 'These rules drive attendance, leave, payroll and every automatic email.')}
    ${r.mail_mode === 'test' ? `<div class="note warn">Test mode: emails are not sent. Read them, and open their links, in the <a href="${X.base}/settings/outbox">Outbox</a>.</div>` : ''}
    <div class="hcopy"><span>Your employee app</span><code>${esc(r.team_url)}</code><button class="btn small" data-copy="${esc(r.team_url)}">Copy</button><span>Careers page</span><code>${esc(r.careers_url)}</code><button class="btn small" data-copy="${esc(r.careers_url)}">Copy</button></div>
    <form id="sf" class="hform">
      <section class="section"><header><h2>Work week</h2><p>Unmarked work days count as present.</p></header><div class="stack">
        <div class="field"><span class="lab">Work days</span><div class="wdays">${WD.map((d, i) => `<label class="check"><input type="checkbox" name="wd" value="${i}" ${S.work_days.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
        <div class="grid3">${field('Office starts', 'office_start', S.office_start, { type: 'time' })}${field('Office ends', 'office_end', S.office_end, { type: 'time' })}${field('Late after (minutes)', 'late_after_min', S.late_after_min, { type: 'number' })}</div>
        <div class="grid3">${field('Time zone', 'timezone', S.timezone, { hint: 'e.g. Asia/Dhaka, Europe/London' })}${field('Currency', 'currency', S.currency, { hint: 'BDT, USD, GBP…' })}</div>
        ${area('Teams / departments (one per line)', 'departments', S.departments.join('\n'), { hint: 'set team leads on the Teams page' })}</div></section>
      <section class="section" id="brand"><header><h2>Branding</h2><p>Your employees see your name, logo and colour in the app, on the careers page and in emails. Nothing else.</p></header><div class="stack">
        <div class="grid3">${field('App name', 'b_name', S.brand.app_name, { ph: r.company, hint: 'shown on the phone home screen' })}<label class="field"><span class="lab">Brand colour</span><input type="color" name="b_color" value="${esc(S.brand.color || '#5b2be0')}"></label>
          <label class="field"><span class="lab">Logo (square PNG, under 200 KB)</span><input type="file" name="b_logo" accept="image/png,image/jpeg,image/webp"></label></div>
        <div class="brandprev" id="bprev"><span class="bp-logo">${r.logo_url ? `<img src="${esc(r.logo_url)}" alt="">` : ''}</span><b>${esc(S.brand.app_name || r.company)}</b><span class="bp-btn">Check in at office</span>${r.logo_url ? '<button type="button" class="btn small ghost" id="blrm">Remove logo</button>' : ''}</div></div></section>
      <section class="section" id="testing"><header><h2>Try it with demo data</h2><p>Adds 8 demo employees in 4 teams with leads, this month’s attendance, today’s check-ins, leave and a job with applicants. Remove it all with one click before you go live.</p></header><div class="stack">
        ${r.demo.on ? `<p>Demo data is on. Each demo employee signs in at <a href="${esc(r.team_url)}" target="_blank" rel="noopener">${esc(r.team_url)}</a> with password <code>${esc(r.demo.password)}</code>:</p>
          <ul class="hlist two">${r.demo.employees.map(x => `<li><div><b>${esc(x.name)}</b><small>${esc(x.designation)} · ${esc(x.dept)}</small></div><code>${esc(x.email)}</code></li>`).join('')}</ul>
          <div><button type="button" class="btn danger" id="demoRm">Remove demo data</button></div>` : '<div><button type="button" class="btn" id="demoAdd">Add demo data</button></div>'}
        <p class="muted small"><a href="${X.base}/settings/outbox">Open the Outbox</a> to see every email the system wrote for your company.</p></div></section>
      <section class="section" id="attapp"><header><h2>Attendance app</h2><p>Employees check in from their phone. Office check-in only works inside the office; field and branch visits work anywhere with a note and location.</p></header><div class="stack">
        <label class="field"><span class="lab">How is attendance recorded?</span><select name="ci_mode">${opt('manual', 'HR marks it on this dashboard (unmarked = present)', S.checkin.mode)}${opt('app', 'Employees check in on the app (no check-in = absent)', S.checkin.mode)}</select></label>
        <div id="ciopts" class="stack">
          <label class="check"><input type="checkbox" name="ci_loc" ${S.checkin.require_location ? 'checked' : ''}> Check the phone’s location: must be inside an office</label>
          <div id="offw">${rowsEd('offices', S.checkin.offices, [['name', 'Office or branch name', 'text'], ['lat', 'Latitude', 'coord'], ['lng', 'Longitude', 'coord'], ['radius', 'Allowed distance (metres)', 'number']], { name: '', lat: '', lng: '', radius: 150 })}
            <button type="button" class="btn small" id="here">📍 Use my current location</button><p class="muted small">Stand inside the office, click “Use my current location”, then name it. 100–200 m works for most buildings.</p></div>
          <label class="check"><input type="checkbox" name="ci_ip" ${S.checkin.require_ip ? 'checked' : ''}> Check the office internet: must be on the office Wi-Fi</label>
          <div id="ipw">${area('Office internet IP addresses (one per line)', 'ci_ips', S.checkin.ips.join('\n'), { ph: '103.12.34.56' })}
            <button type="button" class="btn small" id="myip" data-ip="${esc(r.my_ip || '')}">Add this network’s IP${r.my_ip ? ` (${esc(r.my_ip)})` : ''}</button><p class="muted small">Open this page from the office Wi-Fi and click the button. If your internet provider changes your IP, add the new one.</p></div>
          <div class="grid2"><label class="check"><input type="checkbox" name="ci_field" ${S.checkin.allow_field ? 'checked' : ''}> Allow “Field visit” check-in (from anywhere, note required)</label>
            <label class="check"><input type="checkbox" name="ci_branch" ${S.checkin.allow_branch ? 'checked' : ''}> Allow “Branch visit” check-in</label></div>
        </div></div></section>
      <section class="section"><header><h2>Holidays</h2><p>Not counted as work days; nobody needs leave for them.</p></header>${rowsEd('hol', S.holidays, [['date', 'Date', 'date'], ['name', 'Holiday', 'text']], { date: '', name: '' })}</section>
      <section class="section" id="leave"><header><h2>Leave types</h2><p>Days per year are deducted as people take leave. 0 = no fixed limit. Unpaid leave is deducted from salary. <b>Alternate</b> and <b>Roster</b> leave are earned, not given.</p></header><div class="stack">
        ${rowsEd('lt', S.leave_types, [['name', 'Name', 'text'], ['kind', 'How it works', 'lkind'], ['days', 'Days / year', 'number'], ['paid', 'Paid', 'bool'], ['carry', 'Carry unused to next year', 'bool']], { name: '', kind: 'normal', days: 0, paid: true, carry: false })}
        <div class="row"><button type="button" class="btn small ghost" id="addAlt">+ Alternate leave</button><button type="button" class="btn small ghost" id="addRos">+ Roster leave</button></div>
        <label class="check"><input type="checkbox" name="prorate" ${S.prorate_first_year ? 'checked' : ''}> In the joining year, give leave only for the months left (otherwise the full year from day one)</label>
        <div class="hcard soft"><h3 class="sub" style="margin-top:0">Roster leave rule</h3>
          <label class="check"><input type="checkbox" name="ro_on" ${S.roster.on ? 'checked' : ''}> On: an employee earns roster leave when they came on time on every work day of a run in the month before</label>
          <div class="grid3">${field('Work days in a row on time', 'ro_streak', S.roster.streak, { type: 'number', attrs: 'min="3" max="31"' })}${field('Days of roster leave earned', 'ro_days', S.roster.days, { type: 'number', attrs: 'min="0.5" max="5" step="0.5"' })}
            <p class="muted small" style="align-self:end">Counts only after probation. Choose the teams on the <a href="${X.base}/teams">Teams</a> page (none chosen = every team).</p></div></div></div></section>
      <section class="section"><header><h2>Payroll</h2><p>Allowances and deductions apply to everyone; % is of basic salary.</p></header><div class="stack">
        <div class="grid3">${field('Pay day (day of month)', 'pay_day', S.payroll.pay_day, { type: 'number', attrs: 'min="1" max="28"', hint: '1–10 pays the previous month' })}
          <label class="check" style="align-self:end"><input type="checkbox" name="auto_draft" ${S.payroll.auto_draft ? 'checked' : ''}> Prepare a draft 3 days before pay day</label>
          <label class="check" style="align-self:end"><input type="checkbox" name="leave_encashment" ${S.payroll.leave_encashment ? 'checked' : ''}> Pay unused annual leave at exit</label></div>
        <div class="grid2">${area('Payroll report goes to (one per line)', 'pay_to', S.payroll_recipients.join('\n'), { ph: 'CEO <ceo@company.com>\ncfo@company.com\naccounts@company.com', hint: 'only these people get the payroll report; employees don’t' })}
          <div class="stack"><label class="check"><input type="checkbox" name="pay_app" ${S.payslips_in_app ? 'checked' : ''}> Employees see their payslip in the app as soon as payroll is approved</label><p class="muted small">Off: an employee asks for a payslip in the app, and HR sends it with one click.</p></div></div>
        <h3 class="sub">Allowances</h3>${rowsEd('comp', S.payroll.components, [['name', 'Name', 'text'], ['type', 'Type', 'sel'], ['value', 'Value', 'number']], { name: '', type: 'percent', value: 0 })}
        <h3 class="sub">Deductions</h3>${rowsEd('ded', S.payroll.deductions, [['name', 'Name', 'text'], ['type', 'Type', 'sel'], ['value', 'Value', 'number']], { name: '', type: 'percent', value: 0 })}
        <div class="grid3"><label class="field"><span class="lab">Income tax</span><select name="tax_type">${opt('none', 'No tax deduction', S.payroll.tax.type)}${opt('percent', 'Flat % of gross', S.payroll.tax.type)}${opt('slabs', 'Yearly slabs', S.payroll.tax.type)}</select></label>
          ${field('Flat tax %', 'tax_value', S.payroll.tax.value, { type: 'number', attrs: 'step="any"' })}</div>
        <div id="slabs">${rowsEd('slab', S.payroll.tax.slabs, [['upto', 'Yearly income up to (0 = and above)', 'number'], ['rate', 'Tax %', 'number']], { upto: 0, rate: 0 })}</div>
        <div class="grid3"><label class="check"><input type="checkbox" name="absent_deduction" ${S.payroll.absent_deduction ? 'checked' : ''}> Deduct absent days from salary</label>
          ${field('Late days that count as one absence', 'late_count', S.payroll.late_count, { type: 'number', hint: '0 = no late deduction' })}${field('…deducting how many days', 'late_days', S.payroll.late_days, { type: 'number', attrs: 'step="0.5"' })}</div></div></section>
      <section class="section"><header><h2>Hiring and leaving</h2></header><div class="stack">
        <div class="grid3">${field('Probation (months)', 'probation_months', S.probation_months, { type: 'number' })}${field('Notice period (days)', 'notice_days', S.notice_days, { type: 'number' })}${field('AI shortlist score', 'ai_shortlist', S.ai_shortlist, { type: 'number', hint: 'applicants at or above move to Shortlisted. 0 = off' })}</div>
        <div class="grid2">${area('Onboarding checklist (one task per line)', 'onboarding', S.onboarding.join('\n'))}${area('Offboarding checklist', 'offboarding', S.offboarding.join('\n'))}</div>
        ${area('Careers page intro', 'careers_intro', S.careers_intro)}</div></section>
      <section class="section"><header><h2>Emails and automation</h2><p>The daily digest goes to the HR email every morning.</p></header><div class="stack">
        <div class="grid2">${field('HR email', 'hr_email', S.hr_email, { type: 'email', hint: 'gets the daily digest, leave requests and replies. Empty = your account email' })}${field('n8n webhook (optional)', 'webhook', S.webhook, { hint: 'every HR event is sent here, e.g. to send WhatsApp messages' })}</div>
        <label class="check"><input type="checkbox" name="notify_candidates" ${S.notify_candidates ? 'checked' : ''}> Email candidates when we receive their CV and when not selected</label>
        <label class="check"><input type="checkbox" name="notify_shortlist" ${S.notify_shortlist ? 'checked' : ''}> Email candidates when the AI shortlists them</label>
        <label class="check"><input type="checkbox" name="auto_regret" ${S.auto_regret ? 'checked' : ''}> Send a polite “not selected” email automatically to weak matches (AI score under 45)</label>
        <label class="check"><input type="checkbox" name="celebrate" ${S.celebrate ? 'checked' : ''}> Send birthday and work-anniversary wishes</label></div></section>
      <section class="section" id="fb"><header><h2>Job posting</h2><p>Connect your Facebook page to post jobs from the dashboard. Create a page access token in Meta for Developers (Graph API Explorer → your page → <code>pages_manage_posts</code>).</p></header><div class="stack">
        <div class="grid2">${field('Facebook page ID', 'fb_page', S.facebook.page_id, { ph: '1234567890' })}${field('Page access token', 'fb_token', S.facebook.token, { type: 'password', hint: S.facebook.token ? 'saved; leave as is to keep it' : '' })}</div></div></section>
      <section class="section" id="recruitauto"><header><h2>Recruitment on autopilot</h2><p>HR only adds the position and job description, then answers three updates by email. Everything else runs by itself.</p></header><div class="stack">
        <label class="check"><input type="checkbox" name="ra_iv" ${S.recruit.auto_interview ? 'checked' : ''}> Book an interview slot for every shortlisted candidate and email the invite</label>
        <div class="grid3"><div class="field"><span class="lab">Interview days</span><div class="wdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => `<label class="check"><input type="checkbox" name="ra_day" value="${i}" ${S.recruit.slot_days.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
          ${field('Interview times (comma separated)', 'ra_times', S.recruit.slot_times.join(', '), { ph: '11:00, 15:00' })}${field('Interview rounds', 'ra_rounds', S.recruit.rounds, { type: 'number', attrs: 'min="1" max="4"' })}</div>
        <div class="grid2"><label class="field"><span class="lab">Interview type</span><select name="ra_mode">${['In person', 'Video call', 'Phone call'].map(m => opt(m, m, S.recruit.mode)).join('')}</select></label>${field('Where / meeting link', 'ra_where', S.recruit.where, { ph: 'Head office, House 12, Road 5, Gulshan' })}</div>
        <label class="check"><input type="checkbox" name="ra_dayend" ${S.recruit.day_end_report ? 'checked' : ''}> At the end of each interview day, email HR one-click buttons: next round / selected / not selected</label>
        <div class="grid2">${area('New joiner checklist (emailed to HR and accounts when someone is hired)', 'ra_mat', S.recruit.materials.join('\n'))}${field('Accounts email', 'ra_acc', S.recruit.accounts_email, { type: 'email', hint: 'gets the checklist too' })}</div></div></section>
      <section class="section" id="hook"><header><h2>Automation key</h2><p>For your n8n workflows: CVs from Gmail or Google Drive, and LinkedIn candidates from Apify, come in through this address.</p></header><div class="stack">
        <div class="hcopy"><span>Address</span><code>${esc(r.hook.url)}</code><button type="button" class="btn small" data-copy="${esc(r.hook.url)}">Copy</button></div>
        <div class="hcopy"><span>Key (header X-HR-Key)</span><code id="hk">${esc(r.hook.key.slice(0, 6))}••••••••</code><button type="button" class="btn small" data-copy="${esc(r.hook.key)}">Copy key</button><button type="button" class="btn small ghost" id="hkNew">Make a new key</button></div></div></section>
      <section class="section"><header><h2>Employee profiles</h2></header><div class="stack">
        <label class="check"><input type="checkbox" name="self_edit" ${S.employee_self_edit ? 'checked' : ''}> Employees can fill in their own profile once (photo, blood group, NID, LinkedIn, bank, emergency contact). After that only HR can change it.</label></div></section>
      <section class="section"><header><h2>Letter templates</h2><p>Placeholders: {name} {designation} {dept} {company} {join_date} {date} {salary} {probation_months} {office_hours} {manager} {code} {last_day}</p></header><div class="stack">
        ${area('Appointment letter (sent when you hire)', 'l_appointment', S.letters.appointment, { cls: 'tall' })}${area('Offer letter', 'l_offer', S.letters.offer, { cls: 'tall' })}${area('Experience letter', 'l_experience', S.letters.experience, { cls: 'tall' })}</div></section>
      <div class="savebar">${errLine('sErr')}<button class="btn primary">Save settings</button></div></form>`;
  bindCopy();
  const f = $('#sf');
  $$('[data-addrow]', f).forEach(b => b.onclick = () => $('#' + b.dataset.addrow).insertAdjacentHTML('beforeend', ledRow(JSON.parse($('#' + b.dataset.addrow).dataset.cols), JSON.parse(b.dataset.blank))));
  f.addEventListener('click', ev => { const x = ev.target.closest('[data-delrow]'); if (x) x.closest('.lrow').remove(); });
  const showSlabs = () => { $('#slabs').hidden = f.elements.tax_type.value !== 'slabs'; f.elements.tax_value.closest('.field').hidden = f.elements.tax_type.value !== 'percent'; };
  f.elements.tax_type.onchange = showSlabs; showSlabs();
  const showCi = () => { $('#ciopts').hidden = f.elements.ci_mode.value !== 'app'; $('#offw').hidden = !f.elements.ci_loc.checked; $('#ipw').hidden = !f.elements.ci_ip.checked; };
  [f.elements.ci_mode, f.elements.ci_loc, f.elements.ci_ip].forEach(x => x.addEventListener('change', showCi)); showCi();
  $('#here').onclick = ev => {
    if (!navigator.geolocation) return toast('This browser cannot share location.');
    const b = ev.target; b.disabled = true; b.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition(pos => {
      b.disabled = false; b.textContent = '📍 Use my current location';
      $('#offices').insertAdjacentHTML('beforeend', ledRow([['name', 'Office or branch name', 'text'], ['lat', 'Latitude', 'coord'], ['lng', 'Longitude', 'coord'], ['radius', 'Allowed distance (metres)', 'number']], { name: '', lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), radius: Math.max(100, Math.min(300, Math.round(pos.coords.accuracy * 2))) }));
      $('#offices .lrow:last-child input').focus(); toast(`Location added (accurate to about ${Math.round(pos.coords.accuracy)} m). Now type the office name.`);
    }, e => { b.disabled = false; b.textContent = '📍 Use my current location'; toast('Location was not shared: ' + e.message); }, { enableHighAccuracy: true, timeout: 20000 });
  };
  $('#myip').onclick = ev => { const ip = ev.target.dataset.ip; if (!ip) return toast('Your IP could not be read.'); const t = f.elements.ci_ips; if (!t.value.split('\n').includes(ip)) t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + ip; };
  const LK = [['name', 'Name', 'text'], ['kind', 'How it works', 'lkind'], ['days', 'Days / year', 'number'], ['paid', 'Paid', 'bool'], ['carry', 'Carry unused to next year', 'bool']];
  $('#addAlt').onclick = () => $('#lt').insertAdjacentHTML('beforeend', ledRow(LK, { name: 'Alternate leave', kind: 'alternate', days: 0, paid: true }));
  $('#addRos').onclick = () => $('#lt').insertAdjacentHTML('beforeend', ledRow(LK, { name: 'Roster leave', kind: 'roster', days: 0, paid: true }));
  $('#hkNew').onclick = ev => busy(ev.target, async () => { if (!confirm('Make a new key? Your n8n workflows must use the new key afterwards.')) return; try { await X.api('settings/hook-key', { method: 'POST' }); toast('New key made'); settings(['hook']); } catch (er) { toast(er.message); } });
  const anchor = { fb: '#fb', attendance: '#attapp', brand: '#brand', testing: '#testing', leave: '#leave', recruit: '#recruitauto', hook: '#hook' }[p[0]];
  if (anchor) setTimeout(() => $(anchor).scrollIntoView({ block: 'start' }), 50);
  f.onsubmit = async ev => {
    ev.preventDefault(); const e = f.elements, v = n => e[n].value, ck = n => e[n].checked;
    const body = { work_days: $$('[name=wd]:checked', f).map(x => +x.value), office_start: v('office_start'), office_end: v('office_end'), late_after_min: v('late_after_min'), timezone: v('timezone'), currency: v('currency'),
      departments: v('departments'), holidays: ledRead('hol'), leave_types: ledRead('lt').map(t => ({ ...t, key: t.key || t.name })),
      payroll: { pay_day: v('pay_day'), auto_draft: ck('auto_draft'), leave_encashment: ck('leave_encashment'), components: ledRead('comp'), deductions: ledRead('ded'),
        tax: { type: v('tax_type'), value: v('tax_value'), slabs: ledRead('slab') }, absent_deduction: ck('absent_deduction'), late_count: v('late_count'), late_days: v('late_days') },
      probation_months: v('probation_months'), notice_days: v('notice_days'), ai_shortlist: v('ai_shortlist'), onboarding: v('onboarding'), offboarding: v('offboarding'), careers_intro: v('careers_intro'),
      prorate_first_year: ck('prorate'), roster: { on: ck('ro_on'), streak: v('ro_streak'), days: v('ro_days') }, payroll_recipients: v('pay_to'), payslips_in_app: ck('pay_app'), employee_self_edit: ck('self_edit'),
      recruit: { auto_interview: ck('ra_iv'), slot_days: $$('[name=ra_day]:checked', f).map(x => +x.value), slot_times: v('ra_times').split(/[,\s]+/).filter(Boolean), rounds: v('ra_rounds'), mode: v('ra_mode'), where: v('ra_where'), day_end_report: ck('ra_dayend'), materials: v('ra_mat'), accounts_email: v('ra_acc') },
      hr_email: v('hr_email'), webhook: v('webhook'), notify_candidates: ck('notify_candidates'), notify_shortlist: ck('notify_shortlist'), auto_regret: ck('auto_regret'), celebrate: ck('celebrate'),
      letters: { offer: v('l_offer'), appointment: v('l_appointment'), experience: v('l_experience') },
      checkin: { mode: v('ci_mode'), require_location: ck('ci_loc'), require_ip: ck('ci_ip'), allow_field: ck('ci_field'), allow_branch: ck('ci_branch'), offices: ledRead('offices'), ips: v('ci_ips') },
      facebook: { page_id: v('fb_page'), token: v('fb_token') }, brand: { app_name: v('b_name'), color: v('b_color') } };
    const lf = e.b_logo.files && e.b_logo.files[0];
    if (lf) { if (lf.size > 200000) return fail('sErr', new Error('The logo is larger than 200 KB.')); body.brand.logo = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(lf); }); }
    await busy($('button.primary', f), async () => { try { X.S = (await X.api('settings', { method: 'PUT', body })).settings; toast('Settings saved'); if (lf) settings(['brand']); } catch (er) { fail('sErr', er); } });
  };
  const prev = () => { const c = f.elements.b_color.value; $('#bprev').style.setProperty('--bc', c); $('#bprev b').textContent = f.elements.b_name.value || r.company; };
  f.elements.b_color.oninput = prev; f.elements.b_name.oninput = prev; prev();
  const rm = $('#blrm'); if (rm) rm.onclick = () => busy(rm, async () => { try { X.S = (await X.api('settings', { method: 'PUT', body: { brand: { logo: '' } } })).settings; toast('Logo removed'); settings(['brand']); } catch (er) { toast(er.message); } });
  const da = $('#demoAdd'); if (da) da.onclick = () => busy(da, async () => { try { await X.api('demo', { method: 'POST' }); X.S = (await X.api('settings')).settings; toast('Demo data added'); settings(['testing']); } catch (er) { toast(er.message); } });
  const dr = $('#demoRm'); if (dr) dr.onclick = () => busy(dr, async () => { if (!confirm('Remove all demo employees, their attendance and leave, and the demo job?')) return; try { const x = await X.api('demo', { method: 'DELETE' }); toast(`Removed ${x.removed} demo employees`); settings(['testing']); } catch (er) { toast(er.message); } });
}
async function outbox(id) {
  const r = await X.api('outbox');
  X.v.innerHTML = `<a class="muted small" href="${X.base}/settings">← Settings</a>${head('Outbox', 'Every email the system wrote for your company: to candidates, employees and you. In test mode they are kept here instead of being sent; open one to read it and click its links.')}
    <section class="hcard flush">${r.emails.length ? `<div class="scroll"><table class="t"><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th><th></th></tr></thead><tbody>${r.emails.map(x => `<tr ${String(x.id) === String(id) ? 'class="on"' : ''}><td class="nowrap">${fmtDateTime(x.created_at)}</td><td>${esc(x.to_addr)}</td><td>${esc(x.subject)}</td>
      <td>${x.status === 'sent' ? pill('Sent', 'good') : x.status === 'held' ? pill('Not sent (test)', 'warn') : pill('Failed', 'bad')}</td><td><a class="btn small" href="${X.base}/settings/outbox/${x.id}">Open</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="padding:22px">No emails yet.</p>'}</section>
    ${id ? `<div class="mailframe"><iframe src="${X.raw}outbox/${encodeURIComponent(id)}" title="Email" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe></div>` : ''}`;
  if (id) setTimeout(() => $('.mailframe').scrollIntoView({ behavior: 'smooth' }), 80);
}
function ledRow(cols, it) {
  return `<div class="lrow" data-key="${esc(it.key || '')}">${cols.map(([k, l, t]) => t === 'bool' ? `<label class="check"><input type="checkbox" data-k="${k}" ${it[k] ? 'checked' : ''}> ${l}</label>`
    : t === 'sel' ? `<label class="field"><span class="lab">${l}</span><select data-k="${k}">${opt('percent', '% of basic', it[k])}${opt('fixed', 'Fixed amount', it[k])}</select></label>`
    : t === 'lkind' ? `<label class="field"><span class="lab">${l}</span><select data-k="${k}">${opt('normal', 'Days per year', it[k])}${opt('alternate', 'Alternate (earned on weekends/holidays worked)', it[k])}${opt('roster', 'Roster (earned by on-time streak)', it[k])}</select></label>`
    : t === 'coord' ? `<label class="field"><span class="lab">${l}</span><input type="text" data-k="${k}" data-coord inputmode="decimal" value="${esc(it[k] ?? '')}"></label>`
    : `<label class="field"><span class="lab">${l}</span><input data-k="${k}" type="${t}" value="${esc(it[k] ?? '')}" ${t === 'number' ? 'step="any" min="0"' : ''}></label>`).join('')}<button type="button" class="icon-x" data-delrow aria-label="Remove">×</button></div>`;
}
function ledRead(id) {
  return $$('#' + id + ' .lrow').map(r => { const o = { key: r.dataset.key || undefined }; $$('[data-k]', r).forEach(i => { o[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? Number(i.value) || 0 : 'coord' in i.dataset ? (i.value.trim() === '' ? '' : Number(i.value)) : i.value; }); return o; })
    .filter(o => Object.entries(o).some(([k, v]) => k !== 'key' && typeof v === 'string' && v.trim()) || o.upto != null);
}
})();
