# Reporte: fase PWA (2026-11-12)

Rama `spa`, sin commit. Cubre los observables de la rúbrica "La aplicación es instalable y gestiona correctamente el flujo de instalación" y "mantiene su funcionalidad en modos en línea y fuera de línea".

## Resultado

- `npm test`: **231 pruebas, 33 suites, 231 pasan, 0 fallan, 0 todo** (exit 0).
- Cobertura (`node --test --experimental-test-coverage tests/*.test.js`), solo de la lógica de esta fase:

  | Archivo | Líneas | Ramas | Funciones |
  |---|---|---|---|
  | `pwa/sw_logica.js` | 100 % | 95.52 % | 100 % |
  | `pwa/controlador_instalacion.js` | 100 % | 97.06 % | 92.31 % |
  | `pwa/controlador_conexion.js` | 100 % | 100 % | 100 % |
  | `pwa/registro_sw.js` | 100 % | 100 % | 100 % |
  | `pwa/caches_cliente.js` | 100 % | 100 % | 100 % |

  Total del proyecto: 77.61 % de líneas. Los componentes (`install_prompt.js`, `estado_conexion.js`) quedan entre 50 % y 59 % porque su parte de DOM no se ejecuta en Node; su lógica está en los controladores.
- Verificado en Chromium con el servidor de desarrollo, ver "Verificación hecha en navegador".

## Qué se agregó

| Archivo | Rol |
|---|---|
| `src/manifest.webmanifest` | Nombre, `start_url` y `scope` `./`, `display: standalone`, colores del tema claro (`#edf5f2`), 4 íconos. |
| `src/resources/iconos/*.png` | 192 y 512 px, versión normal (`any`) y `maskable`. |
| `scripts/generar_iconos.js` | Genera los PNG: dibuja la cruz de la marca y codifica el PNG a mano (zlib + CRC32). Sin dependencias ni recursos de terceros. `node scripts/generar_iconos.js`. |
| `src/sw.js` | Service worker clásico; solo conecta eventos (`install`, `activate`, `fetch`). |
| `src/js/boundary/pwa/sw_logica.js` | Toda la lógica del SW: lista de precache, clasificación de peticiones, estrategias, versionado y limpieza. Sin DOM ni globales del SW; `fetch` y `caches` llegan por inyección. |
| `src/js/boundary/pwa/registro_sw.js` | Registra `sw.js` con `updateViaCache: "none"`. |
| `src/js/boundary/pwa/caches_cliente.js` | `limpiarCachesDeDatos()` desde la página, sin depender del SW. |
| `src/js/boundary/pwa/controlador_instalacion.js` | Lógica sin DOM de `<install-prompt>`. |
| `src/js/boundary/pwa/controlador_conexion.js`, `conexion.js` | Estado online/offline con suscriptores; `conexion.js` es la instancia compartida. |
| `src/js/boundary/components/install_prompt.js` | `<install-prompt>`. |
| `src/js/boundary/components/estado_conexion.js` | `<estado-conexion>`. |
| `src/resources/pwa.css` | Estilos propios de ambos componentes. |
| `src/js/boundary/vistas/vista_dashboard.js`, `vista_consulta.js` | Marcadores mínimos; ver "Decisiones". |

**Cambios en archivos existentes:**
- `index.html`: enlaza el manifest y el `apple-touch-icon`.
- `app_shell.js`:
  - Registra el SW.
  - Pone `<install-prompt>` en la cabecera y `<estado-conexion>` debajo.
  - Limpia los cachés de datos al cerrar o perder la sesión.
- `vista_login.js` y `session_bar.js`: deshabilitan sus acciones de red sin conexión.
- `dev_server.js`: tipo MIME de `.webmanifest`.
- `rutas.test.js` y `vistas.test.js`: ahora existen todas las vistas, así que ya no quedan pruebas `todo`.

## Estrategias del service worker

| Petición | Estrategia | Caché |
|---|---|---|
| Navegación dentro del alcance | Siempre `index.html`: red primero, precache si no hay red | Precache |
| Archivo de la lista `PRECACHE` (sin query) | Red primero, precache si no hay red | Precache (no se reescribe en ejecución) |
| `GET /galenosv/api/publico/*` | Red primero | Solo catálogos permitidos (`tipos-documento`), respuesta 200 JSON sin query |
| `/galenosv/api/auth/*`, datos clínicos, cualquier otra ruta de la API | El SW no la intercepta | Nunca |
| Métodos distintos de GET, otro origen, fuera del alcance | El SW no la intercepta | Nunca |

**Sin red ni copia en caché:**
- La API pública responde **503 JSON** `{ code: "sin.red" }`.
- La navegación y los archivos del shell responden **503 de texto**.

