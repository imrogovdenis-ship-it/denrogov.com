/* Rogov Pro design 5b0f17410219a0956527ee1f3231bc9114285fab */
(function(root){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number.isSafeInteger(x)&&x>=0;
const date=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT/.test(x)&&Number.isFinite(Date.parse(x));
const url=x=>{try{let u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
function valid(d){
 if(!d||d.schema_version!==1||!Array.isArray(d.accounts)||d.accounts.length>30||!d.totals||d.totals.excludes_youtube!==true||d.totals.unique_people!==false)return false;
 if(!(d.totals.followers===null||num(d.totals.followers))||!Array.isArray(d.totals.coverage_keys))return false;
 const keys=new Set();
 for(const a of d.accounts){if(!a||typeof a.key!=='string'||keys.has(a.key)||!['personal','company'].includes(a.kind)||!['ok','stale','unavailable','unverified'].includes(a.status)||!(a.followers===null||num(a.followers))||typeof a.platform!=='string'||typeof a.label!=='string'||!Array.isArray(a.history))return false;keys.add(a.key);
 // Public Telegram is strictly the owner's public channel, never joined chats.
 if(a.platform.toLowerCase()==='telegram'&&url(a.profile_url)!=='https://t.me/rogovpro'&&d.totals.coverage_keys.includes(a.key))return false;
 }
 return d.totals.coverage_keys.every(k=>d.accounts.some(a=>a.key===k&&a.kind==='personal'&&a.platform.toLowerCase()!=='youtube'&&a.include_in_total===true&&['ok','stale'].includes(a.status)&&num(a.followers)));
}
function render(d,l,compact){
 d={...d,accounts:d.accounts.filter(a=>a.platform.toLowerCase()!=='telegram'||url(a.profile_url)==='https://t.me/rogovpro')};
 const platform=a=>({twitter:'X',instagram:'Instagram',linkedin:'LinkedIn',facebook:'Facebook',threads:'Threads',telegram:'Telegram',youtube:'YouTube'}[a.platform.toLowerCase()]||a.platform);
 const f=x=>num(x)?new Intl.NumberFormat(l.locale).format(x):'—';
 const dt=x=>date(x)?new Intl.DateTimeFormat(l.locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(x))+' UTC':'—';
 const signed=x=>Number.isFinite(x)?new Intl.NumberFormat(l.locale,{signDisplay:'exceptZero',maximumFractionDigits:1}).format(x):'—';
 const history=a=>{const points=a.history.filter(p=>num(p.followers)&&date(p.observed_at));return [...new Map(points.map(p=>[p.observed_at,p])).values()].sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));};
 const graph=a=>{let p=history(a);if(p.length<2)return `<p class="aw-note">${esc(l.baseline)}</p>`;let v=p.map(x=>x.followers),lo=Math.min(...v),hi=Math.max(...v),t=p.map(x=>Date.parse(x.observed_at)),span=t.at(-1)-t[0]; if(!span)return '';let coords=p.map((x,i)=>`${8+284*(t[i]-t[0])/span},${64-48*(v[i]-lo)/(hi-lo||1)}`).join(' ');return `<svg class="aw-chart" viewBox="0 0 300 80" role="img" aria-label="${esc(l.history+': '+p.map(x=>dt(x.observed_at)+' — '+f(x.followers)).join('; '))}"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="2"/></svg><p class="aw-note">${esc(dt(p[0].observed_at))} → ${esc(dt(p.at(-1).observed_at))}</p>`;};
 const card=a=>{const href=url(a.profile_url);const count=['ok','stale'].includes(a.status)?a.followers:null;let old=history(a).filter(p=>p.observed_at!==a.observed_at).at(-1);let delta=Number.isFinite(a.delta_week)&&num(a.previous_followers)&&old?`${signed(a.delta_week)}${Number.isFinite(a.delta_pct)?' ('+signed(a.delta_pct)+'%)':''}`:'—';return `<article class="aw-card"><div class="aw-card-top"><h3>${esc(a.label)}</h3><span class="aw-badge">${esc(l[a.status])}</span></div><p class="aw-platform">${esc(a.platform)}${a.include_in_total?'':' · '+esc(l.separate)}</p><div class="aw-value">${a.approximate&&num(count)?'≈ ':''}${f(count)}</div><p class="aw-note">${esc(l.observed)}: ${esc(dt(a.observed_at))}</p><p class="aw-change">${esc(l.weekly)} <strong>${delta}</strong></p>${old?`<p class="aw-note">${esc(dt(old.observed_at))} → ${esc(dt(a.observed_at))}</p>`:''}${graph(a)}${href?`<a class="aw-profile" href="${esc(href)}" rel="noopener noreferrer">${esc(l.profile)} ↗</a>`:''}</article>`;};
 const coverage=d.totals.coverage_keys.map(k=>{const a=d.accounts.find(a=>a.key===k);return a?platform(a):k;}).join(' · ');
 const observed=d.accounts.filter(a=>d.totals.coverage_keys.includes(a.key)&&date(a.observed_at)).map(a=>a.observed_at).sort((a,b)=>Date.parse(a)-Date.parse(b));
 const stamp=observed.length?`${esc(l.observed)}: ${esc(dt(observed[0]))} — ${esc(dt(observed.at(-1)))}`:'';
 let out=`<p class="aw-note">${stamp}</p><div class="aw-summary"><div><p class="aw-eyebrow">ROGOV PRO · ${esc(l.title)}</p><h2>${esc(l.total)}</h2><div class="aw-total">${f(d.totals.followers)}</div></div><div class="aw-summary-side"><p class="aw-change">${esc(l.weekly)} <strong>${Number.isFinite(d.totals.delta_week)?signed(d.totals.delta_week):'—'}</strong></p><p class="aw-note">${esc(l.baseline)}</p><p class="aw-note">${esc(l.coverage)}: ${esc(coverage||l.none)}</p></div></div><p class="aw-policy">${esc(l.policy)}</p>`;
 if(compact)return out+`<a class="aw-button" href="${l.prefix}audience/">${esc(l.details)} <span aria-hidden="true">↗</span></a>`;
 for(const [title,accounts]of [[l.personal,d.accounts.filter(a=>a.kind==='personal'&&a.platform.toLowerCase()!=='youtube')],[l.youtube,d.accounts.filter(a=>a.kind==='personal'&&a.platform.toLowerCase()==='youtube')],[l.company,d.accounts.filter(a=>a.kind==='company')]])out+=`<section class="aw-group"><h2>${esc(title)}</h2>${title===l.company?`<p class="aw-note">${esc(l.companyNote)}</p>`:''}<div class="aw-grid">${accounts.length?accounts.map(card).join(''):`<p class="aw-note">${esc(l.none)}</p>`}</div></section>`;
 return out;
}
const api={valid,render};if(typeof module!=='undefined')module.exports=api;
if(typeof document==='undefined')return;
for(const el of document.querySelectorAll('[data-audience]')){
 const l=JSON.parse(el.querySelector('[data-labels]').textContent); const target=el.querySelector('[data-content]'),notice=el.querySelector('[data-notice]');
 fetch('/audience-data/audience.json',{credentials:'omit',cache:'no-cache',signal:AbortSignal.timeout(8000)}).then(r=>{if(!r.ok)throw Error('HTTP');return r.json();}).then(d=>{if(!valid(d))throw Error('schema');target.innerHTML=render(d,l,el.dataset.compact==='true');notice.textContent='';el.dataset.state='ready';}).catch(()=>{notice.textContent=l.failed;el.dataset.state='fallback';});
}
})(typeof globalThis!=='undefined'?globalThis:this);
