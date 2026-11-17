// Serves images uploaded in the admin Media Library (stored in the database).
import { getDb, one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { name } = await params;
  const d = await getDb().catch(() => null);
  const row = d ? await one(d, 'SELECT type, data FROM media WHERE name = ?', String(name)) : null;
  if (!row) return new Response('Not found', { status: 404 });
  const bin = Uint8Array.from(atob(row.data), c => c.charCodeAt(0));
  return new Response(bin, { headers: {
    'Content-Type': row.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
    ...(row.type === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}),
  } });
}
