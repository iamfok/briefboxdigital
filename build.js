// Static site generator for briefboxdigital.com. No dependencies. Run: node build.js
const fs=require('fs'),P=require('path');
const J=n=>JSON.parse(fs.readFileSync(P.join(__dirname,'content',n+'.json'),'utf8'));
const S=J('site'),SV=J('services'),PG=J('pages'),FQ=J('faqs'),PO=J('posts').filter(p=>p.slug&&p.title).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
const O=P.join(__dirname,'dist'),D=S.domain.replace(/\/$/,''),V=Date.now(),T=S.theme,L=S.logo,H=S.home,PGS=S.pg;
const today=new Date().toISOString().slice(0,10),book=S.book.url||'/contact',urls=[];
const e=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const hl=s=>e(s).replace(/\*(.+?)\*/g,'<span class="g">$1</span>');
const ld=x=>`<script type="application/ld+json">${JSON.stringify(x).replace(/</g,'\\u003c')}</script>`;
const crumbs=l=>({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:l.map((c,i)=>({'@type':'ListItem',position:i+1,name:c[0],item:D+c[1]}))});
const faqLd=l=>l&&l.length?{'@context':'https://schema.org','@type':'FAQPage',mainEntity:l.map(x=>({'@type':'Question',name:x.q,acceptedAnswer:{'@type':'Answer',text:x.a}}))}:null;
const faqs=(l,t)=>l&&l.length?`<section class="w sec"><h2>${hl(t||'Frequently asked *questions*')}</h2><div class="fq">${l.map(x=>`<details><summary>${e(x.q)}</summary><p>${e(x.a)}</p></details>`).join('')}</div></section>`:'';
fs.rmSync(O,{recursive:true,force:true});
function W(u,html,pri=.7){const f=P.join(O,u==='/'?'/index':u)+'.html';fs.mkdirSync(P.dirname(f),{recursive:true});fs.writeFileSync(f,html);if(u!=='/404')urls.push([u,pri])}
const link=(n,act)=>`<a href="${e(n.u)}"${act(n.u)?' aria-current="page"':''}>${e(n.t)}</a>`;

