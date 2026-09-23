// Private synthetic fixtures: never publish these observations.
const assert=require('node:assert/strict'),a=require('./audience.js'),labels=require('./labels.json');
const row=(key,status,followers,kind='personal')=>({key,platform:key==='x'?'twitter':key,label:key,kind,status,followers,history:[],observed_at:'2026-09-22T00:00:00Z',profile_url:'https://example.com/'+key,include_in_total:key==='x'});
const d={schema_version:1,accounts:[row('x','ok',0),row('facebook','unverified',1),row('missing','ok',null),row('unavailable','unavailable',3),row('company','unavailable',null,'company'),row('youtube','stale',14500)],totals:{followers:0,coverage_keys:['x'],excludes_youtube:true,unique_people:false}};
for(const l of Object.values(labels)){
 const s=a.render(d,l,false);
 assert.equal((s.match(/class="aw-card"/g)||[]).length,2,'hide null, unavailable and unverified cards, preserve verified zero and stale');
 assert(!s.includes('facebook'));assert(!s.includes(l.company));assert(s.includes('>X<'),'visible X, technical twitter retained');assert.equal(d.accounts[0].platform,'twitter');
}
for(const l of Object.values(labels)){
 const s=a.render(d,l,true);
 assert(s.includes('class="aw-networks"'),'compact linked network counts');
 assert(s.includes(l.homeTitle));assert(s.includes(l.totalScope));assert(s.includes(l.nonUnique));
 assert(!s.includes('aw-summary-side'));assert(!s.includes('aw-button'));assert(!s.includes('facebook'));
 assert(s.includes('class="aw-youtube"'));assert(s.includes('>X <strong>0</strong>'));
 assert.equal((s.match(/class="aw-details"/g)||[]).length,1);
}
console.log('PASS minimal visibility: 4 locales, null/unavailable/unverified hidden; zero/stale retained; empty company hidden; X display-only');
