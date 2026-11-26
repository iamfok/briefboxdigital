// A company's own employee app: /team/<company code>. Name, logo and colour come from HR Settings → Branding.
import { TeamShell } from '@/components/team-shell.jsx';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }) {
  const { code } = await params;
  const c = encodeURIComponent(String(code || '').toLowerCase());
  return { title: 'Employee app', robots: 'noindex,nofollow', manifest: `/api/team/manifest/${c}`,
    icons: { icon: `/api/team/brand/${c}/logo`, apple: `/api/team/brand/${c}/logo` }, appleWebApp: { capable: true, title: 'Employee app', statusBarStyle: 'default' } };
}
export const viewport = { themeColor: '#f6f5fb', colorScheme: 'light', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function CompanyTeam() { return <TeamShell />; }
