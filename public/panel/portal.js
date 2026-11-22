/* Briefbox client portal: sign up, sign in, company info, and every automation the client uses
   (each with its own Settings, Dashboard and Subscription). */
(() => {
'use strict';
const { $, $$, esc, toast, makeApi, fmtDate, money, periodLabel, busy, field } = UI;
const app = $('#app');
const api = makeApi('/api', () => { state.me = null; if (!/^#\/(login|register)/.test(location.hash)) location.hash = '#/login'; });
const state = { me: null };

window.addEventListener('hashchange', route);
async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const page = parts[0] || '';
  if (page === 'login') return renderAuth('login');
  if (page === 'register') return renderAuth('register');
  try { state.me = await api('/me'); } catch (e) { if (!e.auth) fatal(e); return; }
  if (page === 'info') { shell('info'); return renderInfo(); }
  if (page === 'a' && parts[1]) return renderAutomation(parts[1], parts[2]);
  shell('home'); renderHome();
}

// ------------------------------------------------------------------ sign in / sign up
function renderAuth(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<div class="auth">
    <aside class="auth-side">
      <a class="wordmark" href="/"><img src="/assets/logo-h.png" alt="Briefbox Digital" height="34"></a>
      <div class="auth-copy"><h1>Your automations, set up and followed in one place.</h1>
        <p>Choose the automations you need, connect your tools, and see what each one does for your business.</p></div>
      <ol class="auth-steps">
        <li><b>Create your account</b><span>Your company details, in two minutes.</span></li>
        <li><b>Choose your automations</b><span>Take one, or several together.</span></li>
        <li><b>Connect and pay</b><span>Fill in each automation's settings and choose a plan.</span></li>
        <li><b>We check and switch it on</b><span>Usually within one working day.</span></li>
      </ol>
    </aside>
    <main class="auth-main"><form class="auth-form" novalidate>
      <h2>${reg ? 'Create your account' : 'Sign in'}</h2>
      <p class="muted">${reg ? 'Already have an account? <a href="#/login">Sign in</a>' : 'New to Briefbox? <a href="#/register">Create an account</a>'}</p>
      ${reg ? `<div class="grid2">${field('Your name', 'name', '', { attrs: 'required autocomplete="name"' })}${field('Company name', 'company', '', { attrs: 'required autocomplete="organization"' })}</div>` : ''}
      ${field('Work email', 'email', '', { type: 'email', attrs: 'required autocomplete="email"' })}
      ${field('Password', 'password', '', { type: 'password', hint: reg ? 'at least 8 characters, letters and numbers' : '', attrs: `required autocomplete="${reg ? 'new-password' : 'current-password'}"` })}
      ${reg ? `<div class="grid2">${field('Phone or WhatsApp', 'phone', '', { attrs: 'autocomplete="tel"' })}
        <label class="field"><span class="lab">Country</span><select name="country"><option value="">Choose</option>${['Bangladesh', 'United Kingdom', 'United States', 'Canada', 'Australia', 'Germany', 'Ireland', 'United Arab Emirates', 'India', 'Other'].map(c => `<option>${c}</option>`).join('')}</select></label></div>` : ''}
      <div class="error" id="err" role="alert"></div>
      <button class="btn primary big" type="submit">${reg ? 'Create account' : 'Sign in'}</button>
      ${reg ? '' : '<p class="muted small">Forgot your password? Email <a href="mailto:hello@briefboxdigital.com">hello@briefboxdigital.com</a> and we will reset it.</p>'}
    </form></main></div>`;
  const form = $('form', app);
  $('input', form).focus();
  form.onsubmit = async e => {
    e.preventDefault(); $('#err').textContent = '';
    const body = Object.fromEntries(new FormData(form));
    await busy($('button[type=submit]', form), async () => {
      try { await api(reg ? '/auth/register' : '/auth/login', { method: 'POST', body, noAuthRedirect: true }); state.me = null; location.hash = '#/'; }
      catch (err) { $('#err').textContent = err.message; }
    });
  };
}
function fatal(e) {
  app.innerHTML = `<div class="blank" style="padding:80px 20px"><h2>We couldn't load your account</h2><p class="error">${esc(e.message)}</p>
    <p style="margin-top:16px"><button class="btn" onclick="location.reload()">Try again</button></p></div>`;
}

// ------------------------------------------------------------------ shell
function shell(active, head = '') {
  const a = state.me.account;
  app.innerHTML = `
  <header class="topbar"><a class="wordmark" href="#/"><img src="/assets/logo-h.png" alt="Briefbox Digital" height="34"></a>
    <div class="topbar-r"><span class="who">${esc(a.email)}</span><button class="btn ghost-inv small" id="logout">Sign out</button></div></header>
  <div class="page">
    <div class="profilehead"><div><h1>${esc(a.company)}</h1>${head}</div></div>
    ${a.status === 'suspended' ? note('warn', 'Your account is paused by Briefbox.', 'Contact hello@briefboxdigital.com to switch it back on.') : ''}
    <nav class="tabs" aria-label="Account"><a href="#/" ${active === 'home' || active === 'auto' ? 'aria-current="page"' : ''}>My automations</a><a href="#/info" ${active === 'info' ? 'aria-current="page"' : ''}>Company info</a></nav>
    <main id="main"></main>
  </div>`;
  $('#logout').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch (e) {} state.me = null; location.hash = '#/login'; };
}
const note = (tone, title, text) => `<div class="note ${tone}"><b>${title}</b> ${text}</div>`;

// ------------------------------------------------------------------ home: my automations + catalog
async function renderHome() {
  const main = $('#main'), subs = state.me.subs;
  main.innerHTML = '<p class="muted">Loading...</p>';
  let products = [];
  try { products = (await api('/products')).products; } catch (e) { /* catalog not available */ }
  const mine = new Set(subs.map(s => s.product_id));
  const others = products.filter(p => !mine.has(p.id));
  const from = p => { const pr = p.plans.filter(x => x.price > 0).sort((a, b) => a.price - b.price)[0]; return pr ? `From ${money(pr.price, pr.currency)} / ${periodLabel(pr.period_days)}` : 'Price on request'; };
  main.innerHTML = `
    <section class="autos">
      ${subs.length ? subs.map(s => `<a class="auto" href="#/a/${s.id}">
        <span class="auto-ic" aria-hidden="true">${esc(s.product.icon || '⚙️')}</span>
        <span class="auto-body"><b>${esc(s.product.name)}</b><span class="muted small">${s.plan ? esc(s.plan.name) + ' plan' : 'No plan yet'}${s.sub_ends_at ? ` · ${s.sub_status === 'expired' ? 'ended' : 'paid until'} ${fmtDate(s.sub_ends_at)}` : ''}</span></span>
        ${UI.stagePill(s.stage)}</a>`).join('')
        : '<div class="blank" style="padding:28px 0"><h2>No automations yet</h2><p>Choose your first one below. You can add more any time.</p></div>'}
    </section>
    ${others.length ? `<section class="section"><header><h2>Add an automation</h2><p>Each automation has its own settings, dashboard and plan.</p></header>
      <div class="plans">${others.map(p => `<article class="plan">
        <header><h3>${esc(p.icon || '')} ${esc(p.name)}</h3></header>
        <p class="muted">${esc(p.short)}</p>${p.description ? `<p class="small">${esc(p.description)}</p>` : ''}
        <p class="small"><b>${from(p)}</b></p>
        <button class="btn primary" type="button" data-add="${esc(p.slug)}">Add ${esc(p.name)}</button></article>`).join('')}</div></section>` : ''}`;
  $$('[data-add]', main).forEach(b => b.onclick = () => busy(b, async () => {
    try { const r = await api('/me/subscriptions', { method: 'POST', body: { product: b.dataset.add } }); toast('Added. Fill in its settings next.'); location.hash = `#/a/${r.sub.id}/settings`; }
    catch (e) { toast(e.message); }
  }));
}

// ------------------------------------------------------------------ company info
function renderInfo() {
  const a = state.me.account;
  $('#main').innerHTML = `
    <section class="section"><header><h2>Company</h2><p>Your company name appears in the messages your automations send.</p></header>
      <form id="info" class="stack">${UI.infoFields(a)}
        <div class="row-end"><span class="error" id="infoErr" role="alert"></span><button class="btn primary" type="submit">Save info</button></div></form></section>
    <section class="section"><header><h2>Account</h2><p>Your sign-in and reference details.</p></header>
      <dl class="facts"><div><dt>Email</dt><dd>${esc(a.email)}</dd></div><div><dt>Client ID</dt><dd><code>${esc(a.client_id)}</code></dd></div>
        <div><dt>Member since</dt><dd>${fmtDate(a.created_at)}</dd></div><div><dt>Automations</dt><dd>${state.me.subs.length}</dd></div></dl></section>
    <section class="section"><header><h2>Password</h2><p>Changing it signs you out on other devices.</p></header>
      <form id="pw" class="stack narrow">${field('Current password', 'current', '', { type: 'password', attrs: 'required autocomplete="current-password"' })}
        ${field('New password', 'next', '', { type: 'password', hint: 'at least 8 characters, letters and numbers', attrs: 'required autocomplete="new-password"' })}
        <div class="row-end"><span class="error" id="pwErr" role="alert"></span><button class="btn" type="submit">Change password</button></div></form></section>`;
  $('#info').onsubmit = async e => {
    e.preventDefault(); $('#infoErr').textContent = '';
    await busy($('#info button[type=submit]'), async () => {
      try { await api('/me/info', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Info saved'); route(); }
      catch (err) { $('#infoErr').textContent = err.message; }
    });
  };
  $('#pw').onsubmit = async e => {
    e.preventDefault(); $('#pwErr').textContent = '';
    await busy($('#pw button'), async () => {
      try { await api('/me/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); toast('Password changed'); }
      catch (err) { $('#pwErr').textContent = err.message; }
    });
  };
}

// ------------------------------------------------------------------ one automation
async function renderAutomation(id, tab) {
  shell('auto');
  const main = $('#main'); main.innerHTML = '<p class="muted">Loading...</p>';
  let b, view = null;
  try { b = await api(`/me/s/${id}`); } catch (e) { if (!e.auth) main.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  const s = b.sub, p = b.product, base = `#/a/${s.id}`;
  if (!['settings', 'dashboard', 'subscription'].includes(tab)) { location.replace(`${base}/${s.stage === 'live' ? 'dashboard' : 'settings'}`); return; }
  if (s.stage !== 'live') { try { view = await api(`/me/s/${s.id}/settings`); } catch (e) { view = null; } }
  const tabs = [['settings', 'Settings'], ['dashboard', 'Dashboard'], ['subscription', 'Subscription']];
  main.innerHTML = `
    <div class="autohead"><a href="#/" class="muted small">← My automations</a>
      <h2><span aria-hidden="true">${esc(p.icon || '⚙️')}</span> ${esc(p.name)}</h2>
      <p class="sub">${UI.stagePill(s.stage)} ${b.plan ? `<span>${esc(b.plan.name)} plan</span>` : ''} ${s.sub_ends_at ? `<span>${s.sub_status === 'expired' ? 'ended' : 'paid until'} ${fmtDate(s.sub_ends_at)}</span>` : ''}
        ${!s.live && !b.invoices.some(i => ['paid', 'submitted'].includes(i.status)) ? '<button class="btn small ghost" id="rm">Remove</button>' : ''}</p></div>
    ${banner(s)}
    ${view ? track(s, view, b.invoices) : ''}
    <nav class="tabs subtabs" aria-label="${esc(p.name)}">${tabs.map(([k, l]) => `<a href="${base}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div id="tab"></div>`;
  const rm = $('#rm');
  if (rm) rm.onclick = async () => { if (!confirm(`Remove ${p.name} from your account?`)) return; try { await api(`/me/s/${s.id}`, { method: 'DELETE' }); toast('Removed'); location.hash = '#/'; } catch (e) { toast(e.message); } };
  const el = $('#tab');
  if (tab === 'settings') return tabSettings(el, s, p, view);
  if (tab === 'dashboard') return tabDashboard(el, s, p);
  return tabSubscription(el, s, p, b);
}
function banner(s) {
  if (s.stage === 'suspended') return note('warn', 'This automation is paused by Briefbox.', esc(s.status_note || 'Contact us at hello@briefboxdigital.com to switch it back on.'));
  if (s.stage === 'rejected') return note('bad', 'We could not approve this automation.', esc(s.status_note || 'Write to hello@briefboxdigital.com.'));
  if (s.stage === 'expired') return note('bad', 'The plan has ended, so this automation is off.', `Renew on the Subscription tab. It switches back on once the payment is confirmed.`);
  if (s.sub_status === 'grace') return note('warn', `The plan ended on ${fmtDate(s.sub_ends_at)}.`, 'It keeps running for a few more days. Renew now to avoid a pause.');
  if (s.stage === 'live' && s.renew_soon) return note('info', `Renews by ${fmtDate(s.sub_ends_at)} (${s.days_left} day${s.days_left === 1 ? '' : 's'} left).`, 'Renew on the Subscription tab. The new period starts after the current one ends.');
  return '';
}
// Setup track: the real sequence before an automation goes live.
function track(s, view, invoices) {
  const a = state.me.account;
  const paid = ['trial', 'active', 'grace'].includes(s.sub_status);
  const submitted = invoices.some(i => i.status === 'submitted');
  const steps = [
    ['Company info', a.company && a.phone && a.country ? 'done' : 'todo', '#/info'],
    ['Settings', view.missing.length ? 'todo' : 'done', `#/a/${s.id}/settings`],
    ['Plan and payment', paid ? 'done' : submitted ? 'wait' : 'todo', `#/a/${s.id}/subscription`],
    ['Briefbox review', s.status === 'active' ? 'done' : 'wait', null],
    ['Live', s.stage === 'live' ? 'done' : 'todo', null],
  ];
  const current = steps.findIndex(x => x[1] !== 'done');
  const hint = { 0: 'Add your phone and country on the Company info tab.', 1: `${view.missing.length} thing${view.missing.length === 1 ? '' : 's'} left on the Settings tab.`,
    2: submitted ? 'We are checking your payment.' : 'Choose a plan on the Subscription tab.', 3: 'We are reviewing your setup. We email you when it is live.' }[current] || '';
  return `<section class="track" aria-label="Setup progress"><ol>${steps.map(([l, st, href], i) => `<li data-state="${i === current ? 'current' : st}">
      <span class="stop" aria-hidden="true">${st === 'done' ? '<svg viewBox="0 0 16 16"><path d="M4 8.4l2.6 2.6L12 5.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : i + 1}</span>
      ${href ? `<a href="${href}">${l}</a>` : `<span>${l}</span>`}<span class="sr">${st === 'done' ? 'done' : i === current ? 'current step' : 'not started'}</span></li>`).join('')}</ol>
    ${hint ? `<p class="track-hint">${hint}</p>` : ''}</section>`;
}

async function tabSettings(el, s, p, view) {
  el.innerHTML = '<p class="muted">Loading settings...</p>';
  try {
    view = view || await api(`/me/s/${s.id}/settings`);
    const save = async body => { const r = await api(`/me/s/${s.id}/settings`, { method: 'PUT', body }); if (!s.live) setTimeout(() => route(), 900); return r; };
    if (p.kind === 'lead-engine') UI.settingsForm(el, view, { save, test: (svc, body) => api(`/me/s/${s.id}/test/${svc}`, { method: 'POST', body }) });
    else UI.genericForm(el, view, { save });
  } catch (e) { if (!e.auth) el.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
function tabDashboard(el, s, p) {
  const opts = { load: days => api(`/me/s/${s.id}/stats?days=${days}`), csvHref: days => `/api/me/s/${s.id}/data.csv?days=${days}`,
    notLive: `<div class="blank"><h2>The dashboard fills in once this automation is live</h2><p>Finish the steps above. After that you will see everything it does here.</p></div>` };
  return p.kind === 'lead-engine' ? UI.dashboard(el, opts) : UI.genericDashboard(el, opts);
}

function tabSubscription(el, s, p, b) {
  const plan = b.plan, u = b.usage, limit = u.limit;
  const open = b.invoices.find(i => i.status === 'unpaid' || i.status === 'rejected');
  const review = b.invoices.find(i => i.status === 'submitted');
  el.innerHTML = `
    <section class="plan-now">
      <div><p class="muted small">Current plan</p><h2>${plan ? esc(plan.name) : 'No plan yet'}</h2>${UI.subPill(s.sub_status)}</div>
      <div><p class="muted small">${s.sub_status === 'expired' ? 'Ended' : 'Paid until'}</p><p class="big num">${s.sub_ends_at ? fmtDate(s.sub_ends_at) : '-'}</p>
        <p class="muted small">${s.sub_ends_at && s.days_left > 0 ? s.days_left + ' days left' : s.sub_status === 'grace' ? `Grace period: ${b.payment.grace_days} days after the end date` : ''}</p></div>
      <div><p class="muted small">${esc(u.unit.replace(/^./, c => c.toUpperCase()))} in the last 30 days</p><p class="big num">${u.used_30d == null ? '-' : u.used_30d}${limit ? ` <span class="muted">/ ${limit}</span>` : ''}</p>
        ${limit && u.used_30d != null ? `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${u.used_30d}" aria-label="Usage"><span style="width:${Math.min(100, u.used_30d / limit * 100)}%" class="${u.used_30d > limit ? 'over' : ''}"></span></div>` : `<p class="muted small">${plan && !limit ? 'No limit' : ''}</p>`}</div>
    </section>
    <div id="pay">${review ? reviewBox(review) : open ? payBox(open, b.payment) : ''}</div>
    <section class="section"><header><h2>${s.sub_ends_at ? 'Renew or change plan' : 'Choose a plan'}</h2>
      <p>${s.sub_ends_at && s.sub_status !== 'expired' ? 'A renewal adds a new period after your current end date, so you never lose days.' : 'This automation switches on after we confirm the payment.'}</p></header>
      <div class="plans">${b.plans.map(x => planCard(x, plan, !!review, p.unit)).join('') || '<p class="muted">Plans are being updated. Please check back soon.</p>'}</div></section>
    <section class="section"><header><h2>Payment history</h2><p>Invoices for ${esc(p.name)}.</p></header>
      ${b.invoices.length ? `<div class="scroll"><table class="t"><tr><th>Date</th><th>Plan</th><th class="n">Amount</th><th>Status</th><th>Reference</th><th>Period</th></tr>
        ${b.invoices.map(i => `<tr><td>${fmtDate(i.created_at)}</td><td>${esc(i.plan_name)}</td><td class="n">${money(i.amount, i.currency)}</td><td>${UI.invPill(i.status)}${i.status === 'rejected' && i.admin_note ? `<div class="muted small">${esc(i.admin_note)}</div>` : ''}</td>
          <td class="muted">${esc([i.method, i.reference].filter(Boolean).join(' / ') || '-')}</td><td class="muted">${i.period_end ? fmtDate(i.period_start) + ' to ' + fmtDate(i.period_end) : '-'}</td></tr>`).join('')}</table></div>`
      : '<p class="muted">No invoices yet.</p>'}</section>`;
  $$('[data-plan]', el).forEach(btn => btn.onclick = () => busy(btn, async () => {
    try { await api(`/me/s/${s.id}/invoices`, { method: 'POST', body: { plan_id: Number(btn.dataset.plan) } }); await route(); const pay = $('#pay'); if (pay) pay.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { toast(e.message); }
  }));
  const form = $('#payForm', el);
  if (form) form.onsubmit = async e => {
    e.preventDefault(); $('#payErr').textContent = '';
    await busy($('button[type=submit]', form), async () => {
      try { await api(`/me/invoices/${form.dataset.id}/pay`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); toast('Payment details sent. We will confirm soon.'); route(); }
      catch (err) { $('#payErr').textContent = err.message; }
    });
  };
}
function planCard(x, current, locked, unit) {
  const isCur = current && current.id === x.id;
  return `<article class="plan ${isCur ? 'current' : ''}">
    <header><h3>${esc(x.name)}</h3>${isCur ? '<span class="pill good">Your plan</span>' : ''}</header>
    <p class="price"><b class="num">${x.price ? money(x.price, x.currency) : 'Ask us'}</b>${x.price ? `<span> / ${periodLabel(x.period_days)}</span>` : ''}</p>
    <p class="muted small">${x.lead_limit ? `Up to ${x.lead_limit.toLocaleString()} ${esc(unit)} a month` : 'No limit'}</p>
    <ul>${x.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    <button class="btn ${isCur ? 'primary' : ''}" type="button" data-plan="${x.id}" ${locked ? 'disabled title="A payment is under review"' : ''}>${isCur ? 'Renew this plan' : 'Choose ' + esc(x.name)}</button></article>`;
}
function payBox(i, pay) {
  return `<section class="paybox" aria-labelledby="payTitle">
    <div><h2 id="payTitle">Pay for ${esc(i.product_name || '')} ${esc(i.plan_name)}</h2>
      <p class="amount num">${money(i.amount, i.currency)}<span class="muted"> for ${periodLabel(i.period_days)}</span></p>
      ${i.status === 'rejected' ? `<div class="note bad"><b>We could not find your last payment.</b> ${esc(i.admin_note || '')} Check the details and send them again.</div>` : ''}
      <h3>How to pay</h3><pre class="instructions">${esc(pay.instructions)}</pre></div>
    <form id="payForm" data-id="${i.id}" class="stack" novalidate><h3>After paying</h3>
      <label class="field"><span class="lab">Paid with</span><select name="method">${pay.methods.map(m => `<option ${m === i.method ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      ${field('Transaction ID or reference', 'reference', i.reference || '', { attrs: 'required' })}
      ${UI.area('Note for us', 'note', i.payer_note || '', { ph: 'Optional, for example the sender number' })}
      <div class="error" id="payErr" role="alert"></div>
      <button class="btn primary" type="submit">Send payment details</button></form></section>`;
}
const reviewBox = i => `<div class="note info"><b>We are checking your payment of ${money(i.amount, i.currency)} for ${esc(i.plan_name)}.</b>
  Sent ${UI.fmtDateTime(i.submitted_at)} with reference <code>${esc(i.reference)}</code>. Your plan updates as soon as it is confirmed.</div>`;

route();
})();
