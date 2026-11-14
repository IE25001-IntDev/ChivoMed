# Auditoría contra la rúbrica (revisión externa, solo lectura)

- Fecha: 2026-11-13. Commit auditado: `9a1560e` (rama `spa`). Backend: `galenasv` `76ce528`.
- Fuentes: `docs/definicion-parcial.pdf` (4 páginas, 5 imágenes de referencia), `docs/rubrica.md`, `docs/plan.md`, `../galenasv/docs/LEVANTAR.md`.
- Método: comandos en el repositorio, lectura del backend (solo lectura) y Chromium (Playwright) en `http://localhost:3000` con el backend en 9080, a 1280 y 375 px, en modo oscuro y con teclado. Capturas en `.playwright-mcp/auditoria/` (carpeta ignorada por git).
- No se escribió en el backend. Solo hubo login/logout, `PUT /atencion/rol-activo` y `PUT /consultas/{id}/sesion`, que según el código cambian solo la sesión HTTP propia (`AtencionSesion` es `@SessionScoped`, `ConsultaResource.java:83-96`), y las búsquedas públicas `POST /publico/clinicas|citas|citas/{id}/ticket`, que son lecturas (`PublicoResource.java:64-99`). No se guardó atención ni se emitieron órdenes; tampoco se avanzó, retrocedió ni cerró ninguna consulta.

## 1. Tabla por observable (en el orden de la rúbrica)

