# Correcciones de la auditoría y regla de roles B8 (frontend)

## Contexto

- `docs/reportes/auditoria-rubrica.md` (commit `9a1560e`) deja con riesgo:
  - el arranque: no hay README;
  - el modo offline después de recargar;
  - la HU3: no hay búsqueda de paciente y una consulta en curso bloquea el flujo;
  - la HU4: los exámenes se asignan de uno en uno;
  - detalles de UI y de accesibilidad;
  - código sin uso que baja la cobertura.
- El backend (B8, `../galenasv/docs/reportes/b8-plan.md`) cambia la regla:
  - es empleado cualquier rol activo excepto Paciente;
  - cada paso lo atiende su rol responsable;
  - cierra la consulta quien completó el paso final;
  - `/auth/me` trae `nombreRol` y `codigo` puede ser `null`.
- Los datos demo pasan a los de `../galenasv/docs/datos-demo-rubrica.md`: Carlos (Doctor), Lucía (Enfermera), Marta (Atención al público), Ana (paciente) y Pedro (sin rol).
- **Con el frontend de hoy, Lucía no puede entrar:** `auth_service.obtenerSesion` rechaza todo `codigo` fuera de `ROLES`. Además, Marta ve "Solo el rol Doctor…" y no puede cerrar SA-6.

### Estado del backend leído (solo lectura, rama `backend-rubrica`)
- **Ya está en el código:**
  - `/auth/me` con `nombreRol` (`AuthResource.java:73-74`);
  - asignaciones de cualquier empleado (commits `4d5910a` y `3af1644`);
  - mensajes y mapeo de `consulta.noResponsablePaso`, `consulta.soloFinalizador`, `consulta.soloEmpleado` y `consulta.rolClinica` a 403, y de `consulta.sinPasoParaRol` a 409. Esto está en `ApiExceptionMapper` y `Messages*.properties`, pero **sin commitear** (commit 4 de B8 en curso).
- **Todavía no está en el código** (commits 6 y 7 del plan B8):
  - `DELETE /api/atencion/consulta`;
  - `tiposExamen` en `examenes-asignables`: `ExamenAsignable` sigue siendo `(idExamen, nombre)`, en `AtencionService.java:360`.

  Los commits F5 y F9 de este plan esperan a que existan y vuelvo a leer el Resource y el DTO antes de usarlos.

### Discrepancias que te aviso (manda el código)
1. `../galenasv/docs/api-rest.md`, sección Dashboard, todavía dice "Roles: DOCTOR y ADMINISTRACION", y la línea ~394 dice "Requieren el rol médico". El código ya acepta a cualquier empleado.
2. `pendienteParaMi` en api-rest.md solo describe "un paso PENDIENTE de mi rol". B8 agrega "falta cerrar y yo completé la finalización" (commit 5 de B8, pendiente).
3. **Hueco de contrato:** en el dashboard, `paso.responsable.rol` es el rol **de la persona asignada**, no el de la definición del paso. Si un paso PENDIENTE no tiene responsable, el frontend no puede decir qué rol lo atiende y usará un motivo genérico. Si lo quieres exacto, el backend tendría que exponer el rol del paso, por ejemplo con un campo `rolPaso`. No lo asumo.
4. `CLAUDE.md`, sección Login (HU2), dice "Solo DOCTOR y ADMINISTRACION", y `docs/plan.md` dice "Offline: en memoria, nunca en disco". Las dos cosas quedan superadas por este pedido. Propongo actualizar `docs/plan.md` en F1 y F4. `CLAUDE.md` es tuyo: te dejo el texto y lo cambias tú.

## Orden de commits (por riesgo en la revisión secuencial)

El revisor se detiene en el primer observable que falla. Por eso el orden es:

1. lo que impide entrar;
2. el arranque (0);
3. los observables en el orden de la rúbrica: 3, 5, 8, 10, 13 y 14.

