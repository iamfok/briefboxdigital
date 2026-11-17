// Building blocks of the public website. Same markup and classes as the old static build,
// so /assets/style.css and /assets/app.js work unchanged.
import { sortedPosts } from '@/lib/content';

export const ASSET_V = '20261117';
export const domain = S => String(S.domain || 'https://briefboxdigital.com').replace(/\/$/, '');
export const bookUrl = S => (S.book && S.book.url) || '/contact';

// "*word*" in a heading becomes the gradient text span
export function Hl({ s }) {
  const parts = String(s ?? '').split(/\*(.+?)\*/g);
  return <>{parts.map((p, i) => i % 2 ? <span key={i} className="g">{p}</span> : p)}</>;
}
export function JsonLd({ data }) {
  const list = (Array.isArray(data) ? data : [data]).filter(Boolean);
  return <>{list.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x).replace(/</g, '\\u003c') }} />)}</>;
}
export const crumbs = (D, l) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: l.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: D + c[1] })) });
export const faqLd = l => l && l.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: l.map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) } : null;

// Next.js metadata for a page (title, description, canonical, robots, Open Graph, Twitter, icons)
export function pageMeta(S, { u, title, desc, type = 'website', ni = false }) {
  const D = domain(S), url = D + (u === '/' ? '' : u);
  return {
    metadataBase: new URL(D),
    title, description: desc,
    alternates: { canonical: url },
    robots: ni ? 'noindex,follow' : 'index,follow,max-image-preview:large',
    openGraph: { siteName: S.brand, type, title, description: desc, url, images: [D + '/assets/og.png'] },
    twitter: { card: 'summary_large_image', title, description: desc },
    icons: { icon: '/assets/mark.png', apple: '/assets/mark.png' },
  };
}

function NavLink({ n, act }) {
  return <a href={n.u} aria-current={act(n.u) ? 'page' : undefined}>{n.t}</a>;
}

// Header, footer, cookie banner, tracking. Every page is wrapped in this.
export function Shell({ C, u, ld = [], children }) {
  const S = C.site, D = domain(S), T = S.theme, L = S.logo, book = bookUrl(S);
  const act = x => u === x || (x !== '/' && u.startsWith(x + '/'));
  const org = { '@context': 'https://schema.org', '@type': 'Organization', name: S.brand, url: D, logo: D + L.full, email: S.email, sameAs: (S.social || []).map(s => s.u) };
  if (S.phone) org.telephone = S.phone;
  if (S.address) org.address = { '@type': 'PostalAddress', streetAddress: S.address };
  const graph = [org, ...(u === '/' ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name: S.brand, url: D }] : []), ...ld].filter(Boolean);
  const vars = `:root{--bg:${T.bg};--c1:${T.c1};--c2:${T.c2};--c3:${T.c3}}`.replace(/</g, '');
  return (
    <>
      <link rel="stylesheet" href={`/assets/style.css?v=${ASSET_V}`} precedence="default" />
      <style dangerouslySetInnerHTML={{ __html: vars }} />
      <JsonLd data={graph} />
      <a className="skip" href="#main">Skip to content</a>
      <header className="nav"><div className="w nv">
        <a className="logo" href="/"><img src={L.head} alt={`${S.brand} logo`} width={L.hw} height={L.hh} /></a>
        <input type="checkbox" id="mt" hidden /><label className="bur" htmlFor="mt" aria-label="Menu">☰</label>
        <nav className="nl" aria-label="Main">
          {(S.nav || []).map((n, i) => n.children && n.children.length
            ? <div className="dd" key={i}><NavLink n={n} act={act} /><span className="car" aria-hidden="true">▾</span>
                <div className="dm">{n.children.map((c, j) => <NavLink key={j} n={c} act={act} />)}</div></div>
            : <NavLink key={i} n={n} act={act} />)}
        </nav>
        <a className="btn sm" href={book} data-ev="schedule">{S.cta}</a>
      </div></header>
      <main id="main">{children}</main>
      <footer className="ft"><div className="w">
        <div className="fg">
          <div>
            <a href="/"><img src={L.full} alt={S.brand} width={L.fw} height={L.fh} loading="lazy" style={{ width: 190, height: 'auto' }} /></a>
            <p className="mu">{S.footer.about}</p>
            <p className="mu sm">
              <a href={`mailto:${S.email}`}>{S.email}</a>
              {S.phone ? <> · <a href={`tel:${String(S.phone).replace(/[^+\d]/g, '')}`}>{S.phone}</a></> : null}
              {S.address ? <><br />{S.address}</> : null}
            </p>
            <div className="so">{(S.social || []).map((s, i) =>
              <a key={i} href={s.u} target="_blank" rel="noopener noreferrer me" aria-label={s.n} style={{ background: s.c }}>{s.i}</a>)}</div>
          </div>
          {S.footer.cols.map((c, i) => <div key={i}><h3>{c.title}</h3>{(c.links || []).map((l, j) => <NavLink key={j} n={l} act={act} />)}</div>)}
        </div>
        <div className="fb"><span>{S.footer.copy}</span><button className="lk" data-cc="">Cookie settings</button></div>
      </div></footer>
      <div id="cc" hidden><p>We use cookies for analytics and advertising (GDPR, UK GDPR, CCPA). Accept to enable tracking.</p>
        <div className="row"><button className="btn sm" data-cy="">Accept</button><button className="btn sm gh" data-cn="">Decline</button></div></div>
      <script dangerouslySetInnerHTML={{ __html: 'window.BB=' + JSON.stringify(S.track || {}).replace(/</g, '\\u003c') }} />
      <script src={`/assets/app.js?v=${ASSET_V}`} defer />
    </>
  );
}

