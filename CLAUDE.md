# ChivoMed (frontend)

Frontend de GalenoSV, un sistema de gestión clínica. El backend vive en `../galenasv` (la carpeta se llama `galenasv`, pero el contexto web y los paquetes Java usan `galenosv`).

## Stack
- Node.js >= 22.5 (`engines` en `package.json`). JavaScript nativo (ES Modules) y Web Components con Shadow DOM. No hay React, Vue, Angular ni bundler: el código fuente se sirve directamente.
- Servidor de desarrollo: `npm start`, que ejecuta `node scripts/dev_server.js` (servidor propio en Node, sin dependencias): sirve `src/` y hace de proxy inverso de `/galenosv/api` hacia `API_URL`, en el puerto 3000.
- Backend: Java 21, Jakarta EE 11, Open Liberty en el puerto 9080, API en `/galenosv/api`. Base de datos: PostgreSQL en Docker.
- Variables en `.env`: `API_URL` (por defecto `http://localhost:9080/galenosv/api`) y `PORT` (por defecto `3000`). Nunca imprimir ni commitear valores sensibles.
- Pruebas: `npm test` (`node --test tests/*.test.js`). Cobertura solo sobre `src`: `npm run cobertura`. No hay e2e en el repositorio: la prueba contra el backend real se hace a mano en el puerto 3000.

## Reglas de trabajo
- Solo se editan archivos dentro de ChivoMed. `../galenasv` es SOLO LECTURA.
- Antes de consumir un endpoint, leer en `../galenasv` el Resource, el DTO y la entity correspondientes, y la documentación en `../galenasv/docs/api-rest.md` y `../galenasv/docs/autenticacion.md`. Si la documentación y el código no coinciden, manda el código y avisarme.
- Nunca inventar endpoints, campos ni tipos. Si el frontend necesita algo que el backend no expone, decírmelo en vez de asumirlo; el cambio en el backend lo hago yo.
- No ejecutar docker ni tocar la base de datos.
- Proponer un plan antes de cambios que afecten más de 3 archivos.
- Correr `npm test` antes de dar una tarea por terminada e informar el resultado real, sin suponerlo.
- Rama de trabajo actual: `spa`, compartida con otros compañeros. No hacer force push, no reescribir historial, no hacer push sin que te lo pidan y no tocar archivos ajenos a la tarea. Fuera de los commits quedan `.vscode/tasks.json`, `auditar_roles.sh` y `docs/definicion-parcial.pdf`.
- `CLAUDE.md` y `AGENTS.md` (para Codex) tienen el mismo contenido: si cambias uno, cambia el otro.
- Nunca poner datos reales de pacientes en código, mocks, pruebas ni commits.

## Arquitectura
Patrón BCE (Boundary-Control-Entity), igual que el backend:
- `src/js/boundary/`: router (`router.js`, `rutas.js`), vistas y sus controladores sin DOM (`vistas/`), Web Components (`components/`, con `citas/`, `dashboard/` y `consulta/`) y la PWA (`pwa/`).
- `src/js/control/`: servicios HTTP que extienden `DefaultService`, más `auth_service.js` y `estado_reactivo.js`.
- `src/js/entities/`: modelos que extienden `DefaultEntity`.
- SPA con una sola entrada: `src/index.html` solo contiene `<app-shell>`, que monta la vista de cada ruta por hash (`#/citas`, `#/login`, `#/dashboard`, `#/consulta/:id`). `src/sw.js` es el service worker; la lista `PRECACHE` de `pwa/sw_logica.js` debe ser exactamente lo que la SPA carga (`tests/precache.test.js`).

## Contrato con el backend
- Autenticación por sesión HTTP (cookie `JSESSIONID`, HttpOnly). Toda petición que no sea GET/HEAD/OPTIONS debe enviar la cabecera `X-CSRF-Token`; el token se obtiene de `GET /api/auth/me`.
- El backend NO implementa CORS. Todo pasa por el proxy del puerto 3000 para que sea same-origin. No llamar al puerto 9080 directamente desde el navegador.
- El frontend debe correr en el puerto 3000 (`http://localhost:3000` o `http://127.0.0.1:3000`). El backend rechaza toda petición que no sea GET/HEAD/OPTIONS cuyo `Origin` no esté en `CHIVOMED_ORIGINS` (por defecto, esos dos), con 403 `auth.origen`; en otro puerto ni el login funciona. No cambiar `PORT` en `.env` ni levantar el servidor en otro puerto para probar contra el backend real.
- Los DTOs son planos: las relaciones viajan como UUID (`idPersona`, `idClinica`, ...), nunca como objetos anidados. Las colecciones hijas se piden con `GET /api/{recurso}/{id}/{subcoleccion}`.
- Roles: empleado es cualquier rol activo excepto `PACIENTE` (incluidos Enfermera, Atención al público con código `ADMINISTRACION` y roles sin código). El backend aplica permisos por rol activo y aísla datos por clínica; un 403 es comportamiento esperado, no un bug del frontend.
- Evitar cascadas de peticiones N+1: usar los endpoints agregados del backend en vez de pedir cada elemento por separado.

