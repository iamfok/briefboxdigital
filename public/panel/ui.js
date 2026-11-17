/* Shared pieces for the client portal and the admin panel: helpers, the automation settings form, the dashboard. */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3600);
}
function makeApi(prefix, onAuth) {
  return async function api(path, opts = {}) {
    const res = await fetch(prefix + path, { method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = {}; try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && !opts.noAuthRedirect) { onAuth(); const e = new Error(data.error || 'Please sign in.'); e.auth = true; throw e; }
    if (!res.ok) { const e = new Error(data.error || ('Request failed (' + res.status + ')')); e.errors = data.errors; throw e; }
    return data;
  };
}
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDateTime = ms => ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
const money = (n, cur) => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0); }
  catch (e) { return (cur || '') + ' ' + n; }
};
const periodLabel = d => d === 30 || d === 31 ? 'month' : d === 365 ? 'year' : d === 90 ? '3 months' : d + ' days';
const busy = async (btn, fn) => { btn.disabled = true; try { return await fn(); } finally { btn.disabled = false; } };

const field = (label, name, value, { type = 'text', hint = '', ph = '', attrs = '' } = {}) =>
  `<label class="field"><span class="lab">${label}${hint ? ` <span class="hint">${hint}</span>` : ''}</span><input type="${type}" name="${name}" value="${esc(value)}" placeholder="${esc(ph)}" ${attrs}></label>`;
const area = (label, name, value, { hint = '', cls = '', ph = '' } = {}) =>
  `<label class="field"><span class="lab">${label}${hint ? ` <span class="hint">${hint}</span>` : ''}</span><textarea name="${name}" class="${cls}" placeholder="${esc(ph)}">${esc(value)}</textarea></label>`;
