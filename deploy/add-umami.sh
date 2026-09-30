#!/bin/sh
set -eu

usage() {
    echo "Usage: $0 <website-id> [site-root]" >&2
    exit 64
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage

website_id=$1
site_root=${2:-.}

if ! printf '%s\n' "$website_id" | grep -Eq '^[0-9A-Fa-f-]{20,64}$'; then
    echo "Invalid Umami website ID: expected a UUID-like value." >&2
    exit 65
fi

if [ ! -d "$site_root" ]; then
    echo "Site root does not exist: $site_root" >&2
    exit 66
fi

snippet="<script defer src=\"https://analytics.ai-class.tech/script.js\" data-website-id=\"$website_id\"></script>"

find "$site_root" \
    \( -path "$site_root/.git" -o -path "$site_root/files" -o -path "$site_root/node_modules" \) -prune -o \
    -type f -name '*.html' -print |
while IFS= read -r file; do
    if grep -Fq 'analytics.ai-class.tech/script.js' "$file"; then
        printf 'skip %s\n' "$file"
        continue
    fi

    tmp="${file}.umami.$$"
    if awk -v snippet="$snippet" '
        BEGIN { inserted = 0 }
        {
            if (!inserted) {
                lowered = tolower($0)
                position = index(lowered, "</head>")
                if (position > 0) {
                    print substr($0, 1, position - 1) snippet substr($0, position)
                    inserted = 1
                    next
                }
            }
            print
        }
        END { if (!inserted) exit 2 }
    ' "$file" > "$tmp"; then
        chmod --reference="$file" "$tmp" 2>/dev/null || true
        mv "$tmp" "$file"
        printf 'add  %s\n' "$file"
    else
        status=$?
        rm -f "$tmp"
        if [ "$status" -eq 2 ]; then
            echo "No </head> tag found: $file" >&2
        fi
        exit "$status"
    fi
done

if find "$site_root" \
    \( -path "$site_root/.git" -o -path "$site_root/files" -o -path "$site_root/node_modules" \) -prune -o \
    -type f -name '*.html' -exec grep -L "data-website-id=\"$website_id\"" {} + | grep -q .; then
    exit 1
fi

echo "Umami snippet is present in every deployable HTML page."
