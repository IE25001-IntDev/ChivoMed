# HU4: prueba de punta a punta contra el backend real

- **Fecha:** 2026-11-13, entre las 12:01 y las 12:10 (hora de El Salvador).
- **Frontend:** rama `spa`, `npm start` en `http://localhost:3000`, que hace de proxy hacia Liberty en `:9080`.
- **Backend:** `../galenasv` en `aea1d2f` (B6), con la demo recién reiniciada.
- **Usuario:** DUI 00000000-2 ("Doctor Demostración"), con los roles Doctor y Administración en la Clínica de demostración.
- **Navegador:** Chromium, manejado con Playwright.

## Contrato verificado antes de probar

- `GET /api/atencion/consultas/{id}` devuelve un solo objeto con la misma forma que un elemento del dashboard. Si la consulta no existe o es de otra clínica, responde 404 `consulta.noExiste`. Esto coincide con lo que se programó (decisión 1 del plan).
- `POST …/ordenes-examen` acepta `idExamen`, e `indicaciones` ya no es obligatorio.
- Las acciones admiten un cuerpo vacío aunque lleguen con `Content-Type: application/json` (`8477070`). El frontend ya no envía ese encabezado sin cuerpo (`5abd197`). En la prueba, `…/sesion` y `…/retroceso` salieron sin él.

## Resultado por paso

| # | Paso | Peticiones | Resultado |
|---|------|-----------|-----------|
| 1 | Login y dashboard | `auth/login` 204, `dashboard` 200, `asignaciones` 200 | Bien. Aparece 1 consulta de hoy, con "Pendiente para ti". |
| 2 | "Atender" | `PUT consultas/{id}/sesion` 200, `GET atencion/consultas/{id}` 200, y del paso `GET` paso, órdenes, asignables y definición (200) | **Falló y se corrigió (F1).** Tras la corrección: muestra paciente, recorrido con el paso actual marcado, paso actual y exámenes; el cierre queda oculto. |
| 3 | Exámenes asignables | `GET …/examenes-asignables` 200 | Bien. Aparecen los nombres: Examen general de orina, Glucosa en ayunas y Hemograma completo. |
| 4 | Escribir el valor y emitir una orden (Glucosa en ayunas, con indicaciones) | `POST …/ordenes-examen` 201 y `GET …/ordenes-examen` 200 | Bien. La orden aparece con el nombre del examen, la fecha y las indicaciones. |
| 5 | Intentar retroceder | Ninguna | Bien. "Retroceder" queda deshabilitado con el motivo "Este paso ya tiene órdenes de examen; no se puede retroceder." (ver la nota N1). |
| 6 | Avanzar | `PUT …/finalizacion` 200 y recarga de la consulta y del paso nuevo | Bien. Evaluación médica pasa a Completado y el paso actual es "Indicaciones y cierre", con el botón "Completar paso" porque `indicaFin` es true. |
| 7 | Retroceder el paso nuevo, que está vacío | `PUT …/retroceso` 200, sin `Content-Type` | Bien. Se reabre Evaluación médica con el valor precargado y el aviso de paso reabierto, la orden sigue listada y el foco va al título del paso. |
| 8 | Recargar la página a mitad del flujo | `PUT …/sesion` 200 y la misma carga del paso 2 | Bien. La consulta se retoma en el mismo paso, con el valor guardado y la orden. |
| 9 | Avanzar y completar el último paso | `PUT …/finalizacion` 200, dos veces | Bien. No quedan pasos pendientes: el panel del paso dice "No quedan pasos pendientes…", los exámenes se ocultan y aparece "Cerrar consulta". |
| 10 | Cerrar con observaciones y confirmar | `PUT consultas/{id}/cierre` 200 | Bien. Aparecen el aviso "Consulta cerrada." (con el foco), el bloqueo "Esta consulta ya está cerrada." y el estado "Cerrada el …"; los tres paneles quedan ocultos. |
| 11 | Recargar la consulta cerrada | `PUT …/sesion` 409 `consulta.yaCerrada` y `GET` 200 | Bien. La vista queda en solo lectura, sin mostrar error. |
| 12 | Cambiar al rol ADMINISTRACION y volver al dashboard | `PUT atencion/rol-activo` 200 | Bien. "Atender" queda deshabilitado con "Solo el rol Doctor puede atender consultas.", motivo que se evalúa antes que el de "cerrada". |
| 13 | Abrir `#/consulta/{id}` con ADMINISTRACION | Solo `GET atencion/consultas/{id}` 200 | Bien. No hay `PUT …/sesion` ni peticiones del paso, y el bloqueo dice "Solo el rol Doctor puede atender consultas." |

