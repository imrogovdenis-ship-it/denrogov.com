// Synthetic fixtures stay private and are NEVER written into public/.
const assert=require('assert'),a=require('./audience.js'),l=require('./labels.json').en;
const acct=(key,platform,kind='personal')=>({key,platform,kind,label:'TEST <img src=x onerror=alert(1)>',profile_url:'javascript:alert(1)',followers:12,observed_at:'2026-09-22T00:00:00Z',status:'ok',previous_followers:10,delta_week:2,delta_pct:20,history:[{observed_at:'2026-09-15T00:00:00Z',followers:10},{observed_at:'2026-09-22T00:00:00Z',followers:12}],include_in_total:true});
let d={schema_version:1,accounts:[acct('x','twitter')],totals:{followers:999,delta_week:2,coverage_keys:['x'],excludes_youtube:true,unique_people:false}};
assert(a.valid(d));let s=a.render(d,l,false);assert(s.includes('999'));assert(!s.includes('<img'));assert(!s.includes('href="javascript:'));assert(s.includes('<svg'));assert(s.includes('+2'));assert(s.includes('Sep 15'));
d.accounts[0].history=d.accounts[0].history.slice(1);assert(!a.render(d,l,false).includes('<svg'));
d.accounts.push({...acct('tg','telegram'),profile_url:'https://t.me/privatejoinedchannel',include_in_total:false});assert(a.valid(d));assert(!a.render(d,l,false).includes('privatejoinedchannel'));
d.accounts.push({...acct('yt','youtube'),include_in_total:false,approximate:true});assert(a.render(d,l,false).includes('≈'));
d.totals.coverage_keys.push('yt');assert(!a.valid(d));
console.log('PASS runtime: source-only total, XSS/URL, history, weekly dates, Telegram boundary, approximation, exclusions');
