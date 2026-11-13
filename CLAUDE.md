# ChivoMed (frontend)

Frontend de GalenoSV, un sistema de gestión clínica. El backend vive en `../galenasv` (la carpeta se llama `galenasv`, pero el contexto web y los paquetes Java usan `galenosv`).

## Stack
- Node.js >= 22. JavaScript nativo (ES Modules) y Web Components con Shadow DOM. No hay React, Vue, Angular ni bundler: el código fuente se sirve directamente.
- Servidor de desarrollo: `npm start`, que ejecuta `node scripts/dev_server.js` (servidor propio en Node, sin dependencias): sirve `src/` y hace de proxy inverso de `/galenosv/api` hacia `API_URL`, en el puerto 3000.
- Backend: Java 21, Jakarta EE 11, Open Liberty en el puerto 9080, API en `/galenosv/api`. Base de datos: PostgreSQL en Docker.
- Variables en `.env`: `API_URL` (por defecto `http://localhost:9080/galenosv/api`) y `PORT` (por defecto `3000`). Nunca imprimir ni commitear valores sensibles.
- Pruebas: `npm test` (`node --test tests/*.test.js`). No hay e2e en el repositorio: la prueba contra el backend real se hace a mano en el puerto 3000.

## Reglas de trabajo
- Solo se editan archivos dentro de ChivoMed. `../galenasv` es SOLO LECTURA.
- Antes de consumir un endpoint, leer en `../galenasv` el Resource, el DTO y la entity correspondientes, y la documentación en `../galenasv/docs/api-rest.md` y `../galenasv/docs/autenticacion.md`. Si la documentación y el código no coinciden, manda el código y avisarme.
- Nunca inventar endpoints, campos ni tipos. Si el frontend necesita algo que el backend no expone, decírmelo en vez de asumirlo; el cambio en el backend lo hago yo.
- No ejecutar docker ni tocar la base de datos.
- Proponer un plan antes de cambios que afecten más de 3 archivos.
- Correr `npm test` antes de dar una tarea por terminada e informar el resultado real, sin suponerlo.
- Rama de trabajo actual: `spa`, compartida con otros compañeros. No hacer force push, no reescribir historial y no tocar archivos ajenos a la tarea.
- Nunca poner datos reales de pacientes en código, mocks, pruebas ni commits.

## Arquitectura
Patrón BCE (Boundary-Control-Entity), igual que el backend:
- `src/js/boundary/`: Web Components y controladores de vista.
- `src/js/control/`: servicios HTTP que extienden `DefaultService`.
- `src/js/entities/`: modelos que extienden `DefaultEntity`.
- Páginas por rol en `src/paginas/` (`personal/`, `medico/`, `pacientes/`). Entradas: `src/index.html` (login) y `src/inicio.html` (verificación de sesión y selección de rol).

## Contrato con el backend
- Autenticación por sesión HTTP (cookie `JSESSIONID`, HttpOnly). Toda petición que no sea GET/HEAD/OPTIONS debe enviar la cabecera `X-CSRF-Token`; el token se obtiene de `GET /api/auth/me`.
- El backend NO implementa CORS. Todo pasa por el proxy del puerto 3000 para que sea same-origin. No llamar al puerto 9080 directamente desde el navegador.
- El frontend debe correr en el puerto 3000 (`http://localhost:3000` o `http://127.0.0.1:3000`). El backend rechaza toda petición que no sea GET/HEAD/OPTIONS cuyo `Origin` no esté en `CHIVOMED_ORIGINS` (por defecto, esos dos), con 403 `auth.origen`; en otro puerto ni el login funciona. No cambiar `PORT` en `.env` ni levantar el servidor en otro puerto para probar contra el backend real.
- Los DTOs son planos: las relaciones viajan como UUID (`idPersona`, `idClinica`, ...), nunca como objetos anidados. Las colecciones hijas se piden con `GET /api/{recurso}/{id}/{subcoleccion}`.
- Roles: `ADMINISTRACION`, `DOCTOR`, `PACIENTE`. El backend aplica permisos por rol activo y aísla datos por clínica; un 403 es comportamiento esperado, no un bug del frontend.
- Evitar cascadas de peticiones N+1. `PatientPortalService.ordenesDelPaciente` ya tiene ese problema y no debe replicarse en código nuevo.

## Convenciones
- Archivos JS en `snake_case` (`patient_portal_service.js`). Web Components en kebab-case (`panel-catalogo-simple`).

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



## Login (HU2)
- El login es con tipo de documento y número de documento, sin contraseña. Contrato: POST /api/auth/login con { idTipoDocumento, numeroDocumento }. Solo DOCTOR y ADMINISTRACION.