function layout(o){
 const url=D+(o.u==='/'?'':o.u),act=u=>o.u===u||(u!=='/'&&o.u.startsWith(u+'/'));
 const org={'@context':'https://schema.org','@type':'Organization',name:S.brand,url:D,logo:D+L.full,email:S.email,sameAs:S.social.map(s=>s.u)};
 if(S.phone)org.telephone=S.phone;if(S.address)org.address={'@type':'PostalAddress',streetAddress:S.address};
 const all=[org,...(o.u==='/'?[{'@context':'https://schema.org','@type':'WebSite',name:S.brand,url:D}]:[]),...(o.ld||[])].filter(Boolean);
 const nav=S.nav.map(n=>n.children?`<div class="dd">${link(n,act)}<span class="car" aria-hidden="true">▾</span><div class="dm">${n.children.map(c=>link(c,act)).join('')}</div></div>`:link(n,act)).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${e(o.title)}</title><meta name="description" content="${e(o.desc)}"><link rel="canonical" href="${url}"><meta name="robots" content="${o.ni?'noindex,follow':'index,follow,max-image-preview:large'}"><meta name="theme-color" content="${T.bg}"><meta property="og:site_name" content="${e(S.brand)}"><meta property="og:type" content="${o.type||'website'}"><meta property="og:title" content="${e(o.title)}"><meta property="og:description" content="${e(o.desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${D}/assets/og.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(o.title)}"><meta name="twitter:description" content="${e(o.desc)}"><link rel="icon" href="/assets/mark.png"><link rel="apple-touch-icon" href="/assets/mark.png"><link rel="preload" as="image" href="${L.head}"><link rel="stylesheet" href="/assets/style.css?v=${V}"><style>:root{--bg:${T.bg};--c1:${T.c1};--c2:${T.c2};--c3:${T.c3}}</style>${all.map(ld).join('')}</head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav"><div class="w nv"><a class="logo" href="/"><img src="${L.head}" alt="${e(S.brand)} logo" width="${L.hw}" height="${L.hh}"></a><input type="checkbox" id="mt" hidden><label class="bur" for="mt" aria-label="Menu">☰</label><nav class="nl" aria-label="Main">${nav}</nav><a class="btn sm" href="${e(book)}" data-ev="schedule">${e(S.cta)}</a></div></header>
<main id="main">${o.body}</main>
<footer class="ft"><div class="w"><div class="fg"><div><a href="/"><img src="${L.full}" alt="${e(S.brand)}" width="${L.fw}" height="${L.fh}" loading="lazy" style="width:190px;height:auto"></a><p class="mu">${e(S.footer.about)}</p><p class="mu sm"><a href="mailto:${e(S.email)}">${e(S.email)}</a>${S.phone?` · <a href="tel:${e(S.phone.replace(/[^+\d]/g,''))}">${e(S.phone)}</a>`:''}${S.address?`<br>${e(S.address)}`:''}</p><div class="so">${S.social.map(s=>`<a href="${e(s.u)}" target="_blank" rel="noopener noreferrer me" aria-label="${e(s.n)}" style="background:${e(s.c)}">${e(s.i)}</a>`).join('')}</div></div>${S.footer.cols.map(c=>`<div><h3>${e(c.title)}</h3>${c.links.map(l=>link(l,act)).join('')}</div>`).join('')}</div><div class="fb"><span>${e(S.footer.copy)}</span><button class="lk" data-cc>Cookie settings</button></div></div></footer>
<div id="cc" hidden><p>We use cookies for analytics and advertising (GDPR, UK GDPR, CCPA). Accept to enable tracking.</p><div class="row"><button class="btn sm" data-cy>Accept</button><button class="btn sm gh" data-cn>Decline</button></div></div>
<script>window.BB=${JSON.stringify(S.track).replace(/</g,'\\u003c')}</script><script src="/assets/app.js?v=${V}" defer></script></body></html>`}

const tiers=sv=>`<div class="tiers">${sv.tiers.map(t=>{const n=sv.name+' - '+t.name;return `<article class="tier${t.pop?' pop':''}">${t.pop?'<span class="bdg">Most popular</span>':''}<h3>${e(t.name)}</h3><p class="mu">${e(t.desc)}</p><p class="pr">${e(t.price)}<small>${e(t.per)}</small></p><ul>${t.features.map(f=>`<li>${e(f)}</li>`).join('')}</ul><a class="btn${t.pop?'':' gh'}" href="${e(t.pay||'/contact?plan='+encodeURIComponent(n))}" data-ev="begin_checkout" data-p="${e(n)}"${t.pay?' target="_blank" rel="noopener"':''}>${t.pay?'Buy now':'Get started'}</a></article>`}).join('')}</div>`;
const cta=(t,s)=>`<section class="w sec"><div class="cta"><h2>${hl(t)}</h2><p class="mu">${e(s)}</p><a class="btn" href="${e(book)}" data-ev="schedule">${e(S.cta)}</a></div></section>`;
const post=p=>`<article class="card"><span class="tag">${e(p.tag)}</span><h3><a href="/blog/${p.slug}">${e(p.title)}</a></h3><p class="mu">${e(p.desc)}</p><time class="mu sm" datetime="${p.date}">${p.date}</time></article>`;
const ring=a=>a.map((t,i)=>{const g=i/a.length*6.2832+.6;return `<span class="a" style="left:${(50+50*Math.cos(g)).toFixed(1)}%;top:${(50+50*Math.sin(g)).toFixed(1)}%"><span class="ch">${e(t)}</span></span>`}).join('');
const feat=f=>`<div class="card"><h3>${e(f.t)}</h3><p class="mu">${e(f.d)}</p></div>`;
const flow=['Lead','AI qualify','CRM','Follow-up','Booking'];
const head=(tag,h1,intro)=>`<div class="ph"><span class="tag">${e(tag)}</span><h1>${hl(h1)}</h1><p class="lead mu">${e(intro)}</p></div>`;

// Home
W('/',layout({u:'/',title:H.meta,desc:S.description,ld:[faqLd(FQ.home)],body:`<div class="hs"><canvas id="hb" aria-hidden="true"></canvas><section class="w hero"><div><span class="tag">${e(H.tag)}</span><h1>${hl(H.title)}</h1><p class="lead">${e(H.sub)}</p><div class="row"><a class="btn" href="${e(book)}" data-ev="schedule">${e(H.cta1)}</a><a class="btn gh" href="#services">${e(H.cta2)}</a></div></div><div class="orbit" aria-hidden="true"><span class="ring r1">${ring(H.ring1)}</span><span class="ring r2">${ring(H.ring2)}</span><img class="core" src="/assets/mark.png" alt="" width="256" height="256"></div></section></div>
<div class="tk" aria-hidden="true"><div>${[...H.ticker,...H.ticker,...H.ticker,...H.ticker].map(t=>`<span>${e(t)}</span>`).join('')}</div></div>
<section id="services" class="w sec"><h2>${hl(H.svc_title)}</h2><p class="mu">${e(H.svc_sub)}</p><div class="grid">${SV.map(s=>`<article class="card"><div class="ic">${s.icon}</div><h3><a href="/services/${s.slug}">${e(s.name)}</a></h3><p class="mu">${e(s.short)}</p><p class="row"><a class="more" href="/services/${s.slug}">Learn more →</a></p></article>`).join('')}</div></section>
${SV.map((s,i)=>`<section class="w sec alt${i%2?' rev':''}"><div class="sp"><span class="tag">${e(s.name)}</span><h2>${hl(s.hh)}</h2><p class="mu">${e(s.short)}</p>${s.slug==='ai-automation'?`<div class="flow" aria-hidden="true">${flow.map((f,j)=>(j?'<span class="ar">→</span>':'')+`<span class="node">${f}</span>`).join('')}</div>`:''}<a class="btn" href="/services/${s.slug}">Explore ${e(s.name)}</a></div><div class="fgrid">${s.features.slice(0,4).map(feat).join('')}</div></section>`).join('')}
<section class="w sec"><h2>${hl(H.why_title)}</h2><div class="grid">${H.why.map(feat2=>`<div class="card"><h3>${e(feat2.t)}</h3><p class="mu">${e(feat2.d)}</p></div>`).join('')}</div></section>
<section class="w sec"><h2>${hl(H.steps_title)}</h2><div class="grid">${H.steps.map(s=>`<div class="card"><h3>${e(s.t)}</h3><p class="mu">${e(s.d)}</p></div>`).join('')}</div></section>
<section class="w sec"><h2>${hl(H.ex_title)}</h2><p class="mu">${e(H.ex_sub)}</p><div class="grid">${H.examples.map(x=>`<div class="card"><div class="th" aria-hidden="true">✦</div><h3>${e(x.t)}</h3><p class="mu">${e(x.d)}</p></div>`).join('')}</div></section>
${faqs(FQ.home,H.faq_title)}
<section class="w sec"><h2>${hl(H.blog_title)}</h2><div class="grid">${PO.slice(0,3).map(post).join('')}</div></section>
${cta(H.cta_title,H.cta_sub)}`}),1);

// Services hub
const hub=PGS.hub;
W('/services',layout({u:'/services',title:hub.title,desc:hub.desc,ld:[crumbs([['Home','/'],['Services','/services']])],body:`<section class="w sec"><nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Services</span></nav>${head('Services',hub.h1,hub.intro)}<div class="grid">${SV.map(s=>`<article class="card"><div class="ic">${s.icon}</div><h2 class="h3"><a href="/services/${s.slug}">${e(s.name)}</a></h2><p class="mu">${e(s.short)}</p><p class="row"><a class="more" href="/services/${s.slug}">Learn more →</a><a class="more" href="/pricing#${s.slug}">Pricing</a></p></article>`).join('')}</div></section>${cta(H.cta_title,H.cta_sub)}`}),.9);

// Service pages (no prices here, see /pricing)
SV.forEach(s=>{const u='/services/'+s.slug,rel=PO.filter(p=>p.service===s.slug);W(u,layout({u,title:s.seo_title,desc:s.meta,
 ld:[crumbs([['Home','/'],['Services','/services'],[s.name,u]]),{'@context':'https://schema.org','@type':'Service',name:s.name,description:s.meta,url:D+u,provider:{'@type':'Organization',name:S.brand,url:D},areaServed:['United States','United Kingdom','Europe']},faqLd(s.faq)],
 body:`<section class="w sec"><nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/services">Services</a> / <span>${e(s.name)}</span></nav><h1>${e(s.h1)}</h1><p class="lead mu">${e(s.intro)}</p><div class="row"><a class="btn" href="${e(book)}" data-ev="schedule">${e(S.cta)}</a><a class="btn gh" href="/pricing#${s.slug}">View pricing</a></div></section>
<section class="w sec"><h2>What is <span class="g">included</span></h2><div class="grid">${s.features.map(feat).join('')}</div></section>
<section class="w sec prose wide">${s.sections.map(x=>`<h2>${e(x.h)}</h2><p>${e(x.p)}</p>`).join('')}</section>
<section class="w sec"><h2>How the <span class="g">process</span> works</h2><div class="grid">${s.process.map((x,i)=>`<div class="card"><h3>${i+1}. ${e(x.t)}</h3><p class="mu">${e(x.d)}</p></div>`).join('')}</div></section>
<section class="w sec"><div class="cta"><h2>Packages for <span class="g">${e(s.name)}</span></h2><p class="mu">Three clear packages with USD pricing. ${e(s.from)}.</p><a class="btn" href="/pricing#${s.slug}">Compare packages</a></div></section>
${faqs(s.faq,s.name+' *FAQ*')}
${rel.length?`<section class="w sec"><h2>Related <span class="g">guides</span></h2><div class="grid">${rel.map(post).join('')}</div></section>`:''}
<section class="w sec"><h2>Explore other services</h2><div class="row">${SV.filter(x=>x!==s).map(x=>`<a class="btn gh sm" href="/services/${x.slug}">${e(x.name)}</a>`).join('')}</div></section>${cta(H.cta_title,H.cta_sub)}`}),.9)});

// Pricing
const pr=PGS.pricing;
W('/pricing',layout({u:'/pricing',title:pr.title,desc:pr.desc,ld:[crumbs([['Home','/'],['Pricing','/pricing']]),faqLd(FQ.pricing),{'@context':'https://schema.org','@type':'ItemList',itemListElement:SV.flatMap(s=>s.tiers.map(t=>({'@type':'Offer',name:s.name+' - '+t.name,price:t.price.replace(/[^\d.]/g,''),priceCurrency:'USD',description:t.features.join(', ')}))).map((o,i)=>({'@type':'ListItem',position:i+1,item:o}))}],
 body:`<section class="w sec"><nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Pricing</span></nav>${head('Pricing',pr.h1,pr.intro)}<div class="row chips">${SV.map(s=>`<a class="btn gh sm" href="#${s.slug}">${e(s.name)}</a>`).join('')}</div></section>
${SV.map(s=>`<section id="${s.slug}" class="w sec"><h2>${e(s.name)} <span class="g">packages</span></h2><p class="mu">${e(s.short)} <a class="more" href="/services/${s.slug}">About this service →</a></p>${tiers(s)}</section>`).join('')}
<section class="w sec"><p class="mu sm">${e(pr.note)}</p></section>${faqs(FQ.pricing,'Pricing *FAQ*')}${cta(H.cta_title,H.cta_sub)}`}),.9);

// Blog
const bl=PGS.blog;
W('/blog',layout({u:'/blog',title:bl.title,desc:bl.desc,ld:[crumbs([['Home','/'],['Blog','/blog']]),faqLd(FQ.blog)],body:`<section class="w sec"><nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Blog</span></nav>${head('Blog',bl.h1,bl.intro)}<div class="grid">${PO.map(post).join('')}</div></section>${faqs(FQ.blog,'Blog *FAQ*')}${cta(H.cta_title,H.cta_sub)}`}),.8);
PO.forEach(p=>{const u='/blog/'+p.slug,sv=SV.find(x=>x.slug===p.service),more=PO.filter(x=>x!==p).slice(0,2);W(u,layout({u,type:'article',title:p.seo_title||((p.title+' | '+S.brand).length<=60?p.title+' | '+S.brand:p.title),desc:p.desc,ld:[crumbs([['Home','/'],['Blog','/blog'],[p.title,u]]),{'@context':'https://schema.org','@type':'BlogPosting',headline:p.title,description:p.desc,datePublished:p.date,dateModified:p.date,image:D+'/assets/og.png',mainEntityOfPage:D+u,author:{'@type':'Organization',name:S.brand},publisher:{'@type':'Organization',name:S.brand,logo:{'@type':'ImageObject',url:D+L.full}}}],
 body:`<article class="w sec prose"><nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a></nav><span class="tag">${e(p.tag)}</span><h1>${e(p.title)}</h1><time class="mu" datetime="${p.date}">${p.date}</time>${p.body}${sv?`<p class="rel">Related service: <a href="/services/${sv.slug}">${e(sv.name)}</a> · <a href="/pricing#${sv.slug}">pricing</a></p>`:''}</article>${more.length?`<section class="w sec"><h2>More <span class="g">guides</span></h2><div class="grid">${more.map(post).join('')}</div></section>`:''}${cta(H.cta_title,H.cta_sub)}`}),.6)});

// Pages (About, Privacy, Terms, Cookies and any page added in admin)
PG.forEach(p=>{if(!p.slug)return;const u='/'+p.slug,extra=p.slug==='about'?`<h2>Contact details</h2><p>Email: <a href="mailto:${e(S.email)}">${e(S.email)}</a>${S.phone?`<br>Phone: ${e(S.phone)}`:''}${S.address?`<br>Address: ${e(S.address)}`:''}</p>`:'';W(u,layout({u,title:`${p.title} | ${S.brand}`,desc:p.desc,ld:[crumbs([['Home','/'],[p.title,u]])],body:`<article class="w sec prose"><h1>${e(p.title)}</h1>${p.body}${extra}</article>${p.slug==='about'?cta(H.cta_title,H.cta_sub):''}`}),p.slug==='about'?.7:.4)});

// Contact + booking
const ep=S.forms.endpoint||'',tz=['London (GMT/BST)','Central Europe (CET)','Eastern Europe (EET)','New York (ET)','Chicago (CT)','Los Angeles (PT)','Other'];
const ct=PGS.contact,opt=a=>a.map(x=>`<option>${e(x)}</option>`).join('');
W('/contact',layout({u:'/contact',title:ct.title,desc:ct.desc,ld:[crumbs([['Home','/'],['Contact','/contact']])],body:`<section class="w sec"><nav class="bc" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Contact</span></nav>${head('Contact',ct.h1,ct.intro)}<div class="two">
<form class="card" id="bk" data-form data-kind="Booking request" data-mail="${e(S.email)}" method="post" action="${e(ep)}"><h2 class="h3">📅 Book a free call</h2>${S.book.url?`<p><a class="btn" href="${e(S.book.url)}" target="_blank" rel="noopener" data-ev="schedule">Book instantly on Google Calendar</a></p><p class="mu sm">Or request a time below.</p>`:''}<input type="hidden" name="_subject" value="Booking request"><label>Name<input name="name" required autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Service<select name="service">${opt(SV.map(s=>s.name).concat('Not sure yet'))}</select></label><label>Your time zone<select name="timezone">${opt(tz)}</select></label><label>Preferred date<input name="date" type="date" required data-today></label><label>Preferred time<span class="slots" data-slots></span><input type="hidden" name="time"></label><button class="btn" type="submit">Request booking</button></form>
<form class="card" id="cf" data-form data-kind="Message" data-mail="${e(S.email)}" method="post" action="${e(ep)}"><h2 class="h3">✉️ Send a message</h2><input type="hidden" name="_subject" value="New website message"><label>Name<input name="name" required autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Service<select name="service">${opt(SV.map(s=>s.name).concat('Something else'))}</select></label><label>Message<textarea name="message" rows="6" required></textarea></label><button class="btn" type="submit" data-ev="generate_lead">Send message</button></form></div></section>`}),.8);
W('/404',layout({u:'/404',ni:1,title:`Page not found | ${S.brand}`,desc:'Page not found.',body:`<section class="w sec"><h1>Page not found</h1><p class="lead mu">That page does not exist.</p><a class="btn" href="/">Back to home</a></section>`}));

fs.writeFileSync(P.join(O,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u,p])=>`<url><loc>${D}${u==='/'?'':u}</loc><lastmod>${today}</lastmod><priority>${p}</priority></url>`).join('')}</urlset>`);
fs.writeFileSync(P.join(O,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${D}/sitemap.xml\n`);
['assets','admin'].forEach(d=>fs.cpSync(P.join(__dirname,d),P.join(O,d),{recursive:true}));
console.log('Built',urls.length,'pages');