**Consola, en cada paso:** no hubo errores de la app. Las únicas entradas fueron estas, todas esperadas:

- un 401 de `auth/me` antes de iniciar sesión;
- el 409 `consulta.yaCerrada` del paso 11, que el navegador registra ante cualquier respuesta 4xx;
- el aviso informativo "Banner not shown" de la instalación de la PWA.

## Fallo encontrado

### F1: los paneles ocultos se veían (corregido en `cb983e0`)

- **Síntoma:** al abrir la consulta aparecía "Cerrar consulta" aunque el paso "Evaluación médica" seguía en PENDIENTE.
- **Diagnóstico:**
  1. La respuesta de la B6 era correcta: el paso venía con `"estado": "PENDIENTE"`.
  2. En el navegador, `panel-cierre-consulta` tenía `hidden = true`, pero su `display` calculado era `block`.
  3. La causa es `:host { display: block; }` en `src/resources/vistas.css`. Como regla de autor, gana a la regla `[hidden] { display: none }` del navegador. La regla `[hidden] … !important` del mismo archivo solo alcanza a los elementos dentro del shadow, no al host.
  4. Las pruebas no lo detectaron porque el DOM mínimo no aplica CSS.
  5. Con el rol ADMINISTRACION habría pasado lo mismo: se habrían visto los exámenes y el cierre.
- **Corrección:** se agregó `:host([hidden]) { display: none !important; }` en `vistas.css`, el mismo criterio que `app_shell.css`, y una prueba que fija esa regla (`tests/estilos_vistas.test.js`). `VERSION` del service worker pasó a `2026-11-13.7`.
- **Verificación:** después de recargar, el cierre tiene `display: none`.

## Notas

- **N1:** el retroceso con orden no llegó al backend. El frontend lo bloquea antes con `motivoNoRetroceder`. No se forzó la llamada porque, si el backend la aceptara, borraría el paso. El 409 `consulta.retrocesoConRegistros` del backend solo está cubierto por las pruebas unitarias con dobles.
- **N2:** hoy solo hay una consulta en la demo. La prueba con ADMINISTRACION se hizo con esa consulta ya cerrada; el motivo del rol se muestra porque se evalúa primero. Ver una consulta *abierta* con ADMINISTRACION (panel del paso en solo lectura, sin exámenes ni cierre) solo está cubierto por las pruebas de la vista.
- **N3:** en la primera apertura se vio dos veces `GET atencion/consultas/{id}`. La segunda petición fue mi `fetch` de diagnóstico, no de la app. En la recarga y en las acciones, cada lectura se pidió una sola vez.
- **N4:** no se probaron contra el backend real el modo sin red ni el diseño en un ancho de teléfono. Los dos quedan para revisar a mano.

## Datos que quedaron modificados (para reiniciar la demo)

En la base, todo dentro de la consulta `de110009-0000-4000-8000-000000000002` de la Clínica de demostración:

1. **Consulta:** quedó cerrada (`fecha_fin` ≈ 2026-11-13 12:05 −06:00), con las observaciones "Observación de prueba.".
2. **Paso "Evaluación médica"** (`de11000b-0000-4000-8000-000000000021` no cambió; el que cambió es `…-000000000022`):
   - quedó COMPLETADO, con el valor "Registro de prueba: evaluación sin hallazgos.";
   - se completó, se reabrió con el retroceso y se volvió a completar, así que su `fecha_fin` cambió.
3. **Orden de examen nueva** en el paso `…-000000000022`: Glucosa en ayunas, con las indicaciones "En ayunas de 8 horas.".
4. **Paso "Indicaciones y cierre"**:
   - `9257d8bc-b5e5-4a8c-be37-037e1488927c` se creó al avanzar y el retroceso lo **eliminó**;
   - `9ad797a7-0cc9-4695-8af5-408e7ed56556` se creó al volver a avanzar y quedó COMPLETADO, con el valor "Registro de prueba: indicaciones generales.".

Solo en la sesión HTTP, no en la base: la consulta seleccionada (`PUT …/sesion`) y el rol activo, que terminó en ADMINISTRACION. Se pierden al cerrar sesión o al reiniciar Liberty.

Todos los valores escritos son textos de prueba inventados.

## Commits de esta ronda (rama `spa`, sin push)

- `5abd197` DefaultService: Content-Type solo cuando hay cuerpo
- `cbebeb3` Pruebas de `<vista-consulta>` sin red: con y sin datos guardados
- `93d1110` CLAUDE.md: la rama de trabajo actual es spa
- `cb983e0` vistas.css: un host con hidden queda oculto (F1)

`npm test`: 482 pruebas, 482 pasan y 0 fallan.
