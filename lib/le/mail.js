// Emails to clients and to you: order confirmation with the invoice, payment received, payment confirmed
// (receipt), automation live, welcome. Sent through Resend (API key) or your own n8n webhook.
// A failed email never stops the order itself; every attempt is listed in Admin → Billing settings.
import { encryptJSON, decryptJSON } from '../auth.js';
import { getContent } from '../content.js';

const q = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);
const all = async (env, sql, ...a) => (await q(env, sql, ...a).all()).results || [];
const one = (env, sql, ...a) => q(env, sql, ...a).first();
const run = (env, sql, ...a) => q(env, sql, ...a).run();
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export const invNo = id => 'BB-' + String(id).padStart(5, '0');
export const money = (n, cur = 'USD') => {
  const v = Number(n) || 0;
  if (cur === 'BDT') return '৳' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); } catch (e) { return cur + ' ' + v; }
};
const day = t => t ? new Date(Number(t)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' }) : '-';
const period = d => d % 365 === 0 ? (d / 365 === 1 ? '1 year' : d / 365 + ' years') : d % 30 === 0 ? (d / 30 === 1 ? '1 month' : d / 30 + ' months') : d + ' days';

// ---------------------------------------------------------------- settings
const KEYS = ['mail_mode', 'mail_provider', 'mail_from', 'mail_admin', 'mail_webhook', 'mail_reply_to'];
export async function mailConfig(env) {
  const c = Object.fromEntries((await all(env, `SELECT key, value FROM config WHERE key LIKE 'mail_%'`)).map(r => [r.key, r.value]));
  let key = '';
  if (c.mail_api_key_enc) { try { key = (await decryptJSON(env, c.mail_api_key_enc)).k || ''; } catch (e) { key = ''; } }
  return { mode: c.mail_mode === 'test' ? 'test' : 'live', provider: c.mail_provider || '', from: c.mail_from || '', admin: c.mail_admin || '', webhook: c.mail_webhook || '', reply_to: c.mail_reply_to || '', api_key: key };
}
export async function mailView(env) {
  const c = await mailConfig(env);
  return { ...c, api_key: c.api_key ? '••••' + c.api_key.slice(-4) : '', log: await all(env, 'SELECT id, to_addr, subject, kind, status, error, account_id, created_at FROM emails ORDER BY id DESC LIMIT 50') };
}
export async function setMailConfig(env, b) {
  const set = (k, v) => run(env, 'INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, String(v ?? '').trim().slice(0, 500));
  if ('mode' in b) await set('mail_mode', b.mode === 'test' ? 'test' : 'live');
  if ('provider' in b) { if (!['', 'resend', 'n8n'].includes(b.provider)) throw err('Choose Resend, n8n or Off.'); await set('mail_provider', b.provider); }
  if ('from' in b) { if (b.from && !EMAIL.test(String(b.from).replace(/^.*</, '').replace(/>$/, ''))) throw err('The "From" address is not a valid email.'); await set('mail_from', b.from); }
  if ('admin' in b) { if (b.admin && !String(b.admin).split(',').every(x => EMAIL.test(x.trim()))) throw err('The admin email is not valid.'); await set('mail_admin', b.admin); }
  if ('reply_to' in b) { if (b.reply_to && !EMAIL.test(String(b.reply_to).trim())) throw err('The reply-to email is not valid.'); await set('mail_reply_to', b.reply_to); }
  if ('webhook' in b) { if (b.webhook && !/^https:\/\//.test(b.webhook)) throw err('The n8n webhook must start with https://'); await set('mail_webhook', b.webhook); }
  if (b.api_key && !String(b.api_key).startsWith('••••')) await set('mail_api_key_enc', await encryptJSON(env, { k: String(b.api_key).trim() }));
  return mailView(env);
}

// ---------------------------------------------------------------- sending
// A company's HR emails go out from the verified address, under the company's name.
const fromFor = (c, msg) => { if (!msg.from_name) return c.from; const addr = (/<([^>]+)>/.exec(c.from) || [, c.from])[1]; return `${String(msg.from_name).replace(/["<>]/g, '')} <${addr}>`; };
async function deliver(c, msg) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    if (c.provider === 'resend') {
      if (!c.api_key || !c.from) throw new Error('Resend needs an API key and a From address.');
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: ctl.signal,
        headers: { Authorization: 'Bearer ' + c.api_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromFor(c, msg), to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, ...((msg.reply_to || c.reply_to) ? { reply_to: msg.reply_to || c.reply_to } : {}) }) });
      if (!r.ok) throw new Error('Resend: ' + ((await r.json().catch(() => ({}))).message || r.status));
    } else if (c.provider === 'n8n') {
      if (!c.webhook) throw new Error('Add the n8n webhook URL.');
      const r = await fetch(c.webhook, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: msg.to.join(','), from: fromFor(c, msg), reply_to: msg.reply_to || c.reply_to, subject: msg.subject, html: msg.html, text: msg.text, kind: msg.kind }) });
      if (!r.ok) throw new Error('n8n webhook answered ' + r.status);
    } else throw new Error('Email is off');
  } finally { clearTimeout(t); }
}
export async function sendMail(env, { to, subject, html, text, kind = '', from_name = '', reply_to = '', account_id = null }) {
  const list = (Array.isArray(to) ? to : String(to || '').split(',')).map(x => String(x).trim()).filter(x => EMAIL.test(x));
  if (!list.length) return { ok: false, error: 'No email address' };
  const c = await mailConfig(env);
  // Test mode: nothing leaves the server. The email waits in the Outbox, where its buttons and links can be opened by hand.
  if (c.mode === 'test') {
    try { await run(env, 'INSERT INTO emails(to_addr, subject, kind, status, error, html, account_id, created_at) VALUES(?,?,?,?,?,?,?,?)', list.join(', '), subject.slice(0, 200), kind, 'held', '', String(html || '').slice(0, 200000), account_id, Date.now()); } catch (e) { /* log only */ }
    return { ok: true, held: true, error: '' };
  }
  if (!c.provider) return { ok: false, error: 'Email is off' };
  let error = '';
  try { await deliver(c, { to: list, subject, html, text, kind, from_name, reply_to: EMAIL.test(reply_to) ? reply_to : '' }); } catch (e) { error = e.name === 'AbortError' ? 'Timed out' : String(e.message || e).slice(0, 300); }
  try { await run(env, 'INSERT INTO emails(to_addr, subject, kind, status, error, html, account_id, created_at) VALUES(?,?,?,?,?,?,?,?)', list.join(', '), subject.slice(0, 200), kind, error ? 'failed' : 'sent', error, String(html || '').slice(0, 200000), account_id, Date.now()); } catch (e) { /* log only */ }
  return { ok: !error, error };
}
// One stored email, shown in a sandboxed frame (test mode outbox and the sent log).
export async function emailHtml(env, id, accountId) {
  const r = await env.DB.prepare(`SELECT html FROM emails WHERE id = ?${accountId ? ' AND account_id = ?' : ''}`).bind(...(accountId ? [Number(id), accountId] : [Number(id)])).first();
  if (!r) return new Response('Not found', { status: 404 });
  const html = (r.html || '<p style="font-family:sans-serif">This email was sent before emails were stored.</p>').replace(/<head>/i, '<head><base target="_blank">');
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline'", 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' } });
}
// Never let an email problem break the action that triggered it.
const safe = fn => async (...a) => { try { return await fn(...a); } catch (e) { console.error('email:', e.message); return { ok: false, error: e.message }; } };

