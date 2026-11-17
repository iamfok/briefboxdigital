// Lead Engine client portal: sign up, sign in, Info, Settings, Dashboard, Subscription.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client portal | Briefbox Digital', robots: 'noindex,nofollow', icons: { icon: '/assets/mark.png' } };

const V = '20261118';
export default function Portal() {
  return (
    <>
      <link rel="stylesheet" href={`/panel/portal.css?v=${V}`} precedence="default" />
      <div id="app" className="pp" aria-live="polite" />
      <div id="toast" role="status" hidden />
      <script src={`/panel/ui.js?v=${V}`} defer />
      <script src={`/panel/portal.js?v=${V}`} defer />
      <noscript>The client portal needs JavaScript.</noscript>
    </>
  );
}
