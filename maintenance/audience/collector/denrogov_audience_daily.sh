#!/bin/bash
# Daily audience counts for denrogov.com: Apify + public pages -> /audience-data/audience.json. No model.
set -uo pipefail
umask 077
export HOME=/root PATH=/usr/local/bin:/usr/bin:/bin TZ=UTC
/usr/bin/timeout 600 /usr/bin/python3 /root/work/audience-apify/collect.py \
  --out /root/work/audience-weekly-data/public/audience.json
rc=$?
if (( rc != 0 )); then
  printf 'Сбор аудитории denrogov.com: код %s (2 = часть источников не ответила, на сайте остались прошлые значения; 1 или 124 = сбор не прошел). Подробности: /root/work/audience-apify/last-run.json\n' "$rc" >&2
fi
exit "$rc"