| # | Observable | % | Veredicto | Evidencia | Qué vería el revisor |
|---|---|---|---|---|---|
| 0 | (Previo) Clonar y correr | — | **Riesgo** | No hay `README` en ChivoMed (`ls` de la raíz: `CLAUDE.md docs LICENSE package.json package-lock.json scripts src tests`). Cómo levantar el sistema está solo en `../galenasv/docs/LEVANTAR.md`. `npm start` funciona sin `.env` (`scripts/dev_server.js:24-25` tiene valores por defecto). | Clona el repo y no encuentra cómo levantarlo ni qué documentos demo usar. Si no logra levantar el backend y la base, no llega al primer observable. |
| 1 | SPA: navegación fluida, intuitiva y consistente | 0.5 | **Cumple** | `src/index.html:17` solo tiene `<app-shell>`. El router usa `hashchange` (`router.js:82`). El título cambia por vista ("Búsqueda de citas \| ChivoMed", "Dashboard \| ChivoMed"...). Navegué citas → login → dashboard → consulta → dashboard sin recargar el documento. | Rutas `#/citas`, `#/login`, `#/dashboard` y `#/consulta/:id`, con enlaces "Acceso del personal", "Busca tus citas" y "Volver al dashboard". |
| 2 | PWA instalable y flujo de instalación | 0.5 | **Cumple** (falta completar la instalación a mano) | `manifest.webmanifest` tiene `name`, `start_url`, `scope`, `display: standalone` e iconos 192/512 `any` y `maskable` (PNG verificados con `file`). Service worker registrado con alcance `http://localhost:3000/` y controlando la página. Chrome disparó `beforeinstallprompt` y apareció el botón "Instalar app" (`<install-prompt>`). | Botón "Instalar app" en la cabecera. El diálogo de instalación y lo que pasa después de aceptar **requieren prueba manual** (no se puede completar en headless). |
| 3 | Funciona online y offline | 0.5 | **Riesgo** | Sin red y sin recargar: el dashboard sigue mostrando las consultas ("Sin conexión. Mostrando las consultas guardadas a las 05:48 p. m.") y "Atender" se deshabilita con su motivo; la navegación entre rutas funciona. Con **F5 sin red**: carga el shell desde el precache, pero `#/dashboard` muestra la vista "Sin conexión: Inicia sesión cuando vuelva la red" (captura `offline-recarga-f5.png`). En `#/citas` el catálogo de tipos se sirve de caché (`["Selecciona un tipo","DUI"]`), pero la búsqueda necesita red. La causa es la decisión de `docs/plan.md` ("en memoria, nunca en disco") y `sw_logica.js:13-15`. | Lo típico es activar "Offline" en DevTools y recargar. Ve una pantalla de "Sin conexión" en las vistas de empleado y puede concluir que la app "no mantiene su funcionalidad" fuera de línea. |
| 4 | Arquitectura basada en Web Components | 1 | **Cumple / Riesgo bajo** | Hay 18 `customElements.define`, uno por vista (`vista-*`) y por pieza (`tarjeta-cita`, `indicador-pasos`, `tarjeta-consulta-dashboard`, `lista-consultas`, `panel-*`, `session-bar`, `theme-toggle`, `install-prompt`, `estado-conexion`, `app-shell`). Los 18 usan Shadow DOM (`attachShadow`). Fuera de `<app-shell>` no hay HTML visible. Dentro de cada Shadow DOM se usan `<button>`, `<input>` y `<select>` nativos. | Todo lo visible está dentro de un componente propio. Un revisor muy estricto con "Web Components para **cada elemento**" podría preguntar por los controles nativos, pero eso es lo habitual. |
| 5 | Estructura modular, clara y organizada | 0.5 | **Cumple** | BCE: `boundary/` (router, vistas con controlador sin DOM, componentes por HU, `pwa/`), `control/` y `entities/`. `snake_case` en archivos y kebab-case en etiquetas. Observación: hay una cadena de servicios y entidades CRUD con 0 % de funciones cubiertas que se importan pero casi no se usan (`procedimiento_paso_*_service.js`, `examen_resultado_service.js`, entidades `consulta.js`, `examen.js`, etc.). | Estructura legible. Si abre `control/` verá servicios que no se usan en ninguna HU. |
| 6 | Componentes a medida, sin librerías ni dependencias | 1 | **Cumple** | `package.json` no tiene `dependencies` ni `devDependencies`. `package-lock.json` solo tiene el paquete raíz. `grep -rnE "https?://" src` encuentra solo el namespace SVG y un texto de error (`auth_service.js:61`). No hay `@font-face`, CDN ni Google Fonts: la fuente es del sistema (`app.css:5`). El único `@import` es local (`app.css:2`). | Nada de terceros. |
| 7 | Lógica reactiva y asíncrona | 0.5 | **Cumple** | Hay `crearEstado()`/`suscribir()` en `control/estado_reactivo.js`; las vistas repintan por las claves que cambiaron. Todo el acceso HTTP es `async` vía `DefaultService`. Ningún `innerHTML` fuera de `plantilla.js` (`grep` vacío). | Cambios de estado sin recargar (asistente de citas, filtro de fechas, cambio de rol, "Ver registro"). |
| 8 | Cobertura integral | 0.5 | **Cumple / Riesgo bajo** | `node --test --experimental-test-coverage`: **97.86 % líneas, 91.93 % ramas y 91.97 % funciones** en "all files". El total **incluye** `tests/dobles/*` y `scripts/dev_server.js`. El único JS de `src` que no carga ninguna prueba es `src/js/boundary/theme_init.js`. Funciones bajas: `consulta_procedimiento_service.js` (0 %), `procedimiento_paso_service.js` (0 %) y 7 entidades al 0 % de funciones. | Si corre la cobertura verá un número alto. Si mira por archivo, verá servicios y entidades al 0 % de funciones. |
| 9 | Pruebas significativas | 0.5 | **Cumple** | `npm test`: **616 pruebas, 113 suites, 616 pasan, 0 fallan** (1.8 s). Hay pruebas por HU: `controlador_citas`, `vista_citas`, `vista_login`, `dashboard`, `vista_dashboard`, `controlador_consulta(_acciones)`, `vista_consulta`, `paneles_consulta`. También para la PWA (`sw_logica`, `instalacion`, `conexion`) y el router. Por ejemplo, `controlador_consulta.test.js:16-25` verifica el motivo de cada 409 del retroceso y del cierre. | Pruebas en verde y con nombres de comportamiento. |
| 10 | UI atractiva, coherente y orientada al usuario | 0.5 | **Cumple / Riesgo bajo** | Estilo consistente (tarjetas, estados con color y tema claro/oscuro). Detalles: a 1280 px la etiqueta del paso 2 se corta ("Número de docu…", `citas-1280.png`). El botón "Modo oscuro" usa una letra visiblemente más chica que "Instalar app". En el dashboard, al aparecer el error de rango el formulario se desacomoda ("Buscar" queda arriba de "Hoy", `dashboard-rango.png`). El título "Consultas de hoy" no cambia al filtrar otro rango. | Interfaz limpia, con detalles de pulido visibles. |
| 11 | Hojas de estilo propias: tipografía, color, espaciado | 1 | **Cumple** | Tokens propios en `theme.css` (paleta clara y oscura) y `app.css` (`--fuente` y escala `--espacio-1..8`). Cada componente trae su CSS (`citas.css`, `consultas.css`, `consulta.css`...). Hay `:focus-visible` y `prefers-reduced-motion`. | CSS propio y ordenado. |
| 12 | Responsive | 0.5 | **Cumple** | A 375 px, `scrollWidth == clientWidth` (360/360 por la barra de scroll) en citas, dashboard y consulta. El indicador de pasos pasa a solo números y los filtros y botones se apilan (`dashboard-375.png`, `citas-375-oscuro.png`, `consulta-375.png`). | Sin scroll horizontal y con un diseño de una columna correcto. |
| 13 | Cumplimiento cabal de las 4 HU | 2 | **Riesgo alto** | Ver §2. HU1 y HU2 funcionan, pero el selector de tipo de documento tiene **una sola opción (DUI)**. HU3 **no tiene búsqueda de paciente**, que sí aparece en las imágenes. HU4 asigna **un examen a la vez** (un `<select>` y "Emitir orden"), mientras que la imagen muestra casillas y "Asignar exámenes seleccionados". | Es el observable con más peso (2) y el que más se compara contra las imágenes. |
| 14 | Diseño ergonómico y accesible | 0.5 | **Cumple / Riesgo bajo** | Enlace "Saltar al contenido", `lang="es"`, regiones con nombre, `role=status` y `alert` en errores, `aria-invalid`/`aria-describedby` en campos y foco visible (outline sólido de 3 px). Con teclado, el foco pasa del encabezado del paso al campo. Detalles: todas las tarjetas tienen un botón "Atender" con el mismo nombre accesible (`tarjeta_consulta_dashboard.js:33`); el número de documento no se autoformatea (hay que escribir el guion); el tema guardado en `localStorage` tiene prioridad sobre el del sistema. | Navegable con teclado y lector. Los botones repetidos "Atender" se distinguen solo por contexto. |

