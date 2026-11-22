# Contenedor frontend (Tercer Parcial PPI115)

Imagen `debian:stable` + nginx. La aplicación **no** va dentro de la imagen: la carpeta `src`
se monta en `/var/www/html`, igual que en el comando del profesor. nginx sirve la SPA y hace de
proxy de `/galeno/` hacia el contenedor `galeno.backend` (puerto 9080) de la red `ppi115net`.

| Archivo | Para qué |
| --- | --- |
| `Dockerfile` | Construye la imagen: instala nginx con apt, borra la caché de apt, manda los logs a stdout/stderr y copia `default.conf` |
| `default.conf` | Sitio de nginx (`/etc/nginx/sites-available/default`): raíz `/var/www/html`, proxy `/galeno/`, `sw.js` sin caché, MIME del manifiesto y vuelta a `index.html` |

## Por qué el proxy

- El navegador del usuario no conoce el nombre `galeno.backend` (solo existe dentro de la red de
  Docker), y el backend no implementa CORS: la SPA llama a `/galeno/api/...` en su mismo origen
  (`http://localhost`) y nginx reenvía la petición al backend.
- `resolver 127.0.0.11` (DNS de Docker) y `proxy_pass $backend` con variable: nginx resuelve el
  nombre en cada petición y no al arrancar. Si el frontend arranca antes que el backend, nginx no
  falla; mientras el backend no esté, la API responde 502.
- `proxy_set_header Host $http_host`: el backend acepta un POST/PUT/DELETE solo si el `Origin` es
  igual a su propia URL, que arma con el `Host` (o si está en `CHIVOMED_ORIGINS`). `$http_host`
  conserva el host y el puerto que escribió el navegador; con otro `Host` los POST dan
  `403 auth.origen`.

## 1. Construir la imagen

Desde la raíz del repo:

```bash
docker build -t hp24002/galeno-frontend:1.0 docker/
```

## 2. Ejecutar como el profesor

```bash
docker network create ppi115net        # si no existe
docker run --rm --name galeno.frontend -h galeno.frontend -p 80:80 --network ppi115net \
  -v "$PWD/src":/var/www/html hp24002/galeno-frontend:1.0
```

El profesor monta `~/Descargas/tercerParcial/src`. El backend se levanta con su propio comando
(`../galenasv/docker/README.md`); el orden de arranque no importa.

Abrir `http://localhost/`. La API queda en `http://localhost/galeno/api/...` y las pantallas JSF
del backend también se ven por el proxy (`http://localhost/galeno/paginas/...`).

## 3. Verificar

```bash
curl -I http://localhost/                                          # 200 text/html
curl -I http://localhost/sw.js                                     # Cache-Control: no-cache
curl -I http://localhost/manifest.webmanifest                      # application/manifest+json
curl -i http://localhost/galeno/api/publico/tipos-documento        # 200 (502 si el backend no está)
docker run --rm hp24002/galeno-frontend:1.0 nginx -t               # sintaxis de la configuración
```

| Síntoma | Causa probable |
| --- | --- |
| `403 Forbidden` de nginx en `/` | No se montó `src` (falta el `-v`) o la ruta del host no existe |
| `502 Bad Gateway` en `/galeno/api/...` | El backend no está corriendo o no está en `ppi115net` con el nombre `galeno.backend` |
| `403 auth.origen` en el login | Se cambió el `Host` que llega al backend (debe ser `$http_host`) |
| `bind: address already in use` | Ya hay algo escuchando en el puerto 80 del host |

## 4. Entrega

Solo se entrega la carpeta `src` comprimida:

```bash
zip -r src.zip src
```

## 5. Publicar

```bash
docker login
docker push hp24002/galeno-frontend:1.0
```
