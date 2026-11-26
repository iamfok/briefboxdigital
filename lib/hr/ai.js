// AI for HR: CV screening and the employee policy assistant. Uses Google Gemini with the key saved in
// Admin → Automations → n8n connection (AI section). Without a key, simple keyword rules are used instead.
import { encryptJSON, decryptJSON } from '../auth.js';

const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
export async function aiConfig(env) {
  const r = Object.fromEntries((await env.DB.prepare("SELECT key, value FROM config WHERE key IN ('ai_key_enc','ai_model')").bind().all()).results.map(x => [x.key, x.value]));
  let key = '';
  if (r.ai_key_enc) { try { key = (await decryptJSON(env, r.ai_key_enc)).k || ''; } catch (e) { key = ''; } }
  return { key, model: r.ai_model || 'gemini-2.5-flash' };
}
export async function searchKey(env) {
  const r = await one(env, "SELECT value FROM config WHERE key = 'search_key_enc'");
  if (!r || !r.value) return '';
  try { return (await decryptJSON(env, r.value)).k || ''; } catch (e) { return ''; }
}
export async function appLinks(env) {
  const r = Object.fromEntries((await env.DB.prepare("SELECT key, value FROM config WHERE key IN ('android_pkg','android_sha')").bind().all()).results.map(x => [x.key, x.value]));
  return { android_pkg: r.android_pkg || '', android_sha: r.android_sha || '' };
}
// /.well-known/assetlinks.json for the Play Store app
export async function assetLinks(env) {
  const a = await appLinks(env);
  if (!a.android_pkg || !a.android_sha) return [];
  return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: a.android_pkg, sha256_cert_fingerprints: a.android_sha.split(/[\s,]+/).filter(Boolean) } }];
}
export async function aiView(env) { const c = await aiConfig(env), sk = await searchKey(env); return { model: c.model, key: c.key ? '••••' + c.key.slice(-4) : '', search_key: sk ? '••••' + sk.slice(-4) : '', ...(await appLinks(env)) }; }
export async function setAi(env, b) {
  const set = (k, v) => run(env, 'INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v);
  if (b.model) await set('ai_model', String(b.model).trim().slice(0, 60));
  if (b.key && !String(b.key).startsWith('••••')) await set('ai_key_enc', await encryptJSON(env, { k: String(b.key).trim() }));
  if (b.key === '') await set('ai_key_enc', '');
  if (b.search_key && !String(b.search_key).startsWith('••••')) await set('search_key_enc', await encryptJSON(env, { k: String(b.search_key).trim() }));
  if (b.search_key === '') await set('search_key_enc', '');
  if ('android_pkg' in b) { const v = String(b.android_pkg || '').trim(); if (v && !/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(v)) throw new Error('The package name looks like com.briefbox.team'); await set('android_pkg', v.slice(0, 120)); }
  if ('android_sha' in b) { const v = String(b.android_sha || '').trim().toUpperCase(); if (v && !v.split(/[\s,]+/).every(x => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(x))) throw new Error('The SHA-256 fingerprint looks like AB:CD:…, 32 pairs.'); await set('android_sha', v.slice(0, 500)); }
  return aiView(env);
}
async function gemini(env, parts, { json = false, timeout = 25000 } = {}) {
  const c = await aiConfig(env);
  if (!c.key) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || 'AI error ' + r.status);
    return ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
  } finally { clearTimeout(t); }
}
export async function testAi(env) { const out = await gemini(env, [{ text: 'Reply with the single word: ready' }]); if (out == null) throw new Error('Add an AI key first.'); return out.trim().slice(0, 40); }

