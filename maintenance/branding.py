"""Build-time header branding. Do not use for prose or runtime DOM rewriting."""
import re
ASSET='/images/tild3939-3732-4135-b030-386439336433__drlogo.svg'
STYLESHEET='<link rel="stylesheet" href="/assets/header-brand-v1.css">'
LABELS={'ru':'На главную','en':'Home','es':'Inicio','zh':'返回首页'}
def apply(text, route):
    lang=next((x for x in LABELS if route.startswith('/'+x+'/')),'ru')
    home='/' if lang=='ru' else '/'+lang+'/'
    changed=False
    def anchor(match):
        nonlocal changed
        a=match.group(); tag=a.split('>',1)[0]+'>'; body=a[len(tag):-4]
        if 'dr-home-logo' in tag:
            changed=True
            return re.sub(r'aria-label="[^"]*"',f'aria-label="{LABELS[lang]}"',re.sub(r'href="[^"]*"',f'href="{home}"',a,count=1),count=1)
        if not ('__drlogo.svg' in body or ('class="aw-brand"' in tag and body=='DENIS ROGOV')):
            return a
        changed=True
        cls=re.search(r'class="([^"]*)"',tag)
        classes=(cls.group(1)+' ' if cls else '')+'dr-home-logo'
        return f'<a class="{classes}" href="{home}" aria-label="{LABELS[lang]}"><img src="{ASSET}" width="36" height="38" alt="Денис Рогов"></a>'
    text=re.sub(r'<a(?=\s|>)[^>]*>.*?</a\s*>',anchor,text,flags=re.S)
    if changed and STYLESHEET not in text:
        text=text.replace('</head>',STYLESHEET+'</head>',1)
    return text
