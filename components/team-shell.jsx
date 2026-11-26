// The employee app page (used by /team and /team/<company code>).
const TEAM_V = '20261126f';
export function TeamShell() {
  const V = TEAM_V;
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
      <noscript>The employee app needs JavaScript.</noscript>
    </>
  );
}