Dentro de la HU, lo más visible contra las imágenes va primero. Cada commit deja `npm test` en verde y la app usable con la demo nueva. Rama `spa`: sin force push, con `Co-Authored-By`, y sin tocar `.vscode/tasks.json` ni `auditar_roles.sh`, que ya estaban modificados.

### F0. Copia del plan
`docs/reportes/correcciones-plan.md`.

### F1. Empleado = cualquier rol activo excepto Paciente; mostrar `nombreRol` (bloqueante: login de Lucía)
- `src/js/control/auth_service.js`:
  - `ROLES` se reemplaza por `CODIGO_PACIENTE = "PACIENTE"` y `esEmpleado(sesion)`: `rolActivo.codigo !== "PACIENTE"`.
  - `obtenerSesion` acepta `codigo` como string o `null` y exige `nombreRol` como texto no vacío.
  - Se actualiza el comentario del contrato.
- `src/js/boundary/rutas.js`:
  - se quita `ROLES_EMPLEADO`;
  - las rutas `/dashboard` y `/consulta/:id` llevan `empleado: true`;
  - `inicioPorRol` usa `esEmpleado`.
- `src/js/boundary/router.js` (líneas 135 y 150): cambia `ruta.roles.includes(codigo)` por `ruta.empleado && esEmpleado(sesion)`. Esto incluye el respaldo sin red.
- `controlador_login.js:101`: rechaza solo PACIENTE. El texto 403 "solo para personal médico y administrativo" pasa a "solo para el personal de la clínica".
- `controlador_dashboard.js`:
  - `normalizarAsignaciones` descarta `codigoRol === "PACIENTE"` y ya no exige que el código esté en una lista;
  - `nombreRol` es obligatorio, con respaldo "Rol sin nombre".
- `vista_dashboard.js:113` y `session_bar.js:57` muestran `rolActivo.nombreRol`.
- Pruebas: `auth_service`, `rutas`, `router`, `login`, `app_shell`, `session_bar`, `vista_dashboard` y `dashboard`. Casos nuevos:
  - ENFERMERA entra;
  - un rol con `codigo: null` entra y se muestra su nombre;
  - PACIENTE se rechaza.

  Las sesiones de ejemplo nuevas usan a Carlos, Lucía y Marta.
- `docs/plan.md`: se actualizan las decisiones de login y de rutas.

En este punto Lucía y Marta entran. La vista de consulta todavía dice "Solo el rol Doctor…" y se corrige en F7: es un estado intermedio coherente.

### F2. README (observable 0)
`README.md` nuevo, con:
- requisitos: Node 22, backend en 9080 y **puerto 3000 obligatorio** (`auth.origen`);
- `npm start` y `npm test`, y el script de cobertura de F6;
- un enlace a `../galenasv/docs/LEVANTAR.md` y el paso `reiniciar-demo.sh` el día de la revisión;
- la tabla de cuentas demo del §10 de `datos-demo-rubrica.md`, con cada documento y para qué HU sirve: Ana `01000004-4`/`B10000004`, Carlos `01000001-1`/`A10000001`, Lucía `01000002-2`, Marta `01000003-3`, Pedro `01000005-5` rechazado y `12345678-9` neutro;
- un guion de demo por HU:
  - HU1 con Ana;
  - HU3 con Carlos en sus 2 clínicas;
  - HU4: Lucía, Triaje de SA-5; Carlos, exámenes en SA-3; Marta, cierre de SA-6;
- cómo probar offline (F4);
- por qué la consola muestra 401 de `/auth/me` y 409 esperados.

### F3. (reservado) no hay cambios de código para el selector de tipos
Pasaporte llega por la demo nueva y el frontend ya filtra por `activo` y valida con `expresionRegular`. Solo se verifica en la prueba manual.

### F4. Offline después de recargar con IndexedDB (observable 3)
- **Nuevo** `src/js/boundary/pwa/almacen_offline.js`:
  - un adaptador de IndexedDB con la base `chivomed-offline` y el store `registros`, con las claves `sesion`, `dashboard` y `consulta`;
  - API async `leer()`, `guardar(clave, valor)` y `borrar()`;
  - recibe `indexedDB` por inyección;
  - si IndexedDB no existe o falla, se comporta como vacío y nunca rompe el arranque.
