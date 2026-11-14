import datetime as dt, json, subprocess, unittest
from pathlib import Path
import collect as c

N = dt.datetime(2026, 11, 12, 9, 0, tzinfo=dt.timezone.utc)
SRC = [{'key': 'instagram:a', 'platform': 'instagram', 'label': 'a', 'profile_url': 'https://www.instagram.com/a', 'kind': 'personal', 'in_total': True},
       {'key': 'youtube:a', 'platform': 'youtube', 'label': 'a', 'profile_url': 'https://www.youtube.com/a', 'kind': 'personal', 'in_total': False, 'approximate': True},
       {'key': 'linkedin:co', 'platform': 'linkedin', 'label': 'co', 'profile_url': None, 'kind': 'company', 'in_total': False, 'publish': False}]
WIDGET = Path(__file__).resolve().parent.parent   # maintenance/audience


def pt(day, n, hour=9):
    d = dt.datetime(2026, 11, day, hour, tzinfo=dt.timezone.utc)
    return {'date': d.date().isoformat(), 'followers': n, 'observed_at': c.iso(d), 'source': 's'}


class T(unittest.TestCase):
    def test_parsers(self):
        self.assertEqual(c.telegram_count('<div class="tgme_page_extra">2 466 subscribers</div>'), 2466)
        self.assertIsNone(c.telegram_count('<div class="tgme_page_extra">@x</div>'))
        page = '"content":"@other • 1K subscribers"},{"content":"‎⁨@me⁩ • ⁨15.9K subscribers⁩"},"16K subscribers"'
        self.assertEqual(c.youtube_count(page, 'me'), 15900)
        self.assertIsNone(c.youtube_count(page, 'nobody'))

    def test_identity_mismatch_rejected(self):
        f = {'actor': 'x/y', 'input': {}, 'count': 'n', 'id': 'u', 'expect': 'me'}
        orig = c.http
        c.http = lambda *a, **k: json.dumps([{'u': 'someone_else', 'n': 5}]).encode()
        try:
            with self.assertRaises(RuntimeError):
                c.fetch_apify(f, 't')
            c.http = lambda *a, **k: json.dumps([{'u': 'Me', 'n': 5}]).encode()
            self.assertEqual(c.fetch_apify(f, 't')[0], 5)
        finally:
            c.http = orig

    def test_retry_and_invalid_count(self):
        calls = []
        def fetcher(src, tok):
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError('HTTP 502')
            return 7, 's'
        self.assertEqual(c.collect(SRC[:1], 't', fetcher, lambda s: None)['instagram:a']['followers'], 7)
        r = c.collect(SRC[:1], 't', lambda s, t: (None, 's'), lambda s: None)
        self.assertIn('error', r['instagram:a'])

    def test_failure_keeps_last_good_and_jump_guard(self):
        st = {'points': {'instagram:a': [pt(11, 1000)]}}
        errs = c.apply(st, {'instagram:a': {'error': 'HTTP 500'}}, N)
        self.assertEqual(st['points']['instagram:a'][-1]['followers'], 1000)
        self.assertIn('instagram:a', errs)
        errs = c.apply(st, {'instagram:a': {'followers': 10, 'source': 's'}}, N)
        self.assertIn('suspicious', errs['instagram:a'])
        self.assertEqual(len(st['points']['instagram:a']), 1)
        self.assertEqual(c.apply(st, {'instagram:a': {'followers': 1010, 'source': 's'}}, N), {})
        c.apply(st, {'instagram:a': {'followers': 1012, 'source': 's'}}, N)   # same-day rerun replaces
        self.assertEqual([p['followers'] for p in st['points']['instagram:a']], [1000, 1012])

    def test_delta_total_and_staleness(self):
        st = {'points': {'instagram:a': [pt(5, 900), pt(12, 950)], 'youtube:a': [pt(5, 15000), pt(12, 16000)], 'linkedin:co': [pt(12, 4)]}}
        d = c.build(SRC, st, N)
        ig, yt = d['accounts']
        self.assertEqual(len(d['accounts']), 2)                      # unpublished company row is absent
        self.assertEqual((ig['delta_week'], ig['previous_followers'], ig['delta_pct']), (50, 900, 5.56))
        self.assertIsNone(yt['delta_week'])                          # rounded source: no invented growth
        self.assertEqual(d['totals']['followers'], 950)
        self.assertEqual(d['totals']['delta_week'], 50)
        late = N + dt.timedelta(days=5)
        d = c.build(SRC, st, late)
        self.assertEqual((d['accounts'][0]['status'], d['totals']['followers'], d['totals']['delta_week']), ('stale', 950, None))
        d = c.build(SRC, st, N + dt.timedelta(days=20))
        self.assertIsNone(d['totals']['followers'])                  # too old: leaves the total, no zero

    def test_no_delta_without_week_old_point(self):
        d = c.build(SRC, {'points': {'instagram:a': [pt(9, 900), pt(12, 950)]}}, N)
        self.assertIsNone(d['accounts'][0]['delta_week'])

    def test_youtube_in_total(self):
        src = [dict(SRC[0]), dict(SRC[1], in_total=True)]
        st = {'points': {'instagram:a': [pt(5, 900), pt(12, 950)], 'youtube:a': [pt(5, 15000), pt(12, 16000)]}}
        d = c.build(src, st, N)
        self.assertEqual((d['totals']['followers'], d['totals']['delta_week'], d['totals']['excludes_youtube']), (16950, 50, False))
        self.assertEqual(d['totals']['coverage_keys'], ['instagram:a', 'youtube:a'])
        self.assertEqual(self.widget(d), 0)

    def widget(self, doc, js=WIDGET):
        code = "const a=require('./audience.js');const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.exit(a.valid(d)?0:4)"
        return subprocess.run(['node', '-e', code], input=json.dumps(doc).encode(), cwd=js).returncode

    def test_widget_accepts_document(self):
        st = {'points': {'instagram:a': [pt(5, 900), pt(12, 950)], 'youtube:a': [pt(12, 16000)]}}
        doc = c.build(SRC, st, N)
        self.assertEqual(self.widget(doc), 0)


if __name__ == '__main__':
    unittest.main()
