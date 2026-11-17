/* Lead Engine pages inside the admin panel: overview, clients, payments, plans, billing, n8n connection. */
(() => {
'use strict';
const { $, $$, esc, toast, makeApi, fmtDate, fmtDateTime, money, periodLabel, busy, field, area } = UI;
const api = makeApi('/api/admin/le', () => { location.reload(); });
let W0 = null;
const put = html => { W0.innerHTML = html; };
const loading = () => put('<p class="muted">Loading...</p>');
const errBox = e => `<p class="error">${esc(e.message)}</p>`;
const counts = async () => { if (window.ADM) await ADM.refreshCounts(); };
const rerender = () => window.ADM && ADM.rerender();

// ------------------------------------------------------------------ overview
async function renderOverview() {
  loading();
  let o; try { o = await api('/overview');  } catch (e) { if (!e.auth) W0.innerHTML = errBox(e); return; }
  const c = o.counts;
  const rev = o.revenue_month.length ? o.revenue_month.map(r => money(r.total, r.currency)).join(' + ') : money(0, 'USD');
  put(`
    <div class="pagehead"><div><h1>Overview</h1><p class="sub">What needs your attention today.</p></div><a class="btn" href="#le-new">Add client</a></div>
    <div class="kpis">
      ${kpi(c.live, 'Live clients', 'automation running or ready')}
      ${kpi(c.review, 'Waiting for approval', 'new sign ups')}
      ${kpi(c.payments, 'Payments to check', 'sent by clients')}
      ${kpi(c.expired, 'Expired', 'automation off')}
      ${kpi(c.suspended, 'Paused by you', '')}
      ${kpi(rev, 'Paid this month', 'confirmed payments')}
    </div>
    <div class="lists">
      <section class="panel wide"><h2>Payments to check</h2><p class="cap">Confirm the money arrived, then mark it paid. The plan updates instantly.</p>
        ${o.payments.length ? payTable(o.payments, true) : '<p class="muted small">Nothing waiting.</p>'}</section>
      <section class="panel"><h2>Waiting for approval</h2><p class="cap">Check their settings, then approve to create the automation.</p>
        ${o.pending.length ? acctTable(o.pending, ['company', 'email', 'created']) : '<p class="muted small">No new sign ups.</p>'}</section>
      <section class="panel wide"><h2>Plans ending soon</h2><p class="cap">Live clients whose paid period ends within the reminder window.</p>
        ${o.expiring.length ? acctTable(o.expiring, ['company', 'plan', 'ends']) : '<p class="muted small">No plans end soon.</p>'}</section>
    </div>`);
  bindRows(); bindPay(renderOverview);
}
const kpi = (v, l, d) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div><div class="d">${esc(d)}</div></div>`;

function acctTable(list, cols) {
  const H = { company: 'Client', email: 'Email', stage: 'Status', plan: 'Plan', ends: 'Paid until', created: 'Signed up', last: 'Last sign in' };
  const cell = (a, c) => ({
    company: `<b>${esc(a.company)}</b><div class="muted small">${esc(a.client_id)}</div>`, email: esc(a.email), stage: UI.stagePill(a.stage) + (a.invoices_to_review ? ' <span class="pill info">payment sent</span>' : ''),
    plan: esc(a.plan_name || '-'), ends: a.sub_ends_at ? `${fmtDate(a.sub_ends_at)} ${UI.subPill(a.sub_status)}` : '-', created: fmtDate(a.created_at),
    last: a.last_login_at ? fmtDateTime(a.last_login_at) : '-',
  }[c]);
  return `<div class="scroll"><table class="t"><tr>${cols.map(c => `<th>${H[c]}</th>`).join('')}</tr>
    ${list.map(a => `<tr class="link" data-href="#le-a/${a.id}/info" tabindex="0">${cols.map(c => `<td>${cell(a, c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
}
function bindRows() {
  $$('tr[data-href]').forEach(r => { r.onclick = e => { if (!e.target.closest('button,a')) location.hash = r.dataset.href; };
    r.onkeydown = e => { if (e.key === 'Enter') location.hash = r.dataset.href; }; });
}
function payTable(list, withClient) {
  return `<div class="scroll"><table class="t"><tr>${withClient ? '<th>Client</th>' : ''}<th>Plan</th><th class="n">Amount</th><th>Paid with</th><th>Sent</th><th></th></tr>
    ${list.map(i => `<tr>${withClient ? `<td><a href="#le-a/${i.account_id}/subscription">${esc(i.company)}</a></td>` : ''}<td>${esc(i.plan_name)}</td><td class="n">${money(i.amount, i.currency)}</td>
      <td>${i.status === 'submitted' ? `${esc(i.method)}<div class="small"><code>${esc(i.reference)}</code></div>${i.payer_note ? `<div class="muted small">${esc(i.payer_note)}</div>` : ''}` : UI.invPill(i.status)}</td>
      <td class="muted">${i.submitted_at ? fmtDateTime(i.submitted_at) : fmtDate(i.created_at)}</td>
      <td><div class="actions">${i.status === 'submitted' ? `<button class="btn small primary" data-paid="${i.id}">Mark paid</button><button class="btn small danger" data-reject="${i.id}">Not received</button>`
        : `<button class="btn small" data-paid="${i.id}">Mark paid</button>`}</div></td></tr>`).join('')}</table></div>`;
}
function bindPay(after) {
  $$('[data-paid]').forEach(b => b.onclick = () => busy(b, async () => {
    try { const r = await api(`/invoices/${b.dataset.paid}/paid`, { method: 'POST', body: {} }); toast(r.warning || 'Marked paid. Plan extended.'); await counts(); after(); } catch (e) { toast(e.message); }
  }));
  $$('[data-reject]').forEach(b => b.onclick = async () => {
    const note = await ask('Payment not received', 'Tell the client what to check. They see this message.', 'We could not find this transaction ID. Please check it and send again.');
    if (note == null) return;
    try { await api(`/invoices/${b.dataset.reject}/reject`, { method: 'POST', body: { note } }); toast('Client asked to check the payment'); await counts(); after(); } catch (e) { toast(e.message); }
  });
}
function ask(title, text, value = '', { input = 'textarea', okLabel = 'Send' } = {}) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog" class="stack"><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      ${input === 'textarea' ? `<textarea name="v">${esc(value)}</textarea>` : input ? `<input type="${input}" name="v" value="${esc(value)}">` : ''}
      <div class="row-end"><button class="btn" value="cancel" type="button">Cancel</button><button class="btn primary" value="ok">${esc(okLabel)}</button></div></form>`;
    document.body.appendChild(d); d.showModal();
    $('button[value=cancel]', d).onclick = () => d.close('cancel');
    d.onclose = () => { const v = d.returnValue === 'ok' ? (d.querySelector('[name=v]') ? d.querySelector('[name=v]').value : '') : null; d.remove(); resolve(v); };
  });
}
function reveal(title, text, secret) {
  const d = document.createElement('dialog');
  d.innerHTML = `<div class="stack"><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><p><code style="font-size:16px;padding:6px 10px">${esc(secret)}</code></p>
    <div class="row-end"><button class="btn" data-copy="${esc(secret)}">Copy</button><button class="btn primary" id="close">Done</button></div></div>`;
  document.body.appendChild(d); d.showModal(); UI.bindCopy(d);
  $('#close', d).onclick = () => { d.close(); d.remove(); };
}

// ------------------------------------------------------------------ clients
async function renderClients(filter) {
  loading();
  let list; try { list = (await api('/accounts')).accounts; } catch (e) { if (!e.auth) W0.innerHTML = errBox(e); return; }
  await counts();
  const F = [['all', 'All'], ['review', 'Waiting for approval'], ['live', 'Live'], ['expired', 'Expired'], ['suspended', 'Paused'], ['rejected', 'Not approved']];
  const shown = filter === 'all' ? list : list.filter(a => a.stage === filter);
  put(`
    <div class="pagehead"><div><h1>Clients</h1><p class="sub">${list.length} account${list.length === 1 ? '' : 's'}</p></div><a class="btn" href="#le-new">Add client</a></div>
    <div class="filters range" role="group" aria-label="Filter">${F.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filter}">${l} <span class="muted">${k === 'all' ? list.length : list.filter(a => a.stage === k).length}</span></button>`).join('')}</div>
    ${shown.length ? acctTable(shown, ['company', 'email', 'stage', 'plan', 'ends', 'last']) : '<div class="blank"><h2>No clients here</h2><p>Clients who sign up on the portal appear in this list.</p></div>'}`);
  $$('[data-f]').forEach(b => b.onclick = () => { location.hash = '#le-clients/' + b.dataset.f; });
  bindRows();
}

async function renderNew() {
  put(`<div class="pagehead"><div><h1>Add client</h1><p class="sub">For clients you onboard yourself. They get a temporary password to sign in.</p></div></div>
    <form id="nf" class="stack" style="max-width:720px">${field('Sign-in email', 'email', '', { type: 'email', attrs: 'required' })}${UI.infoFields({})}
      <div class="row-end"><span class="error" id="err" role="alert"></span><a class="btn ghost" href="#le-clients">Cancel</a><button class="btn primary" type="submit">Create account</button></div></form>`);
  $('#nf').onsubmit = async e => {
    e.preventDefault(); $('#err').textContent = '';
    await busy($('#nf button[type=submit]'), async () => {
      try { const r = await api('/accounts', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        location.hash = `#le-a/${r.account.id}/info`;
        setTimeout(() => reveal('Account created', 'Send this temporary password to the client. It is shown only once. They can change it on the Info tab.', r.temp_password), 300); }
      catch (err) { $('#err').textContent = err.message; }
    });
  };
}