const words = s => String(s || '').toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g) || [];
const STOP = new Set('and the for with you our are will have who this that from your can able good work team years year experience strong skills knowledge must should plus using such into about other well more own senior junior plus etc will must also very least ability good great bonus required preferred'.split(' '));
// Keyword fallback: how many of the job's key words appear in what the candidate wrote, plus experience.
function rules(job, ap) {
  const need = [...new Set(words(job.requirements + ' ' + job.title).filter(w => !STOP.has(w)))].slice(0, 40);
  const have = new Set(words([ap.cover, ap.current_role, ap.link].join(' ')));
  const hit = need.filter(w => have.has(w));
  const exp = Math.min(30, (Number(ap.experience) || 0) * 6);
  const score = Math.max(5, Math.min(95, Math.round((need.length ? hit.length / need.length : 0.3) * 65 + exp)));
  return { score, verdict: score >= 70 ? 'strong' : score >= 45 ? 'possible' : 'weak', by: 'rules',
    summary: `${ap.experience || 0} years of experience${ap.current_role ? ', currently ' + ap.current_role : ''}. Matches ${hit.length} of ${need.length} key words from the job.`,
    strengths: hit.slice(0, 6).map(w => 'Mentions ' + w), gaps: need.filter(w => !have.has(w)).slice(0, 6).map(w => 'No mention of ' + w),
    questions: ['Walk me through your most relevant project.', 'Why are you interested in this role?', 'What notice period do you have?'] };
}
// ---------------------------------------------------------------- reading CV files
// .docx is a zip; the text is in word/document.xml. Small reader using the built-in deflate stream.
export async function docxText(b64) {
  try {
    const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), dv = new DataView(u.buffer);
    let eocd = -1; for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return '';
    let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true);
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
      if (name === 'word/document.xml') {
        const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = u.subarray(start, start + csize);
        let xml;
        if (method === 0) xml = new TextDecoder().decode(raw);
        else xml = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
        return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, '\n\n').trim().slice(0, 30000);
      }
      p += 46 + nl + xl + cl;
    }
  } catch (e) { /* unreadable file */ }
  return '';
}
const INLINE = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
export async function cvParts(cv) {
  if (!cv || !cv.data) return { parts: [], text: '' };
  if (INLINE.includes(cv.type)) return { parts: [{ inline_data: { mime_type: cv.type, data: cv.data } }], text: '' };
  if (/wordprocessingml/.test(cv.type)) { const text = await docxText(cv.data); return { parts: text ? [{ text: 'CV TEXT:\n' + text }] : [], text }; }
  return { parts: [], text: '' };
}
// Pulls the contact details out of a CV (for CVs HR imports from BDJobs, Facebook, email…).
export async function readCv(env, cv, fileName = '') {
  const { parts, text } = await cvParts(cv);
  const fromText = t => {
    const email = (String(t).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0].toLowerCase();
    const phone = (String(t).match(/(?:\+?88)?0?1[3-9]\d{2}[-\s]?\d{6}|\+\d[\d\s-]{8,15}\d/) || [''])[0].replace(/[\s-]/g, '');
    return { email, phone };
  };
  const guessName = String(fileName).replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ').replace(/\b(cv|resume|bdjobs|updated|final|copy)\b/gi, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const first = String(text).split('\n').map(x => x.trim()).find(Boolean) || '';
  const base = { name: /^[A-Za-z][A-Za-z.'-]*( [A-Za-z][A-Za-z.'-]*){1,3}$/.test(first) ? first.slice(0, 80) : guessName, ...fromText(text), current_role: '', experience: 0, by: 'rules' };
  if (!parts.length) return base;
  try {
    const out = await gemini(env, [{ text: 'Read this CV. Return JSON only: {"name": "", "email": "", "phone": "", "current_role": "current or last job title and company", "experience": years of work experience as a number, "location": ""}. Use "" when not found.' }, ...parts], { json: true });
    if (out == null) return base;
    const j = JSON.parse(out.replace(/^```json|```$/g, '').trim());
    return { name: String(j.name || base.name).slice(0, 100), email: String(j.email || base.email).trim().toLowerCase().slice(0, 120), phone: String(j.phone || base.phone).slice(0, 30),
      current_role: String(j.current_role || '').slice(0, 120), experience: Math.max(0, Math.min(60, Number(j.experience) || 0)), location: String(j.location || '').slice(0, 80), by: 'ai' };
  } catch (e) { return base; }
}