- **Nuevo** `tests/dobles/indexeddb_doble.js`: solo el subconjunto que usa el adaptador (`open` y `onupgradeneeded`, `transaction`, `objectStore` con `get`/`put`/`clear`, y eventos `success`/`error`).
- `memoria_vistas.js`, con un puerto `persistencia` opcional:
  - `recordarSesion` persiste la sesión **sin `csrfToken`** y con `verificadaEn`;
  - con otro `idUsuario`, borra todo, tanto en memoria como en disco;
  - `guardar` persiste solo dos claves, y cada una reemplaza a la anterior:
    - `dashboard.ultimo`: `{desde, hasta, consultas, asignaciones, en}`;
    - `consulta:{id}`: la consulta abierta y su `detalle`, **sin borradores ni registros "Ver registro"**;
  - las claves de la HU1 (citas) nunca se persisten;
  - `limpiar()` borra el disco;
  - **nuevo** `hidratar()`: lee el almacén y descarta todo si `verificadaEn` tiene más de 8 horas, el formato no es válido o el usuario no coincide. Si no, restaura la sesión de respaldo y los datos, y las fechas `en` vuelven a ser `Date`.
- `app_shell.js`:
  - espera `memoria.hidratar()`, con tiempo máximo, antes de `router.iniciar`;
  - el cierre de sesión, un 401 y el cambio de cuenta ya llaman a `memoria.limpiar()` y ahora también borran el disco.
- `controlador_consultas.js`: sin red y sin datos para el rango actual, muestra `dashboard.ultimo` con su rango (desde/hasta) y el aviso "Mostrando las consultas guardadas el {fecha} a las {hora}". `controlador_dashboard.js` restaura las asignaciones guardadas.
- `controlador_consulta.js`: sin cambios de flujo, porque ya lee `consulta:{id}` de la memoria.
- `sw_logica.js`: se agrega el archivo nuevo a `PRECACHE` y se sube `VERSION`.
- Se actualizan `docs/plan.md` (decisión Offline) y el comentario de cabecera de `memoria_vistas.js`.
- Pruebas:
  - un ciclo completo guardar → recargar (una instancia nueva) → hidratar → dashboard sin red;
  - caducidad de 8 h con un reloj inyectado;
  - otra cuenta borra lo anterior;
  - el cierre de sesión borra;
  - la HU1 no se persiste;
  - el `csrfToken` no llega al disco;
  - IndexedDB ausente no rompe nada;
  - `precache.test` sigue en verde.

### F5. Quitar servicios y entidades sin uso (observable 5)
- Se borran:
  - los servicios `consulta_procedimiento_service.js`, `examen_resultado_service.js`, `procedimiento_paso_examen_service.js` y `procedimiento_paso_secuencia_service.js`;
  - las entidades `consulta_procedimiento.js`, `examen_resultado.js`, `procedimiento_paso_examen.js`, `procedimiento_paso_secuencia.js` y `examen.js`.
- Se quitan los métodos que los importan y que ninguna HU usa:
  - `ConsultaService.procedimientos`;
  - `ConsultaProcedimientoPasoService.asignarResponsable` y `registrarExamen`;
  - `ProcedimientoPasoService.examenesConfigurados`, `secuencias` y `pasosConsulta`;
  - `OrdenExamenService.resultados`.
- Se quitan sus entradas de `PRECACHE`, se sube `VERSION` y se ajusta `tests/servicios_consulta.test.js`.
- Antes de borrar, un `grep` confirma que nada más los importa.

### F6. Cobertura (observable 8)
- `tests/theme_init.test.js` nuevo, con la ventana doble de `tests/dobles/ventana_doble.js`, agregando lo que falte. Ejecuta el IIFE con import y cache-busting en cada caso:
  - preferencia guardada light o dark;
  - sin preferencia, con el sistema en oscuro o en claro;
  - `localStorage` que lanza excepción;
  - el `meta theme-color`.
