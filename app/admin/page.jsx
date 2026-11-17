// Admin panel. The interface runs in the browser (/panel/*.js) and talks to /api/admin.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin Panel | Briefbox Digital', robots: 'noindex,nofollow', icons: { icon: '/assets/mark.png' } };

const V = '20261118';
export default function Admin() {
  return (
    <>
      <link rel="stylesheet" href={`/panel/portal.css?v=${V}`} precedence="default" />
      <link rel="stylesheet" href={`/panel/admin.css?v=${V}`} precedence="high" />
      <div id="app" />
      <div id="tt" />
      <div id="toast" role="status" hidden />
      <script src={`/panel/ui.js?v=${V}`} defer />
      <script src={`/panel/le-admin.js?v=${V}`} defer />
      <script src={`/panel/admin.js?v=${V}`} defer />
      <noscript>The admin panel needs JavaScript.</noscript>
    </>
  );
}
