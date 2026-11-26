/* Employee app (installable on Android/iPhone): check in / out, attendance, leave, payslips, policies, HR assistant, profile, team approvals. */
(() => {
'use strict';
const { $, $$, esc, toast, makeApi, fmtDate, fmtDateTime, money, busy, field, area } = UI;
const app = $('#app');
// each company has its own app link: /team/<company code>
const CODE = (location.pathname.match(/^\/team\/([a-z0-9_-]+)/i) || [])[1] || '';
const api = makeApi('/api/team', () => { state.me = null; if (!/^#\/(login|invite)/.test(location.hash)) location.hash = '#/login'; }, CODE ? { 'X-Team-Code': CODE } : {});
const state = { me: null, install: null, brand: null };
function applyBrand(b) {
  if (!b) return;
  state.brand = b;
  document.title = b.app_name || b.company || 'Employee app';
  const c = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '';
  if (c) { document.body.classList.add('branded'); const r = app.style; r.setProperty('--accent', c); r.setProperty('--accent-soft', `color-mix(in srgb, ${c} 12%, #fff)`); r.setProperty('--grad', `linear-gradient(100deg, ${c}, color-mix(in srgb, ${c} 72%, #fff))`); r.setProperty('--data', c);
    let m = document.querySelector('meta[name=theme-color]'); if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m); } m.content = '#f6f5fb'; }
  const ap = document.querySelector('link[rel=apple-touch-icon]'); if (ap && b.logo) ap.href = b.logo;
}
const brandMark = (big) => { const b = state.brand || {}; return b.logo ? `<img class="tm-logo${big ? ' big' : ''}" src="${esc(b.logo)}" alt="">` : ''; };
const appTitle = () => (state.brand && (state.brand.app_name || state.brand.company)) || 'Employee app';
const D = s => { if (!s) return '-'; const d = new Date(s + 'T00:00:00Z'); return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const DS = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
const DW = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
const pill = (t, tone) => `<span class="pill ${tone || ''}">${esc(t)}</span>`;
const LV = { pending: ['Waiting', 'warn'], approved: ['Approved', 'good'], rejected: ['Declined', 'bad'], cancelled: ['Cancelled', ''] };
const KIND = { office: 'Office', field: 'Field visit', branch: 'Branch visit' };
const today = () => new Date().toLocaleDateString('en-CA');
const addM = (m, k) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1)).toISOString().slice(0, 7);
const monthName = m => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const to12 = t => { if (!/^\d{2}:\d{2}/.test(t || '')) return t || ''; const h = +t.slice(0, 2); return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`; };
const hello = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  attendance: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8 14l2.5 2.5L16 12"/>',
  leave: '<path d="M4 20c4-1 6-5 8-9m0 0c2 4 4 8 8 9M12 11V3m0 0C9 3 6 5 5 8m7-5c3 0 6 2 7 5"/>',
  payslips: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/team-sw.js', { scope: '/team' }).catch(() => {}));
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.install = e; const b = $('#inst'); if (b) b.hidden = false; });
window.addEventListener('hashchange', route);
(async () => {
  if (CODE) { try { applyBrand(await api('/brand/' + CODE, { noAuthRedirect: true })); } catch (e) { app.innerHTML = `<div class="tm-auth"><form><h1>App not available</h1><p class="error">${esc(e.message)}</p></form></div>`; return; } }
  route();
})();

async function route() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'login') return login();
  if (p[0] === 'invite') return invite(p[1]);
  try { state.me = await api('/me'); applyBrand({ code: state.me.company.code, company: state.me.company.name, app_name: state.me.company.app_name, color: state.me.company.color, logo: (state.brand || {}).logo || '' });
    // signed in through the general link: move to the company's own link
    if (!CODE && state.me.company.code) { location.replace(`/team/${state.me.company.code}${location.hash || '#/'}`); return; }
  } catch (e) { if (!e.auth) app.innerHTML = `<div class="tm-auth"><form><h1>${esc(appTitle())}</h1><p class="error">${esc(e.message)}</p><a class="btn" href="#/login">Sign in again</a></form></div>`; return; }
  const page = p[0] || 'home';
  shell(page);
  const main = $('#main');
  try { await ({ home, leave, attendance, payslips, payslip, policies, ask, profile, approvals, more, letter }[page] || home)(main, p.slice(1)); }
  catch (e) { if (!e.auth) main.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  window.scrollTo(0, 0);
}
function login() {
  app.innerHTML = `<div class="tm-auth"><form novalidate>${brandMark(true)}<span class="eyebrow-pill">${esc(appTitle())}</span><h1>Sign in</h1><p class="muted">Use the email your HR team added for you.</p>
    ${field('Work email', 'email', '', { type: 'email', attrs: 'required autocomplete="email" inputmode="email"' })}${field('Password', 'password', '', { type: 'password', attrs: 'required autocomplete="current-password"' })}
    <span class="error" id="err" role="alert"></span><button class="btn primary big">Sign in</button><p class="muted small">No password yet? Open the link in the email HR sent you. Forgot it? Ask HR to send a new invite.</p></form></div>`;
  const f = $('form', app);
  f.onsubmit = async ev => { ev.preventDefault(); $('#err').textContent = ''; await busy($('button', f), async () => { try { await api('/login', { method: 'POST', body: Object.fromEntries(new FormData(f)), noAuthRedirect: true }); location.hash = '#/'; } catch (e) { $('#err').textContent = e.message; } }); };
}
async function invite(token) {
  let x; try { x = await api('/invite/' + token, { noAuthRedirect: true }); if (!CODE && x.code) { location.replace(`/team/${x.code}#/invite/${token}`); return; } } catch (e) { app.innerHTML = `<div class="tm-auth"><form><h1>Link expired</h1><p class="error">${esc(e.message)}</p><a class="btn" href="#/login">Sign in</a></form></div>`; return; }
  app.innerHTML = `<div class="tm-auth"><form novalidate>${brandMark(true)}<span class="eyebrow-pill">${esc(appTitle())}</span><h1>Welcome, ${esc(x.name.split(' ')[0])}</h1><p class="muted">Set a password for <b>${esc(x.email)}</b>. You will use it to sign in to the employee app.</p>
    ${field('New password', 'password', '', { type: 'password', hint: 'at least 8 characters, letters and numbers', attrs: 'required autocomplete="new-password"' })}
    <span class="error" id="err" role="alert"></span><button class="btn primary big">Set password and continue</button></form></div>`;
  const f = $('form', app);
  f.onsubmit = async ev => { ev.preventDefault(); $('#err').textContent = ''; await busy($('button', f), async () => { try { await api('/invite/' + token, { method: 'POST', body: { password: f.elements.password.value }, noAuthRedirect: true }); location.hash = '#/'; } catch (e) { $('#err').textContent = e.message; } }); };
}
function shell(page) {
  const m = state.me;
  const top = [['home', 'Home'], ['attendance', 'Attendance'], ['leave', 'Leave'], ['payslips', 'Payslips'], ['policies', 'Policies'], ['ask', 'Ask HR'], ['profile', 'My profile']];
  if (m.is_manager) top.splice(3, 0, ['approvals', 'My team']);
  const tabs = [['home', 'Home'], ['attendance', 'Attendance'], ['leave', 'Leave'], ['payslips', 'Payslips'], ['more', 'More']];
  const curTab = ['payslip'].includes(page) ? 'payslips' : ['policies', 'ask', 'profile', 'approvals', 'letter'].includes(page) ? 'more' : page;
  const badge = m.pending_approvals ? `<span class="n">${m.pending_approvals}</span>` : '';
  app.innerHTML = `<div class="tm"><header class="tm-top"><span class="co">${brandMark()}${esc(appTitle())}</span>
    <nav aria-label="App">${top.map(([k, l]) => `<a href="#/${k === 'home' ? '' : k}" ${k === page || (page === 'payslip' && k === 'payslips') ? 'aria-current="page"' : ''}>${l}${k === 'approvals' ? badge : ''}</a>`).join('')}<a href="#" class="out">Sign out</a></nav>
    <a class="tm-me" href="#/profile" aria-label="My profile">${esc(m.employee.name.split(' ').map(x => x[0]).slice(0, 2).join(''))}</a></header>
    <main id="main"></main>
    <nav class="tm-tabs" aria-label="App">${tabs.map(([k, l]) => `<a href="#/${k === 'home' ? '' : k}" ${k === curTab ? 'aria-current="page"' : ''}>${icon(k)}<span>${l}</span>${k === 'more' ? badge : ''}</a>`).join('')}</nav></div>`;
  $$('.out', app).forEach(a => a.onclick = signOut);
}
async function signOut(ev) { if (ev) ev.preventDefault(); try { await api('/logout', { method: 'POST' }); } catch (e) {} location.hash = '#/login'; }

// ---------------------------------------------------------------- check in / out
function getPos() {
  return new Promise(res => {
    if (!navigator.geolocation) return res({ error: 'This phone cannot share its location.' });
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      e => res({ error: e.code === 1 ? 'Location is blocked. Allow location for this app in your phone settings, then try again.' : 'Could not get your location. Turn on GPS / location and try again.' }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
  });
}
function checkCard() {
  const m = state.me, c = m.checkin, st = m.today_status, r = c.rec;
  if (c.mode !== 'app') return '';
  const off = ['HO', 'WE'].includes(st.code), lv = st.code === 'LV' && !/half/i.test(st.label);
  let body;
  if (r && r.out_time) body = `<div class="ci-state done"><b>Done for today</b><span>${to12(r.in_time)} – ${to12(r.out_time)} · ${esc(KIND[r.kind] || '')}${r.place ? ' · ' + esc(r.place) : ''}</span></div>`;
  else if (r && r.in_time) body = `<div class="ci-state in"><b>Checked in at ${to12(r.in_time)}</b><span>${esc(KIND[r.kind] || '')}${r.place ? ' · ' + esc(r.place) : ''}${r.status === 'L' ? ' · ' + pill('Late', 'warn') : ''}</span></div>
      <button class="btn big ci-out" id="cout">Check out</button>`;
  else if (lv) body = `<div class="ci-state"><b>You are on leave today</b><span>${esc(st.label)}</span></div>`;
  else body = `<div class="ci-state"><b>${off ? (st.code === 'HO' ? 'Holiday: ' + esc(st.label) : 'Weekend') : 'Not checked in yet'}</b><span>Office hours ${to12(c.office_start)} – ${to12(c.office_end)}</span></div>
      <button class="btn primary big ci-btn" data-k="office">Check in at office</button>
      ${c.allow_field || c.allow_branch ? `<div class="ci-alt">${c.allow_field ? '<button class="btn" data-k="field">Field visit</button>' : ''}${c.allow_branch ? '<button class="btn" data-k="branch">Branch visit</button>' : ''}</div>` : ''}
      <p class="muted small ci-rule">${c.needs_location ? 'Office check-in works only inside the office' + (c.needs_wifi ? ', on the office Wi-Fi' : '') + '.' : c.needs_wifi ? 'Office check-in works only on the office Wi-Fi.' : ''}</p>`;
  return `<section class="ci" id="ci"><div class="ci-clock"><b id="clock">${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b><span>${esc(DW(m.today))}</span></div><div class="ci-body">${body}</div><div id="cimsg" role="alert"></div></section>`;
}
function bindCheck(after) {
  const ci = $('#ci'); if (!ci) return;
  const clock = setInterval(() => { const c = $('#clock'); if (!c) return clearInterval(clock); c.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }, 15000);
  const msg = (t, tone = 'bad') => { $('#cimsg').innerHTML = t ? `<p class="note ${tone}">${esc(t)}</p>` : ''; };
  $$('.ci-btn, .ci-alt .btn', ci).forEach(b => b.onclick = () => b.dataset.k === 'office' ? doCheckin(b, { kind: 'office' }) : visitSheet(b.dataset.k));
  const out = $('#cout');
  if (out) out.onclick = () => busy(out, async () => {
    msg(''); out.textContent = 'Getting your location…';
    const pos = await getPos();
    try { const x = await api('/checkout', { method: 'POST', body: pos.error ? {} : pos }); toast(x.outside ? 'Checked out (outside the office)' : 'Checked out. Have a good evening!'); state.me = await api('/me'); after(); }
    catch (e) { msg(e.message); out.textContent = 'Check out'; }
  });
  async function doCheckin(btn, body) {
    msg(''); const label = btn.textContent;
    await busy(btn, async () => {
      btn.textContent = 'Getting your location…';
      const pos = await getPos();
      if (pos.error && (state.me.checkin.needs_location || body.kind !== 'office')) { msg(pos.error); btn.textContent = label; return; }
      btn.textContent = 'Checking in…';
      try { const x = await api('/checkin', { method: 'POST', body: { ...body, ...(pos.error ? {} : pos) } }); toast(x.late ? `Checked in at ${to12(x.rec.in_time)} (late)` : `Checked in at ${to12(x.rec.in_time)}`); state.me = await api('/me'); closeSheet(); after(); }
      catch (e) { (document.getElementById('shmsg') || {}).textContent = ''; if ($('#sheet')) $('#shmsg').textContent = e.message; else msg(e.message); btn.textContent = label; }
    });
  }
  function visitSheet(kind) {
    const offices = state.me.checkin.offices;
    document.body.insertAdjacentHTML('beforeend', `<div class="sheet-bg" id="sheet"><form class="sheet" role="dialog" aria-modal="true" aria-labelledby="shh"><h2 id="shh">${kind === 'field' ? 'Field visit' : 'Branch visit'}</h2>
      <p class="muted small">Your location is saved with this check-in.</p>
      ${kind === 'branch' && offices.length ? `<label class="field"><span class="lab">Branch</span><select name="place">${offices.map(o => `<option>${esc(o)}</option>`).join('')}<option value="">Other</option></select></label>` : kind === 'field' ? field('Place', 'place', '', { ph: 'e.g. ABC Ltd, Motijheel' }) : field('Branch', 'place', '')}
      ${area('Note', 'note', '', { ph: kind === 'field' ? 'Who you are meeting and why' : 'Reason for the visit' })}
      <span class="error" id="shmsg" role="alert"></span><div class="row"><button type="button" class="btn" id="shx">Cancel</button><button class="btn primary">Check in</button></div></form></div>`);
    const f = $('#sheet form');
    $('textarea', f).focus();
    $('#shx').onclick = closeSheet; $('#sheet').onclick = e => { if (e.target.id === 'sheet') closeSheet(); };
    f.onsubmit = ev => { ev.preventDefault(); const v = Object.fromEntries(new FormData(f)); if (!v.note.trim()) { $('#shmsg').textContent = 'Write a short note.'; return; } doCheckin($('button.primary', f), { kind, place: v.place, note: [v.place, v.note].filter(Boolean).join(': ') }); };
  }
}
const closeSheet = () => { const s = $('#sheet'); if (s) s.remove(); };

// ---------------------------------------------------------------- pages
async function home(main) {
  const m = state.me, e = m.employee, st = m.today_status;
  const stTxt = st.code === 'LV' ? st.label : st.code === 'HO' ? 'Holiday: ' + st.label : st.code === 'WE' ? 'Weekend' : 'Working day';
  main.innerHTML = `<section class="tm-hero rise"><div><p class="muted">${hello()}</p><h1>${esc(e.name)}</h1><p class="muted">${esc(e.designation || '')}${e.dept ? ' · ' + esc(e.dept) : ''}${m.manager ? ' · reports to ' + esc(m.manager) : ''}</p></div>
      ${m.checkin.mode === 'app' ? '' : `<div class="tm-status"><span class="muted small">Today, ${esc(D(m.today))}</span><b>${esc(stTxt)}</b><a class="btn primary small" href="#/leave">Apply for leave</a></div>`}</section>
    ${checkCard()}
    ${m.policies_to_ack.length ? `<a class="note warn tm-ack" href="#/policies"><b>Please read and accept:</b> ${m.policies_to_ack.map(p => esc(p.title)).join(', ')}</a>` : ''}
    <div class="tm-sec"><h3>Leave left</h3><a class="small" href="#/leave">Apply for leave</a></div>
    <div class="hbal">${m.balances.map(b => `<div class="hk"><span>${esc(b.name)}</span><b>${b.left == null ? '∞' : b.left}</b><small>${b.entitled == null ? 'no fixed limit' : 'of ' + b.entitled + ' days'}${b.pending ? ` · ${b.pending} waiting` : ''}</small></div>`).join('')}</div>
    <div class="tm-grid">
      <section class="hcard"><h3>Notices</h3>${m.notices.length ? `<ul class="hnotes">${m.notices.map(n => `<li><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${fmtDate(n.created_at)}</small></li>`).join('')}</ul>` : '<p class="muted">No notices.</p>'}</section>
      <div style="display:grid;gap:16px">
        ${m.tasks.length ? `<section class="hcard"><h3>Your to-do</h3><ul class="htasks">${m.tasks.map(t => `<li class="${t.done_at ? 'done' : ''}"><label><input type="checkbox" data-t="${t.id}" ${t.done_at ? 'checked' : ''}> ${esc(t.title)}</label></li>`).join('')}</ul></section>` : ''}
        <section class="hcard"><h3>Your upcoming leave</h3>${m.upcoming_leave.length ? `<ul class="hlist">${m.upcoming_leave.map(l => `<li><span class="hdate">${esc(DS(l.start_date))}</span><div>${esc(typeName(l.type))} · ${l.half ? 'half day' : l.days + ' day' + (l.days === 1 ? '' : 's')}</div>${pill(...LV[l.status])}</li>`).join('')}</ul>` : '<p class="muted">None planned.</p>'}</section>
        <section class="hcard"><h3>Holidays</h3>${m.holidays.length ? `<ul class="hlist">${m.holidays.map(h => `<li><span class="hdate">${esc(DS(h.date))}</span><div>${esc(h.name)}</div></li>`).join('')}</ul>` : '<p class="muted">No upcoming holidays.</p>'}</section>
      </div></div>`;
  bindCheck(() => home(main));
  $$('[data-t]', main).forEach(c => c.onchange = async () => { try { await api('/tasks/' + c.dataset.t, { method: 'POST', body: { done: c.checked } }); c.closest('li').classList.toggle('done', c.checked); } catch (er) { toast(er.message); } });
}
const typeName = k => ((state.me.leave_types || []).find(t => t.key === k) || {}).name || k;

async function leave(main) {
  const r = await api('/leaves');
  main.innerHTML = `<div class="hhead"><div><h2>Leave</h2><p class="muted">Your request goes to ${esc(state.me.manager || 'HR')} for approval. You get an email with the answer.</p></div></div>
    <div class="hbal" style="margin-top:14px">${r.balances.map(b => `<div class="hk"><span>${esc(b.name)}</span><b>${b.left == null ? '∞' : b.left}</b><small>${b.entitled == null ? 'no fixed limit' : `of ${b.entitled}`} · ${b.used} used${b.pending ? ` · ${b.pending} waiting` : ''}</small></div>`).join('')}</div>
    <div class="tm-grid rev">
      <section class="hcard"><h3>Apply for leave</h3><form id="lf" class="hform stack">
        <label class="field"><span class="lab">Type</span><select name="type">${r.types.map(t => `<option value="${esc(t.key)}">${esc(t.name)}</option>`).join('')}</select></label>
        <div class="seg2" role="radiogroup" aria-label="Length"><label><input type="radio" name="len" value="full" checked><span>Full day(s)</span></label><label><input type="radio" name="len" value="half"><span>Half day</span></label></div>
        <div class="grid2">${field('From', 'start_date', today(), { type: 'date' })}<div id="tow">${field('To', 'end_date', today(), { type: 'date' })}</div></div>
        <p class="muted small" id="lcount"></p>
        ${area('Reason', 'reason', '')}
        <span class="error" id="lErr" role="alert"></span><button class="btn primary big">Send request</button></form></section>
      <section class="hcard"><h3>Your requests</h3>${r.leaves.length ? `<ul class="tm-list">${r.leaves.map(l => `<li><div><b>${esc(typeName(l.type))}</b> · ${l.half ? 'half day' : l.days + ' day' + (l.days === 1 ? '' : 's')}<small>${esc(DS(l.start_date))}${l.end_date !== l.start_date ? ' – ' + esc(D(l.end_date)) : ', ' + l.start_date.slice(0, 4)}${l.note ? ' · ' + esc(l.note) : ''}</small></div>
        <div class="r">${pill(...LV[l.status])}${l.status === 'pending' ? `<button class="btn small ghost" data-c="${l.id}">Cancel</button>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">No requests yet.</p>'}</section></div>`;
  const f = $('#lf'), half = () => f.elements.len.value === 'half';
  const upd = () => {
    $('#tow').hidden = half(); if (half()) f.elements.end_date.value = f.elements.start_date.value;
    if (f.elements.end_date.value < f.elements.start_date.value) f.elements.end_date.value = f.elements.start_date.value;
    const n = half() ? 0.5 : Math.round((Date.parse(f.elements.end_date.value) - Date.parse(f.elements.start_date.value)) / 864e5) + 1;
    $('#lcount').textContent = n > 0 ? (half() ? 'Counts as 0.5 day.' : `${n} calendar day${n === 1 ? '' : 's'}; weekends and holidays are not counted.`) : '';
  };
  f.addEventListener('change', upd); f.addEventListener('input', upd); upd();
  f.onsubmit = async ev => { ev.preventDefault(); const v = Object.fromEntries(new FormData(f)); v.half = v.len === 'half'; delete v.len; if (v.half) v.end_date = v.start_date;
    await busy($('#lf button.primary'), async () => { try { await api('/leaves', { method: 'POST', body: v }); toast('Request sent'); state.me = await api('/me'); leave(main); } catch (e) { $('#lErr').textContent = e.message; } }); };
  $$('[data-c]', main).forEach(b => b.onclick = async () => { if (!confirm('Cancel this request?')) return; await api('/leaves/' + b.dataset.c, { method: 'DELETE' }); leave(main); });
}
async function attendance(main, p) {
  const m = /^\d{4}-\d{2}$/.test(p[0] || '') ? p[0] : today().slice(0, 7);
  const r = await api('/attendance?month=' + m), row = r.rows[0], app2 = r.mode === 'app';
  const cls = c => ({ P: 'p', L: 'l', H: 'h', A: 'a', LV: 'lv', HO: 'ho', WE: 'we', '-': 'na', '': app2 ? 'na' : 'p' }[c] || '');
  const lab = d => ({ P: 'Present', L: 'Late', H: 'Half', A: 'Absent', WE: '', '-': '', '': !app2 && d.date <= today() ? 'Present' : '' }[d.code] ?? d.label);
  const first = new Date(m + '-01T00:00:00Z').getUTCDay();
  main.innerHTML = `${state.me.checkin.mode === 'app' && m === today().slice(0, 7) ? checkCard() : ''}
    <div class="hhead"><div><h2>Attendance</h2><p class="muted">${app2 ? 'From your check-ins. Something wrong? Tell HR.' : 'As recorded by HR. Days not marked count as present.'}</p></div>
    <div class="row-end mnav"><a class="btn small" href="#/attendance/${addM(m, -1)}" aria-label="Previous month">‹</a><b>${esc(monthName(m))}</b><a class="btn small" href="#/attendance/${addM(m, 1)}" aria-label="Next month">›</a></div></div>
    ${row ? `<div class="hkpis tm-kpis">${[['Work days', row.counts.employed_workdays], ['Present', row.counts.present], ['Late', row.counts.late], ['Absent', row.counts.absent], ['Leave', row.counts.paid_leave + row.counts.unpaid_leave]].map(([l, v]) => `<div class="hk"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
    <section class="hcard"><div class="cal">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span class="dh">${d}</span>`).join('')}${'<span class="d e"></span>'.repeat(first)}
      ${row.days.map(d => `<div class="d ${d.date > today() && !['LV', 'HO', 'WE'].includes(d.code) ? 'na' : cls(d.code)} ${d.date === today() ? 'today' : ''}" title="${esc(d.label)}"><b>${+d.date.slice(8)}</b><span>${esc(d.date > today() && !['LV', 'HO'].includes(d.code) ? '' : lab(d))}</span></div>`).join('')}</div></section>
    ${r.log.filter(x => x.in_time).length ? `<section class="hcard" style="margin-top:16px"><h3>Check-ins</h3><ul class="tm-list">${r.log.filter(x => x.in_time).map(x => `<li><div><b>${esc(DW(x.date))}</b><small>${esc(KIND[x.kind] || (x.source === 'app' ? '' : 'Entered by HR'))}${x.place ? ' · ' + esc(x.place) : ''}${x.note && x.kind !== 'office' ? ' · ' + esc(x.note) : ''}</small></div><div class="r tm-time">${to12(x.in_time)}${x.out_time ? ' – ' + to12(x.out_time) : ''}</div></li>`).join('')}</ul></section>` : ''}`
    : '<p class="muted" style="margin-top:14px">No attendance for this month.</p>'}`;
  bindCheck(() => attendance(main, p));
}
async function payslips(main) {
  const r = await api('/payslips');
  main.innerHTML = `<div class="hhead"><div><h2>Payslips</h2><p class="muted">Every approved salary. Open one to print or save it as PDF.</p></div></div>
    <section class="hcard" style="margin-top:14px">${r.payslips.length ? `<ul class="tm-list">${r.payslips.map(p => `<li class="link"><a href="#/payslip/${p.id}"><div><b>${esc(monthName(p.month))}</b><small>Gross ${money(p.gross, r.currency)} · deductions ${money(p.deductions, r.currency)}</small></div><div class="r"><b>${money(p.net, r.currency)}</b></div></a></li>`).join('')}</ul>` : '<p class="muted">No payslips yet.</p>'}</section>`;
}
async function payslip(main, p) {
  const r = await api('/payslips/' + p[0]);
  main.innerHTML = `<div class="noprint hhead" style="margin-bottom:14px"><a class="muted small" href="#/payslips">← Payslips</a><button class="btn primary" onclick="window.print()">Print or save PDF</button></div><div class="scroll">${window.HRPayslip(r.payslip, r.company)}</div>`;
}
async function policies(main) {
  const r = await api('/policies');
  main.innerHTML = `<div class="hhead"><div><h2>Company policies</h2><p class="muted">Questions? Use <a href="#/ask">Ask HR</a>.</p></div></div>
    <div style="display:grid;gap:14px;margin-top:14px">${r.policies.map(x => `<details class="hcard" ${x.needs_ack && x.acked !== x.version ? 'open' : ''}><summary><b>${esc(x.title)}</b> ${x.needs_ack ? (x.acked === x.version ? pill('Accepted', 'good') : pill('Please read', 'warn')) : ''}</summary>
      <div class="pre" style="margin-top:12px">${esc(x.body)}</div>${x.needs_ack && x.acked !== x.version ? `<div class="row-end"><button class="btn primary" data-ack="${x.id}">I have read and accept this policy</button></div>` : ''}</details>`).join('') || '<p class="muted">No policies published yet.</p>'}</div>`;
  $$('[data-ack]', main).forEach(b => b.onclick = () => busy(b, async () => { await api(`/policies/${b.dataset.ack}/ack`, { method: 'POST' }); toast('Thank you'); state.me = await api('/me'); policies(main); }));
}
async function ask(main) {
  main.innerHTML = `<div class="hhead"><div><h2>Ask HR</h2><p class="muted">Answers come from your company’s policies and your leave balance. For anything personal, contact HR directly.</p></div></div>
    <section class="hcard" style="margin-top:14px"><div class="chat" id="chat"><div class="a">Hi ${esc(state.me.employee.name.split(' ')[0])}! Ask me about leave, office hours, holidays or any company policy.</div></div>
      <form class="chatf" id="cf"><input name="q" placeholder="e.g. How many sick days do I have?" aria-label="Your question" autocomplete="off"><button class="btn primary">Ask</button></form></section>`;
  $('#cf').onsubmit = async ev => {
    ev.preventDefault(); const q = ev.target.elements.q.value.trim(); if (!q) return; ev.target.elements.q.value = '';
    const c = $('#chat'); c.insertAdjacentHTML('beforeend', `<div class="q">${esc(q)}</div><div class="a" id="wait">…</div>`);
    try { const r = await api('/ask', { method: 'POST', body: { question: q } }); $('#wait').textContent = r.answer; } catch (e) { $('#wait').textContent = e.message; }
    $('#wait').removeAttribute('id');
  };
}
async function profile(main) {
  const e = state.me.employee, b = e.bank || {};
  const files = (await api('/files')).files.filter(f => f.kind !== 'appointment');
  main.innerHTML = `<section class="tm-card-me"><span class="hav big" aria-hidden="true">${esc(e.name.split(' ').map(x => x[0]).slice(0, 2).join(''))}</span><div><h2>${esc(e.name)}</h2><p class="muted">${esc(e.designation || '')}${e.dept ? ' · ' + esc(e.dept) : ''}</p></div></section>
    <div class="tm-grid">
      <div style="display:grid;gap:16px"><section class="hcard"><h3>Job</h3><dl class="facts">${[['Employee ID', e.code], ['Designation', e.designation], ['Department', e.dept], ['Reports to', state.me.manager], ['Joined', D(e.join_date)], ['Status', e.status === 'probation' ? 'On probation' + (e.probation_end ? ' until ' + D(e.probation_end) : '') : e.status === 'notice' ? 'Serving notice' : 'Confirmed'], ['Email', e.email]].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || '-')}</dd></div>`).join('')}</dl></section>
        <section class="hcard"><h3>Documents</h3><ul class="tm-list">${state.me.has_letter ? '<li class="link"><a href="#/letter"><div><b>Appointment letter</b><small>Open, print or save as PDF</small></div><div class="r">›</div></a></li>' : ''}
          ${files.map(f => `<li class="link"><a href="/api/team/files/${f.id}" target="_blank" rel="noopener"><div><b>${esc(f.name)}</b><small>${esc(f.kind)}${f.expires_on ? ' · expires ' + esc(D(f.expires_on)) : ''}</small></div><div class="r">›</div></a></li>`).join('')}
          ${!state.me.has_letter && !files.length ? '<li class="muted">No documents yet.</li>' : ''}</ul></section></div>
      <div style="display:grid;gap:16px"><form id="pf" class="hcard hform stack"><h3>Contact and payment</h3><p class="muted small">Name, job and salary are managed by HR.</p>${field('Phone', 'phone', e.phone, { type: 'tel' })}${area('Address', 'address', e.address)}${field('Emergency contact', 'emergency', e.emergency, { ph: 'Name, relation, phone' })}
        <div class="grid2">${field('Bank', 'bank', b.bank)}${field('Branch', 'branch', b.branch)}</div><div class="grid2">${field('Account number', 'account_no', b.account_no)}${field('bKash / Nagad number', 'mobile', b.mobile)}</div>
        <span class="error" id="pErr"></span><button class="btn primary">Save</button></form>
        <form id="pw" class="hcard hform stack"><h3>Password</h3>${field('Current password', 'current', '', { type: 'password', attrs: 'autocomplete="current-password"' })}${field('New password', 'next', '', { type: 'password', attrs: 'autocomplete="new-password"' })}<span class="error" id="wErr"></span><button class="btn">Change password</button></form></div></div>`;
  $('#pf').onsubmit = async ev => { ev.preventDefault(); const v = Object.fromEntries(new FormData(ev.target));
    await busy($('#pf button'), async () => { try { await api('/me', { method: 'PUT', body: { phone: v.phone, address: v.address, emergency: v.emergency, bank: { bank: v.bank, branch: v.branch, account_no: v.account_no, mobile: v.mobile } } }); toast('Saved'); state.me = await api('/me'); } catch (e2) { $('#pErr').textContent = e2.message; } }); };
  $('#pw').onsubmit = async ev => { ev.preventDefault(); await busy($('#pw button'), async () => { try { await api('/password', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); ev.target.reset(); toast('Password changed'); } catch (e2) { $('#wErr').textContent = e2.message; } }); };
}
async function letter(main) {
  const r = await api('/letter');
  main.innerHTML = `<div class="noprint hhead" style="margin-bottom:14px"><a class="muted small" href="#/profile">← My profile</a><button class="btn primary" onclick="window.print()">Print or save PDF</button></div>
    <article class="invdoc letter"><header class="ih"><div><h2>${esc(r.company.name)}</h2><p class="muted">${esc(r.company.address || '')}</p></div></header>
      <h1 style="font-size:22px;margin-bottom:18px">Appointment letter</h1><div class="ltext">${esc(r.text).replace(/\n/g, '<br>')}</div></article>`;
}
async function more(main) {
  const m = state.me, ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const items = [['profile', 'My profile', 'Job details, documents, bank and password'], ['policies', 'Company policies', m.policies_to_ack.length ? `${m.policies_to_ack.length} to accept` : 'Read the rules'], ['ask', 'Ask HR', 'Quick answers about leave and policies']];
  if (m.is_manager) items.unshift(['approvals', 'My team', m.pending_approvals ? `${m.pending_approvals} leave request${m.pending_approvals === 1 ? '' : 's'} waiting for you` : 'Who is in today, and leave requests']);
  main.innerHTML = `<div class="hhead"><div><h2>More</h2></div></div>
    <section class="hcard" style="margin-top:14px"><ul class="tm-list">${items.map(([k, l, s]) => `<li class="link"><a href="#/${k}"><div><b>${l}</b><small>${esc(s)}</small></div><div class="r">›</div></a></li>`).join('')}</ul></section>
    ${standalone ? '' : `<section class="hcard soft" style="margin-top:16px"><h3>Install the app</h3><p class="muted small">${ios ? 'On iPhone: tap the Share button in Safari, then <b>Add to Home Screen</b>.' : 'Add this app to your home screen for one-tap check-in.'}</p><button class="btn primary" id="inst" ${state.install ? '' : 'hidden'}>Install</button></section>`}
    <button class="btn big tm-signout" id="so">Sign out</button>`;
  $('#so').onclick = signOut;
  const ib = $('#inst');
  if (ib) ib.onclick = async () => { if (!state.install) return; state.install.prompt(); await state.install.userChoice.catch(() => {}); state.install = null; ib.hidden = true; };
}
async function approvals(main) {
  const r = await api('/approvals');
  const T = { P: ['In', 'good'], L: ['Late', 'warn'], H: ['Half day', 'info'], A: ['Absent', 'bad'], LV: ['On leave', 'info'], HO: ['Holiday', ''], WE: ['Weekend', ''], '': ['Not in yet', ''] };
  main.innerHTML = `<div class="hhead"><div><h2>My team</h2><p class="muted">${r.teams_led.length ? 'Team lead of ' + r.teams_led.map(esc).join(', ') + '. ' : ''}${r.team.length} people.</p></div></div>
    <section class="hcard" style="margin-top:14px"><h3>Today</h3><ul class="tm-list">${r.today.map(x => `<li><div><b>${esc(x.name)}</b><small>${esc(x.designation || '')}${x.in_time ? ' · in ' + to12(x.in_time) : ''}${x.out_time ? ' – ' + to12(x.out_time) : ''}${x.kind && x.kind !== 'office' ? ' · ' + esc(KIND[x.kind]) + (x.place ? ': ' + esc(x.place) : '') : ''}</small></div><div class="r">${pill(...(T[x.code] || [x.label, '']))}</div></li>`).join('') || '<li class="muted">No one yet.</li>'}</ul></section>
    <h3 style="margin:20px 0 0">Leave requests</h3>
    <section class="hcard" style="margin-top:14px">${r.leaves.length ? `<ul class="tm-list">${r.leaves.map(l => `<li><div><b>${esc(l.employee_name)}</b> · ${esc(l.type_name)}<small>${esc(DS(l.start_date))}${l.end_date !== l.start_date ? ' – ' + esc(D(l.end_date)) : ''} · ${l.half ? 'half day' : l.days + ' day' + (l.days === 1 ? '' : 's')}${l.reason ? ' · ' + esc(l.reason) : ''}</small></div>
      <div class="r">${l.status === 'pending' ? `<button class="btn small" data-d="${l.id}" data-ok="0">Decline</button><button class="btn small primary" data-d="${l.id}" data-ok="1">Approve</button>` : pill(...LV[l.status])}</div></li>`).join('')}</ul>` : '<p class="muted">No requests from your team.</p>'}</section>`;
  $$('[data-d]', main).forEach(b => b.onclick = () => busy(b, async () => {
    const ok = b.dataset.ok === '1', note = ok ? '' : prompt('Reason (optional):', '');
    if (note === null) return;
    try { await api('/approvals/' + b.dataset.d, { method: 'POST', body: { approve: ok, note } }); toast(ok ? 'Approved' : 'Declined'); state.me = await api('/me'); shell('approvals'); approvals($('#main')); } catch (e) { toast(e.message); }
  }));
}
})();
