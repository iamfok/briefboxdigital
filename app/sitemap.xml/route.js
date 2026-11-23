import { getContent, contentVersions, sortedPosts } from '@/lib/content';

export const dynamic = 'force-dynamic';

// lastmod = when that part of the site was last saved (posts: their own date), so Google trusts it.
export async function GET() {
  const C = await getContent();
  let versions = {};
  try { versions = (await contentVersions()).versions || {}; } catch (e) { /* built-in content */ }
  const day = t => t ? new Date(Number(t)).toISOString().slice(0, 10) : '';
  const site = day(versions.site), svc = day(versions.services) || site, pages = day(versions.pages) || site;
  const D = String(C.site.domain || '').replace(/\/$/, '');
  const urls = [['/', 1, site], ['/services', .9, svc], ...C.services.map(s => ['/services/' + s.slug, .9, svc]), ['/pricing', .9, svc], ['/blog', .8, sortedPosts(C)[0]?.date || ''],
    ...sortedPosts(C).map(p => ['/blog/' + p.slug, .6, p.updated || p.date]), ...C.pages.filter(p => p.slug).map(p => ['/' + p.slug, p.slug === 'about' ? .7 : .4, pages]), ['/contact', .8, site]];
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, p, m]) =>
    `<url><loc>${esc(D + (u === '/' ? '' : u))}</loc>${/^\d{4}-\d{2}-\d{2}/.test(m || '') ? `<lastmod>${String(m).slice(0, 10)}</lastmod>` : ''}<priority>${p}</priority></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
