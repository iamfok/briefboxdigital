(()=>{const rm=false,B=window.BB||{},d=document,L=localStorage;window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});
const ld=u=>{const s=d.createElement('script');s.async=1;s.src=u;d.head.appendChild(s)};let loaded=0;
function load(){if(loaded)return;loaded=1;gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
 if(B.gtm){dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});ld('https://www.googletagmanager.com/gtm.js?id='+B.gtm)}
 else if(B.ga4||B.ads){ld('https://www.googletagmanager.com/gtag/js?id='+(B.ga4||B.ads));gtag('js',new Date());B.ga4&&gtag('config',B.ga4);B.ads&&gtag('config',B.ads)}
 if(B.meta){!function(f,b,e,v,n,t,s){n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,d,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',B.meta);fbq('track','PageView')}
 if(B.custom){const w=d.createElement('div');w.innerHTML=B.custom;[...w.childNodes].forEach(n=>{if(n.tagName==='SCRIPT'){const s=d.createElement('script');s.text=n.text;if(n.src)s.src=n.src;d.head.appendChild(s)}else d.head.appendChild(n)})}}
const cc=d.getElementById('cc'),c=L.getItem('bb_c');c==='y'?load():c||(cc.hidden=false);
const set=v=>{L.setItem('bb_c',v);cc.hidden=true;v==='y'&&load()};
function ev(n,p){dataLayer.push({event:n,item:p});if(window.fbq)fbq('trackCustom',n,{item:p})}
d.addEventListener('click',e=>{const t=e.target;
  if(t.closest('[data-cy]'))set('y');if(t.closest('[data-cn]'))set('n');if(t.closest('[data-cc]'))cc.hidden=false;
 const v=t.closest('[data-ev]');if(v)ev(v.dataset.ev,v.dataset.p)});
const pl=new URLSearchParams(location.search).get('plan'),cf=d.getElementById('cf');if(pl&&cf)cf.elements.message.value='I am interested in: '+pl;
d.querySelectorAll('[data-today]').forEach(i=>i.min=new Date().toISOString().slice(0,10));
d.querySelectorAll('[data-slots]').forEach(b=>{const h=b.parentNode.querySelector('input[name=time]');for(let t=9;t<=17;t++){const x=document.createElement('button'),v=(t<10?'0':'')+t+':00';x.type='button';x.textContent=v;x.onclick=()=>{b.querySelectorAll('button').forEach(y=>y.classList.remove('on'));x.classList.add('on');h.value=v};b.append(x)}});
d.querySelectorAll('form[data-form]').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();if(f.elements.time&&!f.elements.time.value)return alert('Please choose a time');const fd=new FormData(f),ep=f.getAttribute('action');if(fd.get('_gotcha'))return;ev('generate_lead',f.dataset.kind);
 if(ep){try{const r=await fetch(ep,{method:'POST',body:fd,headers:{Accept:'application/json'}});if(!r.ok)throw 0;f.innerHTML='<h3>Thank you!</h3><p class="mu">We received your request and will reply within one business day.</p>';return}catch(_){}}
 const lines=[...fd.entries()].filter(([k])=>k[0]!=='_').map(([k,v])=>k+': '+v).join('\n');location.href='mailto:'+f.dataset.mail+'?subject='+encodeURIComponent(f.dataset.kind+' from '+fd.get('name'))+'&body='+encodeURIComponent(lines)}));
/* hero: network background + movable orbit */
const hb=d.getElementById('hb');if(hb&&!rm){const x=hb.getContext('2d'),cs=getComputedStyle(d.documentElement),c1=cs.getPropertyValue('--c3').trim(),c2=cs.getPropertyValue('--c2').trim();let W,H,N;
 const rs=()=>{W=hb.width=hb.offsetWidth;H=hb.height=hb.offsetHeight;N=Array.from({length:Math.min(60,W/22|0)},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35}))};rs();addEventListener('resize',rs);
 (function f(){x.clearRect(0,0,W,H);for(const a of N){a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>W)a.vx*=-1;if(a.y<0||a.y>H)a.vy*=-1;x.globalAlpha=.8;x.fillStyle=c2;x.fillRect(a.x,a.y,2,2);for(const b of N){const q=Math.hypot(a.x-b.x,a.y-b.y);if(q<120){x.globalAlpha=(1-q/120)*.5;x.strokeStyle=c1;x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke()}}}requestAnimationFrame(f)})()}
const ob=d.querySelector('.orbit');if(ob&&!rm){const r1=ob.querySelector('.r1'),r2=ob.querySelector('.r2'),c1s=[...r1.querySelectorAll('.ch')],c2s=[...r2.querySelectorAll('.ch')];let a=0,v=.17,dr=0,last=0,px=0,py=0;
 const ang=e=>{const r=ob.getBoundingClientRect();return Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2)*180/Math.PI};
 ob.addEventListener('pointerdown',e=>{dr=1;last=ang(e);ob.setPointerCapture(e.pointerId);ob.style.cursor='grabbing'});
 ob.addEventListener('pointermove',e=>{const r=ob.getBoundingClientRect();px=(e.clientX-r.left)/r.width-.5;py=(e.clientY-r.top)/r.height-.5;if(dr){const n=ang(e);let q=n-last;if(q>180)q-=360;if(q<-180)q+=360;a+=q;v=q;last=n}});
 const up=()=>{dr=0;ob.style.cursor=''};ob.addEventListener('pointerup',up);ob.addEventListener('pointercancel',up);ob.addEventListener('pointerleave',()=>{px=py=0});
 (function t(){if(!dr){a+=v;v+=(.17-v)*.03}const b=-a*.78;r1.style.transform='rotate('+a+'deg)';r2.style.transform='rotate('+b+'deg)';c1s.forEach(c=>c.style.transform='rotate('+-a+'deg)');c2s.forEach(c=>c.style.transform='rotate('+-b+'deg)');ob.style.transform='perspective(900px) rotateX('+(-py*16)+'deg) rotateY('+(px*16)+'deg)';requestAnimationFrame(t)})()}
})();