// ------------------------------------------------------------------ one client
async function renderAccount(id, tab) {
  loading();
  let r; try { r = await api('/accounts/' + id); } catch (e) { if (!e.auth) W0.innerHTML = errBox(e); return; }
  const a = r.account;
  const tabs = [['info', 'Info'], ['settings', 'Settings'], ['dashboard', 'Dashboard'], ['subscription', 'Subscription']];
  const acts = [];
  if (a.status === 'pending') acts.push(['approve', 'Approve and create automation', 'primary'], ['reject', 'Do not approve', 'danger']);
  if (a.status === 'active') acts.push(['suspend', 'Pause client', 'danger']);
  if (a.status === 'suspended') acts.push(['resume', 'Switch back on', 'primary']);
  if (a.status === 'rejected') acts.push(['reopen', 'Move back to review', '']);
  put(`
    <div class="pagehead"><div><p class="muted small"><a href="#le-clients">Clients</a></p><h1>${esc(a.company)}</h1>
      <p class="sub">${UI.stagePill(a.stage)} <span>${esc(a.email)}</span> <code>${esc(a.client_id)}</code>${r.plan ? ` <span>${esc(r.plan.name)}</span>` : ''}${a.sub_ends_at ? ` <span>paid until ${fmtDate(a.sub_ends_at)}</span>` : ''}</p></div>
      <div class="actions">${acts.map(([k, l, c]) => `<button class="btn ${c}" data-act="${k}">${l}</button>`).join('')}</div></div>
    ${a.status_note ? `<div class="note warn"><b>Note shown to the client:</b> ${esc(a.status_note)}</div>` : ''}
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#le-a/${a.id}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div id="tab"></div>`);
  $$('[data-act]').forEach(b => b.onclick = () => act(a, b.dataset.act, b));
  const el = $('#tab');
  if (tab === 'info') return accInfo(el, a);
  if (tab === 'settings') return accSettings(el, a);
  if (tab === 'dashboard') return UI.dashboard(el, { load: d => api(`/accounts/${a.id}/stats?days=${d}`), csvHref: d => `/api/admin/le/accounts/${a.id}/leads.csv?days=${d}`,
    notLive: '<div class="blank"><h2>Not live yet</h2><p>The dashboard fills once the client is approved and leads arrive.</p></div>' });
  if (tab === 'subscription') return accSub(el, a, r);
}
async function act(a, k, btn) {
  let body = {};
  if (k === 'suspend' || k === 'reject') {
    const note = await ask(k === 'suspend' ? 'Pause this client' : 'Do not approve', 'The client sees this note in their portal.', k === 'suspend' ? 'Your automation is paused. Please contact us.' : '');
    if (note == null) return; body = { note };
  }
  await busy(btn, async () => {
    try { const r = await api(`/accounts/${a.id}/${k}`, { method: 'POST', body });
      toast(r.warning || ({ approve: 'Approved. Automation created.', suspend: 'Client paused', resume: 'Client switched back on', reject: 'Marked as not approved', reopen: 'Moved back to review' })[k]);
      await counts(); rerender(); }
    catch (e) { toast(e.errors ? 'Not ready: ' + e.errors.join(' ') : e.message); }
  });
}
function accInfo(el, a) {
  el.innerHTML = `
    <section class="section"><header><h2>Company</h2><p>What the client entered. You can correct it.</p></header>
      <form id="info" class="stack">${UI.infoFields(a)}${area('Private notes', 'admin_notes', a.admin_notes || '', { hint: 'only admins see this' })}
        <div class="row-end"><span class="error" id="infoErr"></span><button class="btn primary" type="submit">Save</button></div></form></section>
    <section class="section"><header><h2>Account</h2><p>Sign-in and automation details.</p></header>
      <div class="stack"><dl class="facts"><div><dt>Email</dt><dd>${esc(a.email)}</dd></div><div><dt>Client ID</dt><dd><code>${esc(a.client_id)}</code></dd></div>
        <div><dt>Signed up</dt><dd>${fmtDate(a.created_at)}</dd></div><div><dt>Approved</dt><dd>${fmtDate(a.approved_at)}</dd></div>
        <div><dt>Last sign in</dt><dd>${a.last_login_at ? fmtDateTime(a.last_login_at) : '-'}</dd></div><div><dt>n8n workflow</dt><dd>${a.workflow_id ? `<code>${esc(a.workflow_id)}</code>` : 'Not created yet'}</dd></div></dl>
        <div class="actions"><button class="btn" id="resetPw">Reset password</button></div></div></section>
    ${a.workflow_id ? '' : `<section class="section"><header><h2>Existing workflow</h2><p>Already built this client in n8n before the portal? Link it instead of approving.</p></header>
      <div class="stack" id="linkBox"><p class="muted small">Loading workflows...</p></div></section>`}`;
  $('#info').onsubmit = async e => {
    e.preventDefault(); $('#infoErr').textContent = '';
    await busy($('#info button[type=submit]'), async () => {
      try { await api(`/accounts/${a.id}/info`, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Saved'); }
      catch (err) { $('#infoErr').textContent = err.message; }
    });
  };
  $('#resetPw').onclick = async () => {
    if ((await ask('Reset password?', 'The client is signed out and needs the new temporary password to sign in.', '', { input: null, okLabel: 'Reset password' })) == null) return;
    try { const r = await api(`/accounts/${a.id}/password`, { method: 'POST', body: {} }); reveal('New temporary password', 'Send this to the client. It is shown only once.', r.temp_password); }
    catch (e) { toast(e.message); }
  };
  if (!a.workflow_id) api('/workflows/unlinked').then(r => {
    const box = $('#linkBox'); if (!box) return;
    box.innerHTML = r.workflows.length ? `<label class="field"><span class="lab">Workflow</span><select id="wfSel">${r.workflows.map(w => `<option value="${esc(w.id)}">${esc(w.name)}${w.active ? ' (running)' : ''}</option>`).join('')}</select></label>
      <div><button class="btn" id="linkBtn">Link workflow</button></div><p class="muted small">Its settings are copied into this account. The client ID changes to the workflow's.</p>`
      : '<p class="muted small">No unlinked "LE Client" workflows in n8n.</p>';
    const b = $('#linkBtn'); if (b) b.onclick = () => busy(b, async () => {
      try { const x = await api(`/accounts/${a.id}/link`, { method: 'POST', body: { workflow_id: $('#wfSel').value } }); toast(x.warning || 'Linked'); rerender(); } catch (e) { toast(e.message); }
    });
  }).catch(e => { const box = $('#linkBox'); if (box) box.innerHTML = errBox(e); });
}
async function accSettings(el, a) {
  el.innerHTML = '<p class="muted">Loading settings...</p>';
  try {
    const view = await api(`/accounts/${a.id}/settings`);
    UI.settingsForm(el, view, { admin: true, save: body => api(`/accounts/${a.id}/settings`, { method: 'PUT', body }), test: (s, body) => api(`/accounts/${a.id}/test/${s}`, { method: 'POST', body }) });
  } catch (e) { el.innerHTML = errBox(e); }
}
function accSub(el, a, r) {
  const plans = r.plans;
  const toISO = ms => ms ? new Date(ms).toISOString().slice(0, 10) : '';
  el.innerHTML = `
    <section class="section"><header><h2>Subscription</h2><p>Set the plan and end date by hand, for example for free months or corrections.</p></header>
      <form id="subf" class="stack"><div class="grid2">
        <label class="field"><span class="lab">Plan</span><select name="plan_id"><option value="">None</option>${plans.map(p => `<option value="${p.id}" ${p.id === a.plan_id ? 'selected' : ''}>${esc(p.name)}${p.is_active ? '' : ' (hidden)'}</option>`).join('')}</select></label>
        ${field('Paid until', 'ends_at', toISO(a.sub_ends_at), { type: 'date' })}</div>
        <p class="muted small">Now: ${UI.subPill(a.sub_status)} ${a.sub_ends_at ? (a.days_left >= 0 ? a.days_left + ' days left' : -a.days_left + ' days ago') : ''}</p>
        <div class="row-end"><button class="btn" type="submit">Update subscription</button></div></form></section>
    <section class="section"><header><h2>Record a payment</h2><p>For money you received directly. Adds one period of the plan.</p></header>
      <form id="recf" class="stack"><div class="grid2">
        <label class="field"><span class="lab">Plan</span><select name="plan_id">${plans.map(p => `<option value="${p.id}" ${p.id === a.plan_id ? 'selected' : ''}>${esc(p.name)} - ${money(p.price, p.currency)} / ${periodLabel(p.period_days)}</option>`).join('')}</select></label>
        ${field('Amount', 'amount', '', { type: 'number', hint: 'empty = plan price', attrs: 'min="0" step="0.01"' })}
        ${field('Paid with', 'method', 'Bank transfer')}${field('Reference', 'reference', '')}</div>
        <div class="row-end"><button class="btn primary" type="submit">Record payment</button></div></form></section>
    <section class="section"><header><h2>Invoices</h2><p>Everything on this account.</p></header>
      ${r.invoices.length ? `<div class="scroll"><table class="t"><tr><th>Date</th><th>Plan</th><th class="n">Amount</th><th>Status</th><th>Reference</th><th>Period</th><th></th></tr>
        ${r.invoices.map(i => `<tr><td>${fmtDate(i.created_at)}</td><td>${esc(i.plan_name)}</td><td class="n">${money(i.amount, i.currency)}</td><td>${UI.invPill(i.status)}</td>
          <td class="muted">${esc([i.method, i.reference].filter(Boolean).join(' / ') || '-')}${i.payer_note ? `<div class="small">${esc(i.payer_note)}</div>` : ''}</td>
          <td class="muted">${i.period_end ? fmtDate(i.period_start) + ' to ' + fmtDate(i.period_end) : '-'}</td>
          <td><div class="actions">${i.status === 'submitted' ? `<button class="btn small primary" data-paid="${i.id}">Mark paid</button><button class="btn small danger" data-reject="${i.id}">Not received</button>` : i.status === 'unpaid' ? `<button class="btn small" data-paid="${i.id}">Mark paid</button>` : ''}</div></td></tr>`).join('')}</table></div>`
      : '<p class="muted">No invoices yet.</p>'}</section>`;
  bindPay(() => renderAccount(a.id, 'subscription'));
  $('#subf').onsubmit = async e => {
    e.preventDefault();
    await busy($('#subf button'), async () => {
      try { const x = await api(`/accounts/${a.id}/subscription`, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast(x.warning || 'Subscription updated'); renderAccount(a.id, 'subscription'); }
      catch (err) { toast(err.message); }
    });
  };
  $('#recf').onsubmit = async e => {
    e.preventDefault();
    await busy($('#recf button'), async () => {
      try { const x = await api(`/accounts/${a.id}/invoices`, { method: 'POST', body: { ...Object.fromEntries(new FormData(e.target)), paid: true } }); toast(x.warning || 'Payment recorded. Plan extended.'); renderAccount(a.id, 'subscription'); }
      catch (err) { toast(err.message); }
    });
  };
}

// ------------------------------------------------------------------ payments
async function renderPayments() {
  loading();
  let r; try { r = await api('/invoices'); } catch (e) { if (!e.auth) W0.innerHTML = errBox(e); return; }
  await counts();
  const sent = r.review.filter(i => i.status === 'submitted'), open = r.review.filter(i => i.status === 'unpaid');
  put(`
    <div class="pagehead"><div><h1>Payments</h1><p class="sub">Check your bKash, bank or Wise account for each reference before marking it paid.</p></div></div>
    <section class="panel" style="margin-bottom:22px"><h2>Sent by clients</h2><p class="cap">The client says they paid. Waiting for you to confirm.</p>
      ${sent.length ? payTable(sent, true) : '<p class="muted small">Nothing to check.</p>'}</section>
    <section class="panel" style="margin-bottom:22px"><h2>Invoices not paid yet</h2><p class="cap">The client chose a plan but has not sent payment details.</p>
      ${open.length ? payTable(open, true) : '<p class="muted small">None.</p>'}</section>
    <section class="panel"><h2>Recent decisions</h2><p class="cap">The last 50 payments you confirmed or sent back.</p>
      ${r.recent.length ? `<div class="scroll"><table class="t"><tr><th>Client</th><th>Plan</th><th class="n">Amount</th><th>Status</th><th>Reference</th><th>Date</th></tr>
        ${r.recent.map(i => `<tr><td><a href="#le-a/${i.account_id}/subscription">${esc(i.company)}</a></td><td>${esc(i.plan_name)}</td><td class="n">${money(i.amount, i.currency)}</td><td>${UI.invPill(i.status)}</td>
          <td class="muted">${esc([i.method, i.reference].filter(Boolean).join(' / ') || '-')}</td><td class="muted">${fmtDate(i.paid_at || i.created_at)}</td></tr>`).join('')}</table></div>` : '<p class="muted small">None yet.</p>'}</section>`);
  bindPay(renderPayments);
}

// ------------------------------------------------------------------ plans
async function renderPlans() {
  loading();
  let plans; try { plans = (await api('/plans')).plans; } catch (e) { if (!e.auth) W0.innerHTML = errBox(e); return; }
  const row = p => `<form class="panel stack plan-form" data-id="${p.id || ''}">
    <div class="plan-edit">${field('Name', 'name', p.name || '', { attrs: 'required' })}${field('Price', 'price', p.price ?? '', { type: 'number', attrs: 'min="0" step="0.01"' })}
      ${field('Currency', 'currency', p.currency || 'USD', { attrs: 'maxlength="3"' })}${field('Days per period', 'period_days', p.period_days || 30, { type: 'number', attrs: 'min="1"' })}
      ${field('Leads a month', 'lead_limit', p.lead_limit ?? 0, { type: 'number', hint: '0 = no limit', attrs: 'min="0"' })}</div>
    ${area('What is included', 'features', (p.features || []).join('\n'), { hint: 'one per line' })}
    <div class="row-end"><label class="switch"><input type="checkbox" name="is_active" ${p.is_active !== false ? 'checked' : ''}> <span>Shown to clients</span></label>
      ${field('Order', 'sort', p.sort ?? 0, { type: 'number' })}<button class="btn primary" type="submit">${p.id ? 'Save plan' : 'Add plan'}</button></div></form>`;
  put(`<div class="pagehead"><div><h1>Plans</h1><p class="sub">Prices clients see on their Subscription tab. Changing a price does not change invoices already made.</p></div>
      <button class="btn" id="addPlan">Add plan</button></div>
    <div class="stack" id="plans">${plans.map(row).join('')}</div>`);
  const bind = () => $$('.plan-form').forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f)); body.is_active = f.elements.is_active.checked;
    await busy($('button[type=submit]', f), async () => {
      try { const id = f.dataset.id; await api('/plans' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body }); toast('Plan saved'); renderPlans(); } catch (err) { toast(err.message); }
    });
  });
  $('#addPlan').onclick = () => { $('#plans').insertAdjacentHTML('afterbegin', row({ features: [] })); bind(); $('#plans input').focus(); };
  bind();
}