// ---------------------------------------------------------------- template
export async function brand(env) {
  let S = {};
  try { S = (await getContent()).site || {}; } catch (e) { /* defaults */ }
  const D = String(S.domain || 'https://briefboxdigital.com').replace(/\/$/, '');
  return { name: S.brand || 'Briefbox Digital', D, email: S.email || '', phone: S.phone || '', address: [S.address, S.city].filter(Boolean).join(', ') };
}
export function layout(B, { pre, title, intro, body, cta }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f3fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1a3a">
<span style="display:none;max-height:0;overflow:hidden">${esc(pre)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3fb;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e3f5">
<tr><td style="height:5px;${B.color ? `background:${B.color}` : 'background:linear-gradient(90deg,#6a14f5,#ff7a00);background-color:#6a14f5'}"></td></tr>
<tr><td style="padding:26px 32px 6px">${B.logoUrl ? `<img src="${esc(B.logoUrl)}" alt="${esc(B.name)}" height="44" style="display:block;height:44px;width:auto;border-radius:8px">` : B.textLogo ? `<span style="font-size:20px;font-weight:700;color:#14112e">${esc(B.name)}</span>` : `<img src="${B.D}/assets/logo-h-dark.png" alt="${esc(B.name)}" height="40" style="display:block;height:40px;width:auto">`}</td></tr>
<tr><td style="padding:12px 32px 4px"><h1 style="margin:0;font-size:22px;line-height:1.3;color:#14112e">${esc(title)}</h1>
<p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#4a4766">${intro}</p></td></tr>
<tr><td style="padding:14px 32px 8px">${body}</td></tr>
${cta ? `<tr><td style="padding:6px 32px 26px"><a href="${esc(cta.href)}" style="display:inline-block;${B.color ? `background:${B.color};` : 'background:#6a14f5;background-image:linear-gradient(90deg,#6a14f5,#ff7a00);'}color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;font-size:15px">${esc(cta.label)}</a></td></tr>` : ''}
<tr><td style="padding:18px 32px 26px;border-top:1px solid #efedf8;font-size:12.5px;line-height:1.6;color:#8a87a3">${esc(B.name)}${B.address ? ' · ' + esc(B.address) : ''}<br>
${B.email ? `<a href="mailto:${esc(B.email)}" style="color:#6a14f5">${esc(B.email)}</a>` : ''}${B.phone ? ' · ' + esc(B.phone) : ''}</td></tr>
</table></td></tr></table></body></html>`;
  return html;
}
export const toText = html => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<(br|\/p|\/tr|\/h1|\/div)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
export const rows = list => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${list.map(([k, v], i) =>
  `<tr><td style="padding:9px 0;color:#8a87a3;border-top:${i ? '1px solid #efedf8' : '0'};width:42%">${esc(k)}</td><td style="padding:9px 0;color:#1d1a3a;border-top:${i ? '1px solid #efedf8' : '0'};text-align:right;font-weight:600">${v}</td></tr>`).join('')}</table>`;
export function invoiceTable(inv, a) {
  return `<div style="border:1px solid #e6e3f5;border-radius:12px;padding:16px 18px;background:#fbfaff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#8a87a3;margin-bottom:6px"><tr>
<td>Invoice <b style="color:#1d1a3a">${invNo(inv.id)}</b></td><td style="text-align:right">${day(inv.created_at)}</td></tr></table>
${rows([['Billed to', esc(a.company || a.name || a.email)], ['Automation', esc(inv.product_name || '')], ['Plan', esc(inv.plan_name) + ' · ' + period(inv.period_days)],
  ...(inv.period_end ? [['Service period', day(inv.period_start) + ' – ' + day(inv.period_end)]] : []),
  ['Status', { paid: '<span style="color:#1f8a4c">Paid</span>', submitted: 'Payment under review', unpaid: '<span style="color:#a8670f">Waiting for payment</span>', rejected: '<span style="color:#c0392b">Payment not found</span>' }[inv.status] || esc(inv.status)],
  ['Total', `<span style="font-size:18px">${esc(money(inv.amount, inv.currency))}</span>`]])}</div>`;
}
const instructions = text => text ? `<h2 style="font-size:15px;margin:22px 0 8px;color:#14112e">How to pay</h2>
<div style="white-space:pre-wrap;background:#f4f3fb;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.6;color:#1d1a3a">${esc(text)}</div>
<p style="font-size:13.5px;color:#4a4766;margin:10px 0 0">After paying, open the portal and send the transaction ID, so we can confirm it quickly.</p>` : '';

// ---------------------------------------------------------------- the emails
async function ctx(env, inv) {
  const a = await one(env, 'SELECT * FROM accounts WHERE id = ?', inv.account_id);
  return { a, B: await brand(env), c: await mailConfig(env) };
}
const portal = (B, inv) => `${B.D}/portal#/invoice/${inv.id}`;
const send = (env, to, subject, kind, parts, B) => { const html = layout(B, parts); return sendMail(env, { to, subject, html, text: toText(html), kind }); };

export const orderPlaced = safe(async (env, inv, payText = '') => {
  const { a, B, c } = await ctx(env, inv); if (!a) return;
  await send(env, a.email, `Order confirmed: ${inv.product_name} ${inv.plan_name} – invoice ${invNo(inv.id)}`, 'order', {
    pre: `Your invoice ${invNo(inv.id)} for ${money(inv.amount, inv.currency)}`, title: 'Thank you for your order',
    intro: `Hi ${esc(a.name || a.company)}, we have received your order for <b>${esc(inv.product_name)}</b>. Your invoice is below. Your automation is switched on after we confirm the payment and check your setup.`,
    body: invoiceTable(inv, a) + instructions(payText), cta: { label: 'View invoice and pay', href: portal(B, inv) } }, B);
  if (c.admin) await send(env, c.admin, `New order: ${a.company} – ${inv.product_name} ${inv.plan_name} (${money(inv.amount, inv.currency)})`, 'admin-order', {
    pre: 'New order in the client portal', title: 'New order', intro: `${esc(a.company)} (${esc(a.email)}) chose a plan.`, body: invoiceTable(inv, a),
    cta: { label: 'Open payments', href: `${B.D}/admin#le-payments` } }, B);
});
export const paymentSubmitted = safe(async (env, inv) => {
  const { a, B, c } = await ctx(env, inv); if (!a) return;
  await send(env, a.email, `Payment details received – invoice ${invNo(inv.id)}`, 'payment-sent', {
    pre: 'We are checking your payment', title: 'We are checking your payment',
    intro: `Thanks! You sent reference <b>${esc(inv.reference)}</b>${inv.method ? ' (' + esc(inv.method) + ')' : ''}. We usually confirm within one working day and will email you a receipt.`,
    body: invoiceTable(inv, a), cta: { label: 'Open the portal', href: portal(B, inv) } }, B);
  if (c.admin) await send(env, c.admin, `Payment to check: ${a.company} – ${money(inv.amount, inv.currency)} (${inv.method || 'payment'})`, 'admin-payment', {
    pre: 'A client sent payment details', title: 'Payment to check', intro: `${esc(a.company)} sent reference <b>${esc(inv.reference)}</b>${inv.payer_note ? '. Note: ' + esc(inv.payer_note) : ''}.`,
    body: invoiceTable(inv, a), cta: { label: 'Review payment', href: `${B.D}/admin#le-payments` } }, B);
});
export const paymentConfirmed = safe(async (env, inv) => {
  const { a, B } = await ctx(env, inv); if (!a) return;
  await send(env, a.email, `Payment confirmed – receipt ${invNo(inv.id)}`, 'receipt', {
    pre: `Paid until ${day(inv.period_end)}`, title: 'Payment confirmed',
    intro: `We have received ${esc(money(inv.amount, inv.currency))} for <b>${esc(inv.product_name)}</b>. Your plan runs until <b>${day(inv.period_end)}</b>. This email is your receipt.`,
    body: invoiceTable(inv, a), cta: { label: 'View receipt', href: portal(B, inv) } }, B);
});
export const paymentRejected = safe(async (env, inv) => {
  const { a, B } = await ctx(env, inv); if (!a) return;
  await send(env, a.email, `We could not find your payment – invoice ${invNo(inv.id)}`, 'payment-rejected', {
    pre: 'Please check your payment details', title: 'We could not find your payment',
    intro: `We could not match reference <b>${esc(inv.reference)}</b> to a payment. ${esc(inv.admin_note || '')} Please check it and send the details again in the portal.`,
    body: invoiceTable(inv, a), cta: { label: 'Send details again', href: portal(B, inv) } }, B);
});
export const automationLive = safe(async (env, sub, productName) => {
  const a = await one(env, 'SELECT * FROM accounts WHERE id = ?', sub.account_id), B = await brand(env); if (!a) return;
  await send(env, a.email, `${productName} is approved`, 'approved', {
    pre: 'Your automation is set up', title: `${productName} is approved`,
    intro: `Good news, ${esc(a.name || a.company)}: we checked your setup and approved <b>${esc(productName)}</b>. ${['active', 'trial', 'grace'].includes(sub.sub_status) ? 'It is running now. Your dashboard shows everything it does.' : 'It starts running as soon as your payment is confirmed.'}`,
    body: '', cta: { label: 'Open your dashboard', href: `${B.D}/portal#/a/${sub.id}` } }, B);
});
export const welcome = safe(async (env, a) => {
  const B = await brand(env), c = await mailConfig(env);
  await send(env, a.email, `Welcome to ${B.name}`, 'welcome', {
    pre: 'Your client account is ready', title: 'Your account is ready',
    intro: `Hi ${esc(a.name || a.company)}, welcome! In your portal you can choose automations, connect your tools, pay and follow results.`,
    body: rows([['Company', esc(a.company)], ['Sign-in email', esc(a.email)], ['Client ID', esc(a.client_id)]]), cta: { label: 'Go to your portal', href: `${B.D}/portal#/` } }, B);
  if (c.admin) await send(env, c.admin, `New client sign-up: ${a.company}`, 'admin-signup', {
    pre: 'New client account', title: 'New client sign-up', intro: `${esc(a.name)} from ${esc(a.company)} created an account.`,
    body: rows([['Email', esc(a.email)], ['Phone', esc(a.phone || '-')], ['Country', esc(a.country || '-')]]), cta: { label: 'Open clients', href: `${B.D}/admin#le-clients` } }, B);
});
export const testMail = async (env, to) => {
  const B = await brand(env);
  const r = await send(env, to, `Test email from ${B.name}`, 'test', { pre: 'Email works', title: 'Email works', intro: 'This is a test from your admin panel. Order confirmations, invoices and receipts will look like this.',
    body: invoiceTable({ id: 1, created_at: Date.now(), product_name: 'AI Lead Qualifier', plan_name: 'Growth', period_days: 30, status: 'unpaid', amount: 249, currency: 'USD' }, { company: 'Example Ltd' }) }, B);
  if (!r.ok) throw err(r.error || 'Could not send');
  return r;
};
