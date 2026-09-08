(() => {
'use strict';
const {robots,forms,apps}=JSON.parse(document.getElementById('catalog-data').textContent);
const $=id=>document.getElementById(id), q=$('q');
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/\u0451/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const compact=s=>norm(s).replace(/ /g,'');
const records=robots.map(r=>{const title=norm(r.name+' '+r.focus+' '+r.aliases);const body=norm([r.company,r.robots,...r.products,...r.forms.map(k=>forms[k]),...r.apps.map(k=>apps[k]),r.city].join(' '));return {r,title,body,words:(title+' '+body).split(' '),codes:(r.focus+' '+r.robots+' '+r.products.join(' ')).split(/[,;/]/).map(compact)}});
// One insertion, deletion or replacement, only in alphabetic words >= 5 characters.
function near(a,b){if(a.length<5||b.length<5||/\d/.test(a+b)||Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++}return edits+(i<a.length||j<b.length?1:0)<=1}
function rank(rec,query){const tokens=norm(query).split(' ').filter(Boolean);let score=0;for(let i=0;i<tokens.length;i++){let t=tokens[i];if(/^[a-z]+$/.test(t)&&/^\d+$/.test(tokens[i+1]||'')){t+=tokens[++i]}
 if(rec.title.includes(t)){score+=10;continue}if(rec.body.includes(t)){score+=5;continue}if(rec.codes.some(c=>c.includes(t))){score+=4;continue}if(rec.words.some(w=>near(t,w))){score+=1;continue}return -1}return score}
let state={q:'',form:'all',app:'all'};
const nodes=new Map(robots.map(r=>[r.id,$(r.id)]));
function facet(group,labels,key){const host=$(group);for(const [id,label] of [['all','Все'],...Object.entries(labels)]){const b=document.createElement('button');b.type='button';b.dataset.value=id;b.dataset.key=key;b.className='chip';b.textContent=label;b.addEventListener('click',()=>{state[key]=id;update('push')});host.append(b)}}
facet('forms',forms,'form');facet('apps',apps,'app');
function allowed(rec,ignore){return (ignore==='form'||state.form==='all'||rec.r.forms.includes(state.form))&&(ignore==='app'||state.app==='all'||rec.r.apps.includes(state.app))}
function writeURL(mode,hash=location.hash){const url=new URL(location.href);for(const key of ['q','form','app']){const v=state[key];if(v&&v!=='all')url.searchParams.set(key,v);else url.searchParams.delete(key)}url.hash=hash; if(url.href!==location.href)history[mode==='push'?'pushState':'replaceState'](null,'',url)}
function route(visible,scroll){const hash=location.hash;let id;try{id=decodeURIComponent(hash.slice(1))}catch{id='invalid'}if(!id)return;const target=document.getElementById(id);if(nodes.has(id)&&!visible.some(x=>x.r.id===id)||!target){$('route-note').hidden=false;$('route-note').textContent='Ссылка не соответствует текущим результатам или устарела. Фильтры сохранены; выберите запись в каталоге.';writeURL('replace','');return}if(scroll){target.scrollIntoView({block:'start'});if(nodes.has(id))target.focus({preventScroll:true})}}
function update(mode='replace',scroll=false){state.q=q.value;const ranked=records.map(rec=>({...rec,score:rank(rec,state.q)})).filter(rec=>rec.score>=0).sort((a,b)=>b.score-a.score);const visible=ranked.filter(rec=>allowed(rec));const ids=new Set(visible.map(x=>x.r.id));for(const [id,node] of nodes)node.hidden=!ids.has(id);for(const rec of visible)$('cards').append(nodes.get(rec.r.id));
 for(const b of document.querySelectorAll('.chip')){const key=b.dataset.key,id=b.dataset.value;const count=ranked.filter(rec=>allowed(rec,key)&&(id==='all'||rec.r[key==='form'?'forms':'apps'].includes(id))).length;const labels=key==='form'?forms:apps;b.textContent=(id==='all'?'Все':labels[id])+' · '+count;b.setAttribute('aria-pressed',String(state[key]===id));b.disabled=count===0&&state[key]!==id&&id!=='all'}
 $('toc').replaceChildren(...visible.map(({r})=>{const a=document.createElement('a');a.href='#'+r.id;a.textContent=r.name;if(location.hash==='#'+r.id)a.setAttribute('aria-current','location');return a}));
 $('toc-count').textContent=visible.length;$('result-count').textContent=visible.length+' из '+robots.length;$('status').textContent='Найдено: '+visible.length+' из '+robots.length+(state.form!=='all'?' · '+forms[state.form]:'')+(state.app!=='all'?' · '+apps[state.app]:'');$('empty').hidden=visible.length>0;$('active-filters').textContent=[state.form!=='all'?forms[state.form]:'',state.app!=='all'?apps[state.app]:''].filter(Boolean).join(' · ');$('clear').disabled=!state.q;$('route-note').hidden=true;writeURL(mode);route(visible,scroll);return visible}
function load(){const params=new URL(location.href).searchParams;state={q:params.get('q')||'',form:Object.hasOwn(forms,params.get('form'))?params.get('form'):'all',app:Object.hasOwn(apps,params.get('app'))?params.get('app'):'all'};q.value=state.q;update('replace',true)}
function reset(){state={q:'',form:'all',app:'all'};q.value='';writeURL('push','');update();q.focus()}
q.addEventListener('input',()=>update());$('clear').addEventListener('click',()=>{q.value='';update();q.focus()});$('reset').addEventListener('click',reset);$('empty-reset').addEventListener('click',reset);
window.addEventListener('popstate',load);window.addEventListener('hashchange',()=>update('replace',true));
// Native details stay accessible without custom focus traps. Compact by default on mobile.
if(matchMedia('(min-width: 900px)').matches){$('directory-panel').open=true;$('filter-panel').open=true}
$('return-search-bar').hidden=false;
$('return-search').addEventListener('click',()=>{q.focus({preventScroll:true});$('controls').scrollIntoView({block:'start'})});
$('controls').hidden=false;load();
})();
