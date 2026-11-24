# ChivoMed (frontend)

Frontend de GalenoSV, un sistema de gestión clínica. El backend vive en `../galenasv` (la carpeta se llama `galenasv`, el contexto web es `/galeno` y los paquetes Java usan `galenosv`).

## Stack
- Node.js >= 22.5 (`engines` en `package.json`). JavaScript nativo (ES Modules) y Web Components con Shadow DOM. No hay React, Vue, Angular ni bundler: el código fuente se sirve directamente.
- Servidor de desarrollo: `npm start`, que ejecuta `node scripts/dev_server.js` (servidor propio en Node, sin dependencias): sirve `src/` y hace de proxy inverso de `/galeno/api` hacia `API_URL`, en el puerto 3000.
- Backend: Java 21, Jakarta EE 11, Open Liberty en el puerto 9080, API en `/galeno/api`. Base de datos: PostgreSQL en Docker.
- Variables en `.env`: `API_URL` (por defecto `http://localhost:9080/galeno/api`) y `PORT` (por defecto `3000`). Nunca imprimir ni commitear valores sensibles.
- Pruebas: `npm test` ejecuta primero `test:unit` y después `test:integration` (Node nativo). Ver `docs/pruebas.md`. Cobertura solo sobre `src`: `npm run cobertura`. No hay e2e en el repositorio: la prueba contra el backend real se hace a mano en el puerto 3000.

## Reglas de trabajo
- Solo se editan archivos dentro de ChivoMed. `../galenasv` es SOLO LECTURA.
- Antes de consumir un endpoint, leer en `../galenasv` el Resource, el DTO y la entity correspondientes, y la documentación en `../galenasv/docs/api-rest.md` y `../galenasv/docs/autenticacion.md`. Si la documentación y el código no coinciden, manda el código y avisarme.
- Nunca inventar endpoints, campos ni tipos. Si el frontend necesita algo que el backend no expone, decírmelo en vez de asumirlo; el cambio en el backend lo hago yo.
- Tercer parcial: se permite usar Docker para construir y probar las imágenes y contenedores de prueba de este proyecto. No tocar contenedores ni bases que no sean de prueba.
- Proponer un plan antes de cambios que afecten más de 3 archivos.
- Correr `npm test` antes de dar una tarea por terminada e informar el resultado real, sin suponerlo.
- Rama de trabajo actual: `desarrollo`, compartida con otros compañeros. No hacer force push, no reescribir historial, no hacer push sin que te lo pidan y no tocar archivos ajenos a la tarea. Fuera de los commits quedan `.vscode/tasks.json`, `auditar_roles.sh` y `docs/definicion-parcial.pdf`.
- `CLAUDE.md` y `AGENTS.md` (para Codex) tienen el mismo contenido: si cambias uno, cambia el otro.
- Nunca poner datos reales de pacientes en código, mocks, pruebas ni commits.

## Arquitectura
Patrón BCE (Boundary-Control-Entity), igual que el backend. Destino final de las carpetas (norma desde 2026-11-24):
- `src/js/boundary/`: solo lo que toca el DOM o lo sirve el navegador.
  - `router.js`, `rutas.js`, `plantilla.js`, `estilos.js` y `theme_init.js` (script clásico que corre antes de los módulos para evitar el destello de tema).
  - `vistas/`: solo las vistas (`vista_*.js`, Web Components de ruta).
  - `components/`: Web Components reutilizables, con `citas/`, `dashboard/` y `consulta/`.
  - Todo Web Component (vistas incluidas) hereda de `ComponenteChivoMed` (`components/componente_chivomed.js`): Shadow DOM, `montar(plantilla, ...hojas)`, `$(id)`, `emitir(tipo, detalle)` y `modelo` con `pintar()`.
  - `pwa/`: solo lo que sirve o registra el navegador: `sw_logica.js` (script clásico para `importScripts` que también es un módulo válido para las pruebas) y `registro_sw.js`.
- `src/js/control/`: todo lo que no toca el DOM.
  - Servicios HTTP que extienden `DefaultService` (se conserva su CRUD genérico), `auth_service.js`, `api_config.js`, `estado_reactivo.js` y `formato_documento.js`.
  - `controladores/`: los controladores sin DOM de las vistas (`controlador_login.js`, `controlador_citas.js`, `controlador_dashboard.js`, `controlador_consultas.js` y `controlador_consulta.js`).
  - `memoria_vistas.js`, `fechas_sv.js` y la lógica sin DOM de la PWA: `controlador_conexion.js` (conserva su notificación síncrona), `conexion.js`, `controlador_instalacion.js`, `almacen_offline.js` y `caches_cliente.js`.
