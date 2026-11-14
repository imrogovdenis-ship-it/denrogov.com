#!/usr/bin/env python3
"""Daily audience collector: Apify actors + two free public pages. Stdlib only, no LLM.

Reads sources.json, keeps one point per account per UTC day in state.json, writes the
public audience.json in the schema the denrogov.com widget already validates.
A failed or suspicious reading never replaces a good one: the last good value stays, marked stale.
"""
import argparse, datetime as dt, fcntl, json, os, re, sys, tempfile, time
import concurrent.futures as cf
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
TOKEN_FILE = Path('/root/.hermes/profiles/rogov_pro/.env')
TOKEN_KEY = 'APIFY_TOKEN_ROGOV_PRO'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
STALE_AFTER_H = 72        # one missed daily run is tolerated before a value is shown as stale
DROP_AFTER_D = 14         # a value older than this leaves the total
MAX_JUMP = 0.30           # a day-to-day change above 30% (and above 50 people) is treated as a scraper error
RUN_CAP_USD = 0.05        # hard price ceiling per actor run, enforced by Apify


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def iso(d):
    return d.isoformat(timespec='seconds').replace('+00:00', 'Z')


def stamp(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(dt.timezone.utc)


def token():
    t = os.environ.get('APIFY_TOKEN')
    if t:
        return t
    for line in TOKEN_FILE.read_text().splitlines():
        if line.startswith(TOKEN_KEY + '='):
            return line.split('=', 1)[1].strip().strip('"\'')
    raise RuntimeError('Apify token not found')


def http(url, data=None, headers=None, timeout=30):
    req = Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    try:
        with urlopen(req, timeout=timeout) as r:
            return r.read()
    except HTTPError as e:
        raise RuntimeError('HTTP %s' % e.code) from None
    except (URLError, TimeoutError, OSError):
        raise RuntimeError('network failure') from None


def fetch_apify(f, tok):
    q = urlencode({'timeout': 120, 'maxTotalChargeUsd': RUN_CAP_USD, 'maxItems': 3})
    url = 'https://api.apify.com/v2/acts/%s/run-sync-get-dataset-items?%s' % (f['actor'].replace('/', '~'), q)
    items = json.loads(http(url, json.dumps(f['input']).encode(),
                            {'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'}, 150))
    if not isinstance(items, list):
        raise RuntimeError('unexpected actor output')
    want = f['expect'].lower()
    for it in items:
        got = str(it.get(f['id'], '')).lower().rstrip('/') if isinstance(it, dict) else ''
        if got == want or ('/' in want and got.endswith(want)):
            return it.get(f['count']), 'https://apify.com/' + f['actor']
    raise RuntimeError('actor returned no item for the expected profile')


def telegram_count(page):
    m = re.search(r'tgme_page_extra[^>]*>([^<]+)<', page)
    n = re.fullmatch(r'([0-9][0-9\s, ]*)\s+subscribers', m.group(1).strip()) if m else None
    return int(re.sub(r'\D', '', n.group(1))) if n else None


def youtube_count(page, handle):
    """Reads the figure printed next to the channel's own handle (three significant digits)."""
    m = re.search(r'@' + re.escape(handle) + r'[^"0-9]{0,12}([0-9]+(?:[.,][0-9]+)?)([KM]?) subscribers', page)
    if not m:
        return None
    return round(float(m.group(1).replace(',', '.')) * {'': 1, 'K': 1e3, 'M': 1e6}[m.group(2)])


def fetch_one(src, tok):
    f = src['fetch']
    if f['type'] == 'apify':
        return fetch_apify(f, tok)
    if f['type'] == 'telegram':
        url = 'https://t.me/' + f['channel']
        return telegram_count(http(url).decode('utf-8', 'replace')), url
    if f['type'] == 'youtube':
        url = 'https://www.youtube.com/channel/' + f['channel_id']
        try:
            n = youtube_count(http(url, headers={'Accept-Language': 'en-US,en', 'Cookie': 'CONSENT=YES+1; SOCS=CAI'})
                              .decode('utf-8', 'replace'), f['handle'])
            if n is None:
                raise RuntimeError('subscriber figure not found on page')
            return n, url
        except RuntimeError:
            if 'fallback' not in f:
                raise
            return fetch_apify(f['fallback'], tok)
    raise RuntimeError('unknown source type')


def valid_count(n):
    return type(n) is int and 0 <= n <= 10 ** 9


def collect(sources, tok, fetcher=fetch_one, sleep=time.sleep):
    def attempt(src):
        err = None
        for i in range(2):
            try:
                n, source = fetcher(src, tok)
                if not valid_count(n):
                    raise RuntimeError('no valid count in response')
                return {'followers': n, 'source': source}
            except RuntimeError as e:
                err = str(e)
                if i == 0:
                    sleep(5)
        return {'error': err}
    with cf.ThreadPoolExecutor(6) as ex:
        return dict(zip([s['key'] for s in sources], ex.map(attempt, sources)))


def apply(state, readings, now, accept_jumps=False):
    """Adds today's good readings to state; returns per-key error text for everything rejected."""
    errors = {}
    points = state.setdefault('points', {})
    for key, r in readings.items():
        if 'error' in r:
            errors[key] = r['error']
            continue
        series = points.setdefault(key, [])
        prev = [p for p in series if p['date'] != now.date().isoformat()]
        if prev and not accept_jumps:
            old = prev[-1]['followers']
            diff = abs(r['followers'] - old)
            if diff > 50 and diff > MAX_JUMP * max(old, 1):
                errors[key] = 'suspicious jump %s -> %s, kept the previous value' % (old, r['followers'])
                continue
        series[:] = prev + [{'date': now.date().isoformat(), 'followers': r['followers'],
                             'observed_at': iso(now), 'source': r['source']}]
        series.sort(key=lambda p: p['observed_at'])
    return errors


def weekly_history(series):
    """First point of each ISO week plus the latest one: a readable chart, not 365 dots."""
    out = {}
    for p in series:
        d = dt.date.fromisoformat(p['date'])
        out.setdefault((d - dt.timedelta(days=d.weekday())).isoformat(), p)
    pts = list(out.values())
    if series and series[-1] not in pts:
        pts.append(series[-1])
    return [{'observed_at': p['observed_at'], 'followers': p['followers']} for p in pts]


def build(sources, state, now):
    accounts = []
    for s in sources:
        if not s.get('publish', True):
            continue
        series = state.get('points', {}).get(s['key'], [])
        last = series[-1] if series else None
        age_h = (now - stamp(last['observed_at'])).total_seconds() / 3600 if last else None
        status = 'unavailable' if not last else ('ok' if age_h <= STALE_AFTER_H else 'stale')
        prev = delta = pct = None
        if status == 'ok' and not s.get('approximate'):
            today = dt.date.fromisoformat(last['date'])
            base = [p for p in series if 6 <= (today - dt.date.fromisoformat(p['date'])).days <= 8]
            if base:
                b = min(base, key=lambda p: abs((today - dt.date.fromisoformat(p['date'])).days - 7))
                prev = b['followers']
                delta = last['followers'] - prev
                pct = round(delta / prev * 100, 2) if prev else None
        in_total = bool(last and s.get('in_total') and s['kind'] == 'personal' and age_h <= DROP_AFTER_D * 24)
        accounts.append({
            'platform': s['platform'], 'label': s['label'], 'profile_url': s['profile_url'], 'kind': s['kind'],
            'followers': last['followers'] if last else None, 'observed_at': last['observed_at'] if last else None,
            'status': status, 'source': last['source'] if last else None, 'collected_at': iso(now),
            'previous_followers': prev, 'delta_week': delta, 'delta_pct': pct, 'include_in_total': in_total,
            'approximate': bool(s.get('approximate')), 'key': s['key'], 'history': weekly_history(series)})
    inc = [a for a in accounts if a['include_in_total']]
    exact = [a for a in inc if not a['approximate']]   # a rounded source cannot show a weekly change
    complete = bool(exact) and all(a['delta_week'] is not None for a in exact)
    return {'schema_version': 1, 'generated_at': iso(now), 'accounts': accounts, 'totals': {
        'followers': sum(a['followers'] for a in inc) if inc else None,
        'delta_week': sum(a['delta_week'] for a in exact) if complete else None,
        'coverage_count': len(inc), 'excludes_youtube': not any(a['platform'] == 'youtube' for a in inc), 'unique_people': False,
        'coverage_keys': [a['key'] for a in inc]}}


def atomic_json(path, data, mode):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            f.write(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
            f.flush()
            os.fsync(f.fileno())
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def seed_from_public(path):
    """One-time import of the history the old collector already published."""
    points = {}
    for a in json.loads(Path(path).read_text())['accounts']:
        if a['status'] not in ('ok', 'stale'):
            continue
        seen = {}
        for p in a['history'] + [{'observed_at': a['observed_at'], 'followers': a['followers']}]:
            if p['observed_at'] and valid_count(p['followers']):
                o = iso(stamp(p['observed_at']))
                seen[o[:10]] = {'date': o[:10], 'followers': p['followers'], 'observed_at': o,
                                'source': a.get('source') or 'legacy'}
        points[a['key']] = sorted(seen.values(), key=lambda p: p['observed_at'])
    return {'schema_version': 2, 'points': points}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, default=ROOT / 'staging/audience.json',
                    help='public JSON to write (default: local staging copy, the site is not touched)')
    ap.add_argument('--seed', type=Path, help='old public audience.json to import history from when state is empty')
    ap.add_argument('--accept-jumps', action='store_true', help='accept large day-to-day changes this once')
    opt = ap.parse_args()
    with (ROOT / 'collect.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'status': 'error', 'error': 'collector already running'}))
            return 1
        sources = json.loads((ROOT / 'sources.json').read_text())
        sp = ROOT / 'state.json'
        state = json.loads(sp.read_text()) if sp.exists() else (seed_from_public(opt.seed) if opt.seed else {'schema_version': 2, 'points': {}})
        readings = collect(sources, token())
        now = now_utc()
        errors = apply(state, readings, now, opt.accept_jumps)
        doc = build(sources, state, now)
        if doc['totals']['followers'] is None:
            print(json.dumps({'status': 'error', 'error': 'no usable data; nothing written', 'errors': errors}, ensure_ascii=False))
            return 1
        atomic_json(sp, state, 0o600)
        opt.out.parent.chmod(0o755) if opt.out.parent.exists() else opt.out.parent.mkdir(parents=True, mode=0o755)
        atomic_json(opt.out, doc, 0o644)
        summary = {'status': 'degraded' if errors else 'ok', 'generated_at': doc['generated_at'], 'out': str(opt.out),
                   'total': doc['totals']['followers'], 'coverage': doc['totals']['coverage_count'],
                   'delta_week': doc['totals']['delta_week'],
                   'counts': {k: r.get('followers') for k, r in readings.items()}, 'errors': errors}
        atomic_json(ROOT / 'last-run.json', summary, 0o600)
        print(json.dumps(summary, ensure_ascii=False))
        return 2 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
