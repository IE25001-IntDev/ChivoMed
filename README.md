# ChivoMed

Frontend de **GalenoSV**: una PWA de una sola página (SPA) hecha solo con JavaScript nativo
(ES Modules) y Web Components con Shadow DOM. No usa frameworks, librerías, bundler ni
dependencias de npm. Consume el API REST del backend Jakarta EE
`galenasv` (repositorio aparte, que se clona junto a este como `../galenasv`), cuyo contexto web es `/galenosv`.

## Requisitos

- **Node.js 22.5** o superior (solo para el servidor de desarrollo y las pruebas).
- El **backend GalenoSV** corriendo en `http://localhost:9080/galenosv`, con PostgreSQL y los
  datos demo cargados. Cómo levantarlo desde cero: `../galenasv/docs/LEVANTAR.md`.
- El frontend debe correr en el **puerto 3000**. El backend rechaza con `403 auth.origen` las
  escrituras (incluido el login) que vengan de otro origen. No cambies `PORT`.

## Arranque

```bash
npm start          # http://localhost:3000 (sirve src/ y hace de proxy de /galenosv/api)
npm test           # primero unidad/componentes; después integración del frontend
npm run test:unit
npm run test:integration
npm run cobertura  # pruebas con cobertura, medida solo sobre src/
```

Las pruebas usan Node nativo y datos sintéticos: no requieren arrancar GalenoSV, ejecutar
migraciones ni tocar PostgreSQL. Las de integración abren servidores HTTP locales en puertos
efímeros. La matriz por historia de usuario, los resultados y los límites están en
[docs/pruebas.md](docs/pruebas.md).

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

- **HU1, búsqueda de citas** (`#/citas`, sin sesión). Los campos se desbloquean en orden:
  - el número se activa al elegir el tipo y tiene una máscara sacada de la expresión regular del
    tipo: en el DUI no entran letras y el guion se pone solo; en el Pasaporte la minúscula pasa a
    mayúscula; no se puede escribir más allá del largo, y lo pegado se limpia igual;
  - la clínica se activa cuando el número está completo y es válido (ahí se piden sus clínicas);
    las fechas, al elegir clínica; "Buscar citas", cuando todo es válido. Un texto junto al botón
    dice qué falta;
  - cambiar el tipo, el número o la clínica vacía lo que sigue (las fechas vuelven a hoy −30/+30).

  Los errores salen en un solo recuadro arriba del formulario y el campo con error queda marcado.
  Un documento sin clínicas como paciente (por ejemplo, `12345678-9`) muestra "No encontramos
  ese documento registrado como paciente.". El resultado son tarjetas con fecha, hora, clínica y
  procedimientos; "Descargar ticket" baja el PDF que genera el backend.
- **HU2, login** (`#/login`). Entra cualquier empleado, es decir, cualquier rol activo excepto
  Paciente. Ana y Pedro son rechazados.
- **HU3, dashboard** (`#/dashboard`).
  - Con Carlos: elige rol y clínica ("Doctor · Clínica San Salvador" y vuelve a Santa Ana).
  - Por defecto se ven las consultas de hoy; se puede filtrar otro rango de fechas (31 días
    como máximo). El título de la lista refleja el rango ("Consultas de hoy", "Consultas del … al
    …"). "Buscar paciente" filtra por nombre o número de documento las consultas ya cargadas.
  - Cada tarjeta muestra los generales del paciente, el inicio y los pasos en jerarquía, con
    quién y cuándo. "Ver registro" muestra lo registrado en un paso.
  - "Atender" se habilita solo en consultas de hoy o pasadas con un paso pendiente para tu rol.
    Las futuras se muestran como citas, con la acción bloqueada hasta el día programado; en las
    demás, la tarjeta dice a quién le corresponde.
- **HU4, consulta** (`#/consulta/:id`). Cada paso lo atiende su rol responsable:
  1. **Lucía** atiende el Triaje de SA-5: registra la atención y pulsa "Avanzar".
  2. **Carlos** atiende la Consulta médica de SA-3: registra la atención, ordena exámenes de la
     lista de asignables y avanza. "Retroceder al paso anterior" aparece cuando el paso no es el
     primero.
  3. **Marta** completa la Entrega de indicaciones de SA-6 y cierra la consulta. Solo cierra
     quien completó el paso final.

  Una consulta en la que no te toca ningún paso se abre en solo lectura y muestra el motivo.

## Modo sin conexión

1. Con red, haz una búsqueda de citas (HU1) o entra con una cuenta de empleado y abre el
   dashboard.
2. En DevTools → Network, marca **Offline** y recarga (F5).
3. El shell se carga desde el service worker.
   - En `#/citas` se ve la última búsqueda con "Sin conexión. Mostrando la búsqueda de las
     HH:MM"; no se puede buscar ni descargar el ticket.
   - El dashboard y la última consulta abierta se ven en **solo lectura**, con el aviso "Sin
     conexión. Mostrando … guardadas a las HH:MM". Las consultas de hoy que te tocan ofrecen
     **"Ver sin conexión"** y se abren en solo lectura. Las acciones que escriben se deshabilitan
     con su motivo.
4. Al volver la red, la sesión se verifica de nuevo y los datos se actualizan solos.

**Caché de archivos.** Cada vez que la app arranca con red, el service worker descarga de nuevo
todos los archivos del shell y el catálogo de tipos de documento en un caché nuevo. Solo cuando
la copia está completa cambia a ella y borra las anteriores; si la descarga falla a medias, se
queda con la anterior. Sin red no se borra nada. En DevTools → Application → Cache Storage
queda un solo juego `chivomed-*` más `chivomed-vigente`.

**Datos en IndexedDB.**
- Empleado: la sesión verificada (sin token), el último dashboard, la consulta abierta y las
  consultas de hoy que le tocan al rol activo. Se guardan al ingresar y al cambiar de rol.
  Caducan a las 8 horas y se borran al cerrar sesión o al entrar con otra cuenta.
- Paciente (HU1): la última búsqueda con éxito (tipo, número, clínica, rango y resultados).
  Caduca a las 8 horas, se borra con "Limpiar búsqueda" y cuando entra un empleado.

## Instalación

El botón **"Instalar app"** de la cabecera aparece cuando el navegador lo permite. Además, al
pulsar "Buscar citas" o "Ingresar" con datos válidos, la app ofrece instalarse una sola vez por
sesión. No lo vuelve a ofrecer si ya está instalada, si el navegador no lo permite o si se
rechazó en esa sesión. La búsqueda y el login siguen igual aunque se rechace.

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
- `tests/`: pruebas de unidad y componentes con `node --test`, con un DOM mínimo propio (`tests/dobles/`).
- `tests/integracion/`: servicios, autenticación, controladores y proxy HTTP del frontend conectados entre sí.