## 2. Historias de usuario, frase por frase

### HU1 – Búsqueda de citas (imagen: asistente con Tipo [DUI, Pasaporte, Licencia], Número, Clínica, Desde/Hasta y "BUSCAR CITAS"; cards con fecha, hora, clínica y procedimientos)
| Frase | Estado | Evidencia |
|---|---|---|
| "un asistente que me permita seleccionar el tipo de documento" | **Riesgo** | Asistente de 5 pasos (`<indicador-pasos>`). El `<select>` ofrece solo "DUI": `GET /publico/tipos-documento` devuelve 1 elemento y LEVANTAR §10 dice "Todos los documentos son de tipo DUI". La imagen muestra 3 tipos. |
| "al seleccionarlo me permita ingresar el número de documento" | Cumple | El paso 2 se habilita después del 1 y valida con la expresión regular del tipo ("El número no tiene el formato de DUI…"). |
| "seleccionar la clínica de una lista donde he sido registrado como paciente" | Cumple | Con `00000000-3`, radios "Clínica de demostración" y "Clínica de demostración Norte" (`POST /publico/clinicas`). |
| "seleccionar un rango de fechas" | Cumple | Desde y Hasta, con valores por defecto de hoy −30 a hoy +30. |
| "lista de citas, mostradas como cards … fecha y hora, la clínica, y los procedimientos" | Cumple | "4 citas en Clínica de demostración…": 4 `<tarjeta-cita>` con fecha y hora, clínica y la lista de procedimientos. |
| "descargar un ticket en formato PDF … generado desde el backend" | Cumple | "Descargar ticket" baja `ticket-cita-de110009.pdf` (PDF 1.5, 1 página, con código, fecha, clínica y procedimientos), generado por `POST /publico/citas/{id}/ticket`. |

### HU2 – Login (imagen: "Portal de Empleados", Tipo de documento [DUI, Pasaporte, Licencia de Conducir] y Número)
| Frase | Estado | Evidencia |
|---|---|---|
| "seleccionar un tipo de documento" | **Riesgo** | La misma lista de una sola opción ("DUI"). |
| "escribir mi número de documento para probar mi identidad" | Cumple | Sin contraseña. `00000000-2` entra y lleva a `#/dashboard`. |
| "acceder … de acuerdo a mi rol y clínica" / solo empleados | Cumple | `00000000-3` (paciente) recibe el alert "No reconocemos ese documento como personal activo de una clínica." |

