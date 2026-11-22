/* Automations inside the admin panel: overview, clients, each client's automations, payments, products, billing, n8n connection. */
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
const kpi = (v, l, d) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div><div class="d">${esc(d)}</div></div>`;
const prodLabel = s => `${esc((s.product && s.product.icon) || '')} ${esc((s.product && s.product.name) || s.product_name || '')}`;

// ------------------------------------------------------------------ shared bits
function bindRows() {
  $$('tr[data-href]').forEach(r => { r.onclick = e => { if (!e.target.closest('button,a')) location.hash = r.dataset.href; };
    r.onkeydown = e => { if (e.key === 'Enter') location.hash = r.dataset.href; }; });
}
function subTable(list, cols) {
  const H = { client: 'Client', product: 'Automation', stage: 'Status', plan: 'Plan', ends: 'Paid until', created: 'Added' };
  const cell = (s, c) => ({
    client: `<b>${esc(s.company)}</b><div class="muted small">${esc(s.email || '')}</div>`, product: prodLabel(s),
    stage: UI.stagePill(s.stage) + (s.to_review ? ' <span class="pill info">payment sent</span>' : ''), plan: esc(s.plan_name || (s.plan && s.plan.name) || '-'),
    ends: s.sub_ends_at ? `${fmtDate(s.sub_ends_at)} ${UI.subPill(s.sub_status)}` : '-', created: fmtDate(s.created_at),
  }[c]);
  return `<div class="scroll"><table class="t"><tr>${cols.map(c => `<th>${H[c]}</th>`).join('')}</tr>
    ${list.map(s => `<tr class="link" data-href="#le-s/${s.id}/settings" tabindex="0">${cols.map(c => `<td>${cell(s, c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
}
function payTable(list, withClient) {
  return `<div class="scroll"><table class="t"><tr>${withClient ? '<th>Client</th>' : ''}<th>Automation</th><th>Plan</th><th class="n">Amount</th><th>Paid with</th><th>Sent</th><th></th></tr>
    ${list.map(i => `<tr>${withClient ? `<td><a href="#le-a/${i.account_id}">${esc(i.company)}</a></td>` : ''}<td>${i.subscription_id ? `<a href="#le-s/${i.subscription_id}/subscription">${esc(i.product_name || '-')}</a>` : esc(i.product_name || '-')}</td>
      <td>${esc(i.plan_name)}</td><td class="n">${money(i.amount, i.currency)}</td>
      <td>${i.status === 'submitted' ? `${esc(i.method)}<div class="small"><code>${esc(i.reference)}</code></div>${i.payer_note ? `<div class="muted small">${esc(i.payer_note)}</div>` : ''}` : UI.invPill(i.status)}</td>
      <td class="muted">${i.submitted_at ? fmtDateTime(i.submitted_at) : fmtDate(i.created_at)}</td>
      <td><div class="actions">${i.status === 'submitted' ? `<button class="btn small primary" data-paid="${i.id}">Mark paid</button><button class="btn small danger" data-reject="${i.id}">Not received</button>`
        : i.status === 'unpaid' ? `<button class="btn small" data-paid="${i.id}">Mark paid</button>` : ''}</div></td></tr>`).join('')}</table></div>`;
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

// ------------------------------------------------------------------ overview
async function renderOverview() {
  loading();
  let o; try { o = await api('/overview'); } catch (e) { if (!e.auth) put(errBox(e)); return; }
  const c = o.counts;
  const rev = o.revenue_month.length ? o.revenue_month.map(r => money(r.total, r.currency)).join(' + ') : money(0, 'USD');
  put(`
    <div class="pagehead"><div><h1>Overview</h1><p class="sub">What needs your attention today. Counts are per automation.</p></div><a class="btn" href="#le-new">Add client</a></div>
    <div class="kpis">
      ${kpi(c.live, 'Live automations', 'running or ready')}${kpi(c.review, 'Waiting for approval', 'being set up by clients')}
      ${kpi(c.payments, 'Payments to check', 'sent by clients')}${kpi(c.expired, 'Expired', 'switched off')}
      ${kpi(c.accounts, 'Clients', 'accounts')}${kpi(rev, 'Paid this month', 'confirmed payments')}
    </div>
    <div class="lists">
      <section class="panel wide"><h2>Payments to check</h2><p class="cap">Confirm the money arrived, then mark it paid. The plan updates instantly.</p>
        ${o.payments.length ? payTable(o.payments, true) : '<p class="muted small">Nothing waiting.</p>'}</section>
      <section class="panel wide"><h2>Waiting for approval</h2><p class="cap">Open one, check its settings, then approve to create its workflow in n8n.</p>
        ${o.pending.length ? subTable(o.pending, ['client', 'product', 'stage', 'created']) : '<p class="muted small">Nothing waiting.</p>'}</section>
      <section class="panel wide"><h2>Plans ending soon</h2><p class="cap">Live automations whose paid period ends within the reminder window.</p>
        ${o.expiring.length ? subTable(o.expiring, ['client', 'product', 'plan', 'ends']) : '<p class="muted small">No plans end soon.</p>'}</section>
    </div>`);
  bindRows(); bindPay(renderOverview);
}

// ------------------------------------------------------------------ clients
async function renderClients(filter) {
  loading();
  let list; try { list = (await api('/accounts')).accounts; } catch (e) { if (!e.auth) put(errBox(e)); return; }
  await counts();
  const has = (a, st) => a.subs.some(s => s.stage === st);
  const F = [['all', 'All'], ['review', 'Waiting for approval'], ['live', 'Live'], ['expired', 'Expired'], ['none', 'No automation yet']];
  const pass = (a, f) => f === 'all' ? true : f === 'none' ? !a.subs.length : has(a, f);
  const shown = list.filter(a => pass(a, filter));
  put(`
    <div class="pagehead"><div><h1>Clients</h1><p class="sub">${list.length} account${list.length === 1 ? '' : 's'}</p></div><a class="btn" href="#le-new">Add client</a></div>
    <div class="filters range" role="group" aria-label="Filter">${F.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filter}">${l} <span class="muted">${list.filter(a => pass(a, k)).length}</span></button>`).join('')}</div>
    ${shown.length ? `<div class="scroll"><table class="t"><tr><th>Client</th><th>Email</th><th>Automations</th><th>Last sign in</th></tr>
      ${shown.map(a => `<tr class="link" data-href="#le-a/${a.id}" tabindex="0"><td><b>${esc(a.company)}</b><div class="muted small">${esc(a.client_id)}</div></td><td>${esc(a.email)}${a.status === 'suspended' ? ' <span class="pill bad">blocked</span>' : ''}</td>
        <td>${a.subs.length ? a.subs.map(s => `<span class="chipline">${prodLabel(s)} ${UI.stagePill(s.stage)}${s.to_review ? ' <span class="pill info">payment sent</span>' : ''}</span>`).join('') : '<span class="muted">None yet</span>'}</td>
        <td class="muted">${a.last_login_at ? fmtDateTime(a.last_login_at) : '-'}</td></tr>`).join('')}</table></div>`
      : '<div class="blank"><h2>No clients here</h2><p>Clients who sign up on the portal appear in this list.</p></div>'}`);
  $$('[data-f]').forEach(b => b.onclick = () => { location.hash = '#le-clients/' + b.dataset.f; });
  bindRows();
}

async function renderNew() {
  loading();
  let products = []; try { products = (await api('/products')).products; } catch (e) { /* none */ }
  put(`<div class="pagehead"><div><h1>Add client</h1><p class="sub">For clients you onboard yourself. They get a temporary password to sign in.</p></div></div>
    <form id="nf" class="stack" style="max-width:760px">${field('Sign-in email', 'email', '', { type: 'email', attrs: 'required' })}${UI.infoFields({})}
      <fieldset class="stack" style="border:1px solid var(--line);border-radius:10px;padding:14px 16px"><legend class="lab" style="font-weight:600;padding:0 6px">Automations for this client</legend>
        ${products.map(p => `<label class="switch"><input type="checkbox" name="products" value="${p.id}"> <span>${esc(p.icon)} ${esc(p.name)}${p.is_active ? '' : ' (hidden from clients)'}</span></label>`).join('') || '<p class="muted small">No products yet.</p>'}
        <small class="muted">You can add or remove automations later on the client's page.</small></fieldset>
      <div class="row-end"><span class="error" id="err" role="alert"></span><a class="btn ghost" href="#le-clients">Cancel</a><button class="btn primary" type="submit">Create account</button></div></form>`);
  $('#nf').onsubmit = async e => {
    e.preventDefault(); $('#err').textContent = '';
    const body = Object.fromEntries(new FormData(e.target)); body.products = $$('#nf input[name=products]:checked').map(x => Number(x.value));
    await busy($('#nf button[type=submit]'), async () => {
      try { const r = await api('/accounts', { method: 'POST', body });
        location.hash = `#le-a/${r.account.id}`;
        setTimeout(() => reveal('Account created', 'Send this temporary password to the client. It is shown only once. They can change it in the portal.', r.temp_password), 300); }
      catch (err) { $('#err').textContent = err.message; }
    });
  };
}

