# Bitácora del tercer parcial: frontend ChivoMed en Docker

Rama `desarrollo`. El profesor ejecuta:

```bash
docker run --rm --name galeno.frontend -h galeno.frontend -p 80:80 --network ppi115net \
  -v ~/Descargas/tercerParcial/src:/var/www/html IMAGEN
```

Solo se entrega la carpeta `src` (zip). La imagen es `hp24002/galeno-frontend:1.0`, sobre
`debian:stable`. El backend (`hp24002/galeno-backend:1.0`, repo `../galenasv`, rama
`backend-rubrica`) corre en `galeno.backend` en la misma red, con la API en
`http://galeno.backend:9080/galeno/api`.

## Cambios

| Fecha | Commit | Qué | Por qué |
| --- | --- | --- | --- |
| 2026-11-22 | `5bb4786` | `CLAUDE.md` y `AGENTS.md`: API en `/galeno/api`, rama `desarrollo`, Docker permitido para las imágenes y contenedores de prueba de este proyecto | Instrucciones del tercer parcial |
| 2026-11-22 | `c944cf8` | `/galenosv/api` → `/galeno/api` en `api_config.js`, `sw_logica.js` (versión de caché `2026-11-17.28` → `2026-11-22.1`), `dev_server.js`, `.env.example`, `README.md` y 12 archivos de pruebas | El backend cambió su contexto de `/galenosv` a `/galeno`. Subir la versión hace que el SW nuevo precachee de nuevo y borre los cachés viejos (que tenían catálogos bajo `/galenosv/api`) |
| 2026-11-22 | `69ea99a` | `docker/default.conf`: sitio de nginx | Ver "Motivos de la configuración de nginx" |
| 2026-11-22 | `65ddb8e` | `docker/Dockerfile`: `debian:stable`, nginx por apt, sin caché de apt, logs a stdout/stderr, `EXPOSE 80`, `CMD ["nginx","-g","daemon off;"]` | La imagen no copia la app: llega por el volumen en `/var/www/html` |
| 2026-11-22 | `b68e57a` | `docker/README.md` | Cómo construir, probar y publicar la imagen |

`grep -rn galenosv --exclude-dir=node_modules .` después del cambio solo encuentra: el nombre de
los paquetes Java en `CLAUDE.md`/`AGENTS.md` (correcto, los paquetes siguen siendo `galenosv`),
reportes históricos (`docs/plan.md`, `docs/reportes/`) y `auditar_roles.sh` (fuera de los
commits por regla del proyecto). El `.env` local (no versionado) también se actualizó.

### Motivos de la configuración de nginx

- **Proxy `/galeno/`**: el navegador del profesor no conoce `galeno.backend` (es un nombre de la
  red de Docker) y el backend no implementa CORS. La SPA llama a `/galeno/api/...` en su mismo
  origen (`http://localhost`) y nginx la reenvía. `proxy_pass` sin URI conserva la ruta original.
- **`resolver 127.0.0.11 valid=10s ipv6=off` + `set $backend ...`**: con una variable en
  `proxy_pass`, nginx resuelve `galeno.backend` en cada petición y no al arrancar. Así no falla si
  el frontend arranca antes que el backend (probado: con el backend apagado responde 502 y nginx
  sigue arriba; al arrancar el backend responde 200 sin reiniciar nginx).
- **`proxy_set_header Host $http_host`**: conserva el host y el puerto que escribió el navegador.
  El backend (`AutenticacionFilter.origenPermitido`) acepta un POST/PUT/DELETE si el `Origin` es
  igual al esquema + autoridad de `request.getRequestURL()`, que sale del `Host`. Si no coinciden,
  los POST dan `403 auth.origen`. Además `X-Real-IP`, `X-Forwarded-For` y `X-Forwarded-Proto`.
- **`location = /sw.js` con `Cache-Control: no-cache`**: el navegador revalida siempre el service
  worker y detecta enseguida una versión nueva.
- **`.webmanifest` como `application/manifest+json`**.
- **`location / { try_files $uri $uri/ /index.html; }`**: cualquier ruta desconocida devuelve la SPA.

### Tarea 2: todo lo que la app usa en ejecución está en `src/`

- `src/index.html`, `src/manifest.webmanifest`, `src/sw.js`, `src/js/**`, `src/resources/**`
  (CSS, favicon e iconos de la PWA).
