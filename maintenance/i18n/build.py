"""Private, deterministic multilingual overlay. Production is never a write target."""
from pathlib import Path
from bs4 import BeautifulSoup,Comment
import json,re,shutil,hashlib
from urllib.parse import urlsplit
W=Path(__file__).resolve().parent
P=W/'public'; SOURCE=W/'live'; T=W/'templates'
assert W==Path('/root/work/denrogov-i18n-en-zh')
REG={k:v for k,v in json.loads((W/'locales/registry.json').read_text()).items() if v['enabled']}
ROUTES=json.loads((W/'routes.json').read_text())
D={k:json.loads((W/f'locales/{k}.json').read_text()) for k,v in REG.items() if not v['preserve_baseline']}
def translate(text,lang,partial=False):
 d=D[lang]; stripped=text.strip()
 if stripped in d:return text.replace(stripped,d[stripped])
 if partial:
  for a,b in sorted(d.items(),key=lambda x:-len(x[0])):
   if re.search('[А-Яа-я]',a):text=text.replace(a,b)
 return text

def path_for(root,route):return root/route.lstrip('/')/'index.html'
def nav(lang,route):
 s=BeautifulSoup('<nav class="locale-switch"></nav>','html.parser');n=s.nav;n['aria-label']=REG[lang]['language']
 for code,cfg in REG.items():
  a=s.new_tag('a',href=route[code],lang=code,hreflang=code)
  if code==lang:a['aria-current']='page'
  a.string=cfg['label'];n.append(a)
 return n

def alternates(route):return ''.join(f'<link rel="alternate" hreflang="{code}" href="https://denrogov.com{route["ru" if code=="x-default" else code]}"/>' for code in [*REG,'x-default'])
def absolute_assets(s):
 for script in s.find_all('script'):
  if script.string:script.string.replace_with(str(script.string).replace("'js/tilda-stat-1.0.min.js'", "'/js/tilda-stat-1.0.min.js'"))
 for tag in s.find_all(True):
  for attr in ['src','href','data-original','data-img-zoom-url']:
   val=tag.get(attr)
   if isinstance(val,str) and val.startswith(('images/','css/','js/','files/','favicon','apple-touch')):tag[attr]='/'+val
 for st in s.find_all('style'):
  if st.string:st.string.replace_with(re.sub(r'url\(([\"\']?)(images/)',r'url(\1/\2',st.string))
 for tag in s.select('[style]'):tag['style']=re.sub(r'url\(([\"\']?)(images/)',r'url(\1/\2',tag['style'])