// ------------------------------------------------------------------ one client
async function renderAccount(id) {
  loading();
  let r; try { r = await api('/accounts/' + id); } catch (e) { if (!e.auth) put(errBox(e)); return; }
  const a = r.account, mine = new Set(r.subs.map(s => s.product_id));
  const addable = r.products.filter(p => !mine.has(p.id));
  put(`
    <div class="pagehead"><div><p class="muted small"><a href="#le-clients">Clients</a></p><h1>${esc(a.company)}</h1>
      <p class="sub"><span>${esc(a.email)}</span> <code>${esc(a.client_id)}</code>${a.status === 'suspended' ? ' <span class="pill bad">blocked</span>' : ''}</p></div>
      <div class="actions"><button class="btn" id="resetPw">Reset password</button>${a.status === 'suspended' ? '<button class="btn primary" id="blk" data-v="unblock">Unblock client</button>' : '<button class="btn danger" id="blk" data-v="block">Block client</button>'}</div></div>
    <section class="section"><header><h2>Automations</h2><p>Each one has its own settings, approval, dashboard and plan.</p></header>
      <div class="stack">${r.subs.length ? subTable(r.subs.map(s => ({ ...s, company: a.company, email: a.email })), ['product', 'stage', 'plan', 'ends', 'created']) : '<p class="muted">No automations yet.</p>'}
        ${addable.length ? `<div class="actions"><select id="addP" style="max-width:320px">${addable.map(p => `<option value="${p.id}">${esc(p.icon)} ${esc(p.name)}${p.is_active ? '' : ' (hidden)'}</option>`).join('')}</select><button class="btn" id="addBtn">Add to this client</button></div>` : ''}</div></section>
    <section class="section"><header><h2>Company</h2><p>What the client entered. You can correct it.</p></header>
      <form id="info" class="stack">${UI.infoFields(a)}${area('Private notes', 'admin_notes', a.admin_notes || '', { hint: 'only admins see this' })}
        <div class="row-end"><span class="error" id="infoErr"></span><button class="btn primary" type="submit">Save</button></div></form></section>
    <section class="section"><header><h2>Account</h2></header>
      <dl class="facts"><div><dt>Signed up</dt><dd>${fmtDate(a.created_at)}</dd></div><div><dt>Last sign in</dt><dd>${a.last_login_at ? fmtDateTime(a.last_login_at) : '-'}</dd></div>
        <div><dt>Invoices</dt><dd>${r.invoices.length}</dd></div></dl></section>`);
  bindRows();
  const add = $('#addBtn');
  if (add) add.onclick = () => busy(add, async () => {
    try { const x = await api(`/accounts/${a.id}/subscriptions`, { method: 'POST', body: { product_id: Number($('#addP').value) } }); toast('Automation added'); location.hash = `#le-s/${x.sub.id}/settings`; }
    catch (e) { toast(e.message); }
  });
  $('#info').onsubmit = async e => {
    e.preventDefault(); $('#infoErr').textContent = '';
    await busy($('#info button[type=submit]'), async () => {
      try { await api(`/accounts/${a.id}/info`, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Saved'); }
      catch (err) { $('#infoErr').textContent = err.message; }
    });
  };
  $('#resetPw').onclick = async () => {
    if ((await ask('Reset password?', 'The client is signed out and needs the new temporary password to sign in.', '', { input: null, okLabel: 'Reset password' })) == null) return;
    try { const x = await api(`/accounts/${a.id}/password`, { method: 'POST', body: {} }); reveal('New temporary password', 'Send this to the client. It is shown only once.', x.temp_password); }
    catch (e) { toast(e.message); }
  };
  $('#blk').onclick = async e => {
    const v = e.target.dataset.v;
    if (v === 'block' && !confirm('Block this client? They can still sign in, but all their automations are switched off.')) return;
    try { const x = await api(`/accounts/${a.id}/${v}`, { method: 'POST', body: {} }); toast(x.warning || (v === 'block' ? 'Client blocked' : 'Client unblocked')); rerender(); } catch (er) { toast(er.message); }
  };
}

// ------------------------------------------------------------------ one automation of a client
async function renderSub(id, tab) {
  loading();
  let r; try { r = await api('/subs/' + id); } catch (e) { if (!e.auth) put(errBox(e)); return; }
  const s = r.sub, a = r.account, p = r.product;
  const tabs = [['settings', 'Settings'], ['dashboard', 'Dashboard'], ['subscription', 'Subscription']];
  const acts = [];
  if (s.status === 'pending') acts.push(['approve', 'Approve and create workflow', 'primary'], ['reject', 'Do not approve', 'danger']);
  if (s.status === 'active') acts.push(['suspend', 'Pause', 'danger']);
  if (s.status === 'suspended') acts.push(['resume', 'Switch back on', 'primary']);
  if (s.status === 'rejected') acts.push(['reopen', 'Move back to review', '']);
  if (!s.live) acts.push(['remove', 'Remove', 'ghost']);
  put(`
    <div class="pagehead"><div><p class="muted small"><a href="#le-clients">Clients</a> / <a href="#le-a/${a.id}">${esc(a.company)}</a></p><h1>${esc(p.icon)} ${esc(p.name)}</h1>
      <p class="sub">${UI.stagePill(s.stage)} <code>${esc(a.client_id)}</code>${r.plan ? ` <span>${esc(r.plan.name)}</span>` : ''}${s.sub_ends_at ? ` <span>paid until ${fmtDate(s.sub_ends_at)}</span>` : ''}${s.workflow_id ? ` <span class="muted small">workflow ${esc(s.workflow_id)}</span>` : ''}</p></div>
      <div class="actions">${acts.map(([k, l, c]) => `<button class="btn ${c}" data-act="${k}">${l}</button>`).join('')}</div></div>
    ${s.status_note ? `<div class="note warn"><b>Note shown to the client:</b> ${esc(s.status_note)}</div>` : ''}
    ${!s.live ? `<details class="help" style="margin-bottom:14px"><summary>Already built this in n8n? Link existing workflow${p.templates && p.templates.length > 1 ? 's' : ''} instead of approving</summary><div id="linkBox" class="stack" style="margin-top:10px"><p class="muted small">Loading workflows...</p></div></details>` : ''}
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#le-s/${s.id}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div id="tab"></div>`);
  $$('[data-act]').forEach(b => b.onclick = () => subAct(s, p, a, b.dataset.act, b));
  if (!s.live) linkBox(s, p);
  const el = $('#tab');
  if (tab === 'dashboard') {
    const opts = { load: d => api(`/subs/${s.id}/stats?days=${d}`), csvHref: d => `/api/admin/le/subs/${s.id}/data.csv?days=${d}`,
      notLive: '<div class="blank"><h2>Not live yet</h2><p>The dashboard fills once this automation is approved and running.</p></div>' };
    return p.kind === 'lead-engine' ? UI.dashboard(el, opts) : UI.genericDashboard(el, opts);
  }
  if (tab === 'subscription') return subBilling(el, s, r);
  el.innerHTML = '<p class="muted">Loading settings...</p>';
  try {
    const view = await api(`/subs/${s.id}/settings`);
    const save = body => api(`/subs/${s.id}/settings`, { method: 'PUT', body });
    if (p.kind === 'lead-engine') UI.settingsForm(el, view, { admin: true, save, test: (svc, body) => api(`/subs/${s.id}/test/${svc}`, { method: 'POST', body }) });
    else { UI.genericForm(el, view, { save }); if (view.hooks_error) el.insertAdjacentHTML('afterbegin', `<div class="note warn">Could not read webhook addresses: ${esc(view.hooks_error)}</div>`); }
  } catch (e) { el.innerHTML = errBox(e); }
}
async function subAct(s, p, a, k, btn) {
  if (k === 'remove') {
    if (!confirm(`Remove ${p.name} from ${a.company}?`)) return;
    try { await api('/subs/' + s.id, { method: 'DELETE' }); toast('Removed'); location.hash = '#le-a/' + a.id; } catch (e) { toast(e.message); }
    return;
  }
  let body = {};
  if (k === 'suspend' || k === 'reject') {
    const note = await ask(k === 'suspend' ? 'Pause this automation' : 'Do not approve', 'The client sees this note in their portal.', k === 'suspend' ? 'This automation is paused. Please contact us.' : '');
    if (note == null) return; body = { note };
  }
  await busy(btn, async () => {
    try { const x = await api(`/subs/${s.id}/${k}`, { method: 'POST', body });
      toast(x.warning || ({ approve: 'Approved. Workflow created in n8n.', suspend: 'Paused', resume: 'Switched back on', reject: 'Marked as not approved', reopen: 'Moved back to review' })[k]);
      await counts(); rerender(); }
    catch (e) { toast(e.errors ? 'Not ready: ' + e.errors.join(' ') : e.message); }
  });
}
function linkBox(s, p) {
  api('/workflows/unlinked').then(r => {
    const box = $('#linkBox'); if (!box) return;
    const many = (p.templates || []).length > 1;
    box.innerHTML = r.workflows.length ? `<p class="small">${many ? `This product uses ${p.templates.length} workflows. Tick all of this client's copies, the one with the main settings first.` : 'Choose the workflow you made for this client.'}</p>
      <div class="stack" style="gap:6px;max-height:260px;overflow:auto">${r.workflows.map(w => `<label class="switch"><input type="${many ? 'checkbox' : 'radio'}" name="wf" value="${esc(w.id)}"> <span>${esc(w.name)} <span class="muted small">${esc(w.id)}${w.active ? ' · running' : ''}</span></span></label>`).join('')}</div>
      <div><button class="btn" id="linkBtn">Link</button></div><p class="muted small">Its settings are copied into this automation. Workflows named "(template)" are not listed.</p>`
      : '<p class="muted small">No unlinked workflows in n8n.</p>';
    const b = $('#linkBtn'); if (b) b.onclick = () => busy(b, async () => {
      const ids = $$('#linkBox input[name=wf]:checked').map(x => x.value);
      if (!ids.length) { toast('Choose a workflow first.'); return; }
      try { const x = await api(`/subs/${s.id}/link`, { method: 'POST', body: { workflow_ids: ids } }); toast(x.warning || 'Linked'); rerender(); } catch (e) { toast(e.message); }
    });
  }).catch(e => { const box = $('#linkBox'); if (box) box.innerHTML = errBox(e); });
}
function subBilling(el, s, r) {
  const toISO = ms => ms ? new Date(ms).toISOString().slice(0, 10) : '';
  const plans = r.all_plans;
  el.innerHTML = `
    <section class="section"><header><h2>Subscription</h2><p>Set the plan and end date by hand, for example for free months or corrections.</p></header>
      <form id="subf" class="stack"><div class="grid2">
        <label class="field"><span class="lab">Plan</span><select name="plan_id"><option value="">None</option>${plans.map(p => `<option value="${p.id}" ${p.id === s.plan_id ? 'selected' : ''}>${esc(p.name)}${p.is_active ? '' : ' (hidden)'}</option>`).join('')}</select></label>
        ${field('Paid until', 'ends_at', toISO(s.sub_ends_at), { type: 'date' })}</div>
        <p class="muted small">Now: ${UI.subPill(s.sub_status)} ${s.sub_ends_at ? (s.days_left >= 0 ? s.days_left + ' days left' : -s.days_left + ' days ago') : ''} · Usage last 30 days: ${r.usage.used_30d ?? '-'} ${esc(r.usage.unit)}</p>
        <div class="row-end"><button class="btn" type="submit">Update subscription</button></div></form></section>
    <section class="section"><header><h2>Record a payment</h2><p>For money you received directly. Adds one period of the plan.</p></header>
      ${plans.length ? `<form id="recf" class="stack"><div class="grid2">
        <label class="field"><span class="lab">Plan</span><select name="plan_id">${plans.map(p => `<option value="${p.id}" ${p.id === s.plan_id ? 'selected' : ''}>${esc(p.name)} - ${money(p.price, p.currency)} / ${periodLabel(p.period_days)}</option>`).join('')}</select></label>
        ${field('Amount', 'amount', '', { type: 'number', hint: 'empty = plan price', attrs: 'min="0" step="0.01"' })}
        ${field('Paid with', 'method', 'Bank transfer')}${field('Reference', 'reference', '')}</div>
        <div class="row-end"><button class="btn primary" type="submit">Record payment</button></div></form>` : '<p class="muted">This product has no plans yet. Add them in Products.</p>'}</section>
    <section class="section"><header><h2>Invoices</h2></header>
      ${r.invoices.length ? `<div class="scroll"><table class="t"><tr><th>Date</th><th>Plan</th><th class="n">Amount</th><th>Status</th><th>Reference</th><th>Period</th><th></th></tr>
        ${r.invoices.map(i => `<tr><td>${fmtDate(i.created_at)}</td><td>${esc(i.plan_name)}</td><td class="n">${money(i.amount, i.currency)}</td><td>${UI.invPill(i.status)}</td>
          <td class="muted">${esc([i.method, i.reference].filter(Boolean).join(' / ') || '-')}${i.payer_note ? `<div class="small">${esc(i.payer_note)}</div>` : ''}</td>
          <td class="muted">${i.period_end ? fmtDate(i.period_start) + ' to ' + fmtDate(i.period_end) : '-'}</td>
          <td><div class="actions">${i.status === 'submitted' ? `<button class="btn small primary" data-paid="${i.id}">Mark paid</button><button class="btn small danger" data-reject="${i.id}">Not received</button>` : i.status === 'unpaid' ? `<button class="btn small" data-paid="${i.id}">Mark paid</button>` : ''}</div></td></tr>`).join('')}</table></div>`
      : '<p class="muted">No invoices yet.</p>'}</section>`;
  bindPay(() => renderSub(s.id, 'subscription'));
  $('#subf').onsubmit = async e => {
    e.preventDefault();
    await busy($('#subf button'), async () => {
      try { const x = await api(`/subs/${s.id}/subscription`, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast(x.warning || 'Subscription updated'); renderSub(s.id, 'subscription'); }
      catch (err) { toast(err.message); }
    });
  };
  const rec = $('#recf');
  if (rec) rec.onsubmit = async e => {
    e.preventDefault();
    await busy($('#recf button'), async () => {
      try { const x = await api(`/subs/${s.id}/invoices`, { method: 'POST', body: { ...Object.fromEntries(new FormData(e.target)), paid: true } }); toast(x.warning || 'Payment recorded. Plan extended.'); renderSub(s.id, 'subscription'); }
      catch (err) { toast(err.message); }
    });
  };
}

// ------------------------------------------------------------------ payments
async function renderPayments() {
  loading();
  let r; try { r = await api('/invoices'); } catch (e) { if (!e.auth) put(errBox(e)); return; }
  await counts();
  const sent = r.review.filter(i => i.status === 'submitted'), open = r.review.filter(i => i.status === 'unpaid');
  put(`
    <div class="pagehead"><div><h1>Payments</h1><p class="sub">Check your bKash, bank or Wise account for each reference before marking it paid.</p></div></div>
    <section class="panel" style="margin-bottom:22px"><h2>Sent by clients</h2><p class="cap">The client says they paid. Waiting for you to confirm.</p>${sent.length ? payTable(sent, true) : '<p class="muted small">Nothing to check.</p>'}</section>
    <section class="panel" style="margin-bottom:22px"><h2>Invoices not paid yet</h2><p class="cap">The client chose a plan but has not sent payment details.</p>${open.length ? payTable(open, true) : '<p class="muted small">None.</p>'}</section>
    <section class="panel"><h2>Recent decisions</h2><p class="cap">The last 50 payments you confirmed or sent back.</p>
      ${r.recent.length ? `<div class="scroll"><table class="t"><tr><th>Client</th><th>Automation</th><th>Plan</th><th class="n">Amount</th><th>Status</th><th>Reference</th><th>Date</th></tr>
        ${r.recent.map(i => `<tr><td><a href="#le-a/${i.account_id}">${esc(i.company)}</a></td><td>${esc(i.product_name || '-')}</td><td>${esc(i.plan_name)}</td><td class="n">${money(i.amount, i.currency)}</td><td>${UI.invPill(i.status)}</td>
          <td class="muted">${esc([i.method, i.reference].filter(Boolean).join(' / ') || '-')}</td><td class="muted">${fmtDate(i.paid_at || i.created_at)}</td></tr>`).join('')}</table></div>` : '<p class="muted small">None yet.</p>'}</section>`);
  bindPay(renderPayments);
}

// ------------------------------------------------------------------ products
async function renderProducts() {
  loading();
  let r; try { r = await api('/products'); } catch (e) { if (!e.auth) put(errBox(e)); return; }
  put(`<div class="pagehead"><div><h1>Products</h1><p class="sub">Every automation clients can choose. Add a new one without writing code.</p></div><button class="btn primary" id="newP">Add product</button></div>
    <div class="scroll"><table class="t"><tr><th>Product</th><th>Workflows</th><th>Form fields</th><th>Clients</th><th>Shown to clients</th></tr>
      ${r.products.map(p => `<tr class="link" data-href="#le-product/${p.id}" tabindex="0"><td><b>${esc(p.icon)} ${esc(p.name)}</b><div class="muted small">${esc(p.short)}</div></td>
        <td>${p.templates.length ? p.templates.map(t => `<code>${esc(t)}</code>`).join(' ') : '<span class="pill warn">template missing</span>'}</td>
        <td>${p.builtin ? 'built in' : p.fields.length}</td><td>${p.live} live / ${p.clients}</td><td>${p.is_active ? '<span class="pill good">Yes</span>' : '<span class="pill">Hidden</span>'}</td></tr>`).join('')}</table></div>
    <section class="section" style="margin-top:20px"><header><h2>How a product works</h2></header><div class="stack small">
      <p>1. In n8n, build the automation once and name it with <b>(template)</b>. Add a Code node named <b>Client Settings</b> with <code>const S = {};</code> and read every client value from <code>S</code> (for example <code>S.li_token</code>, <code>S.client_id</code>, <code>S.tables.posts</code>).</p>
      <p>2. Here, add the product: its template workflow ID(s), the form fields the client fills, the data tables it writes to, and what the dashboard shows. Then add plans.</p>
      <p>3. Clients choose it in their portal, fill the form and pay. When you approve, the template is copied for that client with their values in <code>S</code>, and every Webhook node gets its own address.</p></div></section>`);
  bindRows();
  $('#newP').onclick = async () => {
    const name = await ask('New product', 'Name of the automation, as clients will see it.', '', { input: 'text', okLabel: 'Create' });
    if (!name) return;
    try { const x = await api('/products', { method: 'POST', body: { name, is_active: false } }); location.hash = `#le-product/${x.product.id}/details`; } catch (e) { toast(e.message); }
  };
}

const TYPE_LABEL = { text: 'Text', textarea: 'Long text', secret: 'Secret (token, key)', number: 'Number', url: 'Link', email: 'Email', select: 'Dropdown', toggle: 'On/off', list: 'List of rows' };
async function renderProduct(id, tab = 'details') {
  loading();
  let r; try { r = await api('/products/' + id); } catch (e) { if (!e.auth) put(errBox(e)); return; }
  const p = r.product;
  const tabs = [['details', 'Details'], ...(p.builtin ? [] : [['form', 'Client form'], ['data', 'Data and dashboard']]), ['plans', 'Plans']];
  put(`<div class="pagehead"><div><p class="muted small"><a href="#le-products">Products</a></p><h1>${esc(p.icon)} ${esc(p.name)}</h1>
      <p class="sub">${p.is_active ? '<span class="pill good">Shown to clients</span>' : '<span class="pill">Hidden from clients</span>'} <code>${esc(p.slug)}</code>${p.builtin ? ' <span class="pill info">built in</span>' : ''}</p></div></div>
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#le-product/${p.id}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav><div id="tab"></div>`);
  const el = $('#tab');
  const save = async (body, msg = 'Saved') => { const x = await api('/products/' + p.id, { method: 'PUT', body: { ...p, ...body } }); toast(msg); return x.product; };
  if (tab === 'plans') return productPlans(el, p, r.plans);
  if (tab === 'form') return productForm(el, p, save);
  if (tab === 'data') return productData(el, p, save);
  el.innerHTML = `<form id="pd">
    <section class="section"><header><h2>What clients see</h2></header><div class="stack">
      <div class="grid2">${field('Name', 'name', p.name, { attrs: 'required' })}${field('Icon', 'icon', p.icon, { hint: 'one emoji' })}</div>
      ${field('One line', 'short', p.short)}${area('Description', 'description', p.description)}
      <div class="grid2">${field('What it counts', 'unit', p.unit, { hint: 'plural, e.g. leads, posts' })}${field('Order', 'sort', p.sort, { type: 'number' })}</div>
      <label class="switch"><input type="checkbox" name="is_active" ${p.is_active ? 'checked' : ''}> <span>Shown to clients in the portal</span></label></div></section>
    <section class="section"><header><h2>n8n template${p.builtin ? '' : 's'}</h2><p>${p.builtin ? 'The "LE Client ... (template)" workflow.' : 'One or more workflow IDs, separated by spaces. All are copied for each client.'}</p></header><div class="stack">
      ${field('Workflow ID' + (p.builtin ? '' : 's'), 'templates', p.templates.join(' '), { hint: 'the ID in the n8n workflow URL' })}
      <div><button type="button" class="btn" id="chk">Check template</button></div><div id="chkOut"></div></div></section>
    <div class="savebar"><button class="btn primary" type="submit">Save product</button></div></form>`;
  $('#pd').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    await busy($('#pd button[type=submit]'), async () => {
      try { await save({ name: f.name.value, icon: f.icon.value, short: f.short.value, description: f.description.value, unit: f.unit.value, sort: f.sort.value, is_active: f.is_active.checked, templates: f.templates.value }); rerender(); } catch (err) { toast(err.message); }
    });
  };
  $('#chk').onclick = e => busy(e.target, async () => {
    try {
      const x = await api(`/products/${p.id}/check`, { method: 'POST', body: { templates: $('#pd').templates.value } });
      $('#chkOut').innerHTML = x.templates.map(t => `<div class="note ${t.ok ? 'good' : 'bad'}"><b>${esc(t.name || t.id)}</b> ${t.ok ? 'is ready.' : esc(t.error)}
        ${t.webhooks && t.webhooks.length ? `<div class="small">Webhooks: ${t.webhooks.map(esc).join(', ')}</div>` : ''}${t.active ? '<div class="small">This template is running. Keep templates switched off.</div>' : ''}</div>`).join('') || '<p class="muted small">Add a workflow ID first.</p>';
    } catch (er) { $('#chkOut').innerHTML = errBox(er); }
  });
}

function productForm(el, p, save) {
  let fields = JSON.parse(JSON.stringify(p.fields));
  const row = (f, i) => `<div class="fieldrow" data-i="${i}">
    <div class="grid4">${field('Label', 'label', f.label)}${field('Key', 'key', f.key, { hint: 'S.' + (f.key || 'key') })}
      <label class="field"><span class="lab">Type</span><select name="type">${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${field('Section', 'group', f.group, { ph: 'Settings' })}</div>
    <div class="grid4">${field('Help text', 'help', f.help)}${field('Placeholder', 'placeholder', f.placeholder)}
      ${field('Default', 'default', f.type === 'toggle' ? String(!!f.default) : f.default ?? '')}${field('Show only when', 'show_if', f.show_if, { ph: 'key=value' })}</div>
    <div class="grid4">
      <span data-only="select">${field('Options', 'options', (f.options || []).map(o => o.value === o.label ? o.value : `${o.value}:${o.label}`).join(', '), { ph: 'daily:Every day, weekly:Every week' })}</span>
      <span data-only="list">${field('Columns', 'columns', (f.fields || []).map(c => `${c.key}:${c.label}`).join(', '), { ph: 'name:Name, phone:Phone' })}</span>
      <label class="switch" style="align-self:end"><input type="checkbox" name="required" ${f.required ? 'checked' : ''}> <span>Required</span></label>
      <div class="actions" style="justify-content:flex-end;align-self:end"><button type="button" class="btn small" data-mv="-1">↑</button><button type="button" class="btn small" data-mv="1">↓</button><button type="button" class="btn small danger" data-del>Remove</button></div></div></div>`;
  const read = () => $$('.fieldrow', el).map(r => {
    const g = n => r.querySelector(`[name="${n}"]`);
    const type = g('type').value;
    return { label: g('label').value, key: g('key').value, type, group: g('group').value, help: g('help').value, placeholder: g('placeholder').value,
      default: type === 'toggle' ? g('default').value === 'true' : g('default').value, show_if: g('show_if').value, required: g('required').checked,
      options: type === 'select' ? g('options').value : undefined, columns: type === 'list' ? g('columns').value : undefined };
  });
  const draw = () => {
    el.innerHTML = `<p class="muted small" style="margin-bottom:12px">These fields make the Settings form the client fills. Each value reaches the workflow as <code>S.key</code>. A secret is hidden after saving.</p>
      <div class="stack" id="rows">${fields.map(row).join('') || '<p class="muted">No fields yet.</p>'}</div>
      <div class="savebar"><button class="btn" type="button" id="addF">Add field</button><span class="error" id="fErr"></span><button class="btn primary" type="button" id="saveF">Save form</button></div>`;
    const syncTypes = () => $$('.fieldrow', el).forEach(r => { const t = r.querySelector('[name=type]').value; $$('[data-only]', r).forEach(x => { x.hidden = x.dataset.only !== t; }); });
    syncTypes(); el.addEventListener('change', syncTypes);
    $('#addF').onclick = () => { fields = read(); fields.push({ label: '', key: '', type: 'text' }); draw(); };
    $$('[data-del]', el).forEach(b => b.onclick = () => { fields = read(); fields.splice(Number(b.closest('.fieldrow').dataset.i), 1); draw(); });
    $$('[data-mv]', el).forEach(b => b.onclick = () => { fields = read(); const i = Number(b.closest('.fieldrow').dataset.i), j = i + Number(b.dataset.mv); if (j < 0 || j >= fields.length) return; [fields[i], fields[j]] = [fields[j], fields[i]]; draw(); });
    $('#saveF').onclick = e => busy(e.target, async () => {
      $('#fErr').textContent = '';
      try { const x = await save({ fields: read().map(f => ({ ...f, fields: undefined })) }, 'Form saved'); fields = x.fields; p.fields = x.fields; draw(); } catch (er) { $('#fErr').textContent = er.message; }
    });
  };
  draw();
}

function productData(el, p, save) {
  const d = p.dashboard || {};
  el.innerHTML = `<form id="dd">
    <section class="section"><header><h2>Data tables</h2><p>Created in n8n for each client when you approve. One table per line: <code>name: column column:type</code>. Types: string, number, boolean, date.</p></header>
      <div class="stack">${area('Tables', 'tables', p.tables || '', { cls: 'tall', ph: 'posts: title topic status posted_at:date\nlog: message level' })}
        <p class="muted small">Table names in n8n become <code>&lt;client_id&gt;_${esc(p.slug.replace(/-/g, '_'))}_&lt;table&gt;</code>. The workflow gets them in <code>S.tables</code>, for example <code>S.tables.posts</code>.</p></div></section>
    <section class="section"><header><h2>Dashboard</h2><p>What the client sees on the Dashboard tab. It reads one of the tables above.</p></header>
      <div class="stack"><div class="grid2">${field('Table', 'table', d.table, { ph: 'posts' })}${field('Date column', 'date_column', d.date_column || 'createdAt', { hint: 'createdAt is added by n8n' })}
        ${field('Main number label', 'kpi_label', d.kpi_label, { ph: 'Posts published' })}${field('Group by', 'group_by', d.group_by, { ph: 'status:Status, topic:Topic' })}</div>
        ${field('Columns in the latest table', 'columns', d.columns, { ph: 'title:Title, status:Status, posted_at:Posted' })}</div></section>
    <div class="savebar"><button class="btn primary" type="submit">Save</button></div></form>`;
  $('#dd').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    await busy($('#dd button[type=submit]'), async () => {
      try { await save({ tables: f.tables.value, dashboard: { table: f.table.value, date_column: f.date_column.value, kpi_label: f.kpi_label.value, group_by: f.group_by.value, columns: f.columns.value } }); } catch (er) { toast(er.message); }
    });
  };
}

function productPlans(el, p, plans) {
  const row = x => `<form class="panel stack plan-form" data-id="${x.id || ''}">
    <div class="plan-edit">${field('Name', 'name', x.name || '', { attrs: 'required' })}${field('Price', 'price', x.price ?? '', { type: 'number', attrs: 'min="0" step="0.01"' })}
      ${field('Currency', 'currency', x.currency || 'USD', { attrs: 'maxlength="3"' })}${field('Days per period', 'period_days', x.period_days || 30, { type: 'number', attrs: 'min="1"' })}
      ${field(`${p.unit} a month`, 'lead_limit', x.lead_limit ?? 0, { type: 'number', hint: '0 = no limit', attrs: 'min="0"' })}</div>
    ${area('What is included', 'features', (x.features || []).join('\n'), { hint: 'one per line' })}
    <div class="row-end"><label class="switch"><input type="checkbox" name="is_active" ${x.is_active !== false ? 'checked' : ''}> <span>Shown to clients</span></label>
      ${field('Order', 'sort', x.sort ?? 0, { type: 'number' })}<button class="btn primary" type="submit">${x.id ? 'Save plan' : 'Add plan'}</button></div></form>`;
  el.innerHTML = `<p class="muted small" style="margin-bottom:12px">Plans for ${esc(p.name)} only. Changing a price does not change invoices already made.</p>
    <div class="actions" style="margin-bottom:12px"><button class="btn" id="addPlan">Add plan</button></div><div class="stack" id="plans">${plans.map(row).join('') || '<p class="muted">No plans yet.</p>'}</div>`;
  const bind = () => $$('.plan-form', el).forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f)); body.is_active = f.elements.is_active.checked; body.product_id = p.id;
    await busy($('button[type=submit]', f), async () => {
      try { const id = f.dataset.id; await api('/plans' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body }); toast('Plan saved'); renderProduct(p.id, 'plans'); } catch (err) { toast(err.message); }
    });
  });
  $('#addPlan').onclick = () => { $('#plans').insertAdjacentHTML('afterbegin', row({ features: [] })); bind(); $('#plans input').focus(); };
  bind();
}