export function Cover({ S, tag, h1, intro, img, children }) {
  img = img || S.cover || '';
  return (
    <header className={'cv' + (img ? ' has' : '')}>
      {img ? <img className="cvi" src={img} alt="" fetchPriority="high" /> : null}
      <div className="w cvt">
        {tag ? <span className="tag">{tag}</span> : null}
        <h1><Hl s={h1} /></h1>
        {intro ? <p className="lead mu">{intro}</p> : null}
        {children}
      </div>
    </header>
  );
}

export function Faqs({ list, title }) {
  if (!list || !list.length) return null;
  return (
    <section className="w sec faq"><h2><Hl s={title || 'Frequently asked *questions*'} /></h2>
      <div className="fq">{list.map((x, i) => <details key={i}><summary>{x.q}</summary><p>{x.a}</p></details>)}</div></section>
  );
}

export function Cta({ S }) {
  const H = S.home;
  return (
    <section className="w sec"><div className="cta"><h2><Hl s={H.cta_title} /></h2><p className="mu">{H.cta_sub}</p>
      <a className="btn" href={bookUrl(S)} data-ev="schedule">{S.cta}</a></div></section>
  );
}

export function PostCard({ p }) {
  return (
    <article className="card"><span className="tag">{p.tag}</span><h3><a href={`/blog/${p.slug}`}>{p.title}</a></h3>
      <p className="mu">{p.desc}</p><time className="mu sm" dateTime={p.date}>{p.date}</time></article>
  );
}

export const Feat = ({ f }) => <div className="card"><h3>{f.t}</h3><p className="mu">{f.d}</p></div>;

export function Tiers({ sv }) {
  return (
    <div className="tiers">{sv.tiers.map((t, i) => {
      const n = sv.name + ' - ' + t.name;
      return (
        <article key={i} className={'tier' + (t.pop ? ' pop' : '')}>
          {t.pop ? <span className="bdg">Most popular</span> : null}
          <h3>{t.name}</h3><p className="mu">{t.desc}</p>
          <p className="pr">{t.price}<small>{t.per}</small></p>
          <ul>{t.features.map((f, j) => <li key={j}>{f}</li>)}</ul>
          <a className={'btn' + (t.pop ? '' : ' gh')} href={t.pay || '/contact?plan=' + encodeURIComponent(n)} data-ev="begin_checkout" data-p={n}
             {...(t.pay ? { target: '_blank', rel: 'noopener' } : {})}>{t.pay ? 'Buy now' : 'Get started'}</a>
        </article>
      );
    })}</div>
  );
}

export function Ring({ items }) {
  return <>{(items || []).map((t, i) => {
    const g = i / items.length * 6.2832 + .6;
    return <span key={i} className="a" style={{ left: (50 + 50 * Math.cos(g)).toFixed(1) + '%', top: (50 + 50 * Math.sin(g)).toFixed(1) + '%' }}><span className="ch">{t}</span></span>;
  })}</>;
}

export const FLOW = ['Lead', 'AI qualify', 'CRM', 'Follow-up', 'Booking'];
export const latestPosts = (C, n) => sortedPosts(C).slice(0, n);
