#!/usr/bin/env python3
"""Additive overlay only. Never runs old i18n generator against current public bytes."""
from pathlib import Path
import json,subprocess,hashlib,re,shutil,html,argparse
W=Path(__file__).resolve().parent
assert (W/'baseline').is_dir(), 'Frozen public baseline required'
args=argparse.ArgumentParser();args.add_argument('--data',type=Path);opt=args.parse_args()
b=W/'baseline';p=W/'public';labels=json.loads((W/'labels.json').read_text())
if opt.data:
 data=json.loads(opt.data.read_text())
 data['accounts']=[a for a in data['accounts'] if a['platform'].lower()!='telegram' or a.get('profile_url')=='https://t.me/rogovpro']
else:
 data={'schema_version':1,'generated_at':None,'accounts':[], 'totals':{'followers':None,'delta_week':None,'coverage_keys':[],'excludes_youtube':True,'unique_people':False}}
# Render through the exact runtime renderer; reject malformed data before producing HTML.
def render(lang,compact):
 code="const fs=require('fs'),a=require('./audience.js'),x=JSON.parse(fs.readFileSync(0,'utf8'));if(!a.valid(x.d))process.exit(4);process.stdout.write(a.render(x.d,x.l,x.c));"
 return subprocess.check_output(['node','-e',code],input=json.dumps({'d':data,'l':labels[lang],'c':compact}).encode(),cwd=W).decode()
assets=p/'audience-assets';assets.mkdir(exist_ok=True)
versions={}
for f in ['audience.css','audience.js']:
 shutil.copy2(W/f,assets/f);versions[f]=hashlib.sha256((W/f).read_bytes()).hexdigest()[:12]
head=f'<link rel="stylesheet" href="/audience-assets/audience.css?v={versions["audience.css"]}"><script defer src="/audience-assets/audience.js?v={versions["audience.js"]}"></script>'
def block(lang,compact):
 l=labels[lang];payload=json.dumps(l,ensure_ascii=False).replace('<','\\u003c');notice=l['fallback'] if not data['accounts'] else (l['shortSnapshot'] if compact else l['snapshot'])
 return f'<!--audience:start--><section class="aw" id="audience" data-audience="/audience-data/audience.json" data-compact="{str(compact).lower()}" aria-label="{html.escape(l["title"])}"><div data-content>{render(lang,compact)}</div><p class="aw-note aw-notice" data-notice role="status">{html.escape(notice)}</p><script type="application/json" data-labels>{payload}</script></section><!--audience:end-->'
for lang,l in labels.items():
 home=l['prefix'];rel=home.lstrip('/')+'index.html';original=(b/rel).read_text()
 # Insert immediately before the verified localized press cards section.
 # Same frozen Tilda record in RU/ES/EN/ZH; preserve all existing bytes.
 pattern=r'<div\b[^>]*\bid="rec2232310341"[^>]*>'
 match=re.search(pattern,original);assert match,rel
 s=original[:match.start()]+block(lang,True)+original[match.start():]
 s=s.replace('</head>','<!--audience:head-->'+head+'<!--audience:/head--></head>',1)
 (p/rel).write_text(s)
 if lang=='ru':
  for alias in b.glob('page*.html'):
   if alias.read_bytes()==(b/'index.html').read_bytes():(p/alias.name).write_text(s)
 alternates=''.join(f'<link rel="alternate" hreflang="{k}" href="https://denrogov.com{v["prefix"]}audience/">' for k,v in labels.items())+'<link rel="alternate" hreflang="x-default" href="https://denrogov.com/audience/">'
 nav=''.join(f'<a href="{v["prefix"]}audience/" lang="{k}"'+(' aria-current="page"' if k==lang else '')+f'>{v["name"]}</a>' for k,v in labels.items())
 title=html.escape(l['title']+' · Denis Rogov');intro=html.escape(l['intro'])
 page=f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><meta name="description" content="{intro}"><link rel="canonical" href="https://denrogov.com{home}audience/">{alternates}<meta property="og:title" content="{title}"><meta property="og:description" content="{intro}"><meta property="og:url" content="https://denrogov.com{home}audience/"><meta property="og:type" content="website">{head}</head><body class="aw-page"><header class="aw-header"><a class="aw-brand" href="{home}">DENIS ROGOV</a><nav class="aw-languages" aria-label="Language">{nav}</nav></header><main><div class="aw-intro"><h1>{html.escape(l["title"])}</h1><p>{intro}</p></div>{block(lang,False)}<section class="aw-method"><h2>{html.escape(l["method"])}</h2><p>{html.escape(l["methodText"])}</p><a href="{home}" style="color:inherit">← {html.escape(l["home"])}</a></section></main><footer class="aw-footer"><span>DENIS ROGOV · DENROGOV.COM</span><span><a href="https://t.me/rogovpro">TG @rogovpro</a> · <a href="https://www.youtube.com/@imrogov">YT @imrogov</a></span></footer></body></html>'
 dest=p/home.lstrip('/')/'audience/index.html';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(page)
sitemap=(b/'sitemap.xml').read_text();addition=''.join(f'<url><loc>https://denrogov.com{l["prefix"]}audience/</loc></url>' for l in labels.values());(p/'sitemap.xml').write_text(sitemap.replace('</urlset>',addition+'</urlset>'))
if opt.data:
 (p/'audience-data').mkdir(exist_ok=True);(p/'audience-data/audience.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
changes=[]
for f in p.rglob('*'):
 if f.is_file():
  f.chmod(0o644);rel=str(f.relative_to(p));old=b/rel
  if not old.exists() or old.read_bytes()!=f.read_bytes():changes.append({'path':rel,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'size':f.stat().st_size,'new':not old.exists(),'mutable':rel.startswith('audience-data/')})
for d in p.rglob('*'):
 if d.is_dir():d.chmod(0o755)
(W/'deploy-allowlist.json').write_text(json.dumps({'authorized':False,'baseline_image':'sha256:d724bc55cf37e4c4dacd65dd74a2e46222ef1c2aa46e7d5609b87492bfa242a4','files':changes},indent=2))
(W/'data-integration.json').write_text(json.dumps({'input':str(opt.data) if opt.data else None,'accounts':len(data['accounts']),'generated_at':data.get('generated_at')},indent=2))
print('Generated',len(changes),'changed/new files; data accounts',len(data['accounts']))