**Versionado:**
- Los cachés se llaman `chivomed-shell-<VERSION>` y `chivomed-datos-<VERSION>`.
- `activate` borra los cachés `chivomed-*` de otras versiones y deja intactos los de otras apps del mismo origen.
- **En cada entrega hay que subir `VERSION` en `sw_logica.js`.**

**Al cerrar sesión** (o perderla en una ruta de empleado) se borran todos los cachés `chivomed-datos-*`, de cualquier versión. El shell se conserva.

## Decisiones (para revisar)

1. **Service worker clásico con `importScripts`, no de tipo módulo.** Funciona en todos los navegadores con SW. `sw_logica.js` no usa `import` ni `export`, así que es a la vez script clásico y módulo ES válido: lo importan las pruebas y `caches_cliente.js`, y publica su API en `globalThis.ChivoMedSW`.
2. **Red primero también para el shell.** Con caché primero, cada cambio de código exigiría subir `VERSION` para que el equipo lo viera. Con red primero, en línea siempre se ve la última versión; sin red se usa el precache de la versión instalada, que es un conjunto coherente.
3. **`/publico/*` no se guarda completo.** Todo `/publico/*` va primero a la red, pero solo se guardan los catálogos de `CATALOGOS_PUBLICOS`. Si la búsqueda pública de citas de HU1 queda bajo `/publico/`, sus respuestas traerían datos clínicos y no deben quedar en el dispositivo. Para cachear otro catálogo hay que agregarlo a esa lista.
4. **Marcadores `vista_dashboard.js` y `vista_consulta.js`.** `cache.addAll` falla por completo si falta un archivo, y la lista debe incluir todos los módulos de `rutas.js`. Sin estos dos archivos el SW no se instalaría. La fase 3 los reemplaza.
5. **El backend envía `Cache-Control: no-store` en toda respuesta** (`AutenticacionFilter`). La Cache API no aplica esa cabecera; se ignora a propósito solo para el catálogo público de tipos de documento, que no tiene datos personales.
6. **Acciones de red deshabilitadas sin conexión:** "Ingresar" y "Volver a cargar" en el login, y "Cerrar sesión" en la barra, cada una con su mensaje. Al volver la red, el login reintenta cargar los tipos si habían fallado.

## Pruebas nuevas

- **`tests/sw_logica.test.js` (40):**
  - Clasificación de 16 casos: navegación, shell, query, API pública, auth, datos clínicos, escrituras, `HEAD`, otro origen, fuera del alcance y URL inválida.
  - Auth, escrituras y datos clínicos no se interceptan ni abren la caché.
  - Navegación servida desde `index.html`: en línea, sin red, con error del servidor y sin precache.
  - Shell con red primero sin reescribir el precache.
  - API pública:
    - Guarda solo 200 JSON del catálogo.
    - Sin red usa la copia guardada; sin red ni copia responde 503 JSON.
    - No guarda un 401 ni un HTML.
    - `/publico/citas` nunca se cachea.
  - `precachear` usa `cache: "reload"`.
  - `activate` limpia las versiones viejas; `limpiarDatos` borra solo los datos.
- **`tests/precache.test.js` (10):**
  - Recorre el grafo real de la app desde `index.html`, el manifest y cada módulo de `rutas.js`: `import`, `importScripts`, `new URL(..., import.meta.url)`, `hojaDeEstilos()`, `@import` y `<link>`/`<script>`.
  - Exige que `PRECACHE` coincida **exactamente**, sin faltantes ni sobrantes, y que cada archivo exista.
  - Revisa el manifest (`start_url` dentro del `scope`, colores iguales al tema y a `theme-color`) y lee el encabezado de cada PNG para confirmar sus dimensiones.
  - Comprobé que detecta errores: al quitar `conexion.js` de la lista, la prueba falla.
- **`tests/instalacion.test.js` (14):**
  - `beforeinstallprompt` (con `preventDefault`), aceptar con `appinstalled`, rechazar sin reusar el evento y nuevo aviso tras rechazar.
  - Doble clic con un solo diálogo, sin evento, fallo de `prompt()` e instalación desde el menú del navegador.
  - App ya instalada (`display-mode: standalone` y `navigator.standalone` de iOS), cambio a standalone, `detener()` y ventana nula.
- **`tests/conexion.test.js` (13):** `ControladorConexion` (estado inicial, cambios sin repetir, cancelar suscripción, `detener()`), `registrarServiceWorker` (sin soporte, URL y opciones, fallo) y `limpiarCachesDeDatos` (solo datos, tolera la falta de CacheStorage).

## Verificación hecha en navegador (Chromium, servidor local)

