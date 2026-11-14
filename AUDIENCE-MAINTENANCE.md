# Audience block — how it works

The block «Моя совокупная аудитория» on the four home pages (RU/ES/EN/ZH), the RU Tilda alias
`page137462456.html` and the four `/audience/` pages.

## Data

- Live data is **not** in the image. nginx serves `/audience-data/audience.json` from
  `/srv/denrogov-audience-public/audience.json`, a read-only bind of the host directory
  `/root/work/audience-weekly-data/public`. Every other path under `/audience-data/` returns 404.
- The file is written by the collector in `maintenance/audience/collector/` (since 13.11.2026; it replaced
  the Schedulala-based weekly collector). It runs daily at 07:00 UTC from Hermes cron
  (`denrogov_audience_daily.sh`), uses Apify actors for Instagram, Threads, X, LinkedIn and Facebook and
  reads the public pages of Telegram and YouTube. Accounts are listed in `collector/sources.json`.
- The total sums every personal channel, **YouTube included** (`totals.excludes_youtube: false`).
  YouTube reports a rounded figure, so it is marked `approximate` and is left out of the weekly change.
  LinkedIn company pages are collected but not published (`publish: false`).
- A failed or suspicious reading (more than 30% and 50 people in a day) never replaces a good one:
  the last value stays, marked stale after 72 h, and leaves the total after 14 days.

Run the collector by hand (writes to `collector/staging/` unless `--out` is given):

```
python3 maintenance/audience/collector/collect.py
python3 maintenance/audience/collector/collect.py --out /root/work/audience-weekly-data/public/audience.json
```

It keeps its own `state.json` next to the script; the live copy lives in `/root/work/audience-apify/`.
The Apify token is read from `APIFY_TOKEN` or the `rogov_pro` Hermes profile and is never written anywhere.

## Widget

- Source: `maintenance/audience/audience.js`, `audience.css`, `labels.json`; published copy in
  `deployed-public/audience-assets/`. The pages fetch the JSON on every visit; the numbers baked into the
  HTML are only the no-JS fallback.
- `valid()` rejects malformed data. YouTube may be in `coverage_keys` only when `excludes_youtube` is false;
  the scope line and the policy text then switch to `totalScopeAll` / `policyAll`.

To refresh the no-JS numbers or ship a widget change, edit the source, then:

```
python3 maintenance/audience/refresh_blocks.py --data /root/work/audience-weekly-data/public/audience.json
node maintenance/audience/runtime-test.cjs
node maintenance/audience/minimal-test.cjs
python3 maintenance/audience/test_contract.py
(cd maintenance/audience/collector && python3 -m unittest test_collect)
```

`refresh_blocks.py` touches only the marked audience block, the labels payload and the `audience.js?v=`
cache-buster inside the published pages. Do **not** run the old `build.py`: it starts from the frozen
September baseline in `maintenance/audience/baseline/` and would drop every later change to the pages.

## Build

`Dockerfile.audience` copies `deployed-public/` and `deploy/audience-nginx.conf` into nginx; the compose file
`compose.audience.yaml` adds the read-only data mount. `maintenance/` is build-only and never served.

`deployed-public/` must equal what is live. Changes made directly on the server have to be brought back here,
otherwise the next build from Git rolls them back.
