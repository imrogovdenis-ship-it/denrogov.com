from pathlib import Path
import json
MAP=json.loads((Path(__file__).resolve().parent/'owner-scale-overrides.json').read_text())['replacements']
def apply_scale(text,lang):
 for old,new in MAP[lang].items():
  assert text.count(old)==1,(lang,old,text.count(old))
  text=text.replace(old,new)
 return text