shutil.copytree(SOURCE,P,dirs_exist_ok=True)
(P/'i18n').mkdir(exist_ok=True);shutil.copy2(W/'locale.css',P/'i18n/locale.css')
coverage=[]
for route in ROUTES:
 for lang,cfg in REG.items():
  if cfg['preserve_baseline']:
   text=path_for(SOURCE,route[lang]).read_text()
   text=re.sub(r'<nav[^>]*class="locale-switch".*?</nav>',str(nav(lang,route)),text,count=1,flags=re.S)
   text=re.sub(r'<link\b(?=[^>]*hreflang=)[^>]*>','',text)
   text=text.replace('</head>',alternates(route)+'</head>')
   if route['id']=='home':
    from owner_scale import apply_scale
    text=apply_scale(text,lang)
  else:
   s=BeautifulSoup((T/route['source']).read_text(),'html.parser');s.html['lang']=lang
   for node in list(s.find_all(string=True)):
    if type(node).__name__=='NavigableString' and node.parent.name not in ['script','style']:node.replace_with(translate(str(node),lang,partial=True))
   for tag in s.find_all(True):
    for attr in ['alt','title','aria-label','placeholder']:
     if tag.get(attr):tag[attr]=translate(tag[attr],lang,partial=True)
   for script in s.find_all('script'):
    if script.string and 'const ZONES' in script.string:
     t=translate(str(script.string),lang,partial=True).replace("'ru-RU'",repr(cfg['intl'])).replace('}ч','}'+cfg['hours'])
     # Chinese default is Guangzhou when the browser zone is not in the supplied list.
     if cfg.get('fallback_zone'):t=t.replace("?.id||'utc'", "?.id||"+repr(cfg['fallback_zone']))
     script.string.replace_with(t)
   for a in s.find_all('a',href=True):
    href=a['href'];path=urlsplit(href).path
    for other in ROUTES:
     if path.rstrip('/')==other['ru'].rstrip('/') and (href.startswith('/') or href.startswith('https://denrogov.com')):a['href']=other[lang];break
    if a['href'].startswith('/') and not a['href'].startswith(cfg['prefix']+'/'):
     a['hreflang']='ru';a['title']=cfg['russian']
   for frame in s.find_all('iframe'):frame['title']=D[lang]['Выбор времени']
   absolute_assets(s)
   for tag in s.select('[data-original]'):
    v=tag['data-original']
    if tag.name=='img':tag['src']=v
    else:tag['style']=tag.get('style','')+f';background-image:url("{v}")'
   for tag in s.select('[data-animate-style]'):
    for key in list(tag.attrs):
     if key.startswith('data-animate'):del tag[key]
    tag['class']=[x for x in tag.get('class',[]) if not x.startswith('t-animate')]
   for t in s.select('link[rel="canonical"],link[rel="alternate"][hreflang],meta[property^="og:"],meta[name="description"]'):t.decompose()
   title=s.title.get_text();desc=cfg['description'] if route['id']=='home' else title
   for attrs in [{'name':'description','content':desc},{'property':'og:title','content':title},{'property':'og:description','content':desc},{'property':'og:url','content':'https://denrogov.com'+route[lang]},{'property':'og:type','content':'website'},{'property':'og:locale','content':cfg['og']},{'property':'og:image','content':'https://denrogov.com/images/tild6164-6638-4162-b334-353563623735__image_rogov.png'}]:s.head.append(s.new_tag('meta',attrs=attrs))
   s.head.append(s.new_tag('link',rel='canonical',href='https://denrogov.com'+route[lang]))
   s.head.append(BeautifulSoup(alternates(route),'html.parser'))
   css_version=hashlib.sha256((W/'locale.css').read_bytes()).hexdigest()[:12]
   s.head.append(s.new_tag('link',rel='stylesheet',href='/i18n/locale.css?v='+css_version))
   s.head.append(Comment(' design 5b0f17410219a0956527ee1f3231bc9114285fab; private deterministic locale overlay '))
   s.body.insert(0,nav(lang,route))
   if route['id']=='home':
    no=s.new_tag('noscript');menu=s.select_one('.t-menu-base__list')
    if menu:
     fallback=s.new_tag('nav',attrs={'class':'locale-note','aria-label':cfg['navigation']})
     for link in menu.find_all('a',href=True):
      a=s.new_tag('a',href=link['href']);a.string=link.get_text();fallback.append(a);fallback.append(' · ')
     no.append(fallback)
    p=s.new_tag('p',attrs={'class':'locale-note'});p.string='WeChat: DenBLG';no.append(p);s.body.insert(1,no)
    note=BeautifulSoup(f'<aside class="locale-note"><p><a href="{route[lang]}booking/">{cfg["book"]}</a> · <a href="https://denrogov.com/ai-class/" hreflang="ru">{cfg["ai"]}</a></p><p>{cfg["disclosure"]} <a href="https://denrogov.com/robots/" hreflang="ru">{cfg["robots"]}</a> · <a href="https://denrogov.com/base/" hreflang="ru">{cfg["base"]}</a></p></aside>','html.parser');s.body.append(note)
   if route['id'].startswith('booking'):
    frame=s.find('iframe')
    if frame:
     note=s.new_tag('p',attrs={'class':'locale-note'});a=s.new_tag('a',href=frame['src'].split('?')[0]);a.string=cfg['calendar'];note.append(a);frame.parent.insert_after(note)
   text=str(s)
  dest=path_for(P,route[lang]);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text)
  if lang=='ru':(P/route['source']).write_text(text)
  coverage.append({'family':route['id'],'locale':lang,'route':route[lang],'path':str(dest.relative_to(P))})
(P/'page137462456.html').write_bytes((P/'index.html').read_bytes())
(P/'sitemap-i18n.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>https://denrogov.com'+r['route']+'</loc></url>' for r in coverage if r['locale']!='ru')+'</urlset>')
(W/'coverage.json').write_text(json.dumps({'pages':coverage,'total':len(coverage),'families':len(ROUTES),'locales':list(REG),'not_translated':['blog and articles','robots','base','AI Class','legal','external channels and Calendly UI']},ensure_ascii=False,indent=2))
allow=[]
for f in sorted(P.rglob('*')):
 if f.is_file():
  rel=str(f.relative_to(P));old=SOURCE/rel
  if not old.exists() or f.read_bytes()!=old.read_bytes():allow.append({'path':rel,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'baseline_sha256':hashlib.sha256(old.read_bytes()).hexdigest() if old.exists() else None})
(W/'deploy-allowlist.json').write_text(json.dumps({'authorized':False,'baseline_image':json.loads((W/'baseline.json').read_text())['image'],'files':allow},indent=2))
print(json.dumps({'pages':len(coverage),'files':len(allow)}))
