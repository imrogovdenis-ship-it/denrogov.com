#!/usr/bin/env python3
"""Build public /base/ from Obsidian-compatible markdown vault.

Source: base-vault/**/*.md
Output: base/index.html and base/<slug>/index.html
Only notes with `published: true` in frontmatter are rendered.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from html import escape
from pathlib import Path
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
VAULT = ROOT / "base-vault"
OUT = ROOT / "base"
SITE = "https://denrogov.com"

CATEGORIES = {
    "china": "Китай",
    "tech": "Технологии",
    "ai": "AI",
    "business": "Бизнес",
    "notes": "Заметки",
}

@dataclass
class Note:
    title: str
    slug: str
    date: str
    category: str
    description: str
    image: str
    tags: list[str]
    body: str
    source: Path


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text
    raw = text[4:end]
    body = text[end + 5:]
    data: dict[str, str] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        data[k.strip()] = v.strip().strip('"').strip("'")
    return data, body


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9а-я\u0451\s_-]+", "", value, flags=re.I)
    table = str.maketrans({
        "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","\u0451":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
    })
    value = value.translate(table)
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "note"


def inline_md(s: str) -> str:
    s = escape(s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", s)
    # Obsidian wikilinks stay readable in public HTML.
    s = re.sub(r"\[\[([^\]]+)\]\]", r"<span class=\"wikilink\">\1</span>", s)
    return s


def md_to_html(md: str) -> str:
    blocks = []
    lines = md.replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("> "):
            quote = []
            while i < len(lines) and lines[i].startswith("> "):
                quote.append(inline_md(lines[i][2:].strip()))
                i += 1
            blocks.append(f"<blockquote>{'<br>'.join(quote)}</blockquote>")
            continue
        if line.startswith("### "):
            blocks.append(f"<h3>{inline_md(line[4:].strip())}</h3>")
            i += 1
            continue
        if line.startswith("## "):
            blocks.append(f"<h2>{inline_md(line[3:].strip())}</h2>")
            i += 1
            continue
        if line.startswith("# "):
            blocks.append(f"<h2>{inline_md(line[2:].strip())}</h2>")
            i += 1
            continue
        if line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{inline_md(lines[i][2:].strip())}</li>")
                i += 1
            blocks.append("<ul>" + "".join(items) + "</ul>")
            continue
        para = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"#{1,3} |[-] ", lines[i]):
            para.append(lines[i].strip())
            i += 1
        blocks.append(f"<p>{inline_md(' '.join(para))}</p>")
    return "\n".join(blocks)


def load_notes() -> list[Note]:
    notes: list[Note] = []
    for path in sorted(VAULT.rglob("*.md")):
        if path.name.startswith("_") or "/_" in path.as_posix():
            continue
        text = path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)
        if fm.get("published", "false").lower() != "true":
            continue
        title = fm.get("title") or path.stem
        slug = fm.get("slug") or slugify(title)
        category = fm.get("category") or "notes"
        tags = [x.strip() for x in fm.get("tags", "").split(",") if x.strip()]
        notes.append(Note(
            title=title,
            slug=slug,
            date=fm.get("date") or date.today().isoformat(),
            category=category,
            description=fm.get("description", ""),
            image=fm.get("image", ""),
            tags=tags,
            body=body,
            source=path,
        ))
    return sorted(notes, key=lambda n: n.date, reverse=True)


def page_shell(title: str, description: str, body: str, canonical: str) -> str:
    return f"""<!doctype html>
<html lang=\"ru\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>{escape(title)}</title>
  <meta name=\"description\" content=\"{escape(description)}\">
  <link rel=\"canonical\" href=\"{canonical}\">
  <meta property=\"og:title\" content=\"{escape(title)}\">
  <meta property=\"og:description\" content=\"{escape(description)}\">
  <meta property=\"og:type\" content=\"article\">
  <meta property=\"og:url\" content=\"{canonical}\">
  <link rel=\"stylesheet\" href=\"/base/assets/base.css\">
  <script defer src=\"https://analytics.ai-class.tech/script.js\" data-website-id=\"denrogov-base\"></script>
</head>
<body>
  <header class=\"topbar\"><a href=\"/\">Денис Рогов</a><nav><a href=\"/blog\">Блог</a><a href=\"/base/\">База</a></nav></header>
  {body}