- `src/js/entities/`: modelos que extienden `DefaultEntity`.
- Los archivos ya están en esta estructura (fase 3 del plan, `../revision-chivomed.md`, fuera del repositorio). Un archivo nuevo va a su carpeta; si se mueve uno, se actualizan los imports, la lista `PRECACHE` y su `VERSION`.
- SPA con una sola entrada: `src/index.html` solo contiene `<app-shell>`, que monta la vista de cada ruta por hash (`#/citas`, `#/login`, `#/dashboard`, `#/consulta/:id`). `src/sw.js` es el service worker; la lista `PRECACHE` de `pwa/sw_logica.js` debe ser exactamente lo que la SPA carga (`tests/precache.test.js`).

## Contrato con el backend
- Autenticación por sesión HTTP (cookie `JSESSIONID`, HttpOnly). Toda petición que no sea GET/HEAD/OPTIONS debe enviar la cabecera `X-CSRF-Token`; el token se obtiene de `GET /api/auth/me`.
- El backend NO implementa CORS. Todo pasa por el proxy del puerto 3000 para que sea same-origin. No llamar al puerto 9080 directamente desde el navegador.
- El frontend debe correr en el puerto 3000 (`http://localhost:3000` o `http://127.0.0.1:3000`). El backend rechaza toda petición que no sea GET/HEAD/OPTIONS cuyo `Origin` no esté en `CHIVOMED_ORIGINS` (por defecto, esos dos), con 403 `auth.origen`; en otro puerto ni el login funciona. No cambiar `PORT` en `.env` ni levantar el servidor en otro puerto para probar contra el backend real.
- En Docker (`docker/`, tercer parcial) nginx sirve `src/` en el puerto 80 y hace de proxy de `/galeno/` hacia `galeno.backend:9080` conservando el `Host`; el backend acepta además el `Origin` igual a su propia URL, así que ahí es `http://localhost`.
- Los DTOs son planos: las relaciones viajan como UUID (`idPersona`, `idClinica`, ...), nunca como objetos anidados. Las colecciones hijas se piden con `GET /api/{recurso}/{id}/{subcoleccion}`.
- Roles: empleado es cualquier rol activo excepto `PACIENTE` (incluidos Enfermera, Atención al público con código `ADMINISTRACION` y roles sin código). El backend aplica permisos por rol activo y aísla datos por clínica; un 403 es comportamiento esperado, no un bug del frontend.
- Evitar cascadas de peticiones N+1: usar los endpoints agregados del backend en vez de pedir cada elemento por separado.

## Convenciones
- Archivos JS en `snake_case` (`citas_publicas_service.js`). Web Components en kebab-case (`tarjeta-cita`).

**Estilo de código** (norma desde 2026-11-24; el código existente se va adaptando por fases)
- Todo el código asíncrono de `src/` usa promesas con `.then()`/`.catch()`/`.finally()`; no se usa `async`/`await`. Las pruebas por ahora se quedan como están.
- JavaScript puro: nada de sintaxis ni convenciones de TypeScript (tampoco tipos entre llaves en JSDoc). Se permite JSDoc descriptivo: `@param nombre descripción`, sin `{tipo}`.
- Un solo paradigma: orientado a objetos (clases). Las funciones sueltas exportadas, fábricas de closures, IIFE y estado de módulo pasan a clases. Usar `map`/`filter`/flechas dentro de métodos y flechas como campos de clase está permitido.
- Se permiten clases con métodos `static` para utilidades.
- `sw_logica.js` sigue siendo un script clásico (`importScripts`) que también es un módulo válido para las pruebas.
- Se conserva el CRUD genérico de `DefaultService` (`crear`, `actualizar`, `modificar`, `eliminar`), aunque hoy no lo use ninguna vista.
- `ControladorConexion` conserva su notificación síncrona (su propio conjunto de suscriptores, no el estado reactivo por microtarea).

