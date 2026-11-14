# Plan de trabajo ChivoMed (parcial 2, PPI115)

## Contexto
- Se califica el frontend contra docs/rubrica.md.
- La revisión es secuencial: si un observable falla, no se revisa el resto.
- El revisor clona el commit entregado y lo corre en su ambiente.

## Estado actual (auditoría del 2026-11-12, solo lectura)

### Mediciones
- `npm test`: 67 pruebas, 9 suites, 67 pasan, 0 fallan.
- Cobertura (`node --test --experimental-test-coverage`): 80.30 % líneas, 89.07 % ramas, 55.91 % funciones, pero solo sobre los 41 de 86 JS de `src` que cargan las pruebas. Ningún Web Component ni controlador de vista tiene pruebas (salvo `utils.js`).
- URLs externas en `src`: ninguna; solo el namespace SVG `http://www.w3.org/2000/svg`.
- PWA: no hay manifest, service worker ni manejo offline.
- 9 páginas HTML; la navegación es entre documentos (`href`, `location.replace`).
- 25 `@media` (solo 1 dentro de un Shadow DOM); 121 `aria-*` y 29 `role=`, concentrados en login y portada.
- 21 Web Components registrados. No son componentes: login (`index.html` + `login.js`), `inicio.html`, `portada.html` y el contenido de las páginas de pacientes (`patient.js`).
- `src/js/boundary/consulta_model.js` es código muerto (sin `define`, import roto, nadie lo importa).

### Cumplimiento por criterio
| Criterio | % | Estado |
|---|---|---|
| SPA | 0.5 | No cumple |
| PWA instalable | 0.5 | No cumple |
| PWA en línea y fuera de línea | 0.5 | No cumple |
| Todo con Web Components | 1 | Parcial |
| Estructura modular | 0.5 | Parcial |
| Sin librerías externas | 1 | Cumple |
| Lógica reactiva y asíncrona | 0.5 | Parcial |
| Cobertura integral | 0.5 | No cumple |
| Pruebas significativas | 0.5 | Parcial (ninguna por HU) |
| UI atractiva | 0.5 | Sin verificar |
| CSS de autoría propia | 1 | Cumple |
| Responsive | 0.5 | Parcial |
| HU completas | 2 | No cumple |
| Diseño accesible | 0.5 | Parcial |

### Historias de usuario
- HU1 Búsqueda de citas: existe el listado de consultas del paciente con cards. Falta el asistente (tipo de documento, número, clínica, rango de fechas), mostrar los procedimientos en la card y el ticket PDF.
- HU2 Login: existe con usuario y contraseña. Debe ser solo tipo y número de documento, sin contraseña, y solo para DOCTOR y ADMINISTRACION.
- HU3 Dashboard: existe la cola de consultas y los pasos con su valor y responsable. Falta el selector de rol y clínica (`PUT /atencion/rol-activo` no se usa en ninguna vista), el filtro por fechas con "hoy" por defecto y la jerarquía de pasos.
- HU4 Consulta: existe registrar atención, órdenes de examen, avanzar paso y cierre. Falta retroceder al paso anterior.

### Brechas del backend (las resuelve el responsable del backend)
1. No hay endpoint que genere el ticket PDF (HU1).
2. Toda `/api` exige sesión salvo el login; HU1 la usan pacientes sin autenticarse.
3. El login recibe `identificador` y `password`; el contrato acordado es `{ idTipoDocumento, numeroDocumento }` sin contraseña, más `GET /api/publico/tipos-documento` sin sesión (HU2).
4. No hay endpoint para retroceder un paso (HU4).

