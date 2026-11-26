import { getContent } from '@/lib/content';

export const dynamic = 'force-dynamic';

export async function GET() {
  const C = await getContent();
  const D = String(C.site.domain || '').replace(/\/$/, '');
  const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /portal\nDisallow: /team\nDisallow: /api/\nSitemap: ${D}/sitemap.xml\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