**Reglas de conversión a `.then()`** (sección A.0 de `../revision-chivomed.md`, copiadas tal cual; los números de línea son del commit `114d1bc`)
1. **Una función que hoy es `async` debe seguir devolviendo una promesa en todos sus caminos.** Los `return` tempranos pasan a `return Promise.resolve(valor)`. Muchos ya lo hacen así, por ejemplo `elegirPaso` y `salirDeConsulta` de `controlador_consulta.js`.
2. **La primera llamada se envuelve en `new Promise(resolve => resolve(llamada()))`, no en `Promise.resolve().then(() => llamada())`.** El ejecutor de `new Promise` corre de forma síncrona: la petición sale en el mismo instante que hoy y un `throw` síncrono se convierte en rechazo, igual que en una `async`. `Promise.resolve().then(...)` retrasa el fetch una microtarea, y eso puede cambiar el orden que verifican las pruebas.
3. **`try { await x; resto } catch (e) { ... }` se traduce a `x.then(resto).catch(manejo)`**, porque el `catch` original también atrapa los errores de `resto`. En cambio, **`try { await x } catch { ... } resto`**, con `resto` fuera del try, se traduce a `x.then(resto, manejo)`: el segundo argumento no atrapa errores de `resto`. Confundir las dos formas cambia a dónde se propaga el error.
4. **`finally` se traduce a `.finally()`.** `.finally()` no cambia el valor ni el error salvo que lance, igual que el bloque. Ojo: un `return` dentro de un `finally` (no hay ninguno hoy) no tiene equivalente directo.
5. **`AbortSignal.timeout(10000)` no cambia** (`auth_service.js:81`, `auth_service.js:147`, `default_service.js:61`). Va dentro de las opciones de `fetch`, y el `.catch` sigue mirando `error.name === "TimeoutError" | "AbortError"`. La lectura del cuerpo (`respuesta.text()`/`blob()`) debe seguir dentro de la cadena que atrapa ese error, porque el timeout también puede cortar la lectura del cuerpo.
6. **Un `await` sobre un valor que no es promesa agrega una microtarea; un `??` que corta antes no.** Ejemplo: `this.estado.enCurso ?? await this.#leerEnCurso()` (`controlador_dashboard.js:263`) es síncrono cuando `enCurso` ya existe. La conversión debe ramificar con `if` y no hacer siempre `Promise.resolve(...)`.
7. **Los ciclos `for…of` con `await` dentro se ejecutan hoy en serie.** Se convierten con un **método privado recursivo** (`#ordenarDesde(i)`), no con `Promise.all`, que los volvería paralelos, ni con `reduce`, que es estilo funcional (decisión 3).
8. **Para recordar el orden:** el código síncrono antes del primer `await` se ejecuta durante la llamada, y lo que viene después siempre en una microtarea posterior. Con `.then` pasa lo mismo, siempre que se respete la regla 2.

**Estado reactivo y plantillas** (norma desde 2026-11-13)
- Cada vista tiene un controlador sin DOM cuyo estado es un `EstadoReactivo` de `src/js/control/estado_reactivo.js`, usado por composición (`#reactivo`; el controlador publica `estado` y delega `suscribir`). El controlador solo escribe en ese estado; nunca recibe callbacks de la vista ni la llama.
- La vista se suscribe con `suscribir()` en `connectedCallback` y cancela en `disconnectedCallback`. Repinta a partir del `Set` de claves que cambiaron.
- Los objetos y arreglos que se guardan en el estado van congelados; para cambiarlos se reemplazan, no se mutan.
- `innerHTML` solo se usa con plantillas fijas (constantes del módulo sin datos del servidor, de la URL ni del usuario), a través de la clase `Plantilla` de `src/js/boundary/plantilla.js` (`new Plantilla(html)`), que crea el `<template>` una vez y lo clona. Los datos se pintan con `textContent`, atributos o propiedades. Las listas se arman con `createElement` o clonando un `<template>`. `escapeHtml` no es una alternativa aceptada en código nuevo. `tests/plantilla.test.js` lo verifica sobre todo el JS del precache.
- Un componente que muestra contenido de otro lo recibe por `<slot>` (p. ej. `<slot name="consultas">` en `<vista-dashboard>`).
- Las vistas se prueban en Node con el DOM mínimo de `tests/dobles/dom_minimo.js`, que solo modela lo que usan las vistas; si una vista necesita algo nuevo del DOM, se agrega ahí.

## Documentos de referencia
- Antes de cualquier tarea, leer docs/rubrica.md y docs/plan.md.
- Todo trabajo debe cumplir la rúbrica. Si algo del código actual contradice la rúbrica, avisarme.
- `docs/reportes/` está en `.git/info/exclude`; solo están en Git, agregados con `git add -f`, los que hacen falta para continuar: `correcciones-plan.md` (plan F0–F12 en curso), `auditoria-rubrica.md` (auditoría que lo motivó), `hu1-prueba-real.md` y `hu4-prueba-real.md`. Un reporte nuevo que deba compartirse también se agrega con `-f`.
- Backend: `../galenasv/docs/reportes/b8-plan.md` (regla de roles B8) y `../galenasv/docs/datos-demo-rubrica.md` (datos demo).