- Script de comprobación: 153 referencias relativas (`import`, `importScripts`, `href`, `src`,
  `url()`, iconos del manifiesto) en los `.js`, `.html`, `.css` y `.webmanifest` de `src/`; 0
  apuntan fuera de `src/` o a un archivo inexistente. Las 72 entradas de `PRECACHE` existen.
- No hay URLs absolutas a otros servidores (ni CDN ni el puerto 9080).
- `src/examples/` no se carga desde la SPA; se entrega igual porque está en `src`.

## Pruebas

Entorno: Docker 29.9.2. Imagen `hp24002/galeno-frontend:1.0` (`52a8f14ab336`, 202 MB): Debian
13.7, nginx 1.26.3. Backend `hp24002/galeno-backend:1.0` con `../galenasv/target/galeno.war`
(compilado después del último commit de código de `backend-rubrica`, no hizo falta recompilar).
Base de prueba nueva y vacía `db-frontend.penya.org` (`postgres:16`, `docker/prueba-bd` del
backend; otro nombre para no tocar el `db.penya.org` existente) en `ppi115net`.

Orden de arranque: base → **frontend** (comando del profesor, montando `./src`) → **backend**
(comando de `../galenasv/docker/README.md` con `PG_HOST=db-frontend.penya.org`).

Datos cargados por las pantallas JSF (`http://localhost:9080/galeno/`), todos inventados:
clínica "Clinica Docker Prueba"; roles Paciente, Doctor, Enfermera y "Atencion al publico";
tipo de documento DUI (`^\d{8}-\d$`); tipo de examen "Laboratorio clinico" y examen "Hemograma
completo"; procedimiento "Consulta general" con "Toma de signos vitales" (Enfermera) →
"Evaluacion medica" (Doctor, fin) y el Hemograma en el segundo paso; personas Elena Margarita
Castro Vides (Paciente, DUI 01234567-8), Jose Antonio Perez Lopez (Doctor, 02345678-9), Ana Sofia
Martinez Cruz (Enfermera, 03456789-0) y Sandra Patricia Lopez Rivas (Atencion al publico,
04567890-1); consulta de hoy REF-DOCKER-001 para Elena con "Consulta general", creada por el
Doctor entrando desde `cambiar-rol.xhtml`.

