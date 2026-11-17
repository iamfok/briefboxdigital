import { Fragment } from 'react';
import { Shell, Hl, Faqs, Cta, PostCard, Feat, Ring, FLOW, Cover, Tiers, crumbs, faqLd, bookUrl, domain, latestPosts } from '@/components/site';
import { sortedPosts } from '@/lib/content';

export function HomeView({ C }) {
  const S = C.site, H = S.home, SV = C.services, book = bookUrl(S);
  const ticker = [...H.ticker, ...H.ticker, ...H.ticker, ...H.ticker];
  return (
    <Shell C={C} u="/" ld={[faqLd(C.faqs.home)]}>
      <div className="hs">
        {H.cover ? <img className="cvi" src={H.cover} alt="" fetchPriority="high" /> : null}
        <canvas id="hb" aria-hidden="true" />
        <section className="w hero">
          <div>
            <span className="tag">{H.tag}</span>
            <h1><Hl s={H.title} /></h1>
            <p className="lead">{H.sub}</p>
            <div className="row"><a className="btn" href={book} data-ev="schedule">{H.cta1}</a><a className="btn gh" href="#services">{H.cta2}</a></div>
          </div>
          <div className="orbit" aria-hidden="true">
            <span className="ring r1"><Ring items={H.ring1} /></span>
            <span className="ring r2"><Ring items={H.ring2} /></span>
            <img className="core" src="/assets/mark.png" alt="" width="256" height="256" />
          </div>
        </section>
      </div>
      <div className="tk" aria-hidden="true"><div>{ticker.map((t, i) => <span key={i}>{t}</span>)}</div></div>

      <section id="services" className="w sec"><h2><Hl s={H.svc_title} /></h2><p className="mu">{H.svc_sub}</p>
        <div className="grid">{SV.map(s => (
          <article key={s.slug} className="card"><div className="ic">{s.icon}</div><h3><a href={`/services/${s.slug}`}>{s.name}</a></h3>
            <p className="mu">{s.short}</p><p className="row"><a className="more" href={`/services/${s.slug}`}>Learn more →</a></p></article>
        ))}</div>
      </section>

      {SV.map((s, i) => (
        <section key={s.slug} className={'w sec alt' + (i % 2 ? ' rev' : '')}>
          <div className="sp"><span className="tag">{s.name}</span><h2><Hl s={s.hh} /></h2><p className="mu">{s.short}</p>
            {s.slug === 'ai-automation' ? <div className="flow" aria-hidden="true">{FLOW.map((f, j) => <Fragment key={j}>{j ? <span className="ar">→</span> : null}<span className="node">{f}</span></Fragment>)}</div> : null}
            <a className="btn" href={`/services/${s.slug}`}>Explore {s.name}</a></div>
          <div className="fgrid">{s.features.slice(0, 4).map((f, j) => <Feat key={j} f={f} />)}</div>
        </section>
      ))}

      <section className="w sec"><h2><Hl s={H.why_title} /></h2><div className="grid">{H.why.map((f, i) => <Feat key={i} f={f} />)}</div></section>
      <section className="w sec"><h2><Hl s={H.steps_title} /></h2><div className="grid">{H.steps.map((f, i) => <Feat key={i} f={f} />)}</div></section>
      <section className="w sec"><h2><Hl s={H.ex_title} /></h2><p className="mu">{H.ex_sub}</p>
        <div className="grid">{H.examples.map((x, i) => <div key={i} className="card"><div className="th" aria-hidden="true">✦</div><h3>{x.t}</h3><p className="mu">{x.d}</p></div>)}</div></section>
      <Faqs list={C.faqs.home} title={H.faq_title} />
      <section className="w sec"><h2><Hl s={H.blog_title} /></h2><div className="grid">{latestPosts(C, 3).map(p => <PostCard key={p.slug} p={p} />)}</div></section>
      <Cta S={S} />
    </Shell>
  );
}

export function ServicesHubView({ C }) {
  const S = C.site, hub = S.pg.hub, D = domain(S);
  return (
    <Shell C={C} u="/services" ld={[crumbs(D, [['Home', '/'], ['Services', '/services']])]}>
      <Cover S={S} tag="Services" h1={hub.h1} intro={hub.intro} img={hub.cover} />
      <section className="w sec"><div className="grid">{C.services.map(s => (
        <article key={s.slug} className="card"><div className="ic">{s.icon}</div><h2 className="h3"><a href={`/services/${s.slug}`}>{s.name}</a></h2>
          <p className="mu">{s.short}</p><p className="row"><a className="more" href={`/services/${s.slug}`}>Learn more →</a><a className="more" href={`/pricing#${s.slug}`}>Pricing</a></p></article>
      ))}</div></section>
      <Cta S={S} />
    </Shell>
  );
}