## Datos demo
Los de `../galenasv/docs/datos-demo-rubrica.md` (se restauran con `bash scripts/reiniciar-demo.sh` del backend; ver `README.md`). Son inventados; usarlos en README, ejemplos y pruebas manuales:
- Ana Martínez, paciente: DUI `01000004-4` o Pasaporte `B10000004` (HU1; rechazada en el login).
- Carlos Gómez, Doctor en Santa Ana y San Salvador: DUI `01000001-1` o Pasaporte `A10000001`.
- Lucía Pérez, Enfermera en Santa Ana: DUI `01000002-2` (Triaje).
- Marta López, Atención al público en 2 clínicas: DUI `01000003-3` (último paso y cierre).
- Pedro Hernández, sin rol: DUI `01000005-5` (rechazado). `12345678-9`: no existe (mensaje neutro).

## Login (HU2)
- El login es con tipo de documento y número de documento, sin contraseña. Contrato: POST /api/auth/login con { idTipoDocumento, numeroDocumento }.
- Entra cualquier empleado: un rol activo excepto PACIENTE, incluso un rol sin código (regla B8 del backend). `/auth/me` puede devolver `codigo: null` y trae `nombreRol`: se muestra `nombreRol` y el código solo se usa para reconocer PACIENTE (`AuthService.esEmpleado` en `auth_service.js`). Nunca fijar listas de roles en el frontend.
- Cada paso de una consulta lo atiende quien tiene su rol responsable, y la cierra quien completó el paso final; el frontend se guía por `pendienteParaMi` y no compara roles por nombre.
- Para saber de qué rol es un paso se compara `paso.rolPaso.idRol` con `sesion.rolActivo.idRol` (`ControladorConsultas.esPasoDeMiRol` en `controlador_consultas.js`), nunca por nombre ni por código. La vista de consulta hace `PUT …/sesion` solo si `pendienteParaMi` y la consulta no está cerrada; si no, queda en solo lectura.

## Estado actual (2026-11-14)
Plan: `docs/reportes/correcciones-plan.md`. Commits en `spa`:
- Hechos: F0 (plan), F1 `dfa93de` (cualquier empleado, `nombreRol`), F2 `d18bacd` (README), F4 `f0d8d41` (offline con IndexedDB), F5 `24cbd64` (quita CRUD sin uso), F6 `4c5db3a` (prueba de `theme_init.js` y cobertura sobre `src`), F7 `b385c85` (atiende quien tiene el paso; errores B8), F10 `653a293` (buscar paciente y título por rango), F11 `b1ae634` (nombre accesible de "Atender", autoformato del documento, detalles de UI). F3 no requería código.
- Implementados con `npm test` en verde (751), PENDIENTE la prueba manual contra el backend real:
  - F8 `5905436`…`aa1f620`: salir de la consulta en curso (`DELETE /api/atencion/consulta`, backend `0e5f644`) desde el dashboard y desde la consulta; "Salir de esa consulta y atender esta" ante el 409 `consulta.cerrarAntesRetomar`.
  - Service worker `83c67a5`: una página cargada con Ctrl+Shift+R pide `{ tipo: "reclamar" }` y el SW hace `clients.claim()`, para que sin red los CSS y módulos salgan del precache.
  - F9 `7f6e61d`, `1ec8ca4`, `46cd952`: exámenes con casillas, filtro por `tiposExamen` (backend `c154c94`), "Ya ordenado", un POST por examen en serie y resultado por examen; el foco va al resultado.
  - A revisar a mano: salir y cambiar de rol; el 409 con otra consulta en curso; Ctrl+Shift+R y luego sin red (Chrome); asignar varios exámenes, éxito parcial y "Ya ordenado"; casillas a 1280 y 375 px y en modo oscuro.
- Pendiente: F12 (reporte final), después de la prueba manual.
- `rolPaso.idRol` y `rolActivo.idRol`: el backend ya los manda (commit `0856fa3`). El frontend ya compara por `idRol` en `esPasoDeMiRol`, y `obtenerSesion` conserva `rolActivo` completo; falta validar `rolActivo.idRol` como UUID en `obtenerSesion` (`auth_service.js`), agregar el campo a las sesiones de prueba y comprobarlo contra el backend real (que Lucía tenga preseleccionado el Triaje y Carlos la Consulta médica).
- Los estilos de F11 (`citas.css`, `consultas.css`, `components.css`) no se han revisado en el navegador: indicador de pasos a 1280 px, filtro de fechas con el error de rango, botón de tema junto a "Instalar app", a 375 px y en modo oscuro.
- La documentación del backend ya está al día con B8 (`api-rest.md` describe `rolPaso`; la §10 de `../galenasv/docs/LEVANTAR.md` tiene la demo nueva). Si algo no coincide, manda el código.
