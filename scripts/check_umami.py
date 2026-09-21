#!/usr/bin/env python3
"""Check all effective public documents, excluding exports and redirects."""
from pathlib import Path
from html.parser import HTMLParser
import re, json, sys
ROOT=Path(__file__).resolve().parents[1]
ID='4bd222b6-0c49-4f3b-95f6-ec44c41f8c6f'
EXCLUDE={'404.html','page100540816.html','page137462456.html','blog/index.html'}
class Scripts(HTMLParser):
 def __init__(self):super().__init__();self.tags=[]
 def handle_starttag(self,tag,attrs):
  if tag=='script':self.tags.append(dict(attrs))
def public(p):
 rel=p.relative_to(ROOT)
 return not any(part.startswith(('_','.')) for part in rel.parts) and rel.parts[0] not in {'files','base-vault','node_modules','deploy','scripts'} and str(rel) not in EXCLUDE
rows=[]
for p in sorted(ROOT.rglob('*.html')):
 if not public(p):continue
 text=p.read_text();parser=Scripts();parser.feed(text)
 trackers=[s for s in parser.tags if 'data-website-id' in s or 'analytics.ai-class.tech' in s.get('src','')]
 valid=len(trackers)==1 and trackers[0].get('data-website-id')==ID and trackers[0].get('src')=='https://analytics.ai-class.tech/script.js'
 # No inline loader, second tracker, or legacy identifier may coexist.
 valid=valid and len(re.findall(r'analytics\.ai-class\.tech/script\.js',text))==1 and 'denrogov-base' not in text
 rows.append({'file':str(p.relative_to(ROOT)),'valid':valid,'initializations':len(trackers)})
generator=(ROOT/'scripts/build_base.py').read_text()
ok=bool(rows) and all(x['valid'] for x in rows) and generator.count(ID)==1 and 'denrogov-base' not in generator
print(json.dumps({'ok':ok,'documents':len(rows),'exactly_one':sum(x['valid'] for x in rows),'generator_ok':generator.count(ID)==1,'rows':rows},indent=2))
sys.exit(0 if ok else 1)
