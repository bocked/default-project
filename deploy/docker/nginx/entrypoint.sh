#!/bin/sh
set -e

# ============================================================================
#  Nginx entrypoint: activate HTTPS config once Let's Encrypt certs exist,
#  otherwise serve plain HTTP so certbot can complete the webroot challenge.
#
#  envsubst replaces ${DOMAIN}, ${APP_HOST}, ${APP_PORT} in the template;
#  all other $variables (e.g. $host, $http_upgrade) are left untouched.
# ============================================================================

: "${DOMAIN:?DOMAIN is required}"
: "${APP_HOST:?APP_HOST is required}"
: "${APP_PORT:?APP_PORT is required}"

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  TEMPLATE=/etc/nginx/conf-templates/site.conf
  echo "certificate found for ${DOMAIN} - enabling HTTPS"
else
  TEMPLATE=/etc/nginx/conf-templates/http.conf
  echo "no certificate for ${DOMAIN} yet - starting HTTP-only"
fi

envsubst '${DOMAIN} ${APP_HOST} ${APP_PORT}' < "${TEMPLATE}" > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