### HU3 – Dashboard (imágenes: "Selección de Contexto" con Clínica + Rol y "Cargar Consultas"; "Filtra: Buscar Paciente…" y "Rango de Fechas: Hoy \| Pasado \| Futuro"; cards con generales, pasos con quién y hora, "Ver Registro" y "Atender Consulta"; panel 4 "Búsqueda Global de Pacientes")
| Frase | Estado | Evidencia |
|---|---|---|
| "seleccionar uno de mis roles en alguna de las clínicas" | Cumple | Radios agrupados por clínica y "Usar este rol". Cambié a "Doctor · Clínica de demostración Norte" y la barra y la lista se actualizaron ("1 consulta del 13 nov 2026"). |
| "muestre las consultas … para el día de hoy" | Cumple | Por defecto, Desde = Hasta = hoy: "2 consultas del 13 nov 2026". |
| "filtrar por fechas y buscar consultas pasadas o futuras" | Cumple / Riesgo bajo | 21 oct – 20 nov devolvió 4 (pasada cerrada, 2 de hoy y una futura). Un rango mayor a 31 días da error ("Elige un rango de 31 días como máximo", el mismo límite en `DashboardService.java:26`). No hay atajos "Pasado/Futuro". |
| (imagen) "Buscar Paciente…" / "Búsqueda Global de Pacientes" | **No cumple frente a la imagen** | No hay ningún campo para buscar paciente. `GET /atencion/dashboard` solo acepta `desde` y `hasta` (`AtencionResource.java:78`). Además, los datos demo tienen un solo paciente, así que aun con el filtro no se vería su efecto. |
| "generales del paciente" | Cumple | Nombre, edad, fecha de nacimiento y DUI. |
| "fecha de inicio de la consulta" | Cumple | "Inicio 13 nov 2026, 8:00 a. m." |
| "pasos realizados previamente mostrados de manera jerárquica, quién … la fecha" | Cumple | Lista anidada (Evaluación médica dentro de Toma de signos vitales), con responsable y "8:05 – 8:15". |
| "opción para ver qué se registró en dicho paso" | Cumple | "Ver registro" muestra "Demostración: PA 120/80, FC 72, T 36.6 °C · Registrado el 13 nov 2026, 8:15", y el botón cambia a "Ocultar registro" con `aria-expanded`. |
| "seleccionar una consulta para poder atenderla" | Cumple / **Riesgo de flujo** | "Atender" lleva a `#/consulta/:id`. Al volver y atender **otra** consulta: "Tienes otra consulta en curso. Ciérrala antes de atender esta." (409 `consulta.cerrarAntesRetomar`). Con una consulta abierta en la sesión, cambiar de rol da "Cierre la consulta antes de cambiar de médico o rol." (409, `AtencionSesion.java:24`). Solo se libera cerrando la consulta o la sesión. |

### HU4 – Consulta (imagen: generales; pasos "Triaje ✓ \| Consulta Médica (Actual) \| Tratamiento \| Cierre"; notas; "Lista de Exámenes Asignables" con filtro por categoría, casillas y "Asignar Exámenes Seleccionados"; "Anterior" y "Guardar y Avanzar"; "Finalizar Consulta")
| Frase | Estado | Evidencia |
|---|---|---|
| "habiendo seleccionado una consulta … desde mi dashboard" | Cumple | Generales, inicio, estado y "Recorrido de la consulta" jerárquico con el paso actual resaltado. |
| "registrando la atención brindada" | Requiere prueba manual | Textarea "Atención brindada" ("Se guarda al completar el paso"). No se guardó. |
| "exámenes administrados de la lista de los que pueden asignarse" | **Riesgo** | La lista viene de `GET …/examenes-asignables` (Examen general de orina, Glucosa en ayunas, Hemograma completo, como dice LEVANTAR §10). Pero es un `<select>` de **un solo** examen con "Emitir orden" (`panel_examenes_paso.js:22,29`), sin casillas ni filtro por categoría. La imagen muestra selección múltiple. Emitir la orden **requiere prueba manual**. |
| "avanzar al siguiente paso si no fuera el último" | Requiere prueba manual | Botón "Avanzar" presente. No se pulsó. |
| "retroceder al anterior si no fuera el primer paso" | Cumple en lo visible; la acción requiere prueba manual | En el paso 2 (consulta `…-2`) aparece "Retroceder al paso anterior". En el paso 1 (consulta `…-7`) solo aparece "Avanzar". |
| Cierre ("Finalizar Consulta" en la imagen) | Requiere prueba manual | Existe `<panel-cierre-consulta>`; solo se ve en el último paso. |