export const serviceLd = (C, s) => {
  const S = C.site, D = domain(S), u = '/services/' + s.slug;
  return [crumbs(D, [['Home', '/'], ['Services', '/services'], [s.name, u]]),
    { '@context': 'https://schema.org', '@type': 'Service', name: s.name, description: s.meta, url: D + u, provider: { '@type': 'Organization', name: S.brand, url: D }, areaServed: ['United States', 'United Kingdom', 'Europe'] },
    faqLd(s.faq)];
};

export function ServiceView({ C, s }) {
  const S = C.site, u = '/services/' + s.slug, book = bookUrl(S);
  const rel = sortedPosts(C).filter(p => p.service === s.slug);
  return (
    <Shell C={C} u={u} ld={serviceLd(C, s)}>
      <Cover S={S} tag={s.name} h1={s.h1} intro={s.intro} img={s.cover}>
        <div className="row"><a className="btn" href={book} data-ev="schedule">{S.cta}</a><a className="btn gh" href={`/pricing#${s.slug}`}>View pricing</a></div>
      </Cover>
      <section className="w sec"><h2>What is <span className="g">included</span></h2><div className="grid">{s.features.map((f, i) => <Feat key={i} f={f} />)}</div></section>
      <section className="w sec prose wide">{s.sections.map((x, i) => <Fragment key={i}><h2>{x.h}</h2><p>{x.p}</p></Fragment>)}</section>
      <section className="w sec"><h2>How the <span className="g">process</span> works</h2>
        <div className="grid">{s.process.map((x, i) => <div key={i} className="card"><h3>{i + 1}. {x.t}</h3><p className="mu">{x.d}</p></div>)}</div></section>
      <section className="w sec"><div className="cta"><h2>Packages for <span className="g">{s.name}</span></h2>
        <p className="mu">Three clear packages with USD pricing. {s.from}.</p><a className="btn" href={`/pricing#${s.slug}`}>Compare packages</a></div></section>
      <Faqs list={s.faq} title={s.name + ' *FAQ*'} />
      {rel.length ? <section className="w sec"><h2>Related <span className="g">guides</span></h2><div className="grid">{rel.map(p => <PostCard key={p.slug} p={p} />)}</div></section> : null}
      <section className="w sec"><h2>Explore other services</h2>
        <div className="row">{C.services.filter(x => x.slug !== s.slug).map(x => <a key={x.slug} className="btn gh sm" href={`/services/${x.slug}`}>{x.name}</a>)}</div></section>
      <Cta S={S} />
    </Shell>
  );
}

export function PricingView({ C }) {
  const S = C.site, pr = S.pg.pricing, D = domain(S), SV = C.services;
  const offers = SV.flatMap(s => s.tiers.map(t => ({ '@type': 'Offer', name: s.name + ' - ' + t.name, price: String(t.price || '').replace(/[^\d.]/g, ''), priceCurrency: 'USD', description: t.features.join(', ') })));
  const ld = [crumbs(D, [['Home', '/'], ['Pricing', '/pricing']]), faqLd(C.faqs.pricing),
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: offers.map((o, i) => ({ '@type': 'ListItem', position: i + 1, item: o })) }];
  return (
    <Shell C={C} u="/pricing" ld={ld}>
      <Cover S={S} tag="Pricing" h1={pr.h1} intro={pr.intro} img={pr.cover}>
        <div className="row chips">{SV.map(s => <a key={s.slug} className="btn gh sm" href={`#${s.slug}`}>{s.name}</a>)}</div>
      </Cover>
      {SV.map(s => (
        <section key={s.slug} id={s.slug} className="w sec"><h2>{s.name} <span className="g">packages</span></h2>
          <p className="mu">{s.short} <a className="more" href={`/services/${s.slug}`}>About this service →</a></p><Tiers sv={s} /></section>
      ))}
      <section className="w sec"><p className="mu sm">{pr.note}</p></section>
      <Faqs list={C.faqs.pricing} title="Pricing *FAQ*" />
      <Cta S={S} />
    </Shell>
  );
}

export function BlogView({ C }) {
  const S = C.site, bl = S.pg.blog, D = domain(S);
  return (
    <Shell C={C} u="/blog" ld={[crumbs(D, [['Home', '/'], ['Blog', '/blog']]), faqLd(C.faqs.blog)]}>
      <Cover S={S} tag="Blog" h1={bl.h1} intro={bl.intro} img={bl.cover} />
      <section className="w sec"><div className="grid">{sortedPosts(C).map(p => <PostCard key={p.slug} p={p} />)}</div></section>
      <Faqs list={C.faqs.blog} title="Blog *FAQ*" />
      <Cta S={S} />
    </Shell>
  );
}

export const postTitle = (S, p) => p.seo_title || ((p.title + ' | ' + S.brand).length <= 60 ? p.title + ' | ' + S.brand : p.title);