- `package.json`: `"cobertura": "node --test --experimental-test-coverage --test-coverage-include=src/** tests/*.test.js"`. La opción existe desde Node 22.5; si `engines` indica >=22, se sube a `>=22.5`.

### F7. HU4/HU3: motivo por rol del paso, sesión solo si toca y errores nuevos (observable 13; punto 1 del pedido)
- `controlador_consultas.js`:
  - se quitan `ROL_ATIENDE` y `MENSAJES.soloDoctor`;
  - `motivoNoAtender(consulta, {enLinea, soloLectura})` se decide por los datos, no por el rol:
    1. si hay `fechaFin`, "Esta consulta ya está cerrada.";
    2. si hay `pendienteParaMi`, se puede atender: es un paso mío o falta cerrarla, y en ese caso la tarjeta dice "Cerrar consulta" en vez de "Atender". Sin red, el motivo es `sinRedAtender`;
    3. si hay un PENDIENTE que no es mío, "Le corresponde a {responsable.nombre} ({responsable.rol})."; sin responsable, "Este paso lo atiende otro rol." (hueco 3);
    4. si no queda ningún PENDIENTE, "Cierra la consulta quien completó el paso de finalización.".
  - `contextoAtender` ya no lleva `rol`.
- `controlador_consulta.js`:
  - **flujo nuevo de `#cargar`:** primero `GET /atencion/consultas/{id}`. Solo si `pendienteParaMi && !fechaFin` hace `PUT …/sesion` y después `#cargarDetalle`. Si no, queda en **solo lectura**, sin pedir la sesión ni los datos clínicos del paso. El motivo se toma de `motivoNoAtender`;
  - nuevo estado `atendiendo`, que es true tras un `PUT sesion` correcto;
  - `bloqueo` y `motivoNoActuar` se basan en `atendiendo`;
  - `elegirPasoActual` compara `responsable.rol` con `sesion.rolActivo.nombreRol`. Se borra `codigoDeRol`, que comparaba "Administración" con ADMINISTRACION y ya no sirve con "Atención al público".
- `mensajeDeErrorConsulta`, códigos nuevos:
  - `consulta.noResponsablePaso` (403): usa el `message` del backend, que trae el nombre del rol, con el respaldo "Este paso lo atiende otro rol.";
  - `consulta.soloFinalizador` (403): "Cierra la consulta quien completó el paso de finalización.";
  - `consulta.soloEmpleado` (403): "Solo el personal de la clínica puede atender consultas.";
  - `consulta.rolClinica` (403): "Elige tu rol y clínica en el dashboard.";
  - `consulta.sinPasoParaRol` (409): "Esta consulta no tiene un paso pendiente para tu rol.".

  Los cinco recargan la consulta en solo lectura: se agregan a `recargarTras` y, en la carga inicial, se pasa a solo lectura en vez de mostrar un error de pantalla completa.
- `vista_consulta.js`, `lista_consultas.js` y `tarjeta_consulta_dashboard.js`: el texto del motivo y la etiqueta "Cerrar consulta".
- Pruebas:
  - por motivo;
  - Lucía (Enfermera) en el Triaje sí hace PUT sesion;
  - Carlos en el Triaje no hace PUT sesion y no pide el paso: menos peticiones, contadas como en `controlador_consulta.test.js:148`;
  - Marta con todo completado y `pendienteParaMi` ve "Cerrar";
  - cada código nuevo con su mensaje y la recarga.

  Se reescriben las pruebas "ADMINISTRACION solo lectura / Solo el rol Doctor".