## 3. Problemas ordenados por riesgo en la revisión secuencial

El orden sigue la revisión real: lo que impide empezar, después los observables en el orden de la rúbrica y, dentro de las HU, lo más visible contra las imágenes.

1. **No hay instrucciones de arranque en el repo del frontend** (antes del observable 1).
   El revisor clona ChivoMed y no encuentra cómo levantar backend, base y demo, ni qué documentos usar.
   *Corrección:* agregar `README.md` con requisitos (Node 22, backend en 9080, puerto 3000 obligatorio), `npm start`, un enlace a `galenasv/docs/LEVANTAR.md`, la tabla de DUIs demo y el paso `reiniciar-demo.sh` el día de la revisión. **Frontend** (documentación).

2. **El estado demo cambia con las pruebas manuales** (afecta a HU3 y HU4).
   Durante la auditoría, otra persona dejó la consulta `…-5` (Norte, hoy) "Cerrada el 13 nov 2026, 5:36 p. m." y la `…-7` con el paso 1 "En curso" desde las 10:35. Si el revisor llega con la demo así, el dashboard de Norte no tiene nada que atender y la HU4 no se puede mostrar desde el inicio.
   *Corrección:* correr `bash scripts/reiniciar-demo.sh` el mismo día y justo antes de la revisión, y no probar escrituras después. **Datos demo**.

3. **Offline tras recargar: las vistas de empleado muestran "Sin conexión"** (observable 3, el primero de la rúbrica que puede fallar).
   La prueba habitual es "Offline" en DevTools más F5. El shell carga, pero el dashboard y la consulta no tienen datos, porque se decidió guardarlos solo en memoria.
   *Corrección (a decidir por el equipo):* (a) guardar en IndexedDB una copia mínima de la última carga del dashboard y de la consulta abierta, borrarla al cerrar sesión, y que el banner indique que son datos guardados; o (b) mantener la decisión, documentarla en el README y preparar la demo offline **sin recargar** (en esa prueba funcionó). La opción (b) depende de que el revisor no recargue. **Frontend**.

4. **El selector de tipo de documento tiene una sola opción** (HU1 y HU2, observable 13).
   La HU dice "seleccionar el tipo de documento" y las dos imágenes muestran DUI, Pasaporte y Licencia. Con una sola opción, el selector parece decorativo.
   *Corrección:* agregar al catálogo demo al menos Pasaporte y Licencia de conducir, con su expresión regular, y un documento de otro tipo para algún empleado o paciente demo (por ejemplo, un pasaporte del paciente) para demostrar que el tipo importa. El frontend ya lee el catálogo y valida con `expresionRegular`, así que no requiere cambios. **Datos demo** (y LEVANTAR §10 en el backend).

5. **El dashboard no permite buscar un paciente** (HU3).
   La imagen de la HU3 muestra "Filtra: Buscar Paciente…" y el panel 4 "Búsqueda Global de Pacientes". El texto no lo pide de forma explícita, pero el revisor compara con la imagen.
   *Corrección:* agregar al dashboard un campo "Buscar paciente" que filtre en el cliente las consultas ya cargadas por nombre o documento (sin endpoint nuevo ni N+1), como estado del controlador. Si se quiere la búsqueda global por tipo y número de documento de la imagen, hace falta un endpoint en el backend (no existe; `AtencionResource.dashboard` solo recibe `desde` y `hasta`). Para que el filtro se note, hace falta un segundo paciente demo. **Frontend** (filtro local), **backend** (búsqueda global, opcional) y **datos demo** (segundo paciente).

