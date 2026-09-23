# Multilingual static overlay — private architecture

## Sources and isolation
- Fresh immutable production baseline: `live/`, image `sha256:011eb91efbc730e09de8f4164bd9d1e701ca9ee89796279524ab039945f1d7f7`; no mounts; ReadonlyRootfs false. `baseline.json` inventories hashes. All previous 23 accepted ES/RU overlay hashes match this live tree.
- `templates/` preserves the previous pre-overlay Tilda export for new-language generation. It is NOT used to overwrite published Russian or Spanish: those are read from `live/` and changed only by replacing the language switch and reciprocal hreflang tags. Contract tests remove those two additive elements and demand byte equality with the baseline.
- `public/` is a local preview copy, not a deployment source to copy wholesale. Publish ONLY exact `deploy-allowlist.json` members after independent approval. No repository, production tree, routing, compose, DNS or auto-deploy configuration was changed.
- Pinned approved design: `5b0f17410219a0956527ee1f3231bc9114285fab`. Original portrait, layout, sections, assets and Tilda behavior retained; existing mobile hero corrections inherited.

## Maintained generator
`build.py` iterates enabled locales from `locales/registry.json`, not an ES-only language list. Registry contains labels, route prefixes, metadata locale, navigation/accessibility labels, disclosures, external-content labels, date locale and optional clock fallback. `routes.json` defines seven page families and equivalent paths. `locales/en.json` and `locales/zh-Hans.json` map original text nodes and accessibility strings; no runtime machine translation, localStorage or browser-language redirect.

`preserve_baseline:true` is a release-protection mode for the already approved RU/ES pages. New locale content is rendered from captured Tilda templates, with localized native links, title/description/OG, `lang`, self-canonical and reciprocal alternates for all actual covered locales plus Russian x-default. All four switch choices are active links, labeled Русский / Español / English / 中文. Original pageNN aliases remain byte-equivalent to Russian canonical pages.

Chinese uses `/zh/` with `lang` and hreflang `zh-Hans`, `zh_CN` Open Graph locale, `zh-CN` date formatting, and Guangzhou fallback only when the browser timezone is not a listed city. Actual browser timezone detection is retained. No locale redirect. Chinese system fallback stack includes PingFang SC / Microsoft YaHei / Noto Sans CJK SC; no font CDN dependency added. Latin Denis Rogov name retains serif display styling. Original language-switch stylesheet gains only Chinese-scoped rules; generated EN/ZH references have content-hashed query versions, while approved RU/ES references remain unchanged.

## Copy maintenance
The authoritative maintained build inputs are registry, routes, dictionaries and templates. `translations.tsv` and `prepare.py` record the initial bilingual authoring/import step; **do not rerun prepare.py after directly editing dictionaries**, as it recreates EN/ZH from the provenance table. `build.py` requires no prepare step. For future changes, edit dictionaries/registry directly and test; retire the importer in a clean source integration if desired.

To add a language:
1. Capture a fresh baseline in a NEW private isolated workspace and hash it. Never build in served source paths.
2. Add locale metadata and every UI/disclosure string to registry; add its dictionary covering text and accessibility attributes. Extend all seven route objects with real translated paths. Enable only complete locales.
3. Choose preserved-baseline vs generated mode explicitly; never silently regenerate an approved locale from an older template.
4. Run contracts including numbers, destination/iframe preservation, native links, assets, translated attributes, canonical/hreflang, and complete JS/no-JS viewport matrix. Human/native-language editorial review remains a separate acceptance step.
5. Build exact new/changed file allowlist against current live baseline, archive private inputs and test evidence, and give publisher immutable baseline ID and rollback requirements.

## Reproduction
```
cd /root/work/denrogov-i18n-en-zh
/root/work/superpowers-phenomenon/.venv/bin/python build.py
# preview.py requires free 127.0.0.1:51212; never stop another owner's preview
python3 preview.py
/root/work/superpowers-phenomenon/.venv/bin/python test_contract.py
node browser-test.cjs
```
Python requires BeautifulSoup; existing venv reused. Playwright reused from `/root/work/test4-rebalance/node_modules/playwright`. No installs. The current absolute-workspace guard and preview/test base must be explicitly adapted if moving the private package. Preview serves only public/, sets noindex/no-store and CSP to suppress analytics transmissions and form submission. Tests abort all third-party browser traffic, including Calendly. These preview headers are NOT in published HTML.

## Scope and limitations
Seven families: homepage (biography, projects, conferences, press, contact); booking selector; 15/30/60/90-minute shells; registration confirmation. Across four languages this is 28 canonical pages. Blog, articles, robots, base, AI Class, legal pages and external channels remain original-language and carry localized notices. Registration page translation is not proof of form submission. Calendly URLs preserved exactly; vendor UI, availability and backend duration not verified. No actual bookings or leads created. Source numeric inconsistencies (38-country hero versus 30+ statistic) are preserved, not invented or corrected.

Existing RU/ES markup is deliberately preserved outside switch/hreflang, including legacy accessibility wording inherited from the approved release. EN/ZH accessibility strings are localized explicitly. No new claim that the older Spanish release received a broader editorial/ARIA cleanup.

`sitemap-i18n.xml` remains a supplement, expanded with EN/ZH. Main sitemap/robots integration remains publisher follow-up, not silently changed.

## Browser acceptance synchronization lesson
For an anchor to the current URL, URL equality is not a navigation barrier. Register an actual navigation wait before Tab/Enter activation, then assert URL and document language. Keep a deterministic delayed-self-navigation RED repro and never catch/ignore ERR_ABORTED globally. Use DOMContentLoaded plus meaningful visible content readiness, persist per-page rows immediately, and derive the final unique matrix count from routes × locales × widths × JS states. See `navigation-repro.cjs`, `navigation-repro-red.log`, `navigation-repro-green.log` and `browser-results.json`.

## Source synchronization / packaging
Current repository is divergent from production and remote main has auto-deploy enabled. DO NOT push main or rebuild the whole checkout: overlays can be lost or unrelated changes shipped. Recommended separate scoped follow-up: an isolated worktree/branch based on reconciled deployment source; put generator/dictionaries/tests under a private build directory excluded from image context; integrate verified public overlays and source-baseline manifest deliberately; compare final image filesystem against this accepted overlay. Require review before any merge or auto-deploy. No such branch/commit/push was made here.

Archive `review-package.tar.gz` is a private reproducibility bundle. Scripts, dictionaries, logs, baseline copies and screenshots must never be put in production docroot or image build COPY wholesale. `deploy-allowlist.json` is exact publication scope, NOT authorization.

## Authorized current-scale override
Owner explicitly amended current company scale to 40+ countries / more than 200 locations. `owner-scale-overrides.json` and `owner_scale.py` apply four exact homepage copy replacements to preserved RU/ES, while updated EN/ZH dictionaries render identical scoped changes. Dates, timelines, speaker retrospective 30+ other-country experience and 60+ expansion plan remain unchanged. `amendment/copy-diff.json` proves all other homepage bytes unchanged versus first deployed EN/ZH release. Reproduction tests allow this explicit fact override, not arbitrary numeric drift. Do not use the historical private review archive as a deployment source; final hashes are in the release reports.