// ------------------------------------------------------------------ billing settings
async function renderBilling() {
  loading();
  let c; try { c = (await api('/billing')).config; } catch (e) { if (!e.auth) put(errBox(e)); return; }
  put(`<div class="pagehead"><div><h1>Billing settings</h1><p class="sub">How clients pay you and what happens when a plan ends. Applies to every product.</p></div></div>
    <form id="cf">
      <section class="section"><header><h2>Payment instructions</h2><p>Shown to the client next to every invoice.</p></header>
        <div class="stack">${area('Instructions', 'payment_instructions', c.payment_instructions, { cls: 'tall' })}
          ${field('Payment methods', 'payment_methods', c.payment_methods.join(', '), { hint: 'comma separated, the client picks one' })}</div></section>
      <section class="section"><header><h2>Plan ends</h2><p>An automation switches off after the grace period.</p></header>
        <div class="grid2">${field('Grace period (days)', 'grace_days', c.grace_days, { type: 'number', attrs: 'min="0"' })}
          ${field('Renewal reminder (days before end)', 'reminder_days', c.reminder_days, { type: 'number', attrs: 'min="1"' })}
          ${field('Free trial after approval (days)', 'trial_days', c.trial_days, { type: 'number', hint: '0 = no trial', attrs: 'min="0"' })}</div></section>
      <div class="savebar"><button class="btn" type="button" id="runExp">Run expiry check now</button><button class="btn primary" type="submit">Save</button></div></form>`);
  $('#cf').onsubmit = async e => {
    e.preventDefault();
    await busy($('#cf button[type=submit]'), async () => { try { await api('/billing', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Billing settings saved'); } catch (err) { toast(err.message); } });
  };
  $('#runExp').onclick = e => busy(e.target, async () => { try { const r = await api('/cron/expire', { method: 'POST', body: {} }); toast(`Checked ${r.checked} plans, ${r.changed} changed`); } catch (err) { toast(err.message); } });
}

// ------------------------------------------------------------------ n8n connection
async function renderConnection() {
  loading();
  let c; try { c = await api('/connection'); } catch (e) { if (!e.auth) put(errBox(e)); return; }
  const env = c.from_env || {};
  put(`<div class="pagehead"><div><h1>n8n connection</h1><p class="sub">Where client workflows are created. Template IDs are set per product.</p></div></div>
    <form id="nf">
      <section class="section"><header><h2>n8n</h2><p>The API key is stored encrypted. Leave it as is to keep the saved key.</p></header>
        <div class="stack">
          ${field('n8n URL', 'n8n_url', c.n8n_url, { type: 'url', ph: 'https://n8n.velsario.com', hint: env.N8N_URL ? 'set by an environment variable' : '', attrs: env.N8N_URL ? 'readonly' : '' })}
          ${field('n8n API key', 'n8n_api_key', c.n8n_api_key, { type: 'password', hint: env.N8N_API_KEY ? 'set by an environment variable' : 'n8n > Settings > n8n API > Create an API key', attrs: 'autocomplete="off"' + (env.N8N_API_KEY ? ' readonly' : '') })}
          <p class="muted small" id="ctest"></p></div></section>
      <section class="section"><header><h2>Daily expiry check</h2><p>Turns off automations whose plan ended. Opening the admin also runs it.</p></header>
        <div class="stack"><p class="small">In n8n, make a workflow: <b>Schedule Trigger</b> (every day) then <b>HTTP Request</b> GET this URL with header <code>X-Cron-Key</code>.</p>
          <div class="urls"><div class="url"><span class="muted">URL</span><code>${esc(c.cron_url)}</code><button type="button" class="btn small" data-copy="${esc(c.cron_url)}">Copy</button></div>
          <div class="url"><span class="muted">X-Cron-Key</span><code>${esc(c.cron_secret.slice(0, 6))}••••••</code><button type="button" class="btn small" data-copy="${esc(c.cron_secret)}">Copy</button></div></div></div></section>
      <div class="savebar"><button class="btn" type="button" id="testC">Save and test</button><button class="btn primary" type="submit">Save connection</button></div>
    </form>`);
  UI.bindCopy(W0);
  $('#nf').onsubmit = async e => {
    e.preventDefault();
    await busy($('#nf button[type=submit]'), async () => { try { await api('/connection', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Connection saved'); renderConnection(); } catch (err) { toast(err.message); } });
  };
  $('#testC').onclick = e => busy(e.target, async () => {
    const out = $('#ctest');
    try { await api('/connection', { method: 'PUT', body: Object.fromEntries(new FormData($('#nf'))) });
      const r = await api('/connection/test', { method: 'POST', body: {} }); out.textContent = r.message; out.className = r.ok ? 'small' : 'error'; }
    catch (err) { out.textContent = err.message; out.className = 'error'; }
  });
}

// view: overview | clients | new | a | s | payments | products | product | billing | connection
window.LE = {
  render(view, w, params) {
    W0 = w;
    if (view === 'a') return renderAccount(params[0]);
    if (view === 's') return renderSub(params[0], params[1] || 'settings');
    if (view === 'product') return renderProduct(params[0], params[1] || 'details');
    if (view === 'clients') return renderClients(params[0] || 'all');
    return ({ overview: renderOverview, new: renderNew, payments: renderPayments, products: renderProducts, billing: renderBilling, connection: renderConnection }[view] || renderOverview)();
  },
};
})();
