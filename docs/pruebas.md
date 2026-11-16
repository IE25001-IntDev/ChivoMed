# Pruebas del frontend

## Ejecución

Node.js >= 22.5, sin instalar dependencias:

```bash
npm test                 # unidad/componentes y después integración
npm run test:unit
npm run test:integration
npm run cobertura        # ambas suites; cobertura solo de src/
```

No necesitan GalenoSV, PostgreSQL ni migraciones. Las pruebas HTTP abren servidores
locales en puertos efímeros; los datos son sintéticos. Cada archivo corre en un proceso
independiente y las pruebas de integración cierran sus servidores al terminar.

## Alcance

| Área | Pruebas |
| --- | --- |
| HU1: citas, validación, PDF, reintentos, respuestas tardías | `tests/controlador_citas.test.js`, `tests/vista_citas.test.js`, `tests/integracion/flujos_http.test.js` |
| HU2: login, rutas protegidas y cambios de sesión | `tests/auth_service.test.js`, `tests/login.test.js`, `tests/app_shell.test.js`, `tests/integracion/session_integration.test.js` |
| HU3: clínica/rol, fechas, pacientes, lectura sin red | `tests/dashboard.test.js`, `tests/consultas.test.js`, `tests/integracion/flujos_http.test.js` |
| HU4: atención, exámenes, retroceso y cierre | `tests/controlador_consulta*.test.js`, `tests/paneles_consulta.test.js`, `tests/integracion/flujos_http.test.js` |
| PWA: instalación, cachés, IndexedDB y reconexión | `tests/sw_logica.test.js`, `tests/offline_indexeddb.test.js`, `tests/integracion/service_worker.test.js` |
| Transporte HTTP y servidor estático | `tests/integracion/api_proxy.test.js`, `tests/integracion/dev_server.test.js` |

La integración HTTP conecta controladores, servicios, autenticación, fetch y proxy reales
del frontend; un servidor sintético sustituye al API remoto. Comprueba solicitudes y estado
resultante, errores 401/429/503, CSRF, privacidad del documento y conservación del borrador.
El service worker ejecuta sus scripts reales con APIs de navegador simuladas.

## Resultado de esta revisión

Base: rama `spa`, commit `6c4510a`. Validación con Node 24.21.0.

- Inicial: 748 pruebas, 737 aprobadas y 11 fallidas por fixtures de sesión desactualizados.
- Final: 780 aprobadas, cero fallidas (756 de unidad/componentes y 24 de integración).
- Cobertura conjunta de `src/`: 99.45 % líneas, 92.27 % ramas y 95.17 % funciones.
- Las regresiones nuevas fallaron antes de corregir las causas: reintento de citas bloqueado,
  peticiones de clínicas duplicadas, resultados y tickets tardíos de criterios anteriores,
  y excepción al retirar el rol activo durante una sesión.
- Los fixtures ahora respetan `idUsuario === idPersona`, contrato contrastado con
  `AuthResource.java` de `origin/backend-rubrica` (`466209b`).

## Límites

Esto no valida el recorrido navegador → GalenoSV → PostgreSQL. Para ese recorrido hay que
preparar la versión correspondiente del backend y aplicar sus migraciones; no se ejecutaron.
El DOM mínimo no verifica layout, accesibilidad visual ni comportamiento completo del navegador.
La cobertura mide ejecución, no garantiza ausencia de errores; quedan ramas sin cubrir.
