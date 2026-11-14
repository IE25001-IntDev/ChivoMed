# HU1: prueba de punta a punta contra el backend real

- **Fecha:** 2026-11-13, entre las 16:40 y las 16:45 (hora de El Salvador).
- **Frontend:** rama `spa` en `36ec0d6`, servido en `http://localhost:3000`, que hace de proxy hacia Liberty en `:9080`. El service worker servía `VERSION = "2026-11-13.10"`.
- **Backend:** `../galenasv` en `8792f9d`.
- **Documento:** DUI 00000000-3, el paciente de la demo. Para el caso neutro se usó un DUI inventado, 12345678-9.
- **Navegador:** Chromium, manejado con Playwright, a 1280 px y a 375 px de ancho.
- **Consumo del límite:** 10 POST públicos en total (2 `clinicas`, 4 `citas`, 1 `ticket`, 1 `clinicas` del caso neutro y 2 de la revisión visual), contra 60 permitidos cada 5 minutos. No se modificó ningún dato.

## Contrato verificado antes de probar

- `PublicoResource`, `CitaPublicaService`, `CitaPublicaRepository`, `IntentosAcceso` y `ApiExceptionMapper` coinciden con el plan: las tres rutas son POST, el número se compara con `strip()`, el 429 trae `Retry-After: 300` y el ticket sale como `ticket-cita-<8>.pdf`.
- **D1 y D2 ya están documentados.** `api-rest.md`, actualizado en `8792f9d`, documenta ahora `DAYS.between(desde, hasta) > 366` y el `400 validacion.invalida` con `details`. Documentación y código ya no se contradicen.
- `FormatoExpresion.coincide` solo se usa en el registro de personas; las rutas públicas no aplican la `expresionRegular`. En la HU1, la validación del formato es solo ayuda para el usuario y el backend no la exige.

## Resultado por paso

| # | Paso | Peticiones | Resultado |
|---|------|-----------|-----------|
| 1 | Abrir `#/citas` | `GET publico/tipos-documento` 200 | Bien. Aparecen el tipo DUI y sus indicaciones. |
| 2 | Tipo DUI y número 00000000-3; "Siguiente" | `POST publico/clinicas` 200 | Bien. Aparecen las **2 clínicas**: "Clínica de demostración" y "Clínica de demostración Norte". Ninguna viene preseleccionada porque son dos. El foco va a "Clínica" y se anuncia "Paso 3 de 5: Clínica". |
| 3 | Fechas por defecto | Ninguna | Bien. Van del 2026-10-14 al 2026-12-13, es decir, de hoy − 30 a hoy + 30. |
| 4 | Buscar en la Clínica de demostración | `POST publico/citas` 200 | Bien. Salen **4 citas**: 24 oct 9:00 (pasada), 13 nov 8:00 y 10:30 (hoy) y 20 nov 10:00 (futura). Cada card muestra la clínica y "Consulta general de demostración". |
| 5 | Atrás hasta la clínica, elegir Norte y buscar | `POST publico/citas` 200 | Bien. Salen **3 citas**: 1 nov 14:00, 13 nov 11:00 y 16 nov 15:30. Las clínicas no se volvieron a pedir. |
| 6 | Descargar el ticket de la primera card (1 nov, Norte) | `POST publico/citas/de110009-…-000000000004/ticket` 200 `application/pdf` | Bien. Se descargó `ticket-cita-de110009.pdf`; `file` lo reconoce como PDF 1.5 de 1 página. Al abrirlo con `pdftotext` dice: "GalenoSV · Ticket de cita · Código de cita: de110009-0000-4000-8000-000000000004 · Fecha y hora: 01/11/2026 14:00 (hora de El Salvador) · Clínica: Clínica de demostración Norte · Procedimientos: Consulta general de demostración". La card muestra "Ticket descargado." y el botón se llama "Descargar ticket de la cita del 1 nov 2026, 2:00 p. m.". |
| 7 | Ir y volver: indicador → Fechas, cambiar a 2026-11-10 / 2026-11-20, indicador → Tipo, y avanzar con "Siguiente" hasta buscar | Solo `POST publico/citas` 200 | Bien. Al volver estaban el tipo DUI, el número 00000000-3, la clínica Norte marcada y las fechas nuevas. Cambiar las fechas invalidó solo los resultados (el paso 5 dejó de estar disponible) y sí se pidieron las citas otra vez, pero no las clínicas. Resultado: 2 citas, del 10 al 20 nov. |
| 8 | "Nueva búsqueda" | Ninguna | Bien. Vuelve al paso 1 con el tipo y el número vacíos y sin cards. |
| 9 | Caso neutro: DUI 12345678-9 | `POST publico/clinicas` 200 `[]` | Bien. Aparece "No encontramos clínicas para esa búsqueda. Revisa el tipo y el número de documento." y "Siguiente" queda deshabilitado. No se dice si el documento existe. |
| 10 | Número con formato inválido (`1234`) | Ninguna | Bien. Aparece "El número no tiene el formato de DUI. Ocho dígitos, guion y dígito verificador. Ejemplo: 00000000-0", con `aria-invalid="true"` y el foco en el campo. |
| 11 | Salir a `#/login` y volver a `#/citas` | Ninguna de citas | Bien. Los resultados siguen ahí, porque se guardan en la memoria RAM. |

## Privacidad del número

- **URL:** `location.href` fue `http://localhost:3000/#/citas` en todos los pasos.
- **Historial:** `history.length` se quedó en 2 durante todo el asistente, así que los pasos no crean entradas.
- **Almacenamiento:** `localStorage` y `sessionStorage` quedaron vacíos (`{}`).
- **Dónde viaja:** el número solo va en el cuerpo de los POST. Las rutas fueron `publico/clinicas`, `publico/citas` y `publico/citas/{idConsulta}/ticket`.
- **Cabeceras:** no se envió `X-CSRF-Token` ni se llamó a `auth/me` durante la búsqueda.
- El campo del número lleva `autocomplete="off"`.
- El `Origin` no aparece en las cabeceras que Playwright expone para la petición, porque lo agrega el navegador. Que el backend respondiera 200 a los POST confirma que lo aceptó; con un origen no permitido habría dado 403 `auth.origen`.

## Diseño adaptable

- A 1280 px, el indicador muestra los cinco pasos con su nombre y las cards se acomodan en 3 columnas.
- A 375 px no hay scroll horizontal (`scrollWidth` = 375).
- **Fallo F1, corregido en `36ec0d6`:** a 375 px, el nombre del paso actual se cortaba ("Tipo de do…"). Ahora, en pantallas angostas, el indicador muestra solo los números. El `<h2>` del paso dice su nombre y cada botón conserva su `aria-label` completo.

## Consola

No hubo errores de la app. Las únicas entradas de esta prueba fueron:

- un 401 de `auth/me` al pasar por `#/login` sin sesión (esperado);
- el aviso informativo "Banner not shown" de la instalación de la PWA.

## No probado contra el backend real

- **El 429:** provocarlo habría gastado las 60 solicitudes de la IP. Está cubierto con dobles en `tests/controlador_citas.test.js` (la hora de desbloqueo y el desbloqueo) y en `tests/citas_publicas_service.test.js` (`Retry-After`).
- **El modo sin red en el navegador:** está cubierto en `tests/controlador_citas.test.js` y `tests/vista_citas.test.js` (los resultados se restauran desde la memoria con "Sin conexión. Mostrando la búsqueda de las HH:MM." y las acciones que hacen POST quedan deshabilitadas).

## Pruebas de unidad

`npm test`: 558 pruebas, 558 pasan y 0 fallan, sobre `36ec0d6`.
