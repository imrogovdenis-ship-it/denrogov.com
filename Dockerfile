FROM nginx:1.29-alpine
ARG UMAMI_WEBSITE_ID=""
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
RUN /bin/sh /usr/share/nginx/html/deploy/prepare-html.sh /usr/share/nginx/html \
 && if [ -n "$UMAMI_WEBSITE_ID" ]; then \
        /bin/sh /usr/share/nginx/html/deploy/add-umami.sh "$UMAMI_WEBSITE_ID" /usr/share/nginx/html; \
    else \
        echo "NOTICE: Umami is disabled; set the UMAMI_WEBSITE_ID build argument." >&2; \
    fi \
 && rm -rf /usr/share/nginx/html/deploy \
           /usr/share/nginx/html/Dockerfile \
           /usr/share/nginx/html/.coolify \
           /usr/share/nginx/html/.dockerignore \
           /usr/share/nginx/html/htaccess.txt \
           /usr/share/nginx/html/readme.txt \
           /usr/share/nginx/html/files \
 && find /usr/share/nginx/html -type d -exec chmod 755 {} \; \
 && find /usr/share/nginx/html -type f -exec chmod 644 {} \;
