# ChivoMed

Frontend de **GalenoSV**: una PWA de una sola página (SPA) hecha solo con JavaScript nativo
(ES Modules) y Web Components con Shadow DOM. No usa frameworks, librerías, bundler ni
dependencias de npm. Consume el API REST del backend Jakarta EE
`galenasv` (repositorio aparte, que se clona junto a este como `../galenasv`), cuyo contexto web es `/galenosv`.

## Requisitos

- **Node.js 22** o superior (solo para el servidor de desarrollo y las pruebas).
- El **backend GalenoSV** corriendo en `http://localhost:9080/galenosv`, con PostgreSQL y los
  datos demo cargados. Cómo levantarlo desde cero: `../galenasv/docs/LEVANTAR.md`.
- El frontend debe correr en el **puerto 3000**. El backend rechaza con `403 auth.origen` las
  escrituras (incluido el login) que vengan de otro origen. No cambies `PORT`.

## Arranque

```bash
npm start          # http://localhost:3000 (sirve src/ y hace de proxy de /galenosv/api)
npm test           # pruebas de unidad (node --test)
```

`npm start` funciona sin `.env`. Por defecto el proxy apunta a
`http://localhost:9080/galenosv/api`. Para otro backend, crea `.env` con `API_URL=…`.
Todo el tráfico al API pasa por el proxy del puerto 3000, porque el backend no implementa CORS.

Abre `http://localhost:3000`. La ruta inicial es la búsqueda pública de citas (`#/citas`). El
personal entra por **"Acceso del personal"** (`#/login`).

### El día de la revisión

En el repositorio del backend, justo antes de revisar:

```bash
bash scripts/reiniciar-demo.sh
```

Devuelve las 11 consultas demo a su estado inicial y ancla las fechas a hoy. Las pruebas
manuales escriben en la base: completan pasos, emiten órdenes y cierran consultas.

## Cuentas demo

Todos los datos son inventados (`../galenasv/docs/datos-demo-rubrica.md`). El login es solo
con tipo y número de documento, sin contraseña.

| Documento | Persona | Para qué sirve |
|---|---|---|
| DUI `01000004-4` o Pasaporte `B10000004` | Ana Martínez (paciente) | **HU1**: 2 clínicas; citas pasadas, de hoy y futuras. En el login se rechaza (no es empleada). |
| DUI `01000001-1` o Pasaporte `A10000001` | Carlos Gómez (Doctor en Santa Ana y San Salvador) | **HU2, HU3 y HU4**: selector con 2 clínicas; atiende la Consulta médica de SA-3 y SS-2. |
| DUI `01000002-2` | Lucía Pérez (Enfermera, Santa Ana) | HU3 y HU4: atiende el Triaje de SA-4 y SA-5. |
| DUI `01000003-3` | Marta López (Atención al público, 2 clínicas) | HU3 y HU4: atiende el último paso de SA-6 y cierra la consulta. |
| DUI `01000005-5` | Pedro Hernández (sin rol) | HU2: rechazado. |
| `12345678-9` | nadie | HU1 y HU2: mensaje neutro. |

En la HU1 y la HU2, el selector de tipo de documento muestra los tipos activos: DUI y Pasaporte.

## Recorrido por historia de usuario

- **HU1, búsqueda de citas** (`#/citas`, sin sesión). Es un asistente de 5 pasos:
  tipo de documento, número (Ana), clínica, rango de fechas y resultado. Muestra las citas como
  tarjetas con fecha, hora, clínica y procedimientos. "Descargar ticket" baja el PDF que genera
  el backend.
- **HU2, login** (`#/login`). Entra cualquier empleado, es decir, cualquier rol activo excepto
  Paciente. Ana y Pedro son rechazados.
- **HU3, dashboard** (`#/dashboard`).
  - Con Carlos: elige rol y clínica ("Doctor · Clínica San Salvador" y vuelve a Santa Ana).
  - Por defecto se ven las consultas de hoy; se puede filtrar otro rango de fechas (31 días
    como máximo).
  - Cada tarjeta muestra los generales del paciente, el inicio y los pasos en jerarquía, con
    quién y cuándo. "Ver registro" muestra lo registrado en un paso.
  - "Atender" se habilita solo en las consultas con un paso pendiente para tu rol. En las demás,
    la tarjeta dice a quién le corresponde.
- **HU4, consulta** (`#/consulta/:id`). Cada paso lo atiende su rol responsable:
  1. **Lucía** atiende el Triaje de SA-5: registra la atención y pulsa "Avanzar".
  2. **Carlos** atiende la Consulta médica de SA-3: registra la atención, ordena exámenes de la
     lista de asignables y avanza. "Retroceder al paso anterior" aparece cuando el paso no es el
     primero.
  3. **Marta** completa la Entrega de indicaciones de SA-6 y cierra la consulta. Solo cierra
     quien completó el paso final.

  Una consulta en la que no te toca ningún paso se abre en solo lectura y muestra el motivo.

## Modo sin conexión

1. Con red, entra con una cuenta de empleado y abre el dashboard. Si quieres probar también la
   HU4 sin red, abre una consulta.
2. En DevTools → Network, marca **Offline** y recarga (F5).
3. El shell se carga desde el service worker. El dashboard y la última consulta abierta se ven
   en **solo lectura**, con el aviso "Sin conexión. Mostrando … guardadas a las HH:MM". Las
   acciones que escriben se deshabilitan con su motivo.
4. Al volver la red, la sesión se verifica de nuevo y los datos se actualizan solos.

La copia sin conexión vive en IndexedDB. Guarda solo la sesión verificada (sin token), el
último dashboard y la consulta abierta. Caduca a las 8 horas y se borra al cerrar sesión o al
entrar con otra cuenta. La búsqueda pública de citas (HU1) no se guarda en disco: sin red
muestra solo la última búsqueda hecha mientras la página sigue abierta.

## Qué es normal ver en la consola del navegador

- Al cargar sin sesión, `GET …/auth/me` responde **401**: así se sabe que no hay sesión.
- Los rechazos esperados del flujo, como un **409** al retroceder un paso con registros o un
  **403** por rol, el navegador los registra como `Failed to load resource`. La app los muestra
  como mensajes. No son excepciones de JavaScript.

## Estructura

Sigue el patrón BCE (Boundary-Control-Entity), igual que el backend:

- `src/index.html`: solo contiene `<app-shell>`. El router por hash monta una vista por ruta.
- `src/js/boundary/`: router, vistas con su controlador sin DOM (`vistas/`), Web Components
  (`components/`) y la PWA (`pwa/`: service worker, instalación y conexión).
- `src/js/control/`: servicios HTTP (`DefaultService`), autenticación y estado reactivo.
- `src/js/entities/`: modelos de los DTOs.
- `tests/`: pruebas de unidad con `node --test`, con un DOM mínimo propio (`tests/dobles/`).
