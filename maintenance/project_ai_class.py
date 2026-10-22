from pathlib import Path
from bs4 import BeautifulSoup
import re,json,hashlib,shutil
W=Path(__file__).resolve().parent
COPY={
'ru': ['Практическое обучение ИИ с Денисом Роговым для предпринимателей и специалистов. Участники сами собирают систему под свои задачи: от нейросетей и автоматизации рутины до собственного ИИ-агента на сервере.','AI Start, AI Agents и индивидуальная работа — практика на своем проекте, обратная связь и контроль над результатом.','Подробнее об AI Class'],
'en': ['Hands-on AI learning with Denis Rogov for entrepreneurs and professionals. Participants build their own system for real tasks: from AI tools and routine automation to an AI agent on their own server.','AI Start, AI Agents and individual sessions combine practice on your own project, feedback and control over the outcome.','Learn more about AI Class'],
'es': ['Formación práctica en IA con Denis Rogov para emprendedores y profesionales. Cada participante crea su propio sistema para tareas reales: desde herramientas de IA y automatización hasta un agente en su propio servidor.','AI Start, AI Agents y sesiones individuales: práctica en tu proyecto, feedback y control sobre el resultado.','Más sobre AI Class'],
'zh': ['与 Denis Rogov 一起实践学习人工智能，面向创业者和专业人士。学员亲手搭建适合实际任务的系统：从使用 AI 工具、自动化日常工作，到在自己的服务器上部署 AI 智能体。','AI Start、AI Agents 和一对一学习：围绕自己的项目实践，获得反馈，并保持对成果的掌控。','了解 AI Class']}
STYLE='''<style data-ai-class-project="v1">
#rec2276415621 .tn-elem[data-elem-id="1778909752727000033"] .ai-class-mark{display:flex!important;align-items:center;justify-content:center;width:100%!important;height:100%!important;text-align:left;background:#0B1220;color:#50B1F9;font:700 24px/1.05 Arial,sans-serif;letter-spacing:-.7px;box-sizing:border-box;border:1px solid #50B1F9;border-radius:20px}
#rec2276415621 .tn-elem[data-elem-id="1778909713837000019"] .tn-atom{font-size:14px;line-height:1.55}
#rec2276415621 .ai-class-copy p{margin:0 0 12px}
#rec2276415621 .ai-class-copy .ai-class-more{display:inline-flex;align-items:center;min-height:44px;color:#50B1F9!important;text-decoration:underline!important;text-underline-offset:3px;font-weight:600;border-bottom:0!important}
#rec2276415621 .ai-class-more:focus-visible{outline:2px solid #50B1F9;outline-offset:3px}
@media(max-width:479px){#rec2276415621 .tn-elem[data-elem-id="1778909752727000033"] .ai-class-mark{font-size:17px;border-radius:12px}#rec2276415621 .tn-elem[data-elem-id="1778909713837000019"] .tn-atom{font-size:13px}}
</style><noscript><style>#rec2276415621 .t396__artboard{min-height:550px}@media(min-width:640px) and (max-width:1199px){#rec2276415621 .t396__artboard{min-height:1050px}}@media(max-width:639px){#rec2276415621 .t396__artboard{min-height:900px}}@media(max-width:479px){#rec2276415621 .t396__artboard{min-height:800px}}</style></noscript>'''
def apply(text,lang):
 lang='zh' if lang=='zh-Hans' else lang
 if 'data-ai-class-project="v1"' in text:return text
 soup=BeautifulSoup(text,'html.parser');rec=soup.find(id='rec2276415621')
 if not rec:return text
 title=rec.select_one('[field="tn_text_1778909713837000020"]');body=rec.select_one('[field="tn_text_1778909713837000019"]');shape=rec.select_one('[data-elem-id="1778909752727000033"] .tn-atom')
 assert title and title.get_text()=='To China Pro'
 assert body and shape
 oldtitle=str(title);oldbody=str(body);oldshape=str(shape)
 # Preserve the original serialization exactly; use the parsed DOM only to locate.
 def exact_outer(tag):
  start=text.index(str(tag).split('>')[0]) if False else None
 # Existing tags have stable field attrs but different attribute order per mirror.
 def atom(field):
  m=re.search(r'<div\b[^>]*\bfield=["\']'+field+r'["\'][^>]*>.*?</div>',text,re.S);assert m;return m.group()
 a=atom('tn_text_1778909713837000020');b=atom('tn_text_1778909713837000019')
 title_new=a.replace('To China Pro','AI Class')
 para1,para2,cta=COPY[lang]
 body_new=b[:b.index('>')+1].replace('class="tn-atom"','class="tn-atom ai-class-copy"')+f'<p>{para1}</p><p>{para2}</p><a class="ai-class-more" href="https://ai-class.tech/">{cta} ↗</a></div>'
 # Read exact original shape bytes from the shape's parent opening tag.
 sm=re.search(r'''(<div\b[^>]*data-elem-id=["']1778909752727000033["'][^>]*>\s*)(<div\b[^>]*>.*?</div>)''',text,re.S);assert sm
 shape_new='<div class="tn-atom ai-class-mark" aria-hidden="true"><span>AI<br>Class</span></div>'
 result=text.replace(a,title_new,1).replace(b,body_new,1).replace(sm[2],shape_new,1)
 marker=re.search(r'<div\b[^>]*id="rec2276415621"[^>]*>',result);assert marker
 insertion=result.index('</style>',marker.end())+len('</style>')
 result=result[:insertion]+STYLE+result[insertion:]
 assert 'tochina' not in str(BeautifulSoup(result,'html.parser').find(id='rec2276415621')).lower()
 # Reverse exact permitted substitutions: full document must be byte-identical.
 reverse=result.replace(STYLE,'',1).replace(title_new,a,1).replace(body_new,b,1).replace(shape_new,sm[2],1)
 assert reverse==text
 return result