6. **Los exámenes se asignan de uno en uno** (HU4).
   La imagen muestra casillas, un filtro por categoría y "Asignar Exámenes Seleccionados". La app tiene un `<select>` y "Emitir orden".
   *Corrección:* cambiar `<panel-examenes-paso>` a una lista de casillas con "Asignar exámenes seleccionados" que emita las órdenes una tras otra con `Promise.all` o en serie, informando éxitos y fallos por examen (el backend recibe una orden por petición). El filtro por categoría puede usar `idTipoExamen` si `examenes-asignables` lo devuelve; si no, hay que pedirlo en el **backend**. **Frontend** (y backend para la categoría).

7. **Una consulta abierta bloquea abrir otra y cambiar de rol** (HU3 y HU4, flujo).
   Si el revisor pulsa "Atender" en una consulta, vuelve y pulsa "Atender" en otra, o intenta cambiar de rol, recibe un 409. Solo se libera cerrando la consulta o la sesión. Es una regla del backend, pero se ve como un bloqueo.
   *Corrección:* en el dashboard, marcar la consulta "en curso" y ofrecer "Ir a la consulta en curso" junto al selector de rol (el mensaje ya existe en la vista de consulta). Opcionalmente, un endpoint para liberar la consulta de la sesión sin cerrarla. Incluir el orden de la demo en el README. **Frontend** (indicación) y **backend** (liberar, opcional).

8. **Detalles de UI visibles** (observable 10).
   La etiqueta del paso 2 se corta a 1280 px ("Número de docu…"). El formulario de fechas se desacomoda con el mensaje de error. "Consultas de hoy" no cambia al filtrar otro rango. El botón "Modo oscuro" usa una letra más chica que "Instalar app".
   *Corrección:* acortar la etiqueta ("Número") o permitir dos líneas; reservar el espacio del error o alinear las acciones con `align-self: end`; que el título refleje el rango ("Consultas del 21 oct al 20 nov"); igualar la tipografía de `<theme-toggle>`. **Frontend**.

9. **Accesibilidad y ergonomía menores** (observable 14).
   Hay varios botones "Atender" con el mismo nombre accesible. El DUI no se autoformatea (sin el guion, falla la validación). El tema guardado en `localStorage` ignora el cambio de tema del sistema.
   *Corrección:* `aria-label="Atender a {paciente}, {hora}"` o `aria-labelledby` con el encabezado de la tarjeta; insertar el guion al escribir el 9.º carácter cuando el tipo es DUI (`formato_documento.js` ya existe); opcionalmente, escuchar `matchMedia(...).change` cuando no haya preferencia explícita. **Frontend**.

10. **Cobertura con código casi sin usar** (observables 5 y 8).
    `theme_init.js` no lo carga ninguna prueba. Varios servicios y entidades CRUD (`consulta_procedimiento_service.js`, `procedimiento_paso_service.js`, entidades `consulta.js`, `examen.js`...) tienen 0 % de funciones. El total de cobertura incluye `tests/dobles`.
    *Corrección:* quitar del flujo los servicios y entidades que ninguna HU usa (y sacarlos de `PRECACHE`), o probarlos; agregar una prueba de `theme_init.js`; medir la cobertura solo sobre `src`. **Frontend**.

11. **Errores rojos en la consola** (impresión del revisor).
    Al cargar sin sesión, el navegador registra `401 … /auth/me`, y los 409 esperados aparecen como `Failed to load resource`. No hay excepciones de JS.
    *Corrección:* ninguna obligatoria (son respuestas HTTP que registra el navegador); conviene explicarlo en el README. **Frontend** (documentación).

## 4. Requiere prueba manual (escrituras no ejecutadas)

- Completar la instalación desde "Instalar app" y abrir la app instalada (standalone).
- HU4: guardar "Atención brindada" y avanzar; retroceder desde el paso 2 (y los 409 "con registros" o "primer paso"); emitir una orden de examen; cerrar la consulta en el último paso.
- Después de esas pruebas, correr `reiniciar-demo.sh` antes de la revisión.

## 5. Comandos ejecutados (salida real)

- `npm test` → `tests 616 · suites 113 · pass 616 · fail 0`.
- `node --test --experimental-test-coverage tests/*.test.js` → `all files | 97.86 | 91.93 | 91.97`.
- `cat package-lock.json` → solo `packages[""]`, sin dependencias.
- `grep -rnE "https?://" src | grep -v w3.org/2000/svg` → solo `auth_service.js:61` (texto de un mensaje).
- `curl http://localhost:3000/galenosv/api/publico/tipos-documento` → 1 elemento (`DUI`).
