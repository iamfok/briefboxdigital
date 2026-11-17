import { getContent, sortedPosts } from '@/lib/content';

export const dynamic = 'force-dynamic';

export async function GET() {
  const C = await getContent();
  const D = String(C.site.domain || '').replace(/\/$/, ''), today = new Date().toISOString().slice(0, 10);
  const urls = [['/', 1], ['/services', .9], ...C.services.map(s => ['/services/' + s.slug, .9]), ['/pricing', .9], ['/blog', .8],
    ...sortedPosts(C).map(p => ['/blog/' + p.slug, .6]), ...C.pages.filter(p => p.slug).map(p => ['/' + p.slug, p.slug === 'about' ? .7 : .4]), ['/contact', .8]];
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, p]) =>
    `<url><loc>${esc(D + (u === '/' ? '' : u))}</loc><lastmod>${today}</lastmod><priority>${p}</priority></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