// ---------------------------------------------------------------- job posts and sourcing
export async function jobPosts(env, job, company, applyUrl) {
  const req = String(job.requirements || '').split('\n').map(x => x.replace(/^[-•*\s]+/, '').trim()).filter(Boolean).slice(0, 6);
  const fallback = {
    linkedin: `We're hiring: ${job.title}${job.location ? ' (' + job.location + ')' : ''} at ${company}.\n\n${String(job.description || '').slice(0, 500)}\n\n${req.length ? 'What we look for:\n' + req.map(r => '• ' + r).join('\n') + '\n\n' : ''}${job.salary_range ? 'Salary: ' + job.salary_range + '\n' : ''}Apply here: ${applyUrl}\n\n#hiring #jobs #${job.title.replace(/[^A-Za-z0-9]/g, '')}${job.location ? ' #' + job.location.replace(/[^A-Za-z0-9]/g, '') : ''}`,
    facebook: `📢 ${company} is hiring!\n\nPosition: ${job.title}\n${job.location ? 'Location: ' + job.location + '\n' : ''}${job.job_type ? 'Type: ' + job.job_type + '\n' : ''}${job.salary_range ? 'Salary: ' + job.salary_range + '\n' : ''}\n${req.length ? 'Requirements:\n' + req.map(r => '✅ ' + r).join('\n') + '\n\n' : ''}Apply online (takes 2 minutes): ${applyUrl}\n${job.closes_on ? 'Deadline: ' + job.closes_on + '\n' : ''}\nPlease share with anyone who fits 🙏`,
    bdjobs: `Job title: ${job.title}\nCompany: ${company}\nVacancy: 1\nJob location: ${job.location || ''}\nEmployment status: ${job.job_type || 'Full-time'}\nSalary: ${job.salary_range || 'Negotiable'}\nApplication deadline: ${job.closes_on || ''}\n\nJob context and responsibilities:\n${String(job.description || '').slice(0, 2500)}\n\nEducational and experience requirements:\n${req.map(r => '• ' + r).join('\n')}\n\nApply procedure: apply through Bdjobs or online at ${applyUrl}`,
  };
  const out = await gemini(env, [{ text: `Write three job posts for the same job. Return JSON only: {"linkedin": "", "facebook": "", "bdjobs": ""}.
- linkedin: professional, 120-180 words, short paragraphs, 3-5 hashtags at the end.
- facebook: friendly, emojis allowed, easy to scan, for a Bangladesh audience, ask people to share.
- bdjobs: plain text in the Bdjobs job post format (Job title, Vacancy, Job context, Job responsibilities, Employment status, Educational requirements, Experience requirements, Additional requirements, Job location, Salary, Compensation & other benefits, Application deadline).
Every post must include this apply link exactly: ${applyUrl}
Use only the facts below. Don't invent benefits or numbers.

Company: ${company}
Title: ${job.title}
Department: ${job.dept || ''}
Location: ${job.location || ''}
Type: ${job.job_type || ''}
Salary: ${job.salary_range || 'not given'}
Deadline: ${job.closes_on || 'not given'}
Description: ${String(job.description || '').slice(0, 3000)}
Requirements: ${String(job.requirements || '').slice(0, 2500)}` }], { json: true }).catch(() => null);
  if (!out) return { ...fallback, by: 'template' };
  try { const j = JSON.parse(out.replace(/^```json|```$/g, '').trim()); return { linkedin: String(j.linkedin || fallback.linkedin).slice(0, 3000), facebook: String(j.facebook || fallback.facebook).slice(0, 3000), bdjobs: String(j.bdjobs || fallback.bdjobs).slice(0, 6000), by: 'ai' }; }
  catch (e) { return { ...fallback, by: 'template' }; }
}
// Scores people found on the web against the job, from their public headline only.
export async function scoreProspects(env, job, list) {
  const need = [...new Set(words(job.requirements + ' ' + job.title).filter(w => !STOP.has(w)))].slice(0, 40), title = new Set(words(job.title).filter(w => !STOP.has(w)));
  const rule = p => { const have = new Set(words(p.headline + ' ' + p.snippet)); const t = [...title].filter(w => have.has(w)).length / Math.max(1, title.size), k = need.filter(w => have.has(w)).length / Math.max(1, need.length);
    return { score: Math.max(5, Math.min(95, Math.round(t * 55 + k * 30 + (p.open_to_work ? 10 : 0) + (job.location && new RegExp(job.location.split(/[ ,]/)[0], 'i').test(p.snippet + p.headline) ? 5 : 0)))), reason: `Title match ${Math.round(t * 100)}%, ${need.filter(w => have.has(w)).length} key words${p.open_to_work ? ', open to work' : ''}` }; };
  const base = list.map(rule);
  const out = await gemini(env, [{ text: `You help a recruiter. For each person, score 0-100 how well their public headline fits the job, and give a short reason (max 12 words). Judge only on work facts. Return JSON only: [{"i": index, "score": n, "reason": ""}]

JOB: ${job.title}, ${job.location || ''}. Requirements: ${String(job.requirements || '').slice(0, 1500)}

PEOPLE:
${list.map((p, i) => `${i}. ${p.headline} | ${String(p.snippet).slice(0, 220)}${p.open_to_work ? ' | open to work' : ''}`).join('\n')}` }], { json: true }).catch(() => null);
  if (!out) return base;
  try { for (const x of JSON.parse(out.replace(/^```json|```$/g, '').trim())) if (base[x.i]) base[x.i] = { score: Math.max(0, Math.min(100, Math.round(Number(x.score) || 0))), reason: String(x.reason || '').slice(0, 120) }; } catch (e) { /* keep rules */ }
  return base;
}
// Which open position does this CV fit best? (CVs dropped in one place, from email or Drive)
export async function routeCv(env, jobs, cv) {
  const { parts, text } = await cvParts(cv);
  const name = String((cv && cv.name) || '');
  const ruleScore = j => { const need = [...new Set(words(j.title + ' ' + j.requirements + ' ' + (j.dept || '')).filter(w => !STOP.has(w)))], have = new Set(words(text + ' ' + name)); return need.filter(w => have.has(w)).length / Math.max(1, need.length) + (words(j.title).some(w => have.has(w) && !STOP.has(w)) ? 0.5 : 0); };
  const best = () => { const sc = jobs.map(j => ({ j, s: ruleScore(j) })).sort((x, y) => y.s - x.s); return { job_id: sc[0].j.id, reason: sc[0].s > 0 ? 'Closest match by keywords' : 'No clear match; placed in the newest position', by: 'rules' }; };
  if (!parts.length) return best();
  const out = await gemini(env, [{ text: `A company has these open positions. Read the CV and choose the ONE position it fits best. Return JSON only: {"job_id": number, "reason": "max 15 words"}

${jobs.map(j => `#${j.id}: ${j.title}${j.dept ? ' (' + j.dept + ')' : ''}. Needs: ${String(j.requirements || '').replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')}` }, ...parts], { json: true }).catch(() => null);
  if (!out) return best();
  try { const x = JSON.parse(out.replace(/^```json|```$/g, '').trim()), id = Number(x.job_id); if (jobs.some(j => j.id === id)) return { job_id: id, reason: String(x.reason || '').slice(0, 120), by: 'ai' }; } catch (e) { /* fall back */ }
  return best();
}
export async function screen(env, job, ap, cv) {
  const prompt = `You are an experienced recruiter. Score this candidate for the job from 0 to 100, fairly and only on job-relevant evidence.
Ignore name, gender, age, religion, nationality, photo and anything not about the work. Return JSON only:
{"score": number, "verdict": "strong"|"possible"|"weak", "summary": "2 sentences", "strengths": ["..."], "gaps": ["..."], "questions": ["3 interview questions for this person"]}

JOB: ${job.title} (${job.dept || ''}, ${job.location || ''}, ${job.job_type || ''})
Description: ${String(job.description).slice(0, 3000)}
Requirements: ${String(job.requirements).slice(0, 3000)}

CANDIDATE
Years of experience: ${ap.experience}
Current or last role: ${ap.current_role}
Expected salary: ${ap.expected_salary}
Profile link: ${ap.link}
Cover note: ${String(ap.cover).slice(0, 3000)}
${cv ? 'The CV is attached.' : 'No CV file was attached.'}`;
  const cp = await cvParts(cv), parts = [{ text: prompt }, ...cp.parts];
  const ap2 = cp.text ? { ...ap, cover: ap.cover + ' ' + cp.text } : ap;
  try {
    const out = await gemini(env, parts, { json: true });
    if (out == null) return rules(job, ap2);
    const j = JSON.parse(out.replace(/^```json|```$/g, '').trim());
    const list = (x, n) => (Array.isArray(x) ? x : []).map(v => String(v).slice(0, 200)).slice(0, n);
    const score = Math.max(0, Math.min(100, Math.round(Number(j.score) || 0)));
    return { score, verdict: ['strong', 'possible', 'weak'].includes(j.verdict) ? j.verdict : score >= 70 ? 'strong' : score >= 45 ? 'possible' : 'weak', by: 'ai',
      summary: String(j.summary || '').slice(0, 600), strengths: list(j.strengths, 6), gaps: list(j.gaps, 6), questions: list(j.questions, 5) };
  } catch (e) { return { ...rules(job, ap2), note: 'AI was not reachable (' + String(e.message).slice(0, 80) + '), so keyword rules were used.' }; }
}
// Employee asks a question; the answer comes only from the company's policies and the employee's own leave balance.
export async function askHr(env, { company, policies, balances, question, name }) {
  const pol = policies.map(p => `## ${p.title}\n${String(p.body).slice(0, 4000)}`).join('\n\n').slice(0, 24000);
  const bal = balances.map(b => `${b.name}: ${b.left == null ? 'no fixed limit' : b.left + ' days left'}`).join('; ');
  const out = await gemini(env, [{ text: `You are the HR assistant of ${company}. Answer ${name}'s question in 2–5 short sentences, in the same language they used.
Use ONLY the company policies and leave balances below. If they don't answer it, say you don't know and suggest asking HR. Never invent rules.

POLICIES
${pol || '(no policies published yet)'}

LEAVE BALANCE (${name}): ${bal}

QUESTION: ${String(question).slice(0, 1000)}` }]).catch(() => null);
  if (out) return { answer: out.trim(), by: 'ai' };
  // fallback: the policy paragraphs that share the most words with the question
  const q = new Set(words(question).filter(w => !STOP.has(w)));
  const paras = policies.flatMap(p => String(p.body).split(/\n\s*\n/).map(t => ({ title: p.title, t })));
  const best = paras.map(x => ({ ...x, s: words(x.t).filter(w => q.has(w)).length })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2);
  if (/leave|balance|holiday|ছুটি/i.test(question)) return { answer: 'Your leave balance: ' + bal + '.' + (best.length ? '\n\n' + best.map(b => `From "${b.title}": ${b.t}`).join('\n\n') : ''), by: 'rules' };
  return { answer: best.length ? best.map(b => `From "${b.title}": ${b.t}`).join('\n\n') : 'I could not find this in the company policies. Please ask HR.', by: 'rules' };
}
