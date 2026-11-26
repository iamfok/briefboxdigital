// Public careers page for a company using the HR automation: /careers#/<company code>
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Careers', icons: { icon: '/assets/mark.png' } };
export const viewport = { themeColor: '#f6f5fb', colorScheme: 'light' };

const V = '20261126f';
export default function Careers() {
  return (
    <>
      <link rel="stylesheet" href={`/panel/portal.css?v=${V}`} precedence="default" />
      <link rel="stylesheet" href={`/panel/portal-app.css?v=${V}`} precedence="high" />
      <link rel="stylesheet" href={`/panel/hr.css?v=${V}`} precedence="high" />
      <div id="app" className="pl" aria-live="polite" />
      <div id="toast" role="status" hidden />
      <script src={`/panel/ui.js?v=${V}`} defer />
      <script src={`/panel/careers.js?v=${V}`} defer />
      <noscript>This page needs JavaScript.</noscript>
    </>
  );
}
