// Sourcing: job posts for LinkedIn / Facebook / Bdjobs, posting to the company's Facebook page,
// and finding people with public profiles that match the job (web search, Serper.dev key in Admin → Connection).
import { all, one, run, err, J, now, todayIn, hrLog, emit, fbToken } from './core.js';
import { getJob } from './recruit.js';
import { jobPosts, scoreProspects, searchKey } from './ai.js';

const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
export const PSTATUS = ['new', 'contacted', 'replied', 'cv_received', 'not_interested'];
export const sourcingOf = j => ({ auto: false, keywords: '', location: '', posts: null, fb_post: null, runs: {}, last_run: 0, last_found: 0, ...J(j.sourcing, {}) });
const saveSourcing = (env, j, x) => run(env, 'UPDATE hr_jobs SET sourcing = ?, updated_at = ? WHERE id = ?', JSON.stringify(x), now(), j.id);

export async function makePosts(env, a, S, jobId, applyUrl) {
  const j = await getJob(env, a.id, jobId);
  if (!j) throw err('Job not found', 404);
  const posts = { ...(await jobPosts(env, j, a.company, applyUrl)), apply_url: applyUrl, at: now() };
  const x = sourcingOf(j); x.posts = posts;
  await saveSourcing(env, j, x);
  // the company's own n8n can publish these (for example their LinkedIn automation)
  await emit(env, a, S, 'job.published', { job: { id: j.id, title: j.title, location: j.location, apply_url: applyUrl }, posts });
  return posts;
}
export async function savePosts(env, a, jobId, b) {
  const j = await getJob(env, a.id, jobId);
  if (!j) throw err('Job not found', 404);
  const x = sourcingOf(j);
  x.posts = { ...(x.posts || {}), linkedin: str(b.linkedin ?? (x.posts || {}).linkedin, 3000), facebook: str(b.facebook ?? (x.posts || {}).facebook, 3000), bdjobs: str(b.bdjobs ?? (x.posts || {}).bdjobs, 6000) };
  if ('auto' in b) x.auto = !!b.auto;
  if ('keywords' in b) x.keywords = str(b.keywords, 200);
  if ('location' in b) x.location = str(b.location, 80);
  await saveSourcing(env, j, x);
  return x;
}
export async function postFacebook(env, a, S, jobId) {
  const j = await getJob(env, a.id, jobId);
  if (!j) throw err('Job not found', 404);
  const x = sourcingOf(j), token = await fbToken(env, S);
  if (!S.facebook.page_id || !token) throw err('Add your Facebook page ID and page access token in HR Settings → Job posting first.');
  if (!x.posts || !x.posts.facebook) throw err('Write the posts first.');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${S.facebook.page_id}/feed`, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: x.posts.facebook, link: x.posts.apply_url || '', access_token: token }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.id) throw err('Facebook said: ' + ((d.error && d.error.message) || 'error ' + r.status));
    x.fb_post = { id: d.id, at: now() };
    await saveSourcing(env, j, x);
    await hrLog(env, a.id, 'HR', `Posted ${j.title} on the Facebook page`);
    return x.fb_post;
  } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------- finding candidates
async function search(env, key, q) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch('https://google.serper.dev/search', { method: 'POST', signal: ctl.signal, headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q, num: 20, gl: 'bd' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw err('Search said: ' + (d.message || 'error ' + r.status));
    return d.organic || [];
  } finally { clearTimeout(t); }
}
const OTW = /open to work|#?opentowork|looking for (a )?(new )?(job|role|opportunit)|seeking (a )?(new )?(job|role|opportunit)|available for (work|hire)|job seeker/i;
function parse(item, source) {
  const title = String(item.title || ''), link = String(item.link || '').split('?')[0], snippet = String(item.snippet || '');
  if (source === 'linkedin') {
    if (!/linkedin\.com\/in\//.test(link)) return null;
    const clean = title.replace(/\s*[|\-–]\s*LinkedIn.*$/i, '');
    const [name, ...restT] = clean.split(/\s[-–|]\s/);
    if (!name || name.length > 60) return null;
    return { name: name.trim(), headline: restT.join(' · ').trim() || snippet.slice(0, 120), url: link, source, snippet: snippet.slice(0, 400), open_to_work: OTW.test(title + ' ' + snippet) ? 1 : 0 };
  }
  if (!/facebook\.com\//.test(link)) return null;
  return { name: title.replace(/\s*[|\-–]\s*Facebook.*$/i, '').slice(0, 60) || 'Facebook post', headline: title.slice(0, 160), url: link, source, snippet: snippet.slice(0, 400), open_to_work: OTW.test(title + ' ' + snippet) ? 1 : 0 };
}
export function queriesFor(j, x) {
  const title = `"${j.title.replace(/"/g, '')}"`, loc = (x.location || j.location || '').split(',')[0].trim(), kw = str(x.keywords, 200);
  const L = loc ? ` "${loc}"` : '';
  return [
    { source: 'linkedin', q: `site:linkedin.com/in ${title}${L} ("open to work" OR "#opentowork" OR "looking for")${kw ? ' ' + kw : ''}` },
    { source: 'linkedin', q: `site:linkedin.com/in ${title}${L}${kw ? ' ' + kw : ''}` },
    { source: 'facebook', q: `site:facebook.com ${title}${L} ("looking for job" OR "open to work" OR "job seeker" OR "CV")` },
  ];
}
const DAILY_RUNS = 4;
export async function findCandidates(env, a, S, jobId, { auto = false } = {}) {
  const j = await getJob(env, a.id, jobId);
  if (!j) throw err('Job not found', 404);
  const key = await searchKey(env);
  if (!key) throw err('Candidate search is not switched on yet. Please ask Briefbox support to add the search key.');
  const x = sourcingOf(j), today = todayIn(S.timezone);
  const used = x.runs && x.runs.date === today ? x.runs.n : 0;
  if (used >= DAILY_RUNS) throw err(`You can search ${DAILY_RUNS} times a day for each job. Try again tomorrow.`);
  const found = [];
  for (const qy of queriesFor(j, x)) {
    try { for (const it of await search(env, key, qy.q)) { const p = parse(it, qy.source); if (p && !found.some(f => f.url === p.url)) found.push(p); } }
    catch (e) { if (!found.length && qy === queriesFor(j, x)[0]) throw e; }
  }
  const known = new Set((await all(env, 'SELECT url FROM hr_prospects WHERE job_id = ?', j.id)).map(r => r.url));
  const fresh = found.filter(p => !known.has(p.url)).slice(0, 40);
  const scores = fresh.length ? await scoreProspects(env, j, fresh) : [];
  for (let i = 0; i < fresh.length; i++) {
    const p = fresh[i];
    await run(env, 'INSERT OR IGNORE INTO hr_prospects(account_id, job_id, name, headline, url, source, snippet, open_to_work, score, reason, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      a.id, j.id, str(p.name, 80), str(p.headline, 200), p.url, p.source, p.snippet, p.open_to_work, scores[i].score, scores[i].reason, now(), now());
  }
  x.runs = { date: today, n: used + 1 }; x.last_run = now(); x.last_found = fresh.length;
  await saveSourcing(env, j, x);
  await hrLog(env, a.id, auto ? 'Automation' : 'HR', `Found ${fresh.length} new candidate${fresh.length === 1 ? '' : 's'} for ${j.title}`);
  if (fresh.length) await emit(env, a, S, 'candidates.found', { job: j.title, count: fresh.length, top: fresh.map((p, i) => ({ ...p, score: scores[i].score })).sort((m, n) => n.score - m.score).slice(0, 10) });
  return { found: fresh.length, seen: found.length, runs_left: DAILY_RUNS - used - 1 };
}
export const prospectsOf = (env, aid, jobId) => all(env, 'SELECT * FROM hr_prospects WHERE account_id = ? AND job_id = ? ORDER BY CASE status WHEN \'not_interested\' THEN 1 ELSE 0 END, open_to_work DESC, score DESC, created_at DESC LIMIT 300', aid, Number(jobId));
export async function setProspect(env, aid, id, b) {
  const p = await one(env, 'SELECT * FROM hr_prospects WHERE id = ? AND account_id = ?', Number(id), aid);
  if (!p) throw err('Candidate not found', 404);
  const status = PSTATUS.includes(b.status) ? b.status : p.status;
  await run(env, 'UPDATE hr_prospects SET status = ?, note = ?, applicant_id = COALESCE(?, applicant_id), updated_at = ? WHERE id = ?', status, str(b.note ?? p.note, 1000), b.applicant_id || null, now(), p.id);
  return one(env, 'SELECT * FROM hr_prospects WHERE id = ?', p.id);
}
// A ready message HR can paste into LinkedIn / Messenger.
export function outreach(a, j, p, applyUrl) {
  const first = String(p.name || '').split(' ')[0] || 'there';
  return `Hi ${first}, I'm from the HR team at ${a.company}. We're hiring a ${j.title}${j.location ? ' in ' + j.location : ''}, and your experience${p.headline ? ' as ' + p.headline.split('·')[0].trim() : ''} looks like a good fit. Would you be interested? You can apply in 2 minutes here: ${applyUrl}, or simply send me your CV. Thank you!`;
}
// daily: search again for open jobs with auto search on (max 3 jobs per company)
export async function dailySourcing(env, a, S) {
  const out = [];
  const jobs = (await all(env, "SELECT * FROM hr_jobs WHERE account_id = ? AND status = 'open'", a.id)).filter(j => sourcingOf(j).auto).slice(0, 3);
  if (!jobs.length || !(await searchKey(env))) return out;
  for (const j of jobs) { try { const r = await findCandidates(env, a, S, j.id, { auto: true }); if (r.found) out.push(`${r.found} new candidates found for ${j.title}`); } catch (e) { /* next job */ } }
  return out;
}
// People found outside (for example an Apify LinkedIn search run by n8n) are added to the job's candidate list.
export async function addProspects(env, a, S, j, people, source = 'linkedin') {
  const clean = people.slice(0, 200).map(p => {
    const url = String(p.url || p.profileUrl || p.linkedinUrl || p.link || '').split('?')[0].slice(0, 300);
    const name = str(p.name || p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' '), 80);
    const L = p.location && typeof p.location === 'object' ? (p.location.linkedinText || p.location.text || p.location.parsed && p.location.parsed.text || '') : (p.location || p.locationName || '');
    const headline = str(p.headline || p.title || p.position || '', 200), loc = str(L, 80);
    const otw = p.open_to_work === true || p.openToWork === true || OTW.test(headline + ' ' + (p.summary || p.about || ''));
    return url && name ? { name, headline, url, source: ['linkedin', 'facebook', 'other'].includes(source) ? source : 'linkedin', snippet: str([loc, p.summary || p.about || ''].filter(Boolean).join(' · '), 400), open_to_work: otw ? 1 : 0 } : null;
  }).filter(Boolean);
  const known = new Set((await all(env, 'SELECT url FROM hr_prospects WHERE job_id = ?', j.id)).map(r => r.url));
  const fresh = clean.filter((p, i) => !known.has(p.url) && clean.findIndex(q => q.url === p.url) === i);
  const scores = fresh.length ? await scoreProspects(env, j, fresh) : [];
  for (let i = 0; i < fresh.length; i++) {
    const p = fresh[i];
    await run(env, 'INSERT OR IGNORE INTO hr_prospects(account_id, job_id, name, headline, url, source, snippet, open_to_work, score, reason, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      a.id, j.id, p.name, p.headline, p.url, p.source, p.snippet, p.open_to_work, scores[i].score, scores[i].reason, now(), now());
  }
  if (fresh.length) {
    await hrLog(env, a.id, 'Automation', `Added ${fresh.length} LinkedIn candidate${fresh.length === 1 ? '' : 's'} for ${j.title}`);
    await emit(env, a, S, 'candidates.found', { job: j.title, count: fresh.length, top: fresh.map((p, i) => ({ ...p, score: scores[i].score })).sort((m, n) => n.score - m.score).slice(0, 10) });
  }
  return { added: fresh.length, received: people.length, skipped: people.length - fresh.length };
}