Datos extra para cubrir casos que con lo mínimo no se podían probar:
- "Retroceder" no se puede después de ordenar un examen (regla del backend: "Este paso ya tiene
  órdenes de examen; no se puede retroceder"), y el backend no permite otra consulta del mismo
  paciente el mismo día ("Ya existe una consulta para esta persona en esa fecha"); una consulta
  programada para mañana (REF-DOCKER-002) solo se atiende desde su día. Por eso se agregó un
  quinto paciente, Mario Ernesto Rivas Soto (DUI 05678901-2), con la consulta de hoy REF-DOCKER-003.
- Para "elegir clínica y rol" con más de una opción: clínica "Clinica Docker Norte" y una segunda
  asignación Doctor del Dr. Perez en ella.

Todas las llamadas del frontend fueron a `http://localhost/galeno/api/...` (log de nginx y
eventos de respuesta del navegador). Ninguna fue al puerto 9080 ni dio 403.

| # | Prueba | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | `npm test` tras el cambio a `/galeno/api` | Pasó | unit 909/909, integración 25/25 |
| 2 | `docker build -t hp24002/galeno-frontend:1.0 docker/` y `nginx -t` en la imagen | Pasó | "syntax is ok"; `access.log -> /dev/stdout`, `error.log -> /dev/stderr`; `/var/lib/apt/lists` vacío |
| 3 | Frontend arrancado antes que el backend | Pasó | `/` 200 `text/html`; `/sw.js` 200 con `Cache-Control: no-cache`; `/manifest.webmanifest` `application/manifest+json`; `/no/existe` 200 (index.html); `/galeno/api/publico/tipos-documento` 502 y nginx sigue arriba |
| 4 | Backend arrancado después, sin reiniciar el frontend | Pasó | Log: `WAR preparado`, `CWWKZ0001I` (14,1 s), `CWWKF0011I`; `curl http://localhost/galeno/api/publico/tipos-documento` → 200 `[]` |
| 5 | Imagen sin volumen | Comportamiento esperado | `/` 403 ("directory index of /var/www/html/ is forbidden"); anotado en `docker/README.md` |
| 6 | Carga de datos por JSF | Pasó | Ver datos arriba; en la base: 4 personas con su rol, clínica y DUI |
| 7 | HU1 búsqueda de citas (DUI de Elena, Clinica Docker Prueba) | Pasó | `POST /publico/clinicas` 200, `POST /publico/citas` 200: "1 cita en Clinica Docker Prueba", procedimiento "Consulta general" |
| 8 | HU1 ticket PDF | Pasó | `POST /publico/citas/{id}/ticket` 200; `ticket-cita-baa75c5e.pdf`: PDF 1.5, 1 página, OpenPDF 2.4.0 |
| 9 | HU2 rechazo del paciente | Pasó | `POST /auth/login` 401; "No encontramos una persona con ese documento activo." |
| 10 | HU2 login de empleado (Enfermera y Doctor) | Pasó | `POST /auth/login` 204, `GET /auth/me` 200 → `#/dashboard` |
| 11 | HU3 dashboard | Pasó | Rol preseleccionado (Enfermera / Doctor); "1 consulta del 22 nov 2026", "Pendiente para ti"; `GET /atencion`, `/atencion/asignaciones`, `/atencion/dashboard` 200 |
| 12 | HU3 filtro por fechas | Pasó | 23–30 nov: "No hay consultas en estas fechas."; 30→1 nov: "La fecha inicial no puede ser posterior a la final." sin petición; 1–30 nov y "Hoy": 200; 22–23 nov: 3 consultas (incluida la programada de mañana) |
| 13 | HU3 elegir clínica y rol (Doctor con 2 clínicas) | Pasó | `PUT /atencion/rol-activo` 200: "Estás atendiendo como Doctor en Clinica Docker Norte" y sin consultas (aislamiento por clínica); vuelta a Clinica Docker Prueba 200 |
| 14 | HU4 atender (Enfermera) y avanzar | Pasó | `PUT /consultas/{id}/sesion` 200; `PUT /consultas-procedimientos-pasos/{id}/finalizacion` 200; el paso 2 pasa al Doctor y la vista queda en solo lectura para la Enfermera |
| 15 | Salir de la consulta en curso | Pasó | `DELETE /atencion/consulta` 204 |
| 16 | Cerrar sesión | Pasó | `POST /auth/logout` 204 → `#/login` |
| 17 | HU4 ordenar examen (Doctor) | Pasó | `POST …/ordenes-examen` 201; "Emitida Hemograma completo: Orden emitida."; la casilla queda "Ya ordenado" |
| 18 | HU4 retroceder con orden emitida | Bloqueado (regla del backend) | Botón deshabilitado: "Este paso ya tiene órdenes de examen; no se puede retroceder." |
| 19 | HU4 retroceder sin órdenes (consulta de Mario) | Pasó | Pide confirmar ("Se descartará lo que escribiste…"); `PUT …/retroceso` 200; el paso vuelve a la Enfermera |
| 20 | HU4 completar el paso final y cerrar | Pasó | `PUT …/finalizacion` 200; "Confirmar cierre" → `PUT /consultas/{id}/cierre` 200; "Cerrada el 22 nov 2026, 4:44 p. m.", solo lectura |
| 21 | PWA: recarga sin red (Chromium, red desactivada) | Pasó | Antes: SW `activated`, cachés `chivomed-shell-2026-11-22.1` y `chivomed-datos-2026-11-22.1`. Sin red: `#/citas` carga desde el precache con "Sin red. Puedes seguir navegando…"; recarga con la página controlada por el SW; `#/dashboard` muestra rol y consultas guardadas y deshabilita cambiar de rol |
| 22 | Log de nginx | Pasó | Estáticos: 118 × 200 y 3 × 304, ningún 404. API: todo 200/201/204 salvo los 401 esperados (`/auth/me` sin sesión, login del paciente) y el 502 de la prueba 3 |
| 23 | `zip -r src.zip src` | Pasó | 90 entradas (76 archivos), 152 224 bytes; contiene `src/index.html`, `src/sw.js` y `src/manifest.webmanifest`. No se agrega a git |

Observaciones:
- La invitación a instalar la PWA (`<install-prompt>`, diálogo modal) apareció en `http://localhost`
  porque Chrome ya la considera instalable. Es el diseño documentado en
  `controlador_instalacion.js` ("invita cada vez, hasta que la app se instale"); en la prueba se
  cerró con "Ahora no" cuando aparecía. No se instaló la app (el diálogo nativo de Chrome no se
  puede automatizar); se probó la recarga sin red.
- Los 401 de `GET /auth/me` son las comprobaciones de sesión al abrir `#/login` o tras cerrar sesión.