const choices = (name, value, opts) => `<div class="choices" role="radiogroup">${opts.map(([v, l]) =>
  `<label><input type="radio" name="${name}" value="${v}" ${v === value ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
const statusPill = (label, tone) => `<span class="pill ${tone || ''}">${esc(label)}</span>`;

// ------------------------------------------------------------------ settings form
const HELP = {
  sheets: `<ol><li>Share the sheet with <b>our Google account</b> as Editor (we send you the address after sign up).</li>
    <li>Add these header columns: <code>LE Status</code> <code>LE Quality</code> <code>LE Counsellor</code> <code>LE Score</code> <code>LE Summary</code> <code>LE Feedback</code> <code>LE WhatsApp</code> <code>LE Call</code></li>
    <li>The sheet ID is the long part of the URL between <code>/d/</code> and <code>/edit</code>.</li></ol>`,
  hubspot: `<ol><li>HubSpot &gt; Settings &gt; Integrations &gt; Private apps &gt; Create. Scopes: <code>crm.objects.contacts.read</code> and <code>write</code>.</li>
    <li>Create contact properties: <code>le_status</code> <code>le_quality</code> <code>le_counsellor</code> <code>le_score</code> <code>le_summary</code> <code>le_feedback</code></li>
    <li>In a HubSpot workflow, send new contacts to the lead address shown here once you are live.</li></ol>`,
  webhook: `<p>Each update is sent as a JSON POST: <code>{event, client_id, lead}</code>. New leads come in through the lead address shown once you are live.</p>`,
  zapier: `<ol><li>Create a Zap with <b>Webhooks by Zapier &gt; Catch Hook</b> and paste its URL here. Map the <code>lead</code> fields into your CRM.</li>
    <li>For new leads, add a <b>Webhooks by Zapier &gt; POST</b> step to the lead address shown once you are live.</li></ol>`,
  gmail: `<p>Welcome emails go out from the Briefbox Gmail account. Good for up to about 500 emails a day. Use Brevo or Mailjet to send from your own address.</p>`,
  brevo: `<p>Brevo &gt; SMTP &amp; API &gt; API keys. Verify the sender email first. Free plan: 300 emails a day.</p>`,
  mailjet: `<p>Mailjet &gt; Account settings &gt; API key management. Free plan: 6,000 a month, 200 a day.</p>`,
  whatsapp: `<ol><li>Meta Business Settings &gt; System users &gt; add an admin user &gt; assign the app and the WhatsApp account.</li>
    <li>Generate a token that never expires with <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>.</li>
    <li>Phone number ID: WhatsApp Manager &gt; Phone numbers.</li>
    <li>Message templates use numbered variables like <code>{{1}}</code>.</li></ol>`,
  sms: `<p>Any HTTP SMS gateway works. Put <code>{to}</code> and <code>{message}</code> where the number and text go, for example
    <code>https://bulksmsbd.net/api/smsapi?api_key=KEY&amp;type=text&amp;number={to}&amp;senderid=ID&amp;message={message}</code></p>`,
};
const socket = (key, title, inner) => `
  <div class="socket" data-socket="${key}" data-state="idle">
    <div class="jack" aria-hidden="true"><i></i></div>
    <div class="body"><div class="head"><h3>${title}</h3>
      <span class="testline"><span class="status" aria-live="polite">Not tested</span>
      <button type="button" class="btn small" data-test="${key}">Test connection</button></span></div>${inner}</div></div>`;
const crmLabel = t => ({ sheets: 'Google Sheets', hubspot: 'HubSpot', webhook: 'Webhook', zapier: 'Zapier' }[t] || t);

function teamRow(m = {}) {
  return `<div class="team-row">
    <input type="text" data-k="name" value="${esc(m.name)}" placeholder="Name" aria-label="Counsellor name">
    <input type="text" data-k="phone" value="${esc(m.phone)}" placeholder="WhatsApp number" aria-label="WhatsApp number">
    <input type="email" data-k="email" value="${esc(m.email)}" placeholder="name@company.com" aria-label="Email">
    <select data-k="role" aria-label="Role"><option value="chat" ${m.role !== 'call' ? 'selected' : ''}>Chat</option><option value="call" ${m.role === 'call' ? 'selected' : ''}>Call</option></select>
    <button type="button" class="icon-btn" data-remove aria-label="Remove counsellor">&times;</button></div>`;
}
function urlsHtml(h) {
  const rows = [['New leads', h.lead], ['Meta WhatsApp callback', h.whatsapp], ['Call status updates', h.call_status]];
  return `<div class="urls">${rows.map(([l, u]) => `<div class="url"><span class="muted">${l}</span><code title="${esc(u)}">${esc(u)}</code>
    <button type="button" class="btn small" data-copy="${esc(u)}">Copy</button></div>`).join('')}</div>`;
}
function bindCopy(root) {
  $$('[data-copy]', root).forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); } catch (e) { toast('Copy failed. Select the text instead.'); }
  });
}
function missingBox(list, live) {
  if (!list || !list.length) return live ? '' : `<div class="note good"><b>Settings complete.</b> Our team can now review and switch on your automation.</div>`;
  return `<div class="note warn"><b>${live ? 'Fix these to save' : 'Still needed before your automation can go live'}</b><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
}

// view = { settings, missing, live, webhooks }
function settingsForm(el, view, { save, test, admin = false }) {
  const s = view.settings || {};
  const crm = s.crm_type || 'sheets', mail = s.email_provider || 'gmail';
  const map = Object.assign({ name: 'Name', phone: 'Phone Number', email: 'Email address', call_status: 'Call Status' }, s.crm_map || {});
  const team = (s.counsellors && s.counsellors.length) ? s.counsellors : [{ role: 'chat' }, { role: 'call' }];
  el.innerHTML = `
  <div id="missing">${missingBox(view.missing, view.live)}</div>
  <form id="sf" novalidate>
    ${view.live ? `<section class="section"><header><h2>Automation</h2><p>Pause it any time. Leads that arrive while paused are not contacted.</p></header>
      <div><label class="switch"><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}> <span>Automation on</span></label></div></section>` : ''}

    <section class="section"><header><h2>Connections</h2><p>Plug in each service, then test it. The socket fills when the connection works.</p></header>
      <div class="board">
        ${socket('crm', 'Where your leads live', `${choices('crm_type', crm, [['sheets', 'Google Sheets'], ['hubspot', 'HubSpot'], ['webhook', 'Webhook'], ['zapier', 'Zapier']])}
          <div data-when="crm_type=sheets" class="stack"><div class="grid2">${field('Google Sheet ID', 'crm_sheet_id', s.crm_sheet_id || '')}${field('Tab name', 'crm_sheet_tab', s.crm_sheet_tab || 'Sheet1')}</div>
            <details class="help"><summary>Column names in your sheet</summary><div class="grid2" style="margin-top:10px">
              ${field('Name column', 'map_name', map.name)}${field('Phone column', 'map_phone', map.phone)}${field('Email column', 'map_email', map.email)}${field('Call status column', 'map_call_status', map.call_status)}</div></details>
            <details class="help"><summary>How to connect a sheet</summary>${HELP.sheets}</details></div>
          <div data-when="crm_type=hubspot" class="stack">${field('Private app token', 'hubspot_token', s.hubspot_token || '', { type: 'password', attrs: 'autocomplete="off"' })}
            <details class="help"><summary>Where to get the token</summary>${HELP.hubspot}</details></div>
          <div data-when="crm_type=webhook|zapier" class="stack">${field('Update URL', 'crm_webhook_url', s.crm_webhook_url || '', { type: 'url', ph: 'https://hooks.zapier.com/...' })}
            <details class="help" data-when="crm_type=webhook"><summary>How it works</summary>${HELP.webhook}</details>
            <details class="help" data-when="crm_type=zapier"><summary>How to set up Zapier</summary>${HELP.zapier}</details></div>`)}
        ${socket('whatsapp', 'WhatsApp', `<div class="grid2">
            ${field('Phone number ID', 'wa_phone_number_id', s.wa_phone_number_id || '')}
            ${field('Permanent access token', 'wa_token', s.wa_token || '', { type: 'password', attrs: 'autocomplete="off"' })}
            ${field('Template language', 'wa_lang', s.wa_lang || 'en_US', { hint: 'en_US for English' })}</div>
          <details class="help"><summary>Where to find these</summary>${HELP.whatsapp}</details>`)}
        ${socket('email', 'Email', `${choices('email_provider', mail, [['gmail', 'Briefbox Gmail'], ['brevo', 'Brevo'], ['mailjet', 'Mailjet'], ['none', 'Off']])}
          <div data-when="email_provider=gmail">${HELP.gmail}</div>
          <div data-when="email_provider=brevo|mailjet" class="stack"><div class="grid2">
            ${field('API key', 'email_api_key', s.email_api_key || '', { type: 'password', attrs: 'autocomplete="off"' })}
            <span data-when="email_provider=mailjet">${field('Secret key', 'email_api_secret', s.email_api_secret || '', { type: 'password', attrs: 'autocomplete="off"' })}</span>
            ${field('Sender email', 'email_from', s.email_from || '', { type: 'email' })}${field('Sender name', 'email_from_name', s.email_from_name || '')}</div>
            <details class="help" data-when="email_provider=brevo"><summary>Where to get the key</summary>${HELP.brevo}</details>
            <details class="help" data-when="email_provider=mailjet"><summary>Where to get the key</summary>${HELP.mailjet}</details></div>`)}
        ${socket('sms', 'SMS', `<label class="switch"><input type="checkbox" name="sms_enabled" ${s.sms_enabled ? 'checked' : ''}> <span>Send a welcome SMS</span></label>
          <div data-when="sms_enabled" class="stack"><div class="grid2 smsgrid">
            <label class="field"><span class="lab">Method</span><select name="sms_method"><option ${s.sms_method !== 'POST' ? 'selected' : ''}>GET</option><option ${s.sms_method === 'POST' ? 'selected' : ''}>POST</option></select></label>
            ${field('Gateway URL', 'sms_url', s.sms_url || '', { type: 'password', attrs: 'autocomplete="off"', hint: 'contains your SMS key' })}</div>
            <details class="help"><summary>URL format</summary>${HELP.sms}</details></div>`)}
      </div>
    </section>

    <section class="section"><header><h2>Counsellors</h2><p>Chat counsellors get students the assistant has qualified. Call counsellors get students who never replied.</p></header>
      <div class="stack"><div class="team-row team-head"><span>Name</span><span>WhatsApp</span><span>Email</span><span>Role</span><span></span></div>
        <div id="team" class="stack" style="gap:8px">${team.map(teamRow).join('')}</div>
        <div><button type="button" class="btn small" id="addMember">Add counsellor</button></div></div>
    </section>

    <section class="section"><header><h2>AI assistant</h2><p>The assistant answers students only from what you write here.</p></header>
      <div class="stack">
        ${area('Company knowledge', 'kb', s.kb || '', { cls: 'tall', ph: 'Office address and hours\nPhone and email\nCountries you work with\nCosts, for example: Europe total cost from ...\nDocuments students need\nCommon questions and answers' })}
        <details class="help"><summary>Assistant instructions and qualification rules</summary><div style="margin-top:10px">
          ${area('Instructions', 'ai_prompt', s.ai_prompt || '', { cls: 'tall', hint: 'leave empty to use the standard study-abroad rules' })}</div></details>
      </div>
    </section>

    <section class="section"><header><h2>Messages</h2><p>Use <code>{name}</code>, <code>{company}</code> and <code>{counsellor}</code> to personalise.</p></header>
      <div class="stack">
        <div class="grid2">${field('Welcome template', 'wa_tpl_welcome', s.wa_tpl_welcome || 'reg_success', { hint: '{{1}} = student' })}
          ${field('Reminder template', 'wa_tpl_reminder', s.wa_tpl_reminder || 'reg_reminder', { hint: '{{1}} = student' })}
          ${field('Feedback template', 'wa_tpl_feedback', s.wa_tpl_feedback || 'service_feedback', { hint: '{{1}} student, {{2}} counsellor' })}
          ${field('Counsellor update template', 'wa_tpl_digest', s.wa_tpl_digest || 'counsellor_digest', { hint: '{{1}} counsellor, {{2}} count' })}</div>
        ${field('Welcome email subject', 'welcome_email_subject', s.welcome_email_subject || '')}
        ${area('Welcome email (HTML)', 'welcome_email_html', s.welcome_email_html || '')}
        ${field('Welcome SMS', 'welcome_sms_text', s.welcome_sms_text || '')}
        ${field('After a counsellor is assigned', 'assigned_msg', s.assigned_msg || '')}
        ${field('After feedback', 'feedback_thanks_msg', s.feedback_thanks_msg || '')}
      </div>
    </section>

    <section class="section"><header><h2>Timing</h2><p>In hours.${admin ? ' Use 0.1 while testing to see reminders within minutes.' : ''}</p></header>
      <div class="stack"><div class="grid2">
        ${field('First reminder after welcome', 'reminder1_h', s.reminder1_h ?? 6, { type: 'number', attrs: 'min="0" step="0.1"' })}
        ${field('Second reminder after the first', 'reminder2_h', s.reminder2_h ?? 12, { type: 'number', attrs: 'min="0" step="0.1"' })}
        ${field('Hand over to a call counsellor after', 'escalate_h', s.escalate_h ?? 6, { type: 'number', attrs: 'min="0" step="0.1"' })}
        ${field('Counsellor update every', 'digest_h', s.digest_h ?? 4, { type: 'number', attrs: 'min="0" step="0.1"' })}</div>
        ${field('Call statuses that trigger feedback', 'call_done_statuses', s.call_done_statuses || '', { hint: 'comma separated' })}
        ${field('Default country code', 'default_cc', s.default_cc || '880', { hint: 'added to local numbers' })}
      </div>
    </section>

    ${view.webhooks ? `<section class="section"><header><h2>Your addresses</h2><p>Give these to your CRM, Zapier and Meta.</p></header>${urlsHtml(view.webhooks)}</section>` : ''}

    <div class="savebar"><div class="error" id="formErr" role="alert"></div><button class="btn primary" type="submit">Save settings</button></div>
  </form>`;

  const form = $('#sf', el);
  bindCopy(el);
  const sync = () => $$('[data-when]', form).forEach(x => {
    const [k, v] = x.dataset.when.split('=');
    const inp = form.elements[k];
    const val = inp && (inp.type === 'checkbox' ? inp.checked : (form.querySelector(`[name="${k}"]:checked`) || inp).value);
    x.hidden = v === undefined ? !val : !v.split('|').includes(val);
  });
  const setSocket = (sk, st, msg) => { sk.dataset.state = st; $('.status', sk).textContent = msg; };
  form.addEventListener('change', e => { sync(); const sk = e.target.closest('[data-socket]'); if (sk) setSocket(sk, 'idle', 'Not tested'); });
  sync();
  $('#addMember', form).onclick = () => { $('#team', form).insertAdjacentHTML('beforeend', teamRow({ role: 'chat' })); $('#team .team-row:last-child input', form).focus(); };
  $('#team', form).onclick = e => { if (e.target.matches('[data-remove]')) e.target.closest('.team-row').remove(); };
  $$('[data-test]', form).forEach(b => b.onclick = async () => {
    const sk = b.closest('[data-socket]'); setSocket(sk, 'busy', 'Testing...'); b.disabled = true;
    try { const r = await test(b.dataset.test, { settings: collect(form) }); setSocket(sk, r.ok ? 'ok' : 'bad', r.message); }
    catch (e) { setSocket(sk, 'bad', e.message); }
    b.disabled = false;
  });
  form.onsubmit = async e => {
    e.preventDefault(); const btn = $('button[type=submit]', form); $('#formErr', form).textContent = '';
    await busy(btn, async () => {
      try {
        const r = await save(collect(form));
        $('#missing', el).innerHTML = missingBox(r.missing, r.live);
        toast(r.pushError ? 'Saved, but: ' + r.pushError : r.live ? 'Saved. Your automation uses the new settings now.' : 'Saved');
      } catch (err) { $('#formErr', form).textContent = err.errors ? err.errors.join('\n') : err.message; }
    });
  };
}
function collect(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.closest('#team') || el.name.startsWith('map_')) continue;
    if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; continue; }
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  o.crm_map = { name: form.elements.map_name.value, phone: form.elements.map_phone.value, email: form.elements.map_email.value, status: 'LE Status', call_status: form.elements.map_call_status.value };
  o.counsellors = $$('#team .team-row', form).map(r => Object.fromEntries($$('[data-k]', r).map(i => [i.dataset.k, i.value.trim()]))).filter(m => m.name);
  return o;
}

// ------------------------------------------------------------------ dashboard
const STAGES = { welcomed: 'Waiting for reply', chatting: 'Chatting with the assistant', assigned: 'Assigned to a counsellor', escalated: 'Handed to the call team',
  unqualified: 'Not eligible', not_interested: 'Not interested', wrong_number: 'Wrong number', junk: 'Junk', feedback_pending: 'Feedback requested',
  feedback_done: 'Feedback given', invalid: 'Invalid contact', invalid_phone: 'No valid phone', duplicate: 'Duplicate', needs_human: 'Needs a person' };

// opts: { load(days) -> stats, csvHref(days), notLive: html }
async function dashboard(el, opts, days = 30) {
  el.innerHTML = '<p class="muted">Loading your numbers...</p>';
  let d;
  try { d = await opts.load(days); } catch (e) { el.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (d.empty) {
    el.innerHTML = d.reason === 'not_live' ? opts.notLive
      : `<div class="blank"><h2>No leads yet</h2><p>Numbers appear here after the first lead reaches your automation.</p></div>`;
    return;
  }
  const t = d.totals, pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-';
  const stages = Object.entries(d.stages).sort((a, b) => b[1] - a[1]).map(([k, v]) => [STAGES[k] || k, v]);
  const sources = Object.entries(d.sources).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const waOrder = [['read', 'Read', 'good'], ['delivered', 'Delivered', 'good'], ['sent', 'Sent', 'neutral'], ['accepted', 'Accepted by Meta', 'neutral'], ['failed', 'Failed', 'bad']];
  el.innerHTML = `
    <div class="dashbar"><div class="range" role="group" aria-label="Date range">${[7, 30, 90].map(n => `<button type="button" data-days="${n}" aria-pressed="${n === d.days}">${n} days</button>`).join('')}</div>
      <a class="btn small" href="${esc(opts.csvHref(d.days))}" download>Download leads (CSV)</a></div>
    <div class="kpis">
      ${kpi(t.leads, 'New leads', `${t.invalid} invalid or duplicate`)}
      ${kpi(t.assigned, 'Qualified and assigned', pct(t.assigned, t.leads) + ' of leads')}
      ${kpi(t.waiting, 'Still in conversation', 'waiting or chatting')}
      ${kpi(t.escalated, 'Sent to the call team', 'never replied')}
      ${kpi(t.wa_delivery_rate == null ? '-' : t.wa_delivery_rate + '%', 'WhatsApp delivered', `${t.wa_failed} failed of ${t.wa_sent}`)}
      ${kpi(t.avg_rating == null ? '-' : t.avg_rating + ' / 5', 'Service rating', `${t.feedback_count} review${t.feedback_count === 1 ? '' : 's'}`)}
    </div>
    <div class="panels viz-root">
      <section class="panel wide"><h2>New leads per day</h2><p class="cap">Every registration that reached the automation, before quality checks.</p>
        <div class="chart" id="perDay"></div>
        <details class="help" style="margin-top:8px"><summary>Show as table</summary><table class="t"><tr><th>Day</th><th class="n">Leads</th></tr>
          ${d.per_day.filter(x => x.leads).map(x => `<tr><td>${esc(x.day)}</td><td class="n">${x.leads}</td></tr>`).join('') || '<tr><td colspan="2">No leads in this range</td></tr>'}</table></details></section>
      <section class="panel"><h2>Where leads are now</h2><p class="cap">Current stage of each lead from this period.</p>${hbars(stages)}</section>
      <section class="panel"><h2>WhatsApp delivery</h2><p class="cap">Outgoing messages, by latest status from Meta.</p>
        <div class="statuses">${waOrder.filter(([k]) => d.wa_status[k]).map(([k, l, tone]) => `<div class="st">${statusIcon(tone)}<span>${l}</span><b class="num">${d.wa_status[k]}</b></div>`).join('') || '<p class="muted small">No WhatsApp messages yet.</p>'}</div>
        <h2 style="margin-top:22px">Lead sources</h2><p class="cap">Where registrations came from.</p>${hbars(sources)}</section>
      <section class="panel"><h2>Counsellors</h2><p class="cap">Leads assigned in this period and how many were called.</p>
        ${d.team.length ? `<table class="t"><tr><th>Name</th><th>Role</th><th class="n">Assigned</th><th class="n">Called</th><th class="n">Rating</th></tr>
        ${d.team.map(m => `<tr><td>${esc(m.name)}</td><td class="muted">${m.role === 'call' ? 'Call' : 'Chat'}</td><td class="n">${m.assigned}</td><td class="n">${m.called}</td><td class="n">${m.avg_rating == null ? '-' : m.avg_rating}</td></tr>`).join('')}</table>`
        : '<p class="muted small">No leads have been assigned yet.</p>'}</section>
      <section class="panel"><h2>Service ratings</h2><p class="cap">Student feedback after the counsellor's call.</p><div class="chart" id="ratings"></div></section>
      <section class="panel wide"><h2>Latest leads</h2><p class="cap">The 15 most recent registrations.</p>
        ${d.recent.length ? `<div class="scroll"><table class="t"><tr><th>Name</th><th>Phone</th><th>Stage</th><th>Quality</th><th>Counsellor</th><th>WhatsApp</th><th>Source</th></tr>
        ${d.recent.map(r => `<tr><td>${esc(r.name || '-')}</td><td class="num">${esc(r.phone || '-')}</td><td>${esc(STAGES[r.stage] || r.stage || '-')}</td>
          <td>${r.quality ? `<span class="pill ${/hot|good|qualified/i.test(r.quality) ? 'good' : /unqual|no resp/i.test(r.quality) ? 'warn' : ''}">${esc(r.quality)}</span>` : '-'}</td>
          <td>${esc(r.counsellor || '-')}</td><td>${r.wa_status ? `<span class="pill ${/read|deliver/.test(r.wa_status) ? 'good' : r.wa_status === 'failed' ? 'bad' : ''}">${esc(r.wa_status)}</span>` : '-'}</td>
          <td class="muted">${esc(r.source || '-')}</td></tr>`).join('')}</table></div>` : '<p class="muted small">No leads yet.</p>'}</section>
    </div>`;
  $$('[data-days]', el).forEach(b => b.onclick = () => dashboard(el, opts, Number(b.dataset.days)));
  columnChart($('#perDay', el), d.per_day.map(x => ({ label: x.day.slice(5), full: x.day, value: x.leads })), { unit: 'lead', height: 220 });
  columnChart($('#ratings', el), d.rating_dist.map(x => ({ label: x.rating + ' star', full: x.rating + ' star', value: x.count })), { unit: 'review', height: 170, every: 1 });
}
const kpi = (v, l, dsc) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div><div class="d">${esc(dsc)}</div></div>`;
function hbars(rows) {
  if (!rows.length) return '<p class="muted small">Nothing yet.</p>';
  const max = Math.max(...rows.map(r => r[1]));
  return `<div class="hbars">${rows.map(([n, v]) => `<div class="hbar"><span class="name" title="${esc(n)}">${esc(n)}</span>
    <span class="track"><span class="fill" style="width:${Math.max(2, v / max * 100)}%"></span></span><span class="val">${v}</span></div>`).join('')}</div>`;
}
function statusIcon(tone) {
  if (tone === 'good') return `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--ok)"/><path d="M4.5 8.2l2.2 2.2 4.8-4.8" stroke="#fff" stroke-width="1.8" fill="none"/></svg>`;
  if (tone === 'bad') return `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--bad)"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.8"/></svg>`;
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="var(--ink-3)" stroke-width="2"/></svg>`;
}
function columnChart(el, data, { unit = '', height = 200, every } = {}) {
  const W = Math.max(320, el.clientWidth || 640), H = height, m = { t: 10, r: 6, b: 24, l: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = Math.max(1, ...data.map(d => d.value));
  const step = niceStep(max), top = Math.ceil(max / step) * step;
  const bw = iw / data.length, gap = Math.min(8, Math.max(2, bw * 0.28)), w = Math.max(2, bw - gap);
  const y = v => m.t + ih - (v / top) * ih;
  every = every || Math.ceil(data.length / Math.max(2, Math.floor(iw / 56)));
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Column chart, ${data.length} values">`;
  for (let v = 0; v <= top; v += step) svg += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  data.forEach((d, i) => {
    const x = m.l + i * bw + gap / 2, h = (d.value / top) * ih, r = Math.min(4, w / 2, h);
    if (d.value > 0) svg += `<path class="bar" data-i="${i}" d="M${x},${m.t + ih} V${m.t + ih - h + r} Q${x},${m.t + ih - h} ${x + r},${m.t + ih - h} H${x + w - r} Q${x + w},${m.t + ih - h} ${x + w},${m.t + ih - h + r} V${m.t + ih} Z"/>`;
    if (i % every === 0) svg += `<text class="tick" x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>`;
    svg += `<rect class="hit" data-i="${i}" x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ih}"/>`;
  });
  el.innerHTML = svg + '</svg><div class="tip" hidden></div>';
  const tip = $('.tip', el), s = $('svg', el);
  const show = i => {
    const d = data[i], scale = el.clientWidth / W;
    tip.innerHTML = `${esc(d.full)}: <b>${d.value}</b> ${unit}${d.value === 1 ? '' : 's'}`;
    tip.style.left = (m.l + i * bw + bw / 2) * scale + 'px'; tip.style.top = y(d.value) * scale + 'px'; tip.hidden = false;
    $$('.bar', el).forEach(b => b.classList.toggle('dim', b.dataset.i !== String(i)));
  };
  s.addEventListener('mousemove', e => { const r = e.target.closest('.hit'); if (r) show(Number(r.dataset.i)); });
  s.addEventListener('mouseleave', () => { tip.hidden = true; $$('.bar', el).forEach(b => b.classList.remove('dim')); });
}
function niceStep(max) { const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw || 1))); return [1, 2, 5, 10].map(k => k * p).find(s => s >= raw) || p * 10; }

