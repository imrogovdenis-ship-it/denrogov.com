#!/bin/sh
set -eu

site_root=${1:-.}

if [ ! -d "$site_root" ]; then
    echo "Site root does not exist: $site_root" >&2
    exit 66
fi

replace_first() {
    file=$1
    needle=$2
    replacement=$3
    tmp="${file}.prepare.$$"

    if awk -v needle="$needle" -v replacement="$replacement" '
        BEGIN { replaced = 0 }
        {
            if (!replaced) {
                lowered = tolower($0)
                position = index(lowered, needle)
                if (position > 0) {
                    print substr($0, 1, position - 1) replacement substr($0, position + length(needle))
                    replaced = 1
                    next
                }
            }
            print
        }
        END { if (!replaced) exit 2 }
    ' "$file" > "$tmp"; then
        chmod --reference="$file" "$tmp" 2>/dev/null || true
        mv "$tmp" "$file"
    else
        status=$?
        rm -f "$tmp"
        echo "Could not find $needle in $file" >&2
        exit "$status"
    fi
}

ensure_lang_ru() {
    file=$1
    if grep -Eiq '<html[^>]+lang=' "$file"; then
        return
    fi
    replace_first "$file" '<html>' '<html lang="ru">'
    printf 'lang      %s\n' "$file"
}

insert_before_head() {
    file=$1
    marker=$2
    snippet=$3
    if grep -Fq "$marker" "$file"; then
        return
    fi
    replace_first "$file" '</head>' "${snippet}</head>"
    printf 'head      %s\n' "$file"
}

ensure_canonical() {
    file=$1
    url=$2
    if grep -Eiq '<link[^>]+rel="canonical"' "$file"; then
        if ! grep -Fq "href=\"$url\"" "$file"; then
            echo "Unexpected existing canonical in $file" >&2
            exit 1
        fi
        return
    fi
    insert_before_head "$file" 'rel="canonical"' "<link rel=\"canonical\" href=\"$url\">"
}

for file in "$site_root/index.html" "$site_root"/page*.html; do
    [ -f "$file" ] || continue
    ensure_lang_ru "$file"
done

ensure_canonical "$site_root/page54053171.html" 'https://denrogov.com/booking'
ensure_canonical "$site_root/page53959051.html" 'https://denrogov.com/booking/15'
ensure_canonical "$site_root/page54052193.html" 'https://denrogov.com/booking/30'
ensure_canonical "$site_root/page54052815.html" 'https://denrogov.com/booking/60'
ensure_canonical "$site_root/page54052831.html" 'https://denrogov.com/booking/90'

for file in "$site_root"/blog/*/index.html; do
    [ -f "$file" ] || continue
    insert_before_head "$file" '/css/blog-responsive.css' '<link rel="stylesheet" href="/css/blog-responsive.css">'
done

echo "Static HTML normalization complete."