### F8. Salir de la consulta y "Ir a la consulta en curso" (observable 13; punto 2)
**Requisito:** el commit 6 de B8 debe estar en el backend. Antes, leo `AtencionResource` y `api-rest.md`.
- `AtencionService.salirDeConsulta()`: `DELETE atencion/consulta`, que devuelve 204. Hay que comprobar que `DefaultService.solicitar` tolera 204 sin cuerpo, como ya lo hace con el logout.
- `controlador_dashboard.js`:
  - carga `GET /atencion` (`contexto()`) **en paralelo** con las asignaciones, una sola petición extra, y publica `estado.enCurso` (idConsulta o null);
  - nuevo `salirDeConsulta()`;
  - ante el 409 `rolCambio.cerrarAntesCambiar`, muestra el mensaje junto con las dos acciones.
- `vista_dashboard.js`, junto al selector de rol: el aviso "Tienes una consulta en curso", con el enlace **"Ir a la consulta en curso"** (`#/consulta/{id}`) y el botón **"Salir de la consulta"**. La tarjeta de esa consulta lleva la insignia "En curso".
- `vista_consulta.js` y `controlador_consulta.js`:
  - con `atendiendo`, aparece el botón **"Salir de la consulta"**: hace DELETE y luego `navegarA` al dashboard;
  - en el error `consulta.cerrarAntesRetomar`, además del enlace actual, aparece "Salir de esa consulta y atender esta": hace DELETE y reintenta.
- Pruebas: el DELETE con CSRF, la idempotencia (un segundo DELETE), el cambio de rol después de salir, el enlace en el dashboard y los errores 401 y de red.

### F9. Exámenes con casillas y filtro por categoría (observable 13; punto 3)
**Requisito:** el commit 7 de B8 (`tiposExamen`).
- `normalizarAsignables` agrega `tiposExamen: [{idTipoExamen, nombre}]` congelado. Si el campo no viene, queda `[]` y el filtro se oculta.
- `<panel-examenes-paso>`:
  - un `<select>` "Categoría", con "Todas" más la unión de tipos ordenada por nombre;
  - un `<fieldset>` con una casilla por examen. La selección se conserva al cambiar el filtro y se muestra "N seleccionados";
  - indicaciones opcionales comunes;
  - el botón **"Asignar exámenes seleccionados"**;
  - el evento `asignar-examenes` con `{ idsExamen, indicaciones }`;
  - la lista se arma con `createElement` o clonando un `<template>`, nunca con `innerHTML` y datos.
- `ControladorConsulta.asignarExamenes`:
  - valida que haya al menos uno y que todos sean asignables;
  - hace `POST …/ordenes-examen` **en serie**, uno por examen, porque el backend recibe una orden por petición;
  - publica `estado.resultadoExamenes = [{ idExamen, nombre, ok, mensaje }]`, que el panel pinta en `role="status"`;
  - al final recarga las órdenes una sola vez, y también los asignables si algún examen dio `examenNoAsignable`;
  - un `pasoYaCompletado` o `yaCerrada` corta la serie y recarga la consulta.
- Se quitan `emitirOrden` y `validarOrden` de un solo examen.
- Pruebas: el filtro, la selección múltiple, el éxito parcial con el mensaje por examen, el corte por paso completado y el panel sin `tiposExamen`.

### F10. "Buscar paciente" y título según el rango (observables 13 y 10)
- `ControladorConsultas`:
  - estado `busqueda` y derivado `consultasVisibles`: filtra en el cliente por nombre (sin acentos ni mayúsculas) o por número de documento (sin guiones);
  - sin petición nueva ni N+1;
  - el resumen queda "2 de 5 consultas coinciden con «ana»".
- `<lista-consultas>`: un campo `type="search"` "Buscar paciente" en el formulario de filtro.
- `tituloConsultas(consultado, hoy)` da "Consultas de hoy", "Consultas del 13 nov 2026" o "Consultas del 21 oct al 20 nov 2026". El encabezado lo pinta quien tiene el estado: en la implementación reviso cómo nombrar la sección, porque `aria-labelledby` no cruza el Shadow DOM.
- La búsqueda global por documento (panel 4 de la imagen) necesitaría un endpoint del backend que no existe, así que no la hago.

