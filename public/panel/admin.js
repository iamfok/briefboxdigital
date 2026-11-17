/* Briefbox admin panel: website content, media, inbox, users, history and Lead Engine.
   Talks only to this site's own /api/admin. No GitHub or other platform needed. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mk = (t, h, c) => { const e = document.createElement(t); if (h) e.innerHTML = h; if (c) e.className = c; return e; };
const IC = {dash:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',home:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',nav:'<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/>',seo:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',svc:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',tag:'<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r=".5"/>',file:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',pen:'<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6l-4 1 1-4z"/>',help:'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',img:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',plug:'<path d="M12 22v-5M9 8V2M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',menu:'<path d="M4 12h16M4 6h16M4 18h16"/>',ext:'<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',hist:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',bolt:'<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',layers:'<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',cog:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'};
const ico = n => `<svg viewBox="0 0 24 24">${IC[n] || IC.file}</svg>`;

let S = {}, VER = {}, dirty = new Set(), me = {}, unread = 0, leCounts = null, sel = 0, q = '', curF = 'site';
let view = 'dash', params = [];
const readHash = () => { const h = (location.hash || '#dash').slice(1).split('/'); view = h[0] || 'dash'; params = h.slice(1); };
readHash();

const V = [
  { id: 'dash', t: 'Dashboard', i: 'dash' },
  { id: 'inbox', t: 'Inbox', i: 'inbox', need: 'inbox' },
  { id: 'home', t: 'Homepage', i: 'home', f: 'site', k: ['home'] },
  { id: 'menus', t: 'Header & Footer', i: 'nav', f: 'site', k: ['nav', 'cta', 'footer', 'social'] },
  { id: 'seo', t: 'SEO & Branding', i: 'seo', f: 'site', k: ['brand', 'domain', 'email', 'phone', 'address', 'tagline', 'description', 'theme', 'cover'] },
  { id: 'pgs', t: 'Page Texts', i: 'file', f: 'site', k: ['pg'] },
  { id: 'services', t: 'Services', i: 'svc', f: 'services', list: 1, omit: ['tiers', 'from'] },
  { id: 'pricing', t: 'Pricing', i: 'tag', f: 'services', list: 1, only: ['from', 'tiers'] },
  { id: 'pages', t: 'Pages', i: 'file', f: 'pages', list: 1 },
  { id: 'posts', t: 'Blog', i: 'pen', f: 'posts', list: 1 },
  { id: 'faqs', t: 'FAQs', i: 'help', f: 'faqs', k: ['home', 'blog', 'pricing'] },
  { id: 'media', t: 'Media Library', i: 'img' },
  { id: 'le-overview', t: 'Overview', i: 'bolt', need: 'owner', le: 1 },
  { id: 'le-clients', t: 'Clients', i: 'users', need: 'owner', le: 1 },
  { id: 'le-payments', t: 'Payments', i: 'card', need: 'owner', le: 1 },
  { id: 'le-plans', t: 'Plans', i: 'layers', need: 'owner', le: 1 },
  { id: 'le-billing', t: 'Billing settings', i: 'tag', need: 'owner', le: 1 },
  { id: 'le-connection', t: 'n8n connection', i: 'plug', need: 'owner', le: 1 },
  { id: 'integ', t: 'Tracking & Booking', i: 'plug', f: 'site', k: ['track', 'book', 'forms'] },
  { id: 'history', t: 'History', i: 'hist' },
  { id: 'team', t: 'Users & Access', i: 'cog' },
];
// hidden routes inside Lead Engine
const HIDDEN = { 'le-a': 'le-clients', 'le-new': 'le-clients' };
const GR = [['Overview', ['dash', 'inbox']], ['Website', ['home', 'menus', 'seo', 'pgs']], ['Content', ['services', 'pricing', 'pages', 'posts', 'faqs', 'media']],
  ['Lead Engine', ['le-overview', 'le-clients', 'le-payments', 'le-plans', 'le-billing', 'le-connection']], ['System', ['integ', 'history', 'team']]];
const allowed = v => !v.need || (v.need === 'owner' ? me.role === 'owner' : me.role !== 'viewer');
const canEdit = () => me.role === 'owner' || me.role === 'editor';

async function api(p, o = {}) {
  const r = await fetch('/api/admin/' + p, { method: o.method || 'GET', credentials: 'same-origin',
    headers: o.body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) { /* empty */ }
  if (r.status === 401 && !o.noAuth) { dirty.clear(); start(); throw Object.assign(new Error(j.error || 'Please sign in.'), { auth: true }); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed (' + r.status + ')'), { status: r.status });
  return j;
}
const ago = d => { const m = Math.round((Date.now() - d) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const when = ms => ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
function toast(m, t) { const x = mk('div', esc(m), 'tst ' + (t || '')); $('#tt').append(x); setTimeout(() => x.remove(), 5000); }

// ------------------------------------------------------------------ sign in
const side = (h, p) => `<div class="lgl"><img src="/assets/logo.png" alt="Briefbox Digital"><h2>${h}</h2><p>${p}</p></div>`;
async function start() {
  $('#app').innerHTML = '<div class="lg" style="display:grid;place-items:center">Loading…</div>';
  let st; try { st = await api('status', { noAuth: true }); } catch (e) { st = { db: false, db_error: e.message }; }
  if (!st.db) return noDb(st);
  if (st.needs_setup) return setup(st);
  if (st.user) { me = st.user; return boot(); }
  login();
}
function noDb(st) {
  $('#app').innerHTML = `<div class="lg">${side('Website Admin Panel', 'Manage pages, pricing, blog, FAQs, SEO, tracking and Lead Engine clients.')}
    <div class="lgr"><div><h1>Connect the database</h1><p class="s">Your website is live and shows its built-in content. To edit it here, connect a Cloudflare D1 database once.</p>
    <ol class="steps"><li>Cloudflare dashboard → <b>Storage & Databases → D1</b> → Create database named <code>briefbox</code>.</li>
      <li>Copy its <b>Database ID</b>.</li><li>In GitHub, open <code>wrangler.jsonc</code>, remove <code>//</code> in front of the 3 database lines and paste the ID. Commit.</li>
      <li>Cloudflare deploys again in about 2 minutes. Reload this page and create your owner account.</li></ol>
    ${st.db_error ? `<p class="err">Database error: ${esc(st.db_error)}</p>` : ''}
    <button class="btn k" id="re" style="width:100%;justify-content:center;padding:11px">Check again</button></div></div></div>`;
  $('#re').onclick = start;
}
function setup(st) {
  $('#app').innerHTML = `<div class="lg">${side('Welcome', 'The database is connected. Create the first Super Admin account. Do this right away: until an owner exists, anyone who opens this page could create it.')}
    <div class="lgr"><form id="sf" autocomplete="on"><h1>Create the owner account</h1><p class="s">You can add more admins later in Users & Access.</p>
    <label class="fl"><span>Your name</span><input name="name" required autocomplete="name"></label>
    <label class="fl"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
    <label class="fl"><span>Password</span><input name="password" type="password" required autocomplete="new-password"><small>At least 8 characters with letters and numbers.</small></label>
    <label class="fl"><span>Repeat password</span><input name="password2" type="password" required autocomplete="new-password"></label>
    ${st.setup_code ? '<label class="fl"><span>Setup code</span><input name="setup_code" required><small>The ADMIN_SETUP_CODE value you set in Cloudflare.</small></label>' : ''}
    <div id="le" class="err"></div><button class="btn k" style="width:100%;justify-content:center;padding:11px">Create account</button></form></div></div>`;
  $('#sf').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), b = e.target.querySelector('button');
    if (f.password !== f.password2) { $('#le').textContent = 'The two passwords are different.'; return; }
    b.disabled = true;
    try { const r = await api('setup', { method: 'POST', body: f, noAuth: true }); me = r.user; boot(); }
    catch (x) { $('#le').textContent = x.message; b.disabled = false; }
  };
}
function login(m) {
  $('#app').innerHTML = `<div class="lg">${side('Website Admin Panel', 'Manage pages, pricing, blog, FAQs, SEO, tracking and Lead Engine clients. Changes go live within seconds.')}
    <div class="lgr"><form id="lf"><h1>Sign in</h1><p class="s">Use your admin email and password.</p>
    <label class="fl"><span>Email</span><input name="email" type="email" required autocomplete="username" autofocus></label>
    <label class="fl"><span>Password</span><div class="row" style="margin:0"><input id="pw" name="password" type="password" required autocomplete="current-password"><button type="button" class="btn" id="eye">Show</button></div></label>
    <div id="le" class="err"></div><button class="btn k" style="width:100%;justify-content:center;padding:11px">Sign in</button>
    <p class="s" style="margin-top:14px">Forgot your password? Ask a Super Admin to reset it in Users & Access.</p></form></div></div>`;
  $('#le').textContent = m || '';
  $('#eye').onclick = () => { const t = $('#pw'); t.type = t.type === 'password' ? 'text' : 'password'; };
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const b = e.target.querySelector('button.k'); b.disabled = true; b.textContent = 'Signing in…';
    try { const r = await api('login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)), noAuth: true }); me = r.user; boot(); }
    catch (x) { $('#le').textContent = x.message; b.disabled = false; b.textContent = 'Sign in'; }
  };
}
async function boot() {
  $('#app').innerHTML = '<div class="lg" style="display:grid;place-items:center">Loading your workspace…</div>';
  try { await loadContent(); shell(); }
  catch (e) { if (!e.auth) login('Could not load content: ' + e.message); }
}
async function loadContent() {
  const r = await api('content');
  S = r.files; VER = r.versions || {}; unread = r.unread || 0; dirty.clear();
  if (me.role === 'owner') await refreshCounts(true);
}
async function refreshCounts(quiet) {
  if (me.role !== 'owner') return;
  try { leCounts = (await api('le/overview')).counts; } catch (e) { leCounts = null; }
  if (!quiet && $('#nv')) nav();
}
const roleLabel = () => me.role_label || me.role;

// ------------------------------------------------------------------ shell
function shell() {
  $('#app').innerHTML = `<div class="sh"><aside class="sb" id="sb"><div class="sbh"><img src="/assets/logo.png" alt=""><button id="cl" title="Collapse">${ico('menu')}</button></div><nav id="nv"></nav>
    <div class="sbf"><a class="ni" href="/" target="_blank" rel="noopener">${ico('ext')}<span class="lb">View website</span></a><a class="ni" href="/portal" target="_blank" rel="noopener">${ico('users')}<span class="lb">Client portal</span></a></div></aside>
    <div class="mn"><header class="tb"><button class="btn burg" id="bg">${ico('menu')}</button><span class="ttl">Admin Panel</span><span class="chip" id="dc" hidden></span>
    <button class="btn p" id="sv" disabled>Save &amp; publish</button><span class="av">${esc((me.name || me.email || 'A')[0].toUpperCase())}</span>
    <div class="who"><b>${esc(me.name || me.email)}</b><small>${esc(roleLabel())}</small></div><button class="btn" id="lo" title="Sign out">${ico('out')}</button></header><main class="ct" id="ct"></main></div></div>`;
  $('#sv').onclick = save;
  $('#bg').onclick = () => $('#sb').classList.toggle('o');
  $('#cl').onclick = () => $('#sb').classList.toggle('c');
  $('#lo').onclick = async () => { if (dirty.size && !confirm('You have unsaved changes. Sign out anyway?')) return; try { await api('logout', { method: 'POST', body: {} }); } catch (e) {} dirty.clear(); me = {}; login(); };
  render();
}
function badge(id) {
  if (id === 'inbox' && unread) return `<i class="cnt">${unread}</i>`;
  if (leCounts && id === 'le-clients' && leCounts.review) return `<i class="cnt">${leCounts.review}</i>`;
  if (leCounts && id === 'le-payments' && leCounts.payments) return `<i class="cnt">${leCounts.payments}</i>`;
  return '';
}
function nav() {
  const active = HIDDEN[view] || view;
  $('#nv').innerHTML = GR.map(([g, ids]) => {
    const items = ids.map(id => V.find(x => x.id === id)).filter(allowed);
    if (!items.length) return '';
    return `<h4>${g}</h4>` + items.map(v => `<button class="ni ${v.id === active ? 'on' : ''}" data-v="${v.id}" title="${v.t}">${ico(v.i)}<span class="lb">${v.t}</span>${v.f && dirty.has(v.f) ? '<b>.</b>' : badge(v.id)}</button>`).join('');
  }).join('');
  document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
}
function go(id, p = []) { view = id; params = p; sel = 0; q = ''; location.hash = [id, ...p].join('/'); $('#sb').classList.remove('o'); render(); }
function ui() { const n = dirty.size; $('#sv').disabled = !n || !canEdit(); $('#dc').hidden = !n; $('#dc').textContent = n + ' unsaved'; nav(); }
const SUB = { dash: 'Overview of your website, SEO health and launch checklist.', inbox: 'Messages and booking requests from the contact page.', home: 'Hero, sections, FAQ titles and call to action.',
  menus: 'Menus, footer links and social profiles.', seo: 'Company details, default description and brand colours.', pgs: 'Titles, headings and intro text of hub, pricing, blog and contact pages.',
  services: 'Service pages: headings, features, long content, process and FAQs.', pricing: 'Packages and prices. Add a payment link to enable Buy now.', pages: 'About, Privacy, Terms, Cookies and any new page.',
  posts: 'Blog articles. Link to a service to add internal links.', faqs: 'Questions shown on the homepage, blog and pricing pages.', media: 'Upload images and use them in pages and posts.',
  integ: 'Analytics, ad pixels, form endpoint and booking link.', history: 'Every saved version of your content. Restore any of them.', team: 'Who can sign in to this admin and what they can do.' };
function render() {
  let v = V.find(x => x.id === (HIDDEN[view] || view));
  if (!v || !allowed(v)) { view = 'dash'; params = []; v = V[0]; }
  const ct = $('#ct'), w = mk('div', '', 'in'); curF = v.f || 'site'; ct.innerHTML = ''; ct.append(w); ct.scrollTop = 0;
  if (v.le) { LE.render(view.slice(3), w, params); ui(); return; }
  w.append(mk('h1', esc(v.t), 'pt')); w.append(mk('p', SUB[view] || '', 'ps'));
  ({ dash, inbox, media, history: historyView, team }[view] || (v.list ? x => listView(v, x) : x => formView(v, x)))(w);
  ui();
}
const chg = f => { if (!canEdit()) return; dirty.add(f); ui(); };
async function save() {
  const b = $('#sv'); b.disabled = true; b.textContent = 'Publishing…';
  try {
    for (const f of [...dirty]) { const r = await api('content/' + f, { method: 'PUT', body: { data: S[f], version: VER[f] } }); VER[f] = r.version; dirty.delete(f); }
    toast('Published! Your live site shows the change within a few seconds.');
  } catch (e) { toast('Save failed: ' + e.message, 'e'); }
  b.textContent = 'Save & publish'; ui();
}
window.ADM = { refreshCounts: () => refreshCounts(false), rerender: () => { readHash(); render(); } };

// ------------------------------------------------------------------ dashboard
const len = (s, a, b) => { const n = String(s || '').length; return n >= a && n <= b; };
function dash(w) {
  const s = S.site, sv = S.services, tiers = sv.flatMap(x => x.tiers || []), paid = tiers.filter(t => t.pay).length;
  const seo = []; const add = (ok, l, v) => { if (!ok) seo.push([l, v]); };
  add(len(s.home.meta, 30, 60), 'Home title should be 30-60 characters', 'home'); add(len(s.description, 70, 160), 'Site description should be 70-160 characters', 'seo');
  sv.forEach(x => { add(len(x.seo_title, 30, 60), x.name + ': SEO title 30-60 characters', 'services'); add(len(x.meta, 70, 160), x.name + ': meta description 70-160 characters', 'services'); });
  S.pages.forEach(x => add(len(x.desc, 70, 160), 'Page "' + x.title + '": description 70-160 characters', 'pages'));
  S.posts.forEach(x => add(len(x.desc, 70, 160), 'Post "' + x.title + '": description 70-160 characters', 'posts'));
  const chk = [[s.track.gtm || s.track.ga4, 'Analytics connected', 'Add your GTM or GA4 ID', 'integ'], [s.track.meta, 'Meta Pixel connected', 'Add your Meta Pixel ID', 'integ'],
    [s.track.ads, 'Google Ads connected', 'Add your Google Ads ID', 'integ'], [s.book.url, 'Google Calendar booking link', 'Paste your booking link', 'integ'],
    [true, 'Contact form saves to your Inbox', '', 'inbox'], [s.forms.endpoint, 'Contact form also emails you (Formspree)', 'Add a Formspree endpoint', 'integ'],
    [paid === tiers.length, 'Payment links (' + paid + '/' + tiers.length + ')', 'Add a checkout link to every package', 'pricing'],
    [s.social.every(x => String(x.u || '').replace(/\/$/, '').split('/').length > 3), 'Real social profile links', 'Replace the placeholder links', 'menus'],
    [s.address && s.phone, 'Company address and phone (trust and local SEO)', 'Add them in SEO & Branding', 'seo']];
  const done = chk.filter(c => c[0]).length, pc = Math.round(done / chk.length * 100), sc = Math.max(0, 100 - seo.length * 6);
  const cards = [['Services', sv.length, 'svc', 'services'], ['Packages', tiers.length, 'tag', 'pricing'], ['Pages', S.pages.length, 'file', 'pages'], ['Blog posts', S.posts.length, 'pen', 'posts']];
  if (me.role !== 'viewer') cards.push(['Unread messages', unread, 'inbox', 'inbox']);
  if (leCounts) cards.push(['Live clients', leCounts.live, 'bolt', 'le-overview'], ['Waiting for you', (leCounts.review || 0) + (leCounts.payments || 0), 'card', 'le-overview']);
  w.innerHTML += `<div class="gr">${cards.map(x => `<div class="stc" data-g="${x[3]}"><div><span>${x[0]}</span><b>${x[1]}</b></div>${ico(x[2])}</div>`).join('')}</div>
<div class="gr" style="grid-template-columns:1fr 1fr"><div class="cd"><h3>SEO health<small>${sc}/100</small></h3><div class="pbar"><i style="width:${sc}%"></i></div>${seo.length ? seo.slice(0, 6).map(x => `<div class="ck"><u>!</u><span>${esc(x[0])}</span><button class="btn sm" data-g="${x[1]}">Fix</button></div>`).join('') + (seo.length > 6 ? `<small style="color:var(--mu)">+${seo.length - 6} more</small>` : '') : '<div class="ck ok"><u>✓</u><span>All titles and descriptions look good</span></div>'}</div>
<div class="cd"><h3>Launch checklist<small>${pc}% complete</small></h3><div class="pbar"><i style="width:${pc}%"></i></div>${chk.map(c => `<div class="ck ${c[0] ? 'ok' : ''}"><u>${c[0] ? '✓' : '!'}</u><span>${c[1]}<small>${c[0] ? 'Done' : c[2]}</small></span>${c[0] ? '' : `<button class="btn sm" data-g="${c[3]}">Set up</button>`}</div>`).join('')}</div></div>
<div class="cd"><h3>Quick actions</h3><div class="ac">${canEdit() ? '<button class="btn" data-g="posts" data-n="1">New blog post</button><button class="btn" data-g="pages" data-n="1">New page</button>' : ''}<button class="btn" data-g="home">Edit homepage</button><button class="btn" data-g="pricing">Edit pricing</button><a class="btn" href="/sitemap.xml" target="_blank">Sitemap</a><a class="btn" href="/" target="_blank">View website</a></div></div>
<div class="cd"><h3>Recent changes</h3><div id="rc" style="color:var(--mu)">Loading…</div></div>`;
  w.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { go(b.dataset.g); if (b.dataset.n) { const nb = document.querySelector('.ls .btn.k'); if (nb) nb.click(); } });
  api('activity?limit=8').then(r => { const e = $('#rc'); if (e) e.innerHTML = r.activity.map(a => `<div class="ev"><span>${esc(a.action)}${a.who ? ` <small style="margin:0">· ${esc(a.who)}</small>` : ''}</span><small>${ago(a.at)}</small></div>`).join('') || 'No changes yet'; })
    .catch(() => { const e = $('#rc'); if (e) e.textContent = 'Not available.'; });
}

