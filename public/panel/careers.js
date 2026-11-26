/* Public careers page: /careers#/<company>, /careers#/<company>/<job>, /careers#/offer/<token> */
(() => {
'use strict';
const { $, $$, esc, makeApi, busy, field, area } = UI;
const app = $('#app');
const api = makeApi('/api/careers', () => {});
const D = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
const foot = '';
// the company's own logo and colour
let branded = '';
async function brand(code) {
  if (branded === code) return; branded = code;
  try {
    const r = await fetch('/api/team/brand/' + encodeURIComponent(code)); if (!r.ok) return; const b = await r.json();
    if (/^#[0-9a-f]{6}$/i.test(b.color || '')) { document.body.classList.add('branded'); const st = app.style; st.setProperty('--accent', b.color); st.setProperty('--accent-soft', `color-mix(in srgb, ${b.color} 12%, #fff)`); st.setProperty('--grad', `linear-gradient(100deg, ${b.color}, color-mix(in srgb, ${b.color} 72%, #fff))`); }
    window.__logo = b.logo || '';
  } catch (e) { /* default look */ }
}
const logo = () => window.__logo ? `<img class="tm-logo big" src="${esc(window.__logo)}" alt="">` : '';
window.addEventListener('hashchange', route);
route();

async function route() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  try {
    if (p[0] === 'offer' && p[1]) return await offer(p[1]);
    if (p[0] === 'join' && p[1]) return await join(p[1]);
    if (p[0]) await brand(p[0]);
    if (p[0] && p[1]) return await job(p[0], p[1]);
    if (p[0]) return await list(p[0]);
    app.innerHTML = `<div class="cr"><div class="cr-hero"><h1>Careers</h1><p>Open the careers link you received from the company.</p></div>${foot}</div>`;
  } catch (e) { app.innerHTML = `<div class="cr"><div class="cr-hero"><h1>Not available</h1><p>${esc(e.message)}</p></div>${foot}</div>`; }
}
async function list(code) {
  const r = await api('/' + encodeURIComponent(code));
  document.title = `Careers at ${r.company}`;
  app.innerHTML = `<div class="cr"><div class="cr-hero">${logo()}<span class="eyebrow-pill">Careers at ${esc(r.company)}</span><h1>Join ${esc(r.company)}</h1><p>${esc(r.intro)}</p></div>
    ${r.jobs.map(j => `<a class="cr-job" href="#/${esc(code)}/${j.id}"><div><b>${esc(j.title)}</b><small>${esc([j.dept, j.location, j.job_type, j.salary_range].filter(Boolean).join(' · '))}</small></div><span class="btn small primary">View and apply</span></a>`).join('')
      || '<div class="empty">There are no open positions right now. Please check back later.</div>'}${foot}</div>`;
}
async function job(code, id) {
  const r = await api(`/${encodeURIComponent(code)}/${encodeURIComponent(id)}`), j = r.job;
  document.title = `${j.title} at ${r.company}`;
  app.innerHTML = `<div class="cr"><div class="cr-hero">${logo()}<a class="muted small" href="#/${esc(code)}">← All jobs at ${esc(r.company)}</a><h1>${esc(j.title)}</h1>
      <p>${esc([j.dept, j.location, j.job_type, j.salary_range].filter(Boolean).join(' · '))}${j.closes_on ? ` · apply by ${esc(D(j.closes_on))}` : ''}</p></div>
    <div class="cr-body">${j.description ? `<div><h2>About the role</h2><div class="desc">${esc(j.description)}</div></div>` : ''}${j.requirements ? `<div><h2>What we are looking for</h2><div class="desc">${esc(j.requirements)}</div></div>` : ''}</div>
    <form class="cr-body hform" id="af" style="margin-top:16px" novalidate><h2>Apply</h2>
      <div class="grid2">${field('Full name', 'name', '', { attrs: 'required autocomplete="name"' })}${field('Email', 'email', '', { type: 'email', attrs: 'required autocomplete="email"' })}</div>
      <div class="grid3">${field('Phone', 'phone', '', { attrs: 'autocomplete="tel"' })}${field('Years of experience', 'experience', '', { type: 'number', attrs: 'min="0" step="0.5"' })}${field('Current or last job title', 'current_role', '')}</div>
      <div class="grid2">${field('Expected salary', 'expected_salary', '')}${field('LinkedIn or portfolio (optional)', 'link', '', { type: 'url' })}</div>
      ${area('Why are you a good fit?', 'cover', '', { ph: 'A few lines about your experience for this role.' })}
      <label class="field"><span class="lab">CV (PDF or Word, max 1.2 MB)</span><input type="file" name="cv" accept=".pdf,.doc,.docx" required></label>
      <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      <p class="muted small">Your application is reviewed by ${esc(r.company)}. An AI tool helps sort applications by how well they match the role; a person makes every decision.</p>
      <span class="error" id="err" role="alert"></span><button class="btn primary big">Send application</button></form>${foot}</div>`;
  $('#af').onsubmit = async ev => {
    ev.preventDefault(); $('#err').textContent = '';
    const f = ev.target, v = Object.fromEntries(new FormData(f)); delete v.cv;
    const file = f.elements.cv.files[0];
    if (!v.name || !v.email) { $('#err').textContent = 'Add your name and email.'; return; }
    if (!file) { $('#err').textContent = 'Please attach your CV.'; return; }
    if (file.size > 1200000) { $('#err').textContent = 'The CV is larger than 1.2 MB. Please upload a smaller file.'; return; }
    await busy($('button', f), async () => {
      try {
        const data = await new Promise((res, rej) => { const r2 = new FileReader(); r2.onload = () => res(String(r2.result).split(',')[1]); r2.onerror = rej; r2.readAsDataURL(file); });
        await api(`/${encodeURIComponent(code)}/${encodeURIComponent(id)}/apply`, { method: 'POST', body: { ...v, cv: { name: file.name, type: file.type, data } } });
        f.outerHTML = `<div class="cr-body" style="margin-top:16px;text-align:center"><h2>Thank you, ${esc(v.name.split(' ')[0])}!</h2><p class="muted">Your application for ${esc(j.title)} has been sent. ${esc(r.company)} will contact you by email.</p></div>`;
      } catch (e) { $('#err').textContent = e.message; }
    });
  };
}
// New joiner: upload the signed joining letter, NID, photo and certificates
async function join(token) {
  const r = await api('/join/' + encodeURIComponent(token));
  await brand(r.code);
  document.title = `Joining documents · ${r.company}`;
  const has = k => r.sent.includes(k);
  const row = (k, req) => `<label class="field"><span class="lab">${esc(r.kinds[k])}${req ? ' *' : ''}${has(k) ? ' ✓ received' : ''}</span><input type="file" data-kind="${k}" accept=".pdf,.jpg,.jpeg,.png${k === 'photo' ? '' : ',.docx'}" ${k === 'certificates' || k === 'other' ? 'multiple' : ''}></label>`;
  app.innerHTML = `<div class="cr"><div class="cr-hero">${logo()}<span class="eyebrow-pill">${esc(r.company)}</span><h1>Welcome, ${esc(r.name.split(' ')[0])}</h1>
      <p>Please upload your documents before you join as ${esc(r.designation || '')} on ${esc(D(r.join_date))}. Each file up to 1.2 MB (the photo up to 400 KB).</p></div>
    <form class="cr-body cr-form" id="jf" novalidate>
      ${row('joining_letter', !has('joining_letter'))}${row('nid')}${row('photo')}${row('certificates')}${row('other')}
      <div class="grid2"><label class="field"><span class="lab">Blood group</span><select name="blood_group"><option value="">Choose…</option>${['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field"><span class="lab">NID number</span><input name="nid" inputmode="numeric"></label></div>
      <label class="field"><span class="lab">Emergency contact</span><input name="emergency" placeholder="Name, relation, phone"></label>
      <span class="error" id="jErr" role="alert"></span><button class="btn primary big">Send documents</button></form></div>`;
  const f = $('#jf');
  f.onsubmit = async ev => {
    ev.preventDefault(); $('#jErr').textContent = '';
    const btn = $('button', f); btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      const files = [];
      for (const inp of $$('input[type=file]', f)) for (const fl of inp.files) {
        if (fl.size > (inp.dataset.kind === 'photo' ? 400000 : 1200000)) throw new Error(`${fl.name} is too large.`);
        files.push({ kind: inp.dataset.kind, name: fl.name, type: fl.type || (/\.docx$/i.test(fl.name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ''), data: await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(fl); }) });
      }
      const v = Object.fromEntries(new FormData(f));
      await api('/join/' + encodeURIComponent(token), { method: 'POST', body: { files, blood_group: v.blood_group, nid: v.nid, emergency: v.emergency } });
      app.innerHTML = `<div class="cr"><div class="cr-hero">${logo()}<h1>Thank you!</h1><p>HR has your documents. See you on ${esc(D(r.join_date))}.</p></div></div>`;
    } catch (e) { $('#jErr').textContent = e.message; btn.disabled = false; btn.textContent = 'Send documents'; }
  };
}
async function offer(token) {
  const r = await api('/offer/' + encodeURIComponent(token)), o = r.offer;
  document.title = `Your offer from ${r.company}`;
  const answered = o.status !== 'sent';
  app.innerHTML = `<div class="cr"><div class="cr-hero"><span class="eyebrow-pill">${esc(r.company)}</span><h1>${answered ? 'Thank you' : `Congratulations, ${esc(r.name.split(' ')[0])}!`}</h1>
      <p>${answered ? `You ${esc(o.status)} this offer. ${o.status === 'accepted' ? `We look forward to seeing you on ${esc(D(o.join_date))}.` : ''}` : `Your offer for ${esc(o.designation)}, starting ${esc(D(o.join_date))}.${o.expires ? ` Please answer by ${esc(D(o.expires))}.` : ''}`}</p></div>
    <div class="cr-body"><div class="desc">${esc(o.letter)}</div></div>
    ${answered ? '' : `<form class="cr-body hform" id="of" style="margin-top:16px">${area('Message (optional)', 'note', '')}<span class="error" id="err"></span>
      <div class="row-end"><button class="btn" value="decline">Decline</button><button class="btn primary big" value="accept">Accept offer</button></div></form>`}${foot}</div>`;
  const f = $('#of');
  if (f) f.onsubmit = async ev => {
    ev.preventDefault(); const answer = ev.submitter && ev.submitter.value;
    if (answer === 'decline' && !confirm('Decline this offer?')) return;
    await busy(ev.submitter, async () => { try { await api('/offer/' + encodeURIComponent(token), { method: 'POST', body: { answer, note: f.elements.note.value } }); offer(token); } catch (e) { $('#err').textContent = e.message; } });
  };
}
})();