Verificado con Playwright, sin backend real. Para el catálogo usé un backend falso mínimo del scratchpad, sin datos reales.

- **SW:** registrado con alcance `/`, en estado `activated`, controla la página, y `chivomed-shell-2026-11-12.1` tiene las 37 entradas de `PRECACHE`.
- **Instalabilidad:** `Page.getInstallabilityErrors` devuelve `[]` y `Page.getAppManifest` no reporta errores. Chromium emitió `beforeinstallprompt` y apareció el botón "Instalar app". El flujo diálogo → "Instalando…" → `appinstalled` oculta el botón y anuncia "ChivoMed quedó instalada…".
- **Offline:**
  - Al desconectar aparece el aviso con `aria-live="polite"`, y "Ingresar" queda deshabilitado con su mensaje.
  - Al recargar sin red se sirven el shell y los tipos de documento desde caché.
  - Las rutas `#/citas` y una inexistente funcionan sin red.
  - Al reconectar aparece "Conexión restablecida." y se oculta a los 4 s.
- **Logout:** borra una entrada marcada del caché de datos y un caché `chivomed-datos-` de una versión vieja, y conserva el shell. Después, el login vuelve a pedir el catálogo público y el SW lo guarda otra vez, lo cual es correcto.
- **Responsive:** a 375 px no hay desborde horizontal.

**Limitación encontrada:** con la emulación offline de Playwright, `navigator.onLine` sigue en `true` en un documento cargado ya sin red. El shell igual se sirve desde caché, pero el aviso no aparece hasta el siguiente evento `offline`. En Chrome con DevTools, el caso de abajo debe mostrar el aviso al recargar; confírmalo ahí. En general, `navigator.onLine` solo indica que hay una red, no que el backend responda: los servicios siguen manejando sus propios errores de conexión.

## Cómo verificar en Chrome DevTools

Preparación: `npm start` y abrir `http://127.0.0.1:3000/`, o `http://localhost:3000/`. Los service workers exigen HTTPS o localhost.

### Instalación
1. DevTools → **Application** → **Manifest**: nombre "ChivoMed", `start_url` y `scope` `./`, `display` standalone, los 4 íconos sin advertencias. En "Installability" no debe aparecer ningún error.
2. **Application** → **Service workers**: `sw.js` con estado "activated and is running" y alcance `http://127.0.0.1:3000/`.
3. **Application** → **Cache storage**: `chivomed-shell-2026-11-12.1` con 37 entradas. Al abrir `#/login` con backend aparece `chivomed-datos-2026-11-12.1` con `/galenosv/api/publico/tipos-documento`.
4. En la cabecera aparece **Instalar app**: pulsarlo abre el diálogo de Chrome. Al aceptar, la app se abre en su propia ventana y el botón desaparece. Al volver a abrir la app instalada, el botón no aparece porque se detecta `display-mode: standalone`.
5. Para repetir la prueba: desinstalar desde la ventana de la app (menú ⋮ → "Desinstalar ChivoMed") o desde `chrome://apps`.

### Modo offline
1. Con la app cargada una vez en línea, en **Network** marcar **Offline**, o activar **Offline** en **Application** → **Service workers**.
2. Debe aparecer el aviso rojo "Sin conexión…". En `#/login`, "Ingresar" queda deshabilitado con el mensaje "Sin conexión a internet…".
3. Recargar (F5): la app carga desde el SW. En **Network**, la columna Size muestra "(ServiceWorker)". Los tipos de documento siguen disponibles desde el caché de datos.
4. Navegar a `#/citas` y a `#/ruta-inexistente`: ambas vistas se muestran sin red.
5. Quitar **Offline**: aparece "Conexión restablecida." y las acciones se habilitan.

### Actualización de versión
1. Cambiar `VERSION` en `src/js/boundary/pwa/sw_logica.js` y recargar.
2. En **Application** → **Service workers** se activa el nuevo SW, porque `skipWaiting` y `clients.claim` hacen que no espere a que se cierren las pestañas.
3. En **Cache storage** solo quedan los cachés de la versión nueva.

Durante el desarrollo conviene marcar **Update on reload** en **Application** → **Service workers**.

## Pendientes

- La fase 3 reemplaza los marcadores de dashboard y consulta. Si agrega archivos que se cargan al usar la app, `precache.test.js` fallará hasta que se agreguen a `PRECACHE`, y eso es intencional.
- Si la búsqueda de citas de HU1 usa catálogos públicos (por ejemplo, clínicas), agregarlos a `CATALOGOS_PUBLICOS` solo si no contienen datos personales.
- Revisar `.vscode/tasks.json`: aún tiene una tarea con `browser-sync`. No lo modifiqué.
