import { getContent } from '@/lib/content';

export const dynamic = 'force-dynamic';

export async function generateViewport() {
  let bg = '#06031c';
  try { bg = (await getContent()).site.theme.bg || bg; } catch (e) { /* default */ }
  return { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: bg };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
