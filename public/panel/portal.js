/* Briefbox client portal: sign up, sign in, and the client's own profile (Info, Settings, Dashboard, Subscription). */
(() => {
'use strict';
const { $, $$, esc, toast, makeApi, fmtDate, money, periodLabel, busy, field } = UI;
const app = $('#app');
const api = makeApi('/api', () => { state.me = null; if (!/^#\/(login|register)/.test(location.hash)) location.hash = '#/login'; });
const state = { me: null, track: null };

window.addEventListener('hashchange', route);
async function route() {
  const tab = (location.hash.replace(/^#\/?/, '').split('/')[0]) || '';
  if (tab === 'login') return renderAuth('login');
  if (tab === 'register') return renderAuth('register');
  if (!state.me) {
    try { await loadMe(); } catch (e) { if (!e.auth) fatal(e); return; }
  }
  const a = state.me.account;
  if (!['info', 'settings', 'dashboard', 'subscription'].includes(tab)) { location.replace('#/' + (a.stage === 'live' ? 'dashboard' : 'info')); return; }
  shell(tab);
  ({ info: renderInfo, settings: renderSettings, dashboard: renderDash, subscription: renderSub })[tab]();
}
async function loadMe() {
  state.me = await api('/me');
  const a = state.me.account;
  state.track = null;
  if (a.stage !== 'live') {
    const [s, b] = await Promise.all([api('/me/settings'), api('/me/billing')]);
    state.track = { missing: s.missing, invoices: b.invoices };
  }
}
const reload = async () => { await loadMe(); route(); };

// ------------------------------------------------------------------ sign in / sign up
function renderAuth(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<div class="auth">
    <aside class="auth-side">
      <a class="wordmark" href="/">Briefbox <span>Digital</span></a>
      <div class="auth-copy"><h1>Every lead answered, checked and handed to the right counsellor.</h1>
        <p>This is where you connect your WhatsApp, CRM and email, follow every lead, and manage your plan.</p></div>
      <ol class="auth-steps">
        <li><b>Create your account</b><span>Your company details, in two minutes.</span></li>
        <li><b>Connect your tools</b><span>WhatsApp, your CRM or Google Sheet, email.</span></li>
        <li><b>Choose a plan and pay</b><span>bKash, bank transfer, Wise or PayPal.</span></li>
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
      try { await api(reg ? '/auth/register' : '/auth/login', { method: 'POST', body, noAuthRedirect: true }); state.me = null; location.hash = reg ? '#/info' : '#/'; }
      catch (err) { $('#err').textContent = err.message; }
    });
  };
}
function fatal(e) {
  app.innerHTML = `<div class="blank" style="padding:80px 20px"><h2>We couldn't load your account</h2><p class="error">${esc(e.message)}</p>
    <p style="margin-top:16px"><button class="btn" onclick="location.reload()">Try again</button></p></div>`;
}

// ------------------------------------------------------------------ shell
function shell(tab) {
  const a = state.me.account, plan = state.me.plan;
  const tabs = [['info', 'Info'], ['settings', 'Settings'], ['dashboard', 'Dashboard'], ['subscription', 'Subscription']];
  app.innerHTML = `
  <header class="topbar"><a class="wordmark" href="#/">Briefbox <span>Digital</span></a>
    <div class="topbar-r"><span class="who">${esc(a.email)}</span><button class="btn ghost-inv small" id="logout">Sign out</button></div></header>
  <div class="page">
    <div class="profilehead">
      <div><h1>${esc(a.company)}</h1>
        <p class="sub">${UI.stagePill(a.stage)} ${plan ? `<span>${esc(plan.name)} plan</span>` : ''} ${a.sub_ends_at ? `<span>${a.sub_status === 'expired' ? 'ended' : 'renews by'} ${fmtDate(a.sub_ends_at)}</span>` : ''}</p></div>
    </div>
    ${banner(a)}
    ${state.track ? track(a) : ''}
    <nav class="tabs" aria-label="Profile">${tabs.map(([k, l]) => `<a href="#/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <main id="main"></main>
  </div>`;
  $('#logout').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch (e) {} state.me = null; location.hash = '#/login'; };
}
function banner(a) {
  if (a.stage === 'suspended') return note('warn', 'Your automation is paused by Briefbox.', a.status_note || 'Contact us at hello@briefboxdigital.com to switch it back on.');
  if (a.stage === 'rejected') return note('bad', 'We could not approve this account.', a.status_note || 'Reply to our email or write to hello@briefboxdigital.com.');
  if (a.stage === 'expired') return note('bad', 'Your plan has ended, so your automation is off.', `Renew on the <a href="#/subscription">Subscription</a> tab and it switches back on once the payment is confirmed.`);
  if (a.sub_status === 'grace') return note('warn', `Your plan ended on ${fmtDate(a.sub_ends_at)}.`, `Your automation keeps running for a few more days. <a href="#/subscription">Renew now</a> to avoid a pause.`);
  if (a.stage === 'live' && a.renew_soon) return note('info', `Your plan renews by ${fmtDate(a.sub_ends_at)} (${a.days_left} day${a.days_left === 1 ? '' : 's'} left).`, `<a href="#/subscription">Renew now</a>. The new period starts after the current one ends.`);
  return '';
}
const note = (tone, title, text) => `<div class="note ${tone}"><b>${title}</b> ${text}</div>`;

// Setup track: the real sequence a new client goes through before going live.
function track(a) {
  const t = state.track;
  const paid = ['trial', 'active', 'grace'].includes(a.sub_status);
  const submitted = t.invoices.some(i => i.status === 'submitted');
  const steps = [
    ['Company profile', a.company && a.phone && a.country ? 'done' : 'todo', '#/info'],
    ['Connections', t.missing.length ? 'todo' : 'done', '#/settings'],
    ['Plan and payment', paid ? 'done' : submitted ? 'wait' : 'todo', '#/subscription'],
    ['Briefbox review', a.status === 'active' ? 'done' : 'wait', null],
    ['Live', a.stage === 'live' ? 'done' : 'todo', null],
  ];
  const current = steps.findIndex(s => s[1] !== 'done');
  const hint = {
    0: 'Add your phone and country on the Info tab.',
    1: `${t.missing.length} thing${t.missing.length === 1 ? '' : 's'} left on the Settings tab.`,
    2: submitted ? 'We are checking your payment.' : 'Choose a plan on the Subscription tab.',
    3: 'We are reviewing your setup. We email you when it is live.',
  }[current] || '';
  return `<section class="track" aria-label="Setup progress">
    <ol>${steps.map(([l, st, href], i) => `<li data-state="${i === current ? 'current' : st}">
      <span class="stop" aria-hidden="true">${st === 'done' ? '<svg viewBox="0 0 16 16"><path d="M4 8.4l2.6 2.6L12 5.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : i + 1}</span>
      ${href ? `<a href="${href}">${l}</a>` : `<span>${l}</span>`}
      <span class="sr">${st === 'done' ? 'done' : i === current ? 'current step' : st === 'wait' ? 'waiting' : 'not started'}</span></li>`).join('')}</ol>
    ${hint ? `<p class="track-hint">${hint}</p>` : ''}</section>`;
}

// ------------------------------------------------------------------ Info
function renderInfo() {
  const a = state.me.account;
  $('#main').innerHTML = `
    <section class="section"><header><h2>Company</h2><p>Students see your company name in every message.</p></header>
      <form id="info" class="stack">${UI.infoFields(a)}
        <div class="row-end"><span class="error" id="infoErr" role="alert"></span><button class="btn primary" type="submit">Save info</button></div></form></section>
    <section class="section"><header><h2>Account</h2><p>Your sign-in and reference details.</p></header>
      <dl class="facts"><div><dt>Email</dt><dd>${esc(a.email)}</dd></div><div><dt>Client ID</dt><dd><code>${esc(a.client_id)}</code></dd></div>
        <div><dt>Member since</dt><dd>${fmtDate(a.created_at)}</dd></div><div><dt>Status</dt><dd>${UI.stagePill(a.stage)}</dd></div></dl></section>
    <section class="section"><header><h2>Password</h2><p>Changing it signs you out on other devices.</p></header>
      <form id="pw" class="stack narrow">${field('Current password', 'current', '', { type: 'password', attrs: 'required autocomplete="current-password"' })}
        ${field('New password', 'next', '', { type: 'password', hint: 'at least 8 characters, letters and numbers', attrs: 'required autocomplete="new-password"' })}
        <div class="row-end"><span class="error" id="pwErr" role="alert"></span><button class="btn" type="submit">Change password</button></div></form></section>`;
  $('#info').onsubmit = async e => {
    e.preventDefault(); $('#infoErr').textContent = '';
    await busy($('#info button[type=submit]'), async () => {
      try { await api('/me/info', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Info saved'); await reload(); }
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

// ------------------------------------------------------------------ Settings
async function renderSettings() {
  const main = $('#main'); main.innerHTML = '<p class="muted">Loading settings...</p>';
  try {
    const view = await api('/me/settings');
    UI.settingsForm(main, view, {
      save: async body => { const r = await api('/me/settings', { method: 'PUT', body }); if (state.track) { state.track.missing = r.missing; refreshTrack(); } return r; },
      test: (svc, body) => api('/me/test/' + svc, { method: 'POST', body }),
    });
  } catch (e) { if (!e.auth) main.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
function refreshTrack() { const t = $('.track'); if (t && state.track) t.outerHTML = track(state.me.account); }

// ------------------------------------------------------------------ Dashboard
function renderDash() {
  UI.dashboard($('#main'), {
    load: days => api('/me/stats?days=' + days),
    csvHref: days => '/api/me/leads.csv?days=' + days,
    notLive: `<div class="blank"><h2>Your dashboard fills in once you are live</h2>
      <p>Finish the steps above. After that you will see every lead, how the WhatsApp assistant handled it, and how your counsellors are doing.</p></div>`,
  });
}

// ------------------------------------------------------------------ Subscription
async function renderSub() {
  const main = $('#main'); main.innerHTML = '<p class="muted">Loading your plan...</p>';
  let b; try { b = await api('/me/billing'); } catch (e) { if (!e.auth) main.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  const a = b.account, plan = b.plan;
  const open = b.invoices.find(i => i.status === 'unpaid' || i.status === 'rejected');
  const review = b.invoices.find(i => i.status === 'submitted');
  const u = b.usage, limit = u.limit;
  main.innerHTML = `
    <section class="plan-now">
      <div><p class="muted small">Current plan</p><h2>${plan ? esc(plan.name) : 'No plan yet'}</h2>${UI.subPill(a.sub_status)}</div>
      <div><p class="muted small">${a.sub_status === 'expired' ? 'Ended' : 'Paid until'}</p><p class="big num">${a.sub_ends_at ? fmtDate(a.sub_ends_at) : '-'}</p>
        <p class="muted small">${a.sub_ends_at && a.days_left > 0 ? a.days_left + ' days left' : a.sub_status === 'grace' ? `Grace period: ${b.payment.grace_days} days after the end date` : ''}</p></div>
      <div><p class="muted small">Leads in the last 30 days</p><p class="big num">${u.leads_30d == null ? '-' : u.leads_30d}${limit ? ` <span class="muted">/ ${limit}</span>` : ''}</p>
        ${limit && u.leads_30d != null ? `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${u.leads_30d}" aria-label="Leads used"><span style="width:${Math.min(100, u.leads_30d / limit * 100)}%" class="${u.leads_30d > limit ? 'over' : ''}"></span></div>` : `<p class="muted small">${plan && !limit ? 'No lead limit' : ''}</p>`}</div>
    </section>
    <div id="pay">${review ? reviewBox(review) : open ? payBox(open, b.payment) : ''}</div>
    <section class="section"><header><h2>${a.sub_ends_at ? 'Renew or change plan' : 'Choose a plan'}</h2>
      <p>${a.sub_ends_at && a.sub_status !== 'expired' ? 'A renewal adds a new period after your current end date, so you never lose days.' : 'Your automation switches on after we confirm the payment.'}</p></header>
      <div class="plans">${b.plans.map(p => planCard(p, plan, !!review)).join('') || '<p class="muted">Plans are being updated. Please check back soon.</p>'}</div></section>
    <section class="section"><header><h2>Payment history</h2><p>Every invoice on your account.</p></header>
      ${b.invoices.length ? `<div class="scroll"><table class="t"><tr><th>Date</th><th>Plan</th><th class="n">Amount</th><th>Status</th><th>Reference</th><th>Period</th></tr>
        ${b.invoices.map(i => `<tr><td>${fmtDate(i.created_at)}</td><td>${esc(i.plan_name)}</td><td class="n">${money(i.amount, i.currency)}</td><td>${UI.invPill(i.status)}${i.status === 'rejected' && i.admin_note ? `<div class="muted small">${esc(i.admin_note)}</div>` : ''}</td>
          <td class="muted">${esc([i.method, i.reference].filter(Boolean).join(' / ') || '-')}</td><td class="muted">${i.period_end ? fmtDate(i.period_start) + ' to ' + fmtDate(i.period_end) : '-'}</td></tr>`).join('')}</table></div>`
      : '<p class="muted">No invoices yet.</p>'}</section>`;

  $$('[data-plan]', main).forEach(btn => btn.onclick = () => busy(btn, async () => {
    try { await api('/me/invoices', { method: 'POST', body: { plan_id: Number(btn.dataset.plan) } }); await renderSub(); $('#pay').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { toast(e.message); }
  }));
  const form = $('#payForm', main);
  if (form) form.onsubmit = async e => {
    e.preventDefault(); $('#payErr').textContent = '';
    await busy($('button[type=submit]', form), async () => {
      try { await api(`/me/invoices/${form.dataset.id}/pay`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); toast('Payment details sent. We will confirm soon.'); await reload(); }
      catch (err) { $('#payErr').textContent = err.message; }
    });
  };
}
function planCard(p, current, locked) {
  const isCur = current && current.id === p.id;
  return `<article class="plan ${isCur ? 'current' : ''}">
    <header><h3>${esc(p.name)}</h3>${isCur ? '<span class="pill good">Your plan</span>' : ''}</header>
    <p class="price"><b class="num">${p.price ? money(p.price, p.currency) : 'Ask us'}</b>${p.price ? `<span> / ${periodLabel(p.period_days)}</span>` : ''}</p>
    <p class="muted small">${p.lead_limit ? `Up to ${p.lead_limit.toLocaleString()} leads a month` : 'No lead limit'}</p>
    <ul>${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    <button class="btn ${isCur ? 'primary' : ''}" type="button" data-plan="${p.id}" ${locked ? 'disabled title="A payment is under review"' : ''}>${isCur ? 'Renew this plan' : 'Choose ' + esc(p.name)}</button>
  </article>`;
}
function payBox(i, pay) {
  return `<section class="paybox" aria-labelledby="payTitle">
    <div><h2 id="payTitle">Pay for ${esc(i.plan_name)}</h2>
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
