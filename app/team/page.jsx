// Employee app (HR automation): check in, leave, attendance, payslips, policies, HR assistant. Installable (PWA), also packaged for Play Store / App Store.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Briefbox Team', robots: 'noindex,nofollow', manifest: '/panel/team.webmanifest',
  icons: { icon: '/panel/app-192.png', apple: '/panel/app-apple.png' }, appleWebApp: { capable: true, title: 'Team', statusBarStyle: 'default' } };
export const viewport = { themeColor: '#f6f5fb', colorScheme: 'light', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

const V = '20261126b';
export default function Team() {
  return (
    <>
      <link rel="stylesheet" href={`/panel/portal.css?v=${V}`} precedence="default" />
      <link rel="stylesheet" href={`/panel/portal-app.css?v=${V}`} precedence="high" />
      <link rel="stylesheet" href={`/panel/hr.css?v=${V}`} precedence="high" />
      <div id="app" className="pl" aria-live="polite" />
      <div id="toast" role="status" hidden />
      <script src={`/panel/ui.js?v=${V}`} defer />
      <script src={`/panel/hr.js?v=${V}`} defer />
      <script src={`/panel/team.js?v=${V}`} defer />
      <noscript>The employee portal needs JavaScript.</noscript>
    </>
  );
}