</body>
</html>"""


def build() -> None:
    notes = load_notes()
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "assets").mkdir(parents=True)
    (OUT / "assets" / "base.css").write_text(CSS, encoding="utf-8")
    vault_assets = VAULT / "assets"
    if vault_assets.exists():
        for asset in vault_assets.iterdir():
            if asset.is_file():
                shutil.copy2(asset, OUT / "assets" / asset.name)

    cards = []
    for n in notes:
        category_label = CATEGORIES.get(n.category, n.category)
        url = f"/base/{n.slug}/"
        image_html = f'<figure class="hero-image"><img src="/base/assets/{escape(n.image)}" alt="{escape(n.title)}"><figcaption>Фото: Денис Рогов</figcaption></figure>' if n.image else ""
        cards.append(f"""<a class=\"card\" href=\"{url}\"><span>{escape(category_label)} · {escape(n.date)}</span><strong>{escape(n.title)}</strong><p>{escape(n.description)}</p></a>""")
        article = f"""<main class=\"article\"><div class=\"eyebrow\">{escape(category_label)} · {escape(n.date)}</div><h1>{escape(n.title)}</h1><p class=\"lead\">{escape(n.description)}</p>{image_html}<section>{md_to_html(n.body)}</section><footer><a href=\"/base/\">← В базу знаний</a></footer></main>"""
        d = OUT / n.slug
        d.mkdir(parents=True)
        (d / "index.html").write_text(page_shell(n.title, n.description, article, f"{SITE}/base/{n.slug}/"), encoding="utf-8")

    index_body = f"""<main class=\"home\"><div class=\"eyebrow\">Second brain</div><h1>База Дениса Рогова</h1><p class=\"lead\">Публичная база знаний: Китай, технологии, AI, бизнес, заметки и материалы, которые не обязаны быть официальными статьями.</p><div class=\"filters\"><span>Китай</span><span>Технологии</span><span>AI</span><span>Бизнес</span><span>Заметки</span></div><section class=\"grid\">{''.join(cards) if cards else '<p>Пока нет опубликованных заметок.</p>'}</section></main>"""
    (OUT / "index.html").write_text(page_shell("База Дениса Рогова", "Публичная база знаний и second brain Дениса Рогова.", index_body, f"{SITE}/base/"), encoding="utf-8")
    (OUT / "notes.json").write_text(json.dumps([n.__dict__ | {"source": str(n.source.relative_to(ROOT))} for n in notes], ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"notes": len(notes), "out": str(OUT)}, ensure_ascii=False))


CSS = """
:root{--bg:#070b12;--panel:#101826;--ink:#f8fafc;--muted:#a8b3c7;--blue:#50B1F9;--line:rgba(80,177,249,.28)}
*{box-sizing:border-box}html,body{width:100%;max-width:100%;overflow-x:hidden}body{margin:0;background:radial-gradient(circle at 20% 0,rgba(80,177,249,.18),transparent 34%),var(--bg);color:var(--ink);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}.topbar{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;align-items:center;gap:18px;width:100%;max-width:100%;padding:18px 28px;background:rgba(7,11,18,.82);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.08)}.topbar a{color:var(--ink);text-decoration:none;font-weight:700}.topbar nav{display:flex;gap:16px;min-width:0}.home,.article{width:min(1080px,calc(100% - 36px));max-width:100%;margin:0 auto;padding:76px 0}.article{width:min(820px,calc(100% - 36px));overflow-wrap:anywhere}.eyebrow{color:var(--blue);font-weight:800;text-transform:uppercase;letter-spacing:.14em;font-size:12px}h1{font-size:clamp(36px,6vw,76px);line-height:.96;margin:16px 0 22px;letter-spacing:-.055em;overflow-wrap:normal}.article h1{font-size:clamp(34px,5vw,58px)}.lead{color:var(--muted);font-size:20px;line-height:1.55;max-width:760px}.filters{display:flex;flex-wrap:wrap;gap:10px;margin:34px 0}.filters span{border:1px solid var(--line);border-radius:999px;padding:9px 13px;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:18px;margin-top:24px}.card{display:block;min-height:220px;padding:24px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(135deg,rgba(80,177,249,.14),rgba(255,255,255,.04));color:var(--ink);text-decoration:none;min-width:0}.card span{color:var(--blue);font-size:12px;text-transform:uppercase;letter-spacing:.12em}.card strong{display:block;margin:14px 0 10px;font-size:23px;line-height:1.12}.card p{color:var(--muted);line-height:1.5}.article section{font-size:19px;line-height:1.72;color:#dbe4f0}.article h2{font-size:30px;margin-top:42px;letter-spacing:-.02em}.article h3{font-size:23px;margin-top:30px}.article a{color:var(--blue);text-decoration-thickness:1px;text-underline-offset:3px;overflow-wrap:anywhere}.article code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:7px;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.hero-image{margin:34px 0;border:1px solid var(--line);border-radius:26px;overflow:hidden;background:rgba(255,255,255,.04);max-width:100%}.hero-image img{display:block;width:100%;height:auto}.hero-image figcaption{padding:12px 16px;color:var(--muted);font-size:14px}blockquote{margin:34px 0;padding:24px 26px;border-left:4px solid var(--blue);border-radius:22px;background:linear-gradient(135deg,rgba(80,177,249,.16),rgba(255,255,255,.05));color:#fff;font-size:clamp(22px,4vw,34px);line-height:1.32;font-weight:800;letter-spacing:-.03em;overflow-wrap:anywhere}.source-list{padding-left:18px}.source-list li{margin:10px 0;color:var(--muted)}.wikilink{color:var(--blue);border-bottom:1px dashed var(--blue)}footer{margin-top:52px;border-top:1px solid rgba(255,255,255,.1);padding-top:24px}@media(max-width:640px){.topbar{padding:14px 16px}.topbar nav{gap:10px}.home,.article{width:100%;padding:46px 16px}.article h1{font-size:34px;line-height:1.02;letter-spacing:-.035em}.lead{font-size:17px;line-height:1.5}.article section{font-size:17px;line-height:1.66}.article h2{font-size:25px}.hero-image{margin-left:0;margin-right:0;border-radius:18px}blockquote{padding:20px 18px;border-radius:18px;font-size:24px}}
""".strip()

if __name__ == "__main__":
    build()
