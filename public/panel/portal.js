/* Briefbox client portal: sign up, sign in, company info, and every automation the client uses
   (each with its own Settings, Dashboard and Subscription). */
(() => {
'use strict';
const { $, $$, esc, toast, makeApi, fmtDate, money, periodLabel, busy, field } = UI;
const app = $('#app');
const api = makeApi('/api', () => { state.me = null; if (!/^#\/(login|register)/.test(location.hash)) location.hash = '#/login'; });
const state = { me: null };

window.addEventListener('hashchange', route);
const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  file: '<path d="M6 2h9l5 5v15H6z M14 2v6h6 M9 13h6 M9 17h6"/>',
  building: '<path d="M4 21V5l8-3v19 M12 9h8v12 M7 8h2 M7 12h2 M7 16h2 M15 13h2 M15 17h2 M2 21h20"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14 M12 17.5v.01"/>',
  out: '<path d="M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10"/>',
  menu: '<path d="M4 6h16 M4 12h16 M4 18h16"/>',
  print: '<path d="M7 9V3h10v6 M7 17H4v-7h16v7h-3 M7 14h10v7H7z"/>',
};
const ico = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const hour = new Date().getHours();
const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
const invNo = id => 'BB-' + String(id).padStart(5, '0');
const skel = n => `<div class="skel">${'<div class="sk"></div>'.repeat(n || 3)}</div>`;

async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const page = parts[0] || '';
  if (page === 'login') return renderAuth('login');
  if (page === 'register') return renderAuth('register');
  try { state.me = await api('/me'); } catch (e) { if (!e.auth) fatal(e); return; }
  if (page === 'info') { shell('info'); return renderInfo(); }
  if (page === 'invoices') { shell('invoices'); return renderInvoices(); }
  if (page === 'invoice' && parts[1]) { shell('invoices'); return renderInvoice(parts[1]); }
  if (page === 'a' && parts[1]) return renderAutomation(parts[1], parts[2], parts.slice(3));
  shell('home'); renderHome();
}

// ------------------------------------------------------------------ sign in / sign up
function renderAuth(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<div class="auth">
    <aside class="auth-side">
      <a class="wordmark" href="/"><img src="/assets/logo-h-dark.png" alt="Briefbox Digital" width="400" height="145"></a>
      <div class="auth-copy"><span class="eyebrow-pill">Client portal</span><h1>Your automations, set up and followed in one place.</h1>
        <p>Choose the automations you need, connect your tools, pay, and see what each one does for your business.</p></div>
      <div class="flowcard" aria-hidden="true">
        <div class="fc-row"><span class="fc-dot ok"></span><b>New lead from Meta ads</b><small>just now</small></div>
        <div class="fc-row"><span class="fc-dot ai"></span><b>AI qualified: hot lead</b><small>4 sec</small></div>
        <div class="fc-row"><span class="fc-dot go"></span><b>Assigned to your team on WhatsApp</b><small>6 sec</small></div>
      </div>
      <ol class="auth-steps">
        <li><b>Create your account</b><span>Your company details, in two minutes.</span></li>
        <li><b>Choose your automations</b><span>Take one, or several together.</span></li>
        <li><b>Connect and pay</b><span>Fill in each automation's settings and choose a plan.</span></li>
        <li><b>We check and switch it on</b><span>Usually within one working day.</span></li>
      </ol>
    </aside>
    <main class="auth-main"><form class="auth-form" novalidate>
      <h2>${reg ? 'Create your account' : 'Welcome back'}</h2>
      <p class="muted">${reg ? 'Already have an account? <a href="#/login">Sign in</a>' : 'New to Briefbox? <a href="#/register">Create an account</a>'}</p>
      ${reg ? `<div class="grid2">${field('Your name', 'name', '', { attrs: 'required autocomplete="name"' })}${field('Company name', 'company', '', { attrs: 'required autocomplete="organization"' })}</div>` : ''}
      ${field('Work email', 'email', '', { type: 'email', attrs: 'required autocomplete="email"' })}
      ${field('Password', 'password', '', { type: 'password', hint: reg ? 'at least 8 characters, letters and numbers' : '', attrs: `required autocomplete="${reg ? 'new-password' : 'current-password'}"` })}
      ${reg ? `<div class="grid2">${field('Phone or WhatsApp', 'phone', '', { attrs: 'autocomplete="tel"' })}
        <label class="field"><span class="lab">Country</span><select name="country"><option value="">Choose</option>${['Bangladesh', 'United Kingdom', 'United States', 'Canada', 'Australia', 'Germany', 'Ireland', 'United Arab Emirates', 'India', 'Other'].map(c => `<option>${c}</option>`).join('')}</select></label></div>` : ''}
      <div class="error" id="err" role="alert"></div>
      <button class="btn primary big" type="submit">${reg ? 'Create account' : 'Sign in'}</button>
      ${reg ? '<p class="muted small">By creating an account you agree to our <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.</p>' : '<p class="muted small">Forgot your password? Email <a href="mailto:hello@briefboxdigital.com">hello@briefboxdigital.com</a> and we will reset it.</p>'}
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

// ------------------------------------------------------------------ shell: sidebar + page
const dot = st => `<i class="sdot ${{ live: 'good', review: 'info', expired: 'bad', rejected: 'bad', suspended: 'warn' }[st] || ''}"></i>`;
function shell(active, subId) {
  const a = state.me.account, subs = state.me.subs;
  app.innerHTML = `<div class="app">
  <aside class="side" id="side">
    <a class="logo" href="#/"><img src="/assets/logo-h-dark.png" alt="Briefbox Digital" width="400" height="145"></a>
    <nav class="snav" aria-label="Portal">
      <a href="#/" ${active === 'home' ? 'aria-current="page"' : ''}>${ico('home')}Overview</a>
      <div class="sgroup"><span class="slabel">${ico('bolt')}Automations</span>
        ${subs.map(s => `<a class="sub" href="#/a/${s.id}" ${String(subId) === String(s.id) ? 'aria-current="page"' : ''}>${dot(s.stage)}<span>${esc(s.product.name)}</span></a>`).join('')}
        <a class="sub add" href="#/#catalog">+ Add an automation</a></div>
      <a href="#/invoices" ${active === 'invoices' ? 'aria-current="page"' : ''}>${ico('file')}Invoices</a>
      <a href="#/info" ${active === 'info' ? 'aria-current="page"' : ''}>${ico('building')}Company info</a>
    </nav>
    <div class="helpcard"><b>Need help?</b><p>We usually reply within a few hours.</p><a class="btn small" href="mailto:hello@briefboxdigital.com">Email us</a></div>
    <div class="me"><span class="avatar" aria-hidden="true">${esc((a.name || a.company || '?').trim()[0] || '?').toUpperCase()}</span>
      <span class="who"><b>${esc(a.name || a.company)}</b><small>${esc(a.email)}</small></span>
      <button class="icon-btn" id="logout" title="Sign out" aria-label="Sign out">${ico('out')}</button></div>
  </aside>
  <div class="mtop"><button class="icon-btn" id="menu" aria-label="Menu" aria-controls="side">${ico('menu')}</button><img src="/assets/logo-h-dark.png" alt="Briefbox Digital" height="30"></div>
  <div class="page">
    ${a.status === 'suspended' ? note('warn', 'Your account is paused by Briefbox.', 'Contact hello@briefboxdigital.com to switch it back on.') : ''}
    <main id="main"></main>
  </div></div>`;
  $('#logout').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch (e) {} state.me = null; location.hash = '#/login'; };
  $('#menu').onclick = () => $('#side').classList.toggle('open');
  $$('#side a').forEach(x => x.addEventListener('click', () => $('#side').classList.remove('open')));
}
const note = (tone, title, text) => `<div class="note ${tone}"><b>${title}</b> ${text}</div>`;

// ------------------------------------------------------------------ overview
async function renderHome() {
  const main = $('#main'), a = state.me.account, subs = state.me.subs;
  main.innerHTML = skel(4);
  const [cat, inv, views] = await Promise.all([
    api('/products').then(r => r.products).catch(() => []),
    api('/me/invoices').then(r => r.invoices).catch(() => []),
    Promise.all(subs.map(s => s.stage === 'review' ? api(`/me/s/${s.id}/settings`).catch(() => null) : null)),
  ]);
  const mine = new Set(subs.map(s => s.product_id)), others = cat.filter(p => !mine.has(p.id));
  const from = p => { const pr = p.plans.filter(x => x.price > 0).sort((x, y) => x.price - y.price)[0]; return pr ? `From ${money(pr.price, pr.currency)} / ${periodLabel(pr.period_days)}` : 'Price on request'; };
  const unpaid = inv.filter(i => i.status === 'unpaid' || i.status === 'rejected'), checking = inv.filter(i => i.status === 'submitted');
  const live = subs.filter(s => s.stage === 'live'), setting = subs.filter(s => s.stage === 'review');
  const renew = subs.filter(s => s.sub_ends_at && s.sub_status !== 'expired').sort((x, y) => x.sub_ends_at - y.sub_ends_at)[0];
  const paidFor = s => ['trial', 'active', 'grace'].includes(s.sub_status);
  // the one thing to do next
  const miss = subs.map((s, i) => [s, views[i]]).find(([s, v]) => v && v.missing && v.missing.length);
  const noPlan = setting.find(s => !paidFor(s) && !inv.some(i => i.subscription_id === s.id && ['unpaid', 'submitted', 'rejected'].includes(i.status)));
  const exp = subs.find(s => s.stage === 'expired') || subs.find(s => s.renew_soon && s.stage === 'live');
  const next = !(a.phone && a.country) ? ['act', 'Add your phone and country', 'We need them to set up your automations and send you updates.', '#/info', 'Add company info']
    : miss ? ['act', `Finish the ${miss[0].product.name} settings`, `${miss[1].missing.length} thing${miss[1].missing.length === 1 ? '' : 's'} left to fill in.`, `#/a/${miss[0].id}/settings`, 'Open settings']
    : unpaid[0] ? ['act', `Pay invoice ${invNo(unpaid[0].id)}`, `${money(unpaid[0].amount, unpaid[0].currency)} for ${unpaid[0].product_name} ${unpaid[0].plan_name}. After paying, send us the transaction ID.`, `#/invoice/${unpaid[0].id}`, 'View invoice']
    : noPlan ? ['act', `Choose a plan for ${noPlan.product.name}`, 'Your automation is switched on after the first payment.', `#/a/${noPlan.id}/subscription`, 'See plans']
    : exp ? ['act', `Renew ${exp.product.name}`, exp.stage === 'expired' ? 'The plan has ended, so it is switched off.' : `The plan ends on ${fmtDate(exp.sub_ends_at)}.`, `#/a/${exp.id}/subscription`, 'Renew now']
    : checking[0] ? ['wait', 'We are checking your payment', `Reference ${checking[0].reference} for ${money(checking[0].amount, checking[0].currency)}. We email you a receipt when it is confirmed.`, `#/invoice/${checking[0].id}`, 'View invoice']
    : setting[0] ? ['wait', `We are reviewing ${setting[0].product.name}`, 'Usually within one working day. We email you as soon as it is live.', `#/a/${setting[0].id}`, 'Open']
    : !subs.length ? ['act', 'Choose your first automation', 'Each automation has its own settings, dashboard and plan.', '#catalog', 'See automations']
    : ['ok', 'Everything is running', `${live.length} automation${live.length === 1 ? ' is' : 's are'} live. Check the dashboards to see results.`, live[0] ? `#/a/${live[0].id}/dashboard` : '#/', 'Open dashboard'];
  const progress = (s, v) => {
    if (s.stage === 'live') return 100;
    let n = 1; if (a.phone && a.country) n++; if (v && !v.missing.length) n++; if (paidFor(s) || inv.some(i => i.subscription_id === s.id && i.status === 'submitted')) n++;
    return Math.round(n / 5 * 100);
  };
  main.innerHTML = `
    <section class="hello rise" style="--i:0">
      <div><p class="muted">${hello}, ${esc((a.name || '').split(' ')[0] || a.company)}</p><h1>${esc(a.company)}</h1>
        <p class="hsub">Client ID <code>${esc(a.client_id)}</code> · member since ${fmtDate(a.created_at)}</p></div>
      <div class="next ${next[0]}"><span class="nk">${next[0] === 'act' ? 'Next step' : next[0] === 'wait' ? 'In progress' : 'All good'}</span>
        <b>${esc(next[1])}</b><p>${esc(next[2])}</p><a class="btn ${next[0] === 'act' ? 'primary' : ''} small" href="${next[3]}">${esc(next[4])}</a></div>
    </section>
    <section class="stats rise" style="--i:1">
      <div class="stat"><span>Live automations</span><b class="num">${live.length}<small> / ${subs.length}</small></b></div>
      <div class="stat"><span>Being set up</span><b class="num">${setting.length}</b></div>
      <div class="stat"><span>Next renewal</span><b>${renew ? fmtDate(renew.sub_ends_at) : '-'}</b>${renew ? `<small>${esc(renew.product.name)}</small>` : ''}</div>
      <div class="stat ${unpaid.length ? 'warn' : ''}"><span>Unpaid invoices</span><b class="num">${unpaid.length}</b>${unpaid.length ? `<small>${unpaid.map(i => money(i.amount, i.currency)).join(' + ')}</small>` : ''}</div>
    </section>
    <section class="rise" style="--i:2"><div class="shead"><h2>Your automations</h2></div>
      ${subs.length ? `<div class="acards">${subs.map((s, i) => { const pc = progress(s, views[i]); return `<a class="acard" href="#/a/${s.id}">
        <span class="aic" aria-hidden="true">${esc(s.product.icon || '⚙️')}</span>
        <span class="abody"><b>${esc(s.product.name)}</b><small>${s.plan ? esc(s.plan.name) + ' plan' : 'No plan yet'}${s.sub_ends_at ? ` · ${s.sub_status === 'expired' ? 'ended' : 'until'} ${fmtDate(s.sub_ends_at)}` : ''}</small></span>
        ${UI.stagePill(s.stage)}
        <span class="abar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pc}" aria-label="Setup progress"><span style="width:${pc}%"></span></span>
        <small class="apc">${s.stage === 'live' ? 'Running' : pc + '% set up'}</small></a>`; }).join('')}</div>`
        : '<div class="empty">No automations yet. Choose your first one below; you can add more any time.</div>'}
    </section>
    ${others.length ? `<section id="catalog" class="rise" style="--i:3"><div class="shead"><h2>Add an automation</h2><p class="muted">Each one has its own settings, dashboard and plan.</p></div>
      <div class="pcards">${others.map(p => `<article class="pcard">
        <span class="aic" aria-hidden="true">${esc(p.icon || '⚙️')}</span><h3>${esc(p.name)}</h3>
        <p class="muted">${esc(p.short)}</p><p class="from">${from(p)}</p>
        <button class="btn primary" type="button" data-add="${esc(p.slug)}">Add ${esc(p.name)}</button></article>`).join('')}</div></section>` : ''}`;
  $$('[data-add]', main).forEach(b => b.onclick = () => busy(b, async () => {
    try { const r = await api('/me/subscriptions', { method: 'POST', body: { product: b.dataset.add } }); toast('Added. Fill in its settings next.'); location.hash = `#/a/${r.sub.id}/settings`; }
    catch (e) { toast(e.message); }
  }));
  if (location.hash.includes('catalog')) { const c = $('#catalog'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }
}

// ------------------------------------------------------------------ invoices
async function renderInvoices() {
  const main = $('#main'); main.innerHTML = skel(3);
  let r; try { r = await api('/me/invoices'); } catch (e) { if (!e.auth) main.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  main.innerHTML = `<div class="phead"><h1>Invoices</h1><p class="muted">Every invoice and receipt. Open one to print it or save it as a PDF.</p></div>
    ${r.invoices.length ? `<div class="card"><div class="scroll"><table class="t"><tr><th>Invoice</th><th>Date</th><th>Automation</th><th class="n">Amount</th><th>Status</th></tr>
      ${r.invoices.map(i => `<tr class="link" data-href="#/invoice/${i.id}" tabindex="0"><td><b>${invNo(i.id)}</b></td><td>${fmtDate(i.created_at)}</td><td>${esc(i.product_name)} · ${esc(i.plan_name)}</td>
        <td class="n">${money(i.amount, i.currency)}</td><td>${UI.invPill(i.status)}</td></tr>`).join('')}</table></div></div>`
      : '<div class="empty">No invoices yet. Choose a plan for one of your automations to get your first invoice.</div>'}`;
  $$('tr[data-href]', main).forEach(t => { t.onclick = () => { location.hash = t.dataset.href; }; t.onkeydown = e => { if (e.key === 'Enter') location.hash = t.dataset.href; }; });
}
async function renderInvoice(id) {
  const main = $('#main'); main.innerHTML = skel(4);
  let r; try { r = await api(`/me/invoices/${id}`); } catch (e) { if (!e.auth) main.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  const i = r.invoice, a = r.account, S = r.seller, open = i.status === 'unpaid' || i.status === 'rejected';
  const stamp = { paid: ['Paid', 'good'], submitted: ['Payment under review', 'info'], unpaid: ['Waiting for payment', 'warn'], rejected: ['Payment not found', 'bad'], void: ['Cancelled', ''] }[i.status] || [i.status, ''];
  main.innerHTML = `<div class="phead noprint"><a class="muted small" href="#/invoices">← All invoices</a>
      <div class="row-end"><button class="btn" id="print">${ico('print')}Print or save PDF</button>${open ? `<a class="btn primary" href="#/a/${i.subscription_id}/subscription">Send payment details</a>` : ''}</div></div>
    <article class="invdoc">
      <header class="ih"><img src="/assets/logo-h-dark.png" alt="${esc(S.name)}" width="400" height="145">
        <div class="ir"><h1>${i.status === 'paid' ? 'Receipt' : 'Invoice'}</h1><p><b>${esc(i.number)}</b></p><p class="muted">Issued ${fmtDate(i.created_at)}</p></div></header>
      <div class="iparties"><div><span class="lab">From</span><b>${esc(S.name)}</b><p>${[S.address, S.email, S.phone].filter(Boolean).map(esc).join('<br>')}</p></div>
        <div><span class="lab">Billed to</span><b>${esc(a.company)}</b><p>${[a.name, a.address, a.country, a.email, a.phone].filter(Boolean).map(esc).join('<br>')}</p><p class="muted small">Client ID ${esc(a.client_id)}</p></div>
        <div><span class="lab">Status</span><span class="pill ${stamp[1]}">${stamp[0]}</span>${i.paid_at ? `<p class="small">Paid ${fmtDate(i.paid_at)}${i.method ? ' by ' + esc(i.method) : ''}${i.reference ? '<br>Ref ' + esc(i.reference) : ''}</p>` : ''}</div></div>
      <table class="t itable"><tr><th>Description</th><th>Period</th><th class="n">Amount</th></tr>
        <tr><td><b>${esc(i.product_name)}</b><div class="muted small">${esc(i.plan_name)} plan · ${periodLabel(i.period_days)}</div></td>
          <td>${i.period_end ? fmtDate(i.period_start) + ' – ' + fmtDate(i.period_end) : periodLabel(i.period_days) + ' from payment'}</td><td class="n">${money(i.amount, i.currency)}</td></tr></table>
      <div class="itotal"><span>Total</span><b>${money(i.amount, i.currency)}</b></div>
      ${open && r.payment.payment_instructions ? `<div class="ipay"><h2>How to pay</h2><pre class="instructions">${esc(r.payment.payment_instructions)}</pre>
        <p class="small muted">After paying, send the transaction ID from the automation's Subscription tab, or the button above.</p></div>` : ''}
      <footer class="ifoot">Thank you for working with ${esc(S.name)}. Questions about this invoice: ${esc(S.email || '')}</footer>
    </article>`;
  $('#print').onclick = () => window.print();
}

// ------------------------------------------------------------------ company info
function renderInfo() {
  const a = state.me.account;
  $('#main').innerHTML = `<div class="phead"><h1>Company info</h1><p class="muted">Used in your automations' messages and on your invoices.</p></div>
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
async function renderAutomation(id, tab, rest = []) {
  shell('auto', id);
  const main = $('#main'); main.innerHTML = skel(4);
  let b, view = null;
  try { b = await api(`/me/s/${id}`); } catch (e) { if (!e.auth) main.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  const s = b.sub, p = b.product, base = `#/a/${s.id}`;
  const isHr = p.kind === 'hr', hrOn = isHr && s.stage === 'live' && ['trial', 'active', 'grace'].includes(s.sub_status);
  const tabs = isHr ? (hrOn ? [['hr', 'HR dashboard'], ['subscription', 'Subscription']] : [['settings', 'Setup'], ['subscription', 'Subscription']]) : [['settings', 'Settings'], ['dashboard', 'Dashboard'], ['subscription', 'Subscription']];
  if (!tabs.some(t => t[0] === tab)) { location.replace(`${base}/${tabs[0][0] === 'settings' && s.stage === 'live' && !isHr ? 'dashboard' : tabs[0][0]}`); return; }
  if (s.stage !== 'live') { try { view = await api(`/me/s/${s.id}/settings`); } catch (e) { view = null; } }
  main.innerHTML = `
    <div class="autohead"><a href="#/" class="muted small">← Overview</a>
      <div class="ahrow"><span class="aic big" aria-hidden="true">${esc(p.icon || '⚙️')}</span><div><h1>${esc(p.name)}</h1>${p.short ? `<p class="muted">${esc(p.short)}</p>` : ''}</div></div>
      <p class="sub">${UI.stagePill(s.stage)} ${b.plan ? `<span>${esc(b.plan.name)} plan</span>` : ''} ${s.sub_ends_at ? `<span>${s.sub_status === 'expired' ? 'ended' : 'paid until'} ${fmtDate(s.sub_ends_at)}</span>` : ''}
        ${!s.live && !b.invoices.some(i => ['paid', 'submitted'].includes(i.status)) ? '<button class="btn small ghost" id="rm">Remove</button>' : ''}</p></div>
    ${banner(s)}
    ${view ? track(s, view, b.invoices) : ''}
    <nav class="tabs subtabs" aria-label="${esc(p.name)}">${tabs.map(([k, l]) => `<a href="${base}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div id="tab"></div>`;
  const rm = $('#rm');
  if (rm) rm.onclick = async () => { if (!confirm(`Remove ${p.name} from your account?`)) return; try { await api(`/me/s/${s.id}`, { method: 'DELETE' }); toast('Removed'); location.hash = '#/'; } catch (e) { toast(e.message); } };
  const el = $('#tab');
  if (tab === 'hr') { $('.autohead', main).classList.add('compact'); return window.HRApp.mount(el, { api, sub: s, parts: rest }); }
  if (tab === 'settings' && isHr) { el.innerHTML = `<section class="section"><header><h2>Nothing to connect</h2><p>The HR automation runs inside Briefbox. Choose a plan on the Subscription tab. Once we approve it, your HR dashboard opens here: employees, attendance, leave, payroll, recruitment and policies.</p></header></section>`; return; }
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
        ${b.invoices.map(i => `<tr><td><a href="#/invoice/${i.id}">${fmtDate(i.created_at)}</a></td><td>${esc(i.plan_name)}</td><td class="n">${money(i.amount, i.currency)}</td><td>${UI.invPill(i.status)}${i.status === 'rejected' && i.admin_note ? `<div class="muted small">${esc(i.admin_note)}</div>` : ''}</td>
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
    <div><h2 id="payTitle">Pay for ${esc(i.product_name || '')} ${esc(i.plan_name)}</h2><p class="muted small">Invoice <a href="#/invoice/${i.id}">${invNo(i.id)}</a>. We also emailed it to you.</p>
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
  Sent ${UI.fmtDateTime(i.submitted_at)} with reference <code>${esc(i.reference)}</code>. Your plan updates as soon as it is confirmed. <a href="#/invoice/${i.id}">View invoice ${invNo(i.id)}</a></div>`;

route();
})();
