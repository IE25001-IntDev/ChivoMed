# Imagen frontend ChivoMed - Tercer Parcial PPI115 2026
# Base exigida: debian:stable. nginx sirve la SPA y hace de proxy de /galeno/ hacia galeno.backend.
# La imagen NO contiene la aplicación: el profesor monta la carpeta src en /var/www/html:
#   docker run --rm --name galeno.frontend -h galeno.frontend -p 80:80 --network ppi115net \
#     -v ~/Descargas/tercerParcial/src:/var/www/html hp24002/galeno-frontend:1.0

FROM debian:stable

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /var/www/html/* \
 && ln -sf /dev/stdout /var/log/nginx/access.log \
 && ln -sf /dev/stderr /var/log/nginx/error.log

COPY default.conf /etc/nginx/sites-available/default

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