## Decisiones
- Entrega en 6 días: fecha límite 2026-11-18.
- Router propio por hash (`#/ruta`); todo se resuelve desde `src/index.html` para que luego lo sirva un service worker.
- Login (HU2) SOLO con tipo de documento y número de documento, sin contraseña, y solo para empleados (cambio de alcance por la rúbrica). Desde la B8 del backend (2026-11-13), empleado es cualquier rol activo excepto PACIENTE, incluso un rol sin código.
- Contrato acordado, pendiente en el backend: `POST /api/auth/login` con `{ idTipoDocumento, numeroDocumento }` y `GET /api/publico/tipos-documento` sin sesión. Hoy el backend solo acepta `identificador` + `password` y exige sesión en toda `/api`. Las llamadas quedan aisladas en `src/js/control/auth_service.js`.
- El frontend rechaza y cierra una sesión con rol PACIENTE, pero eso no es una barrera de seguridad: el backend niega el login a quien no es empleado. El rol se muestra con `nombreRol` y el código solo se usa para reconocer PACIENTE.
- Alcance reducido a las 4 HU. Rutas: `#/citas` (HU1, pública, ruta por defecto), `#/login` (HU2), `#/dashboard` (HU3) y `#/consulta/:id` (HU4), más una vista de no encontrada.
- Las rutas de empleado (`empleado: true` en `rutas.js`) aceptan cualquier rol de empleado (`esEmpleado` de `auth_service.js`). Cada paso de una consulta lo atiende su rol responsable y la consulta la cierra quien completó el paso final (B8); lo decide el backend.
- Fuera de alcance: portada, administración, vista de cuenta y portal del paciente con login. La HU1 no reutiliza el portal (ver `docs/reportes/hu1-plan.md`, D3); su código se borró en la Fase 4.
- `npm start` usa `scripts/dev_server.js`, que tiene el proxy a `/galenosv/api`. BrowserSync, Playwright y los e2e (`tests/browser/`) ya no están; `tests/api_proxy.test.js` prueba `dev_server.js`.
- HU4 "retroceder": reabre el paso anterior en el backend con `PUT /api/consultas-procedimientos-pasos/{id}/retroceso`. Responde 409 si es el primer paso o si el paso actual tiene valor u órdenes; la vista debe mostrar el motivo del 409. Endpoint acordado, pendiente en el backend.
- Offline: cada vista conserva en memoria los últimos datos cargados, para seguir mostrándolos sin red. Desde 2026-11-13 (auditoría, observable 3), para que una recarga sin red funcione, se copia a IndexedDB lo mínimo: la sesión verificada (sin token CSRF), el último dashboard con sus asignaciones y la consulta abierta (sin borradores ni el valor guardado del paso). La copia caduca a las 8 horas de la última verificación y se borra al cerrar sesión, ante un 401 o al entrar otra cuenta. La HU1 (búsqueda pública de citas) sigue solo en memoria. Ver `memoria_vistas.js` y `pwa/almacen_offline.js`.
- `src/js/boundary/components/medico/*` no se reutilizó (eran plantillas enteras con `innerHTML` y `escapeHtml`); la HU4 extrajo antes sus reglas de negocio y se borró en la Fase 4. La parte 2 de HU3 y la HU4 se escribieron con componentes nuevos bajo la norma de abajo.

**Estado reactivo y plantillas** (norma desde 2026-11-13)
- Cada vista tiene un controlador sin DOM cuyo estado es un `crearEstado(...)` de `src/js/control/estado_reactivo.js`. El controlador solo escribe en ese estado; nunca recibe callbacks de la vista ni la llama.
- La vista se suscribe con `suscribir()` en `connectedCallback` y cancela en `disconnectedCallback`. Repinta a partir del `Set` de claves que cambiaron.
- Los objetos y arreglos que se guardan en el estado van congelados; para cambiarlos se reemplazan, no se mutan.
- `innerHTML` solo se usa con plantillas fijas (constantes del módulo sin datos del servidor, de la URL ni del usuario), a través de `plantilla()` de `src/js/boundary/plantilla.js`, que crea el `<template>` una vez y lo clona. Los datos se pintan con `textContent`, atributos o propiedades. Las listas se arman con `createElement` o clonando un `<template>`. `escapeHtml` no es una alternativa aceptada en código nuevo. `tests/plantilla.test.js` lo verifica sobre todo el JS del precache.
- Un componente que muestra contenido de otro lo recibe por `<slot>` (p. ej. `<slot name="consultas">` en `<vista-dashboard>`).
- Las vistas se prueban en Node con el DOM mínimo de `tests/dobles/dom_minimo.js`, que solo modela lo que usan las vistas; si una vista necesita algo nuevo del DOM, se agrega ahí.

## Orden de trabajo
1. SPA
   - Fase 1: `src/js/boundary/router.js`, `src/js/boundary/rutas.js`, `tests/router.test.js` y `tests/rutas.test.js`. Sin cambio visible.
   - Fase 2: `index.html` solo con `<app-shell>`; `app_shell.js`, `session_bar.js`; `<vista-login>` por documento; `<vista-no-encontrada>` y `<vista-citas>` mínima; `npm start` con `scripts/dev_server.js`; quitar BrowserSync, Playwright y los e2e; reescribir las pruebas de login con contraseña y de acceso del rol PACIENTE.
   - Fase 3: vistas de citas, dashboard y consulta con componentes nuevos (la HU1 no reutiliza el portal del paciente).
   - Fase 4 (hecha, 2026-11-13, `4baacd2`, `ad20a93`, `21d65b6`): se borraron los 72 archivos de `src/` fuera del precache (páginas viejas, su JS, componentes `medico/` y `personal/`, el portal del paciente, servicios y entidades CRUD sin uso y sus CSS), `DESTINOS`/`urlAplicacion`/`destinoSesion` de `auth_service.js`, 3 suites de pruebas de ese código (30 pruebas) y la tarea y la configuración de BrowserSync de `.vscode`. `src/` queda igual al cierre de la SPA. Después: 540 pruebas; cobertura de los 65 JS de la SPA: 93.15 % líneas, 91.05 % ramas, 84.77 % funciones.
2. PWA: manifest, service worker y funcionamiento fuera de línea.
3. Completar las HU según lo que exponga el backend.
4. Pruebas de unidad por HU y cobertura de componentes.