export function PostView({ C, p }) {
  const S = C.site, D = domain(S), u = '/blog/' + p.slug;
  const sv = C.services.find(x => x.slug === p.service);
  const more = sortedPosts(C).filter(x => x.slug !== p.slug).slice(0, 2);
  const ld = [crumbs(D, [['Home', '/'], ['Blog', '/blog'], [p.title, u]]),
    { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.desc, datePublished: p.date, dateModified: p.updated || p.date,
      image: D + (p.cover && p.cover.startsWith('/') ? p.cover : '/assets/og.png'), mainEntityOfPage: D + u, author: { '@type': 'Organization', name: S.brand },
      publisher: { '@type': 'Organization', name: S.brand, logo: { '@type': 'ImageObject', url: D + S.logo.full } } }];
  return (
    <Shell C={C} u={u} ld={ld}>
      <Cover S={S} tag={p.tag} h1={p.title} img={p.cover}><time className="mu" dateTime={p.date}>{p.date}</time></Cover>
      <article className="w sec prose">
        <div dangerouslySetInnerHTML={{ __html: p.body || '' }} />
        {sv ? <p className="rel">Related service: <a href={`/services/${sv.slug}`}>{sv.name}</a> · <a href={`/pricing#${sv.slug}`}>pricing</a></p> : null}
      </article>
      {more.length ? <section className="w sec"><h2>More <span className="g">guides</span></h2><div className="grid">{more.map(x => <PostCard key={x.slug} p={x} />)}</div></section> : null}
      <Cta S={S} />
    </Shell>
  );
}

export function PageView({ C, p }) {
  const S = C.site, D = domain(S), u = '/' + p.slug, about = p.slug === 'about';
  return (
    <Shell C={C} u={u} ld={[crumbs(D, [['Home', '/'], [p.title, u]])]}>
      <Cover S={S} tag={about ? 'About us' : ''} h1={p.title} intro={p.desc} img={p.cover} />
      <article className="w sec prose">
        <div dangerouslySetInnerHTML={{ __html: p.body || '' }} />
        {about ? <><h2>Contact details</h2><p>Email: <a href={`mailto:${S.email}`}>{S.email}</a>{S.phone ? <><br />Phone: {S.phone}</> : null}{S.address ? <><br />Address: {S.address}</> : null}</p></> : null}
      </article>
      {about ? <Cta S={S} /> : null}
    </Shell>
  );
}

const TZ = ['London (GMT/BST)', 'Central Europe (CET)', 'Eastern Europe (EET)', 'New York (ET)', 'Chicago (CT)', 'Los Angeles (PT)', 'Other'];
const Opts = ({ list }) => <>{list.map(x => <option key={x}>{x}</option>)}</>;

export function ContactView({ C }) {
  const S = C.site, ct = S.pg.contact, D = domain(S), ep = S.forms.endpoint || '';
  const names = C.services.map(s => s.name);
  const hp = <input className="hp" name="_gotcha" tabIndex={-1} autoComplete="off" aria-hidden="true" />;
  return (
    <Shell C={C} u="/contact" ld={[crumbs(D, [['Home', '/'], ['Contact', '/contact']])]}>
      <Cover S={S} tag="Contact" h1={ct.h1} intro={ct.intro} img={ct.cover} />
      <section className="w sec"><div className="two">
        <form className="card" id="bk" data-form="" data-kind="Booking request" data-mail={S.email} method="post" action={ep}>
          <h2 className="h3">📅 Book a free call</h2>
          {S.book.url ? <><p><a className="btn" href={S.book.url} target="_blank" rel="noopener" data-ev="schedule">Book instantly on Google Calendar</a></p><p className="mu sm">Or request a time below.</p></> : null}
          {hp}<input type="hidden" name="_subject" defaultValue="Booking request" />
          <label>Name<input name="name" required autoComplete="name" /></label>
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Service<select name="service"><Opts list={[...names, 'Not sure yet']} /></select></label>
          <label>Your time zone<select name="timezone"><Opts list={TZ} /></select></label>
          <label>Preferred date<input name="date" type="date" required data-today="" /></label>
          <label>Preferred time<span className="slots" data-slots="" /><input type="hidden" name="time" /></label>
          <button className="btn" type="submit">Request booking</button>
        </form>
        <form className="card" id="cf" data-form="" data-kind="Message" data-mail={S.email} method="post" action={ep}>
          <h2 className="h3">✉️ Send a message</h2>
          {hp}<input type="hidden" name="_subject" defaultValue="New website message" />
          <label>Name<input name="name" required autoComplete="name" /></label>
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Service<select name="service"><Opts list={[...names, 'Something else']} /></select></label>
          <label>Message<textarea name="message" rows={6} required /></label>
          <button className="btn" type="submit" data-ev="generate_lead">Send message</button>
        </form>
      </div></section>
    </Shell>
  );
}

export function NotFoundView({ C }) {
  return (
    <Shell C={C} u="/404">
      <section className="w sec"><h1>Page not found</h1><p className="lead mu">That page does not exist.</p><a className="btn" href="/">Back to home</a></section>
    </Shell>
  );
}
