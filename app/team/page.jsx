import { TeamShell } from '@/components/team-shell.jsx';
// Employee app (HR automation): check in, leave, attendance, payslips, policies, HR assistant. Installable (PWA), also packaged for Play Store / App Store.
// Each company has its own link, /team/<company code>, with its own name, logo and colours (app/team/[code]/page.jsx).
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Employee app', robots: 'noindex,nofollow', manifest: '/panel/team.webmanifest',
  icons: { icon: '/panel/app-192.png', apple: '/panel/app-apple.png' }, appleWebApp: { capable: true, title: 'Employee app', statusBarStyle: 'default' } };
export const viewport = { themeColor: '#f6f5fb', colorScheme: 'light', width: 'device-width', initialScale: 1, viewportFit: 'cover' };


export default function Team() { return <TeamShell />; }