## Convenciones
- Archivos JS en `snake_case` (`citas_publicas_service.js`). Web Components en kebab-case (`tarjeta-cita`).

**Estado reactivo y plantillas** (norma desde 2026-11-13)
- Cada vista tiene un controlador sin DOM cuyo estado es un `crearEstado(...)` de `src/js/control/estado_reactivo.js`. El controlador solo escribe en ese estado; nunca recibe callbacks de la vista ni la llama.
- La vista se suscribe con `suscribir()` en `connectedCallback` y cancela en `disconnectedCallback`. Repinta a partir del `Set` de claves que cambiaron.
- Los objetos y arreglos que se guardan en el estado van congelados; para cambiarlos se reemplazan, no se mutan.
- `innerHTML` solo se usa con plantillas fijas (constantes del módulo sin datos del servidor, de la URL ni del usuario), a través de `plantilla()` de `src/js/boundary/plantilla.js`, que crea el `<template>` una vez y lo clona. Los datos se pintan con `textContent`, atributos o propiedades. Las listas se arman con `createElement` o clonando un `<template>`. `escapeHtml` no es una alternativa aceptada en código nuevo. `tests/plantilla.test.js` lo verifica sobre todo el JS del precache.
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
- Entra cualquier empleado: un rol activo excepto PACIENTE, incluso un rol sin código (regla B8 del backend). `/auth/me` puede devolver `codigo: null` y trae `nombreRol`: se muestra `nombreRol` y el código solo se usa para reconocer PACIENTE (`esEmpleado` en `auth_service.js`). Nunca fijar listas de roles en el frontend.
- Cada paso de una consulta lo atiende quien tiene su rol responsable, y la cierra quien completó el paso final; el frontend se guía por `pendienteParaMi` y no compara roles por nombre.
- Para saber de qué rol es un paso se compara `paso.rolPaso.idRol` con `sesion.rolActivo.idRol` (`esPasoDeMiRol` en `controlador_consultas.js`), nunca por nombre ni por código. La vista de consulta hace `PUT …/sesion` solo si `pendienteParaMi` y la consulta no está cerrada; si no, queda en solo lectura.

## Estado actual (2026-11-13)
Plan: `docs/reportes/correcciones-plan.md`. Commits en `spa`, sin push:
- Hechos: F0 (plan), F1 `dfa93de` (cualquier empleado, `nombreRol`), F2 `d18bacd` (README), F4 `f0d8d41` (offline con IndexedDB), F5 `24cbd64` (quita CRUD sin uso), F6 `4c5db3a` (prueba de `theme_init.js` y cobertura sobre `src`), F7 `b385c85` (atiende quien tiene el paso; errores B8), F10 `653a293` (buscar paciente y título por rango), F11 `b1ae634` (nombre accesible de "Atender", autoformato del documento, detalles de UI). F3 no requería código.
- Pendientes: F8 (salir de la consulta, `DELETE /api/atencion/consulta`, backend `0e5f644`) y F9 (exámenes con casillas y filtro por `tiposExamen`, backend `c154c94`). Antes de implementarlas, leer el Resource y el DTO actuales. F12 (reporte final) después.
- `rolPaso.idRol` y `rolActivo.idRol`: el backend ya los manda (commit `0856fa3`). El frontend ya compara por `idRol` en `esPasoDeMiRol`, y `obtenerSesion` conserva `rolActivo` completo; falta validar `rolActivo.idRol` como UUID en `obtenerSesion` (`auth_service.js`), agregar el campo a las sesiones de prueba y comprobarlo contra el backend real (que Lucía tenga preseleccionado el Triaje y Carlos la Consulta médica).
- Los estilos de F11 (`citas.css`, `consultas.css`, `components.css`) no se han revisado en el navegador: indicador de pasos a 1280 px, filtro de fechas con el error de rango, botón de tema junto a "Instalar app", a 375 px y en modo oscuro.
- La documentación del backend ya está al día con B8 (`api-rest.md` describe `rolPaso`; la §10 de `../galenasv/docs/LEVANTAR.md` tiene la demo nueva). Si algo no coincide, manda el código.
