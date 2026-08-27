FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
RUN rm -rf /usr/share/nginx/html/deploy \
           /usr/share/nginx/html/Dockerfile \
           /usr/share/nginx/html/.coolify \
           /usr/share/nginx/html/.dockerignore \
           /usr/share/nginx/html/htaccess.txt \
           /usr/share/nginx/html/readme.txt \
           /usr/share/nginx/html/files \
 && find /usr/share/nginx/html -type d -exec chmod 755 {} \; \
 && find /usr/share/nginx/html -type f -exec chmod 644 {} \;
