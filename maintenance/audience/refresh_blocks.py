#!/usr/bin/env python3
"""Re-renders the audience block inside the already published pages of deployed-public/.

Use this instead of build.py: build.py starts from the frozen September baseline and would drop
later changes to the pages. This script edits only the marked audience block, the labels payload
and the audience.js cache-buster, so everything else in the pages stays byte-for-byte.

    python3 refresh_blocks.py --data /root/work/audience-weekly-data/public/audience.json
"""
import argparse, hashlib, json, re, shutil, subprocess
from pathlib import Path

W = Path(__file__).resolve().parent
PUB = W.parent.parent / 'deployed-public'
PAGES = {'index.html': 'ru', 'page137462456.html': 'ru', 'audience/index.html': 'ru',
         'en/index.html': 'en', 'en/audience/index.html': 'en', 'es/index.html': 'es',
         'es/audience/index.html': 'es', 'zh/index.html': 'zh-Hans', 'zh/audience/index.html': 'zh-Hans'}
RENDER = ("const fs=require('fs'),a=require('./audience.js'),x=JSON.parse(fs.readFileSync(0,'utf8'));"
          "if(!a.valid(x.d))process.exit(4);process.stdout.write(a.render(x.d,x.l,x.c));")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', type=Path, required=True)
    data = json.loads(ap.parse_args().data.read_text())
    labels = json.loads((W / 'labels.json').read_text())
    shutil.copy2(W / 'audience.js', PUB / 'audience-assets/audience.js')
    ver = hashlib.sha256((W / 'audience.js').read_bytes()).hexdigest()[:12]
    for page, lang in PAGES.items():
        path = PUB / page
        s = path.read_text()
        compact = 'data-compact="true"' in s
        html = subprocess.check_output(['node', '-e', RENDER], cwd=W, input=json.dumps(
            {'d': data, 'l': labels[lang], 'c': compact}).encode()).decode()
        payload = json.dumps(labels[lang], ensure_ascii=False).replace('<', '\\u003c')
        s, n1 = re.subn(r'(<div data-content>).*?(</div><p class="aw-note aw-notice")',
                        lambda m: m.group(1) + html + m.group(2), s, count=1, flags=re.S)
        s, n2 = re.subn(r'(<script type="application/json" data-labels>).*?(</script>)',
                        lambda m: m.group(1) + payload + m.group(2), s, count=1, flags=re.S)
        s, n3 = re.subn(r'audience\.js\?v=[0-9a-f]{12}', 'audience.js?v=' + ver, s)
        if (n1, n2, n3) != (1, 1, 1):
            raise SystemExit('audience markers not found in %s: %s' % (page, (n1, n2, n3)))
        path.write_text(s)
        print(page, lang, 'compact' if compact else 'full')
    print('audience.js', ver, 'total', data['totals']['followers'])


if __name__ == '__main__':
    main()