// ------------------------------------------------------------------ account info + invoices (used by both sides)
const COUNTRIES = ['Bangladesh', 'United Kingdom', 'United States', 'Canada', 'Australia', 'Germany', 'Ireland', 'Netherlands', 'United Arab Emirates', 'India', 'Pakistan', 'Nepal', 'Other'];
function infoFields(a) {
  return `<div class="grid2">
    ${field('Company name', 'company', a.company, { attrs: 'required autocomplete="organization"' })}
    ${field('Contact person', 'name', a.name, { attrs: 'required autocomplete="name"' })}
    ${field('Phone or WhatsApp', 'phone', a.phone, { type: 'text', attrs: 'autocomplete="tel"' })}
    <label class="field"><span class="lab">Country</span><select name="country">${['', ...COUNTRIES].map(c => `<option ${c === a.country ? 'selected' : ''} value="${esc(c)}">${c || 'Choose'}</option>`).join('')}
      ${a.country && !COUNTRIES.includes(a.country) ? `<option selected>${esc(a.country)}</option>` : ''}</select></label>
    ${field('Website', 'website', a.website, { ph: 'https://' })}
    <label class="field"><span class="lab">Type of business</span><select name="business_type">${['', 'Study abroad consultancy', 'IELTS or language centre', 'University or college', 'Training institute', 'Other'].map(c => `<option ${c === a.business_type ? 'selected' : ''} value="${esc(c)}">${c || 'Choose'}</option>`).join('')}</select></label>
  </div>${area('Office address', 'address', a.address)}`;
}
const INV = { unpaid: ['Waiting for payment', 'warn'], submitted: ['Payment under review', 'info'], paid: ['Paid', 'good'], rejected: ['Payment not found', 'bad'], void: ['Cancelled', ''] };
const invPill = st => statusPill(...(INV[st] || [st, '']));
const SUB = { none: ['No plan yet', ''], trial: ['Free trial', 'info'], active: ['Active', 'good'], grace: ['Payment overdue', 'warn'], expired: ['Expired', 'bad'] };
const subPill = st => statusPill(...(SUB[st] || [st, '']));
const STAGE = { review: ['Setting up', 'info'], live: ['Live', 'good'], expired: ['Expired', 'bad'], suspended: ['Paused by Briefbox', 'warn'], rejected: ['Not approved', 'bad'] };
const stagePill = st => statusPill(...(STAGE[st] || [st, '']));

window.UI = { $, $$, esc, toast, makeApi, fmtDate, fmtDateTime, money, periodLabel, busy, field, area, choices, statusPill, settingsForm, dashboard,
  infoFields, invPill, subPill, stagePill, crmLabel, bindCopy };
})();
