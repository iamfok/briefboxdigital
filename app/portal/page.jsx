// Client portal (light theme): overview, automations, invoices, company info.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client portal | Briefbox Digital', robots: 'noindex,nofollow', icons: { icon: '/assets/mark.png' } };
export const viewport = { themeColor: '#f6f5fb', colorScheme: 'light' };

const V = '20261124a';
export default function Portal() {
  return (
    <>
      <link rel="stylesheet" href={`/panel/portal.css?v=${V}`} precedence="default" />
      <link rel="stylesheet" href={`/panel/portal-app.css?v=${V}`} precedence="high" />
      <div id="app" className="pl" aria-live="polite" />
      <div id="toast" role="status" hidden />
      <script src={`/panel/ui.js?v=${V}`} defer />
      <script src={`/panel/portal.js?v=${V}`} defer />
      <noscript>The client portal needs JavaScript.</noscript>
    </>
  );
}