// ------------------------------------------------------------------ billing settings
async function renderBilling() {
  loading();
  let c; try { c = (await api('/billing')).config; } catch (e) { if (!e.auth) W0.innerHTML = errBox(e); return; }
  put(`<div class="pagehead"><div><h1>Billing settings</h1><p class="sub">How clients pay you and what happens when a plan ends.</p></div></div>
    <form id="cf">
      <section class="section"><header><h2>Payment instructions</h2><p>Shown to the client next to every invoice.</p></header>
        <div class="stack">${area('Instructions', 'payment_instructions', c.payment_instructions, { cls: 'tall' })}
          ${field('Payment methods', 'payment_methods', c.payment_methods.join(', '), { hint: 'comma separated, the client picks one' })}</div></section>
      <section class="section"><header><h2>Plan ends</h2><p>The automation switches off after the grace period.</p></header>
        <div class="grid2">${field('Grace period (days)', 'grace_days', c.grace_days, { type: 'number', attrs: 'min="0"' })}
          ${field('Renewal reminder (days before end)', 'reminder_days', c.reminder_days, { type: 'number', attrs: 'min="1"' })}
          ${field('Free trial after approval (days)', 'trial_days', c.trial_days, { type: 'number', hint: '0 = no trial', attrs: 'min="0"' })}</div></section>
      <div class="savebar"><button class="btn" type="button" id="runExp">Run expiry check now</button><button class="btn primary" type="submit">Save</button></div></form>`);
  $('#cf').onsubmit = async e => {
    e.preventDefault();
    await busy($('#cf button[type=submit]'), async () => {
      try { await api('/billing', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Billing settings saved'); } catch (err) { toast(err.message); }
    });
  };
  $('#runExp').onclick = e => busy(e.target, async () => {
    try { const r = await api('/cron/expire', { method: 'POST', body: {} }); toast(`Checked ${r.checked} plans, ${r.changed} changed`); } catch (err) { toast(err.message); }
  });
}

// ------------------------------------------------------------------ n8n connection
async function renderConnection() {
  loading();
  let c; try { c = await api('/connection'); } catch (e) { if (!e.auth) W0.innerHTML = errBox(e); return; }
  const env = c.from_env || {};
  put(`<div class="pagehead"><div><h1>Connection</h1><p class="sub">Where client automations are created. Needed before you approve a client.</p></div></div>
    <form id="nf">
      <section class="section"><header><h2>n8n</h2><p>The API key is stored encrypted. Leave it as is to keep the saved key.</p></header>
        <div class="stack">
          ${field('n8n URL', 'n8n_url', c.n8n_url, { type: 'url', ph: 'https://n8n.example.com', hint: env.N8N_URL ? 'set by an environment variable' : '', attrs: env.N8N_URL ? 'readonly' : '' })}
          ${field('n8n API key', 'n8n_api_key', c.n8n_api_key, { type: 'password', hint: env.N8N_API_KEY ? 'set by an environment variable' : 'n8n > Settings > n8n API > Create an API key', attrs: 'autocomplete="off"' + (env.N8N_API_KEY ? ' readonly' : '') })}
          ${field('Template workflow ID', 'template_workflow_id', c.template_workflow_id, { hint: 'the ID in the URL of your "LE Client ... (template)" workflow', attrs: env.TEMPLATE_WORKFLOW_ID ? 'readonly' : '' })}
          <p class="muted small" id="ctest"></p>
        </div></section>
      <section class="section"><header><h2>Daily expiry check</h2><p>Turns off automations whose plan ended. Opening the admin also runs it.</p></header>
        <div class="stack"><p class="small">In n8n, make a workflow: <b>Schedule Trigger</b> (every day) then <b>HTTP Request</b> GET this URL with header <code>X-Cron-Key</code>.</p>
          <div class="urls"><div class="url"><span class="muted">URL</span><code>${esc(c.cron_url)}</code><button type="button" class="btn small" data-copy="${esc(c.cron_url)}">Copy</button></div>
          <div class="url"><span class="muted">X-Cron-Key</span><code>${esc(c.cron_secret.slice(0, 6))}••••••</code><button type="button" class="btn small" data-copy="${esc(c.cron_secret)}">Copy</button></div></div></div></section>
      <div class="savebar"><button class="btn" type="button" id="testC">Test connection</button><button class="btn primary" type="submit">Save connection</button></div>
    </form>`);
  UI.bindCopy(W0);
  $('#nf').onsubmit = async e => {
    e.preventDefault();
    await busy($('#nf button[type=submit]'), async () => {
      try { await api('/connection', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Connection saved'); renderConnection(); } catch (err) { toast(err.message); }
    });
  };
  $('#testC').onclick = e => busy(e.target, async () => {
    const out = $('#ctest');
    try { await api('/connection', { method: 'PUT', body: Object.fromEntries(new FormData($('#nf'))) });
      const r = await api('/connection/test', { method: 'POST', body: {} }); out.textContent = r.message; out.className = r.ok ? 'small' : 'error'; }
    catch (err) { out.textContent = err.message; out.className = 'error'; }
  });
}

// view: overview | clients | new | a | payments | plans | billing | connection
window.LE = {
  render(view, w, params) {
    W0 = w;
    if (view === 'a') return renderAccount(params[0], params[1] || 'info');
    if (view === 'clients') return renderClients(params[0] || 'all');
    return ({ overview: renderOverview, new: renderNew, payments: renderPayments, plans: renderPlans, billing: renderBilling, connection: renderConnection }[view] || renderOverview)();
  },
};
})();