// ------------------------------------------------------------------ inbox
async function inbox(w) {
  const box = mk('div', 'Loading…'); w.append(box);
  let list; try { list = (await api('messages')).messages; } catch (e) { box.textContent = e.message; return; }
  const draw = () => {
    box.innerHTML = list.length ? '' : '<div class="cd">No messages yet. Messages and booking requests from your contact page appear here.</div>';
    list.forEach(m => {
      const d = m.data || {}, skip = ['name', 'email', 'page'];
      const det = mk('details', '', 'it msg' + (m.is_read ? '' : ' unread'));
      det.innerHTML = `<summary><span><b>${esc(m.name || 'No name')}</b> · ${esc(m.kind)}${d.service ? ' · ' + esc(d.service) : ''}</span><small>${when(m.at)}</small></summary>
        <div><table class="tbl">${[['Email', m.email ? `<a href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + m.kind)}">${esc(m.email)}</a>` : '-'],
          ...Object.entries(d).filter(([k]) => !skip.includes(k)).map(([k, v]) => [esc(k.replace(/_/g, ' ')), esc(v).replace(/\n/g, '<br>')]),
          ['Sent from', esc(d.page || '-')]].map(([k, v]) => `<tr><th style="width:150px">${k}</th><td>${v}</td></tr>`).join('')}</table>
        <div class="ac" style="margin:10px 0">${m.email ? `<a class="btn sm k" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + m.kind)}">Reply by email</a>` : ''}
          <button class="btn sm" data-r>${m.is_read ? 'Mark as unread' : 'Mark as read'}</button><button class="btn sm d" data-x>Delete</button></div></div>`;
      det.addEventListener('toggle', async () => { if (det.open && !m.is_read) { m.is_read = true; det.classList.remove('unread'); unread = Math.max(0, unread - 1); nav(); det.querySelector('[data-r]').textContent = 'Mark as unread'; api(`messages/${m.id}/read`, { method: 'POST', body: { read: true } }).catch(() => {}); } });
      det.querySelector('[data-r]').onclick = async () => { m.is_read = !m.is_read; unread += m.is_read ? -1 : 1; await api(`messages/${m.id}/read`, { method: 'POST', body: { read: m.is_read } }); nav(); draw(); };
      det.querySelector('[data-x]').onclick = async () => { if (!confirm('Delete this message?')) return; await api('messages/' + m.id, { method: 'DELETE' }); if (!m.is_read) unread--; list = list.filter(x => x !== m); nav(); draw(); };
      box.append(det);
    });
    if (list.length) {
      const ex = mk('button', 'Download all as CSV', 'btn sm'); ex.style.marginTop = '12px';
      ex.onclick = () => {
        const keys = ['at', 'kind', 'name', 'email', ...new Set(list.flatMap(m => Object.keys(m.data || {})).filter(k => !['name', 'email'].includes(k)))];
        const cell = v => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        const rows = list.map(m => keys.map(k => cell(k === 'at' ? new Date(m.at).toISOString() : k in m && k !== 'data' ? m[k] : (m.data || {})[k])).join(','));
        const a = mk('a'); a.href = URL.createObjectURL(new Blob([[keys.join(','), ...rows].join('\n')], { type: 'text/csv' })); a.download = 'briefbox-messages.csv'; a.click();
      };
      box.append(ex);
    }
  };
  draw();
}

// ------------------------------------------------------------------ media
async function media(w) {
  const c = mk('div', `${canEdit() ? `<div class="cd"><h3>Upload image</h3><input type="file" id="fu" accept="image/*" multiple><small style="color:var(--mu);display:block;margin-top:6px">Cover size: about 1600x600 px, under 300 KB (WebP or compressed JPG). Maximum 1.5 MB. The address appears below after upload; copy it, or choose the image in any Cover field.</small></div>` : ''}
    <div class="cd"><h3>Images</h3><div id="ml" class="mgrid">Loading…</div></div>`);
  w.append(c);
  const list = async () => {
    try {
      const r = await api('media');
      $('#ml').innerHTML = r.media.map(f => `<figure class="mi"><img src="${esc(f.path)}" alt="" loading="lazy"><figcaption><code title="${esc(f.path)}">${esc(f.path)}</code><small>${Math.round(f.size / 1024)} KB${f.builtin ? ' · built in' : ''}</small>
        <span class="ac"><button class="btn sm" data-c="${esc(f.path)}">Copy address</button>${!f.builtin && canEdit() ? `<button class="btn sm d" data-del="${esc(f.name)}">Delete</button>` : ''}</span></figcaption></figure>`).join('') || 'No images yet';
      document.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.c); toast('Copied ' + b.dataset.c); } catch (e) { toast(b.dataset.c); } });
      document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        if (!confirm('Delete ' + b.dataset.del + '? Pages that use it will show a broken image.')) return;
        try { await api('media/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); toast('Deleted'); list(); } catch (e) { toast(e.message, 'e'); }
      });
    } catch (e) { $('#ml').textContent = e.message; }
  };
  list();
  const fu = $('#fu');
  if (fu) fu.onchange = async e => {
    for (const f of e.target.files) {
      if (f.size > 1.5e6) { toast(f.name + ' is larger than 1.5 MB. Compress it first.', 'e'); continue; }
      const data = await new Promise(r => { const x = new FileReader(); x.onload = () => r(String(x.result).split(',')[1]); x.readAsDataURL(f); });
      try { const r = await api('media', { method: 'POST', body: { name: f.name, type: f.type, data } }); toast('Uploaded: ' + r.path); } catch (x) { toast('Upload failed: ' + x.message, 'e'); }
    }
    fu.value = ''; list();
  };
}

// ------------------------------------------------------------------ history
async function historyView(w) {
  const names = { site: 'Website settings (homepage, menus, SEO, page texts, tracking)', services: 'Services and pricing', pages: 'Pages', posts: 'Blog', faqs: 'FAQs' };
  const c = mk('div', `<div class="cd"><div class="ac" style="margin-bottom:12px"><select id="hk" style="max-width:420px"><option value="">All sections</option>${Object.entries(names).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div><div id="hl">Loading…</div></div>`);
  w.append(c);
  const load = async () => {
    try {
      const r = await api('history' + ($('#hk').value ? '?key=' + $('#hk').value : ''));
      $('#hl').innerHTML = r.versions.length ? `<table class="tbl"><tr><th>Saved</th><th>Section</th><th>By</th><th>Size</th><th></th></tr>${r.versions.map((x, i) => `<tr><td>${when(x.created_at)}</td><td>${esc(names[x.key] || x.key)}</td><td>${esc(x.created_by)}</td><td>${Math.round(x.size / 1024)} KB</td>
        <td>${canEdit() ? `<button class="btn sm" data-rs="${x.id}">Restore</button>` : ''}</td></tr>`).join('')}</table>` : 'No saved versions yet. Every time you press Save & publish, a version is kept here (the last 40 per section).';
      document.querySelectorAll('[data-rs]').forEach(b => b.onclick = async () => {
        if (dirty.size && !confirm('You have unsaved changes. Restoring reloads the content and drops them. Continue?')) return;
        if (!confirm('Restore this version? It becomes the live content. The current version stays in History.')) return;
        try { await api(`history/${b.dataset.rs}/restore`, { method: 'POST', body: {} }); await loadContent(); toast('Restored. The live site uses this version now.'); render(); } catch (e) { toast(e.message, 'e'); }
      });
    } catch (e) { $('#hl').textContent = e.message; }
  };
  $('#hk').onchange = load; load();
}

// ------------------------------------------------------------------ users & access
async function team(w) {
  w.append(mk('div', `<div class="cd"><h3>Your account</h3><p><b>${esc(me.name || '')}</b> · ${esc(me.email)} · ${esc(roleLabel())}</p>
    <form id="pwf" class="g2" autocomplete="off"><label class="fl"><span>Current password</span><input name="current" type="password" required autocomplete="current-password"></label>
    <label class="fl"><span>New password</span><input name="next" type="password" required autocomplete="new-password"><small>At least 8 characters with letters and numbers. Signs you out on other devices.</small></label>
    <div><button class="btn k">Change password</button></div></form></div>`));
  $('#pwf').onsubmit = async e => {
    e.preventDefault();
    try { await api('password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); toast('Password changed'); } catch (x) { toast(x.message, 'e'); }
  };
  const roles = `<div class="cd"><h3>Roles</h3><table class="tbl"><tr><th>Role</th><th>Can do</th></tr>
    <tr><td>Super Admin</td><td>Everything: content, media, inbox, Lead Engine clients and payments, users</td></tr>
    <tr><td>Editor</td><td>Edit and publish website content, upload media, read the inbox</td></tr>
    <tr><td>Viewer</td><td>View only, cannot save</td></tr></table>
    <p style="color:var(--mu);margin-top:10px">Every save is kept in History, so you can see who changed what and restore older versions.</p></div>`;
  if (me.role !== 'owner') { w.append(mk('div', roles)); return; }
  const box = mk('div', `<div class="cd"><h3>Admins</h3><div id="ul">Loading…</div></div>
    <div class="cd"><h3>Add an admin</h3><form id="nu" class="g3"><label class="fl"><span>Email</span><input name="email" type="email" required></label>
      <label class="fl"><span>Name</span><input name="name"></label><label class="fl"><span>Role</span><select name="role"><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="owner">Super Admin</option></select></label>
      <div><button class="btn k">Add admin</button></div></form><small style="color:var(--mu)">They get a temporary password to sign in. Send it to them privately.</small></div>${roles}`);
  w.append(box);
  const load = async () => {
    const r = await api('users');
    $('#ul').innerHTML = `<table class="tbl"><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign in</th><th></th></tr>${r.users.map(u => `<tr${u.disabled ? ' style="opacity:.55"' : ''}><td>${esc(u.name || '-')}</td><td>${esc(u.email)}</td>
      <td><select data-role="${u.id}" ${u.id === me.id ? 'disabled' : ''}>${['owner', 'editor', 'viewer'].map(x => `<option value="${x}" ${x === u.role ? 'selected' : ''}>${{ owner: 'Super Admin', editor: 'Editor', viewer: 'Viewer' }[x]}</option>`).join('')}</select></td>
      <td>${u.last_login_at ? ago(u.last_login_at) : 'never'}</td><td><div class="ac">${u.id === me.id ? '<small style="color:var(--mu)">You</small>' : `<button class="btn sm" data-dis="${u.id}" data-v="${u.disabled ? 0 : 1}">${u.disabled ? 'Enable' : 'Disable'}</button><button class="btn sm" data-rp="${u.id}">Reset password</button><button class="btn sm d" data-del="${u.id}">Delete</button>`}</div></td></tr>`).join('')}</table>`;
    document.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => { try { await api('users/' + s.dataset.role, { method: 'PUT', body: { role: s.value } }); toast('Role changed'); } catch (e) { toast(e.message, 'e'); load(); } });
    document.querySelectorAll('[data-dis]').forEach(b => b.onclick = async () => { try { await api('users/' + b.dataset.dis, { method: 'PUT', body: { disabled: b.dataset.v === '1' } }); load(); } catch (e) { toast(e.message, 'e'); } });
    document.querySelectorAll('[data-rp]').forEach(b => b.onclick = async () => { if (!confirm('Reset this password? They are signed out.')) return; try { const x = await api(`users/${b.dataset.rp}/password`, { method: 'POST', body: {} }); secret('New temporary password', x.temp_password); } catch (e) { toast(e.message, 'e'); } });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete this admin?')) return; try { await api('users/' + b.dataset.del, { method: 'DELETE' }); load(); } catch (e) { toast(e.message, 'e'); } });
  };
  load().catch(e => { $('#ul').textContent = e.message; });
  $('#nu').onsubmit = async e => {
    e.preventDefault();
    try { const x = await api('users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); load(); secret('Admin added. Temporary password', x.temp_password); } catch (er) { toast(er.message, 'e'); }
  };
}
function secret(title, value) {
  const d = mk('dialog', `<h2 style="margin:0 0 8px">${esc(title)}</h2><p style="color:var(--mu)">Shown only once. Send it privately.</p><p><code style="font-size:16px;padding:6px 10px">${esc(value)}</code></p>
    <div class="ac"><button class="btn" data-cp>Copy</button><button class="btn k" data-ok>Done</button></div>`);
  document.body.append(d); d.showModal();
  d.querySelector('[data-cp]').onclick = async () => { try { await navigator.clipboard.writeText(value); toast('Copied'); } catch (e) { /* manual */ } };
  d.querySelector('[data-ok]').onclick = () => { d.close(); d.remove(); };
}

// ------------------------------------------------------------------ content forms (same editor as before)
const hum = k => typeof k === 'number' ? '#' + (k + 1) : String(k).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const ttl = x => x.name || x.title || x.t || x.q || x.h || x.slug || Object.values(x).find(v => typeof v === 'string') || '';
const blank = x => Array.isArray(x) ? [] : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).map(k => [k, blank(x[k])])) : typeof x === 'boolean' ? false : typeof x === 'number' ? 0 : '';
const HP = {'track.gtm':['GTM-XXXXXXX','Google Tag Manager container ID'],'track.ga4':['G-XXXXXXXXXX','GA4 ID. Leave empty if GA4 runs inside GTM'],'track.ads':['AW-XXXXXXXXX','Google Ads conversion ID'],'track.meta':['123456789012345','Meta (Facebook) Pixel ID'],'track.custom':['','Any other tracking script. Loads after cookie consent'],'book.url':['https://calendar.app.google/...','Google Calendar appointment page link'],'forms.endpoint':['https://formspree.io/f/xxxx','Optional. Also emails you each message (messages are always saved in the Inbox)'],'tiers.pay':['https://...','Checkout link (Lemon Squeezy, Paddle, SSLCommerz...). Empty = goes to Contact'],'slug':['','URL part: lowercase letters, numbers and dashes only'],'body':['','HTML content. Use h2, p, ul and a tags'],'service':['','Service slug for internal link, e.g. ai-automation'],'seo_title':['','Shown in Google. 30-60 characters including brand'],'cover':['','Banner image at the top of the page. Upload it in Media Library, then choose it here. Empty = default brand cover'],'address':['','Shown in footer and Organization schema'],'phone':['+44 ...','Shown in footer'],'domain':['https://briefboxdigital.com','Your main address. Used for canonical links, sitemap and social previews']};
const isHex = v => /^#[0-9a-f]{6}$/i.test(v);
const lim = (k, pp) => (k === 'seo_title' || pp === 'home.meta' || /^pg\.\w+\.title$/.test(pp)) ? [30, 60, 'title'] : (/^(description|desc)$/.test(k) || pp === 'meta' || /^pg\.\w+\.desc$/.test(pp)) ? [70, 160, 'description'] : 0;
function inp(o, k, pp) {
  const v = o[k], set = x => { o[k] = x; chg(curF); }; let i;
  if (k === 'cover') {
    const g = mk('div', '<input placeholder="/media/cover.jpg"><button type="button" class="btn">Choose image</button>', 'cl'), t = g.children[0], b = g.children[1]; t.value = v || ''; t.oninput = () => set(t.value);
    b.onclick = async () => {
      b.textContent = 'Loading…';
      try {
        const im = (await api('media')).media; if (!im.length) throw 0;
        const s = mk('select', '<option value="">Select an image…</option>' + im.map(f => '<option>' + esc(f.path) + '</option>').join(''));
        s.onchange = () => { t.value = s.value; set(s.value); s.remove(); }; g.after(s);
      } catch (x) { toast('No images yet. Upload one in Media Library first.', 'e'); }
      b.textContent = 'Choose image';
    };
    return g;
  }
  if (typeof v === 'boolean') { const l = mk('label', '<input type="checkbox"><s></s>', 'sw'); i = l.firstChild; i.checked = v; i.onchange = () => set(i.checked); return l; }
  if (typeof v === 'number') { i = mk('input'); i.type = 'number'; i.value = v; i.oninput = () => set(+i.value); return i; }
  if (isHex(v)) { const g = mk('div', '<input type="color"><input>', 'cl'), c = g.children[0], t = g.children[1]; c.value = t.value = v; c.oninput = () => { t.value = c.value; set(c.value); }; t.oninput = () => { if (isHex(t.value)) { c.value = t.value; set(t.value); } }; return g; }
  if (String(v).length > 70 || /[\n<]/.test(v) || /^(body|custom|intro|p|a)$/.test(k)) { i = mk('textarea'); i.rows = Math.min(14, Math.max(3, Math.ceil(String(v).length / 80))); i.value = v; i.oninput = () => set(i.value); return i; }
  i = mk('input'); i.value = v ?? ''; i.placeholder = (HP[pp] || HP[k] || [])[0] || ''; i.oninput = () => set(i.value); return i;
}
function F(o, k, box, p, top) {
  const v = o[k], pp = String(p || k).replace(/\.\d+/g, ''), w = mk('div', '', 'fd');
  if (Array.isArray(v)) {
    if (!top) w.append(mk('b', esc(hum(k))));
    const L = mk('div'), draw = () => {
      L.innerHTML = '';
      v.forEach((x, i) => {
        const btn = (t, f) => { const b = mk('button', t, 'btn sm' + (t === '✕' ? ' d' : '')); b.type = 'button'; b.onclick = e => { e.preventDefault(); f(); }; return b; },
          mv = d => () => { const j = i + d; if (j < 0 || j >= v.length) return; [v[i], v[j]] = [v[j], v[i]]; chg(curF); draw(); },
          rm = () => { if (confirm('Remove this item?')) { v.splice(i, 1); chg(curF); draw(); } };
        if (x && typeof x === 'object') {
          const dt = mk('details', '', 'it'), sm = mk('summary', '<span>' + esc(ttl(x) || hum(i)) + '</span>'), bd = mk('div');
          sm.append(btn('↑', mv(-1)), btn('↓', mv(1)), btn('✕', rm)); dt.append(sm, bd); Object.keys(x).forEach(y => F(x, y, bd, pp + '.' + y)); L.append(dt);
        } else { const r = mk('div', '', 'row'); r.append(inp(v, i, pp + '.' + i), btn('↑', mv(-1)), btn('↓', mv(1)), btn('✕', rm)); L.append(r); }
      });
    };
    draw(); const ad = mk('button', '+ Add', 'btn sm'); ad.type = 'button'; ad.onclick = () => { v.push(blank(v[0] ?? '')); chg(curF); draw(); }; w.append(L, ad);
  } else if (v && typeof v === 'object') {
    const s = mk('div', '', 'sbx'); s.append(mk('b', esc(hum(k)))); Object.keys(v).forEach(y => F(v, y, s, pp + '.' + y)); w.append(s);
  } else {
    const el = inp(o, k, pp);
    if (typeof v === 'boolean') w.append(mk('b', esc(hum(k))), el); else { const l = mk('label'); l.append(mk('span', esc(hum(k))), el); w.append(l); }
    const h = HP[pp] || HP[k]; if (h && h[1]) w.append(mk('small', esc(h[1])));
    const m = lim(k, pp);
    if (m) { const n = mk('small', '', 'n'), u = () => { const L = String(o[k]).length; n.textContent = L + ' characters (best ' + m[0] + '-' + m[1] + ')'; n.className = 'n' + (L > m[1] || L < m[0] ? ' bad' : ''); }; u(); el.addEventListener('input', u); w.append(n); }
  }
  box.append(w);
}
function formView(v, w) {
  const d = S[v.f], ks = v.k.filter(k => k in d), pr = ks.filter(k => typeof d[k] !== 'object');
  if (pr.length) { const c = mk('div', '<h3>General</h3>', 'cd'); pr.forEach(k => F(d, k, c, k)); w.append(c); }
  ks.filter(k => typeof d[k] === 'object').forEach(k => { const c = mk('div', '<h3>' + esc(hum(k)) + '</h3>', 'cd'), x = d[k]; if (Array.isArray(x)) F(d, k, c, k, 1); else Object.keys(x).forEach(y => F(x, y, c, k + '.' + y)); w.append(c); });
  if (!canEdit()) w.querySelectorAll('input,textarea,select,button').forEach(x => { if (!x.closest('summary')) x.disabled = true; });
}
function listView(v, w) {
  const a = S[v.f], lab = x => x.name || x.title || x.slug || 'Untitled', sub = x => x.date || x.slug || '', wrap = mk('div', '', 'ml'), ls = mk('div', '', 'ls'), ed = mk('div'), L = mk('div');
  const s = mk('input'); s.placeholder = 'Search…'; s.value = q; s.oninput = () => { q = s.value; drawL(); };
  const nb = mk('button', '+ New', 'btn k'); nb.style.cssText = 'width:100%;margin-top:8px;justify-content:center'; nb.disabled = !canEdit();
  nb.onclick = () => {
    const n = blank(a[0] || { slug: '', title: '' });
    if ('slug' in n) n.slug = 'new-' + (Date.now() % 10000); if ('date' in n) n.date = new Date().toISOString().slice(0, 10);
    if ('title' in n) n.title = 'New item'; if ('name' in n) n.name = 'New item';
    a.unshift(n); sel = 0; q = ''; s.value = ''; chg(v.f); drawL(); drawE();
  };
  ls.append(s, nb, L); wrap.append(ls, ed); w.append(wrap);
  function drawL() { L.innerHTML = ''; a.forEach((x, i) => { if (q && !(lab(x) + sub(x)).toLowerCase().includes(q.toLowerCase())) return; const b = mk('button', esc(lab(x)) + '<small>' + esc(sub(x)) + '</small>', 'li' + (i === sel ? ' on' : '')); b.onclick = () => { sel = i; drawL(); drawE(); }; L.append(b); }); }
  function drawE() {
    ed.innerHTML = ''; const x = a[sel];
    if (!x) { ed.append(mk('div', 'Nothing here yet. Click “+ New”.', 'cd')); return; }
    const c = mk('div', '', 'cd'), bar = mk('div', '', 'ac'), act = (t, f, k) => { const b = mk('button', t, 'btn sm' + (k || '')); b.onclick = f; b.disabled = !canEdit(); bar.append(b); },
      mv = d => () => { const j = sel + d; if (j < 0 || j >= a.length) return; [a[sel], a[j]] = [a[j], a[sel]]; sel = j; chg(v.f); drawL(); drawE(); };
    const path = v.f === 'posts' ? '/blog/' + x.slug : v.f === 'services' ? (v.id === 'pricing' ? '/pricing#' + x.slug : '/services/' + x.slug) : '/' + x.slug;
    c.append(mk('h3', esc(lab(x)) + ` <a class="btn sm" style="margin-left:auto" href="${esc(path)}" target="_blank" rel="noopener">View ${ico('ext')}</a>`)); bar.style.marginBottom = '16px';
    act('↑ Move up', mv(-1)); act('↓ Move down', mv(1));
    act('Duplicate', () => { const n = JSON.parse(JSON.stringify(x)); if (n.slug) n.slug += '-copy'; a.splice(sel + 1, 0, n); sel++; chg(v.f); drawL(); drawE(); });
    act('Delete', () => { if (!confirm('Delete this item?')) return; a.splice(sel, 1); sel = Math.max(0, sel - 1); chg(v.f); drawL(); drawE(); }, ' d');
    c.append(bar); Object.keys(x).filter(y => v.only ? v.only.includes(y) : !(v.omit || []).includes(y)).forEach(y => F(x, y, c, y)); ed.append(c);
    if (!canEdit()) c.querySelectorAll('input,textarea,select').forEach(z => { z.disabled = true; });
  }
  if (sel >= a.length) sel = 0; drawL(); drawE();
}

addEventListener('hashchange', () => { const old = view + params.join('/'); readHash(); if (old !== view + params.join('/') && $('#ct')) { sel = 0; render(); } });
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (dirty.size && canEdit()) save(); } });
addEventListener('beforeunload', e => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } });
start();
})();