### F11. Detalles de UI y accesibilidad (observables 10 y 14)
- `tarjeta_consulta_dashboard.js:33`: `aria-label` "Atender a {paciente}, {hora}" o "Cerrar consulta de …", puesto con `setAttribute`.
- **Autoformato del documento:** `formato_documento.js` gana `autoformatear(valor, expresionRegular)`.
  - Si la expresión es de la forma de grupos de dígitos separados por `-` (DUI `^[0-9]{8}-[0-9]$` y Licencia), quita lo que no sea dígito e inserta los guiones.
  - Para otras expresiones, como Pasaporte, no toca el valor.
  - Se aplica en `vista_login.js` y en el paso 2 de `vista_citas.js` solo al escribir hacia adelante, no al borrar.
- **Detalles visibles:**
  - la etiqueta del paso 2 de `indicador_pasos` se acorta o pasa a dos líneas;
  - el formulario de fechas reserva el espacio del error o usa `align-self: end`;
  - `<theme-toggle>` usa la misma tipografía que `<install-prompt>`;
  - sin preferencia guardada, el tema sigue al sistema con `matchMedia(...).change`. Antes verifico si `theme_toggle.js:14` ya lo hace.
- Pruebas por cada uno, en el DOM mínimo, agregando lo que falte a `dom_minimo.js`.

### F12. Reporte
`docs/reportes/correcciones-reporte.md` con:
- la salida real de `npm test` y `npm run cobertura`;
- la prueba manual;
- lo pendiente del backend.

## Archivos críticos
- `src/js/control/auth_service.js`
- `src/js/boundary/rutas.js` y `router.js`
- `src/js/boundary/vistas/controlador_consultas.js` y `controlador_consulta.js`
- `controlador_dashboard.js` y `vista_dashboard.js`
- `vista_consulta.js`
- `components/consulta/panel_examenes_paso.js`
- `components/dashboard/{lista_consultas,tarjeta_consulta_dashboard}.js`
- `vistas/memoria_vistas.js`
- `components/app_shell.js`
- `pwa/sw_logica.js`
- `control/formato_documento.js`

Lo que se reutiliza:
- `crearEstado` y `suscribir`;
- `plantilla()`;
- `MemoriaVistas.clave`;
- `normalizarConsultas`;
- `#ejecutar` y `#recargar` del controlador de consulta;
- `formatearFecha` y `formatearFechaHora` de `fechas_sv.js`;
- `crearValidadorFormato`.

## Verificación
- `npm test` antes de cada commit, informando el resultado real.
- `npm run cobertura`: total solo sobre `src`.
- Prueba manual en `http://localhost:3000`, con el backend B8 completo y `reiniciar-demo.sh` antes:
  1. HU1 con Ana, DUI y Pasaporte: aparecen 2 clínicas.
  2. Pedro y `12345678-9` son rechazados en el login.
  3. Lucía entra; en el dashboard de Santa Ana, SA-4 y SA-5 se pueden atender y SA-3 dice "Le corresponde a Carlos Gómez (Doctor)". Completa el Triaje de SA-5.
  4. Carlos, en SA-5 (ya en Consulta médica) y en SA-3: asigna 2 exámenes filtrando "Laboratorio clínico" y ve el resultado por examen. Electrocardiograma no aparece. Abre SA-4 en solo lectura, sin `PUT sesion` en la pestaña Network.
  5. Marta completa la Entrega de indicaciones de SA-6 y la cierra. Carlos no ve "Cerrar".
  6. Con una consulta en curso, en el dashboard aparece "Ir a la consulta en curso". Luego "Salir de la consulta" y el cambio de rol a San Salvador funciona.
  7. En DevTools: Offline y F5 en `#/dashboard` y en `#/consulta/{id}` muestran los datos guardados. Cerrar sesión y volver a cargar offline lleva a "Sin conexión". Al entrar con otra cuenta no se ven los datos de la anterior.
  8. A 375 px y en modo oscuro.
- Después de probar, `reiniciar-demo.sh` otra vez.
