# Entidades y servicios de GalenoSV

Módulos ES para navegador, basados en los 20 DTO y recursos REST de
`../Galenosv/src/main/java/sv/edu/ues/ingenieria/ppi115_2026/salud/galenosv/boundary/resources`
y en `../Galenosv/docs/api-rest.md`. `Atencion` representa además el contexto de sesión.
Las entidades heredan `DefaultEntity`; todos los servicios heredan `DefaultService`.
No requieren dependencias ni compilación. Cargar desde un `<script type="module">`.

## Configuración y contrato

`control/api_config.js` define `http://localhost:9080/galenosv/api` como base.
Se puede cambiar `API_CONFIG.baseUrl` antes de instanciar servicios, o pasar
`{ baseUrl: "/galenosv/api" }` a cada constructor. Los servicios conservan cookies
con `credentials: "include"`, necesario para compartir el rol y la atención activos.
Si ChivoMed se sirve desde otro origen, el servidor debe permitir ese origen y
credenciales mediante CORS, o se debe configurar un proxy del mismo origen.

Cada operación devuelve una promesa de `DefaultResponse`:
`{ status, message, data, headers }`, con el indicador `ok`. `data` contiene una
entidad, un arreglo de entidades o `null` en respuestas sin cuerpo (`204`).
Galeno devuelve directamente los DTO; la envoltura se crea solo en el cliente.
Las cabeceras usan nombres en minúsculas, por ejemplo `headers.location`.

Los errores rechazan con `DefaultError`, que extiende `Error` y conserva
`status`, `code`, `message`, `path`, `timestamp`, `details`, `headers` y `data`.
`error` es un alias de `code` por compatibilidad con el default original.
Los fallos de red y las cancelaciones tienen `status: 0`.

Las entidades aceptan un objeto y declaran sus campos como `null` inicialmente;
solo copian campos del DTO, incluidos `false` y cadenas vacías. Las relaciones
son UUID, sin colecciones ni objetos JPA. Las fechas se mantienen como cadenas
ISO con zona; `fechaNacimiento` y los demás campos Java `Date` requieren
milisegundos, por ejemplo `2000-01-01T06:00:00.000Z`. Un objeto `Date` de JavaScript
se serializa en ese formato mediante `JSON.stringify`.

## CRUD

```js
import { Clinica, DefaultError } from "./js/entities/index.js";
import { ClinicaService } from "./js/control/index.js";

const clinicas = new ClinicaService();
try {
    const respuesta = await clinicas.listar();
    console.log(respuesta.data); // Clinica[]

    const creada = await clinicas.crear(new Clinica({
        nombre: "Clínica Central", activo: true, tipo: "General",
    }));
    const id = creada.data.idClinica;
    await clinicas.buscarPorId(id);
    await clinicas.actualizar(id, { nombre: "Clínica Central", activo: true,
        tipo: "General", comentarios: "Horario actualizado" });
    await clinicas.modificar(id, { comentarios: null });
    // await clinicas.eliminar(id);
} catch (error) {
    if (!(error instanceof DefaultError)) throw error;
    console.error(error.status, error.code, error.message, error.details);
}
```

Los métodos comunes son `listar(filtros?, opciones?)`, `buscarPorId(id, opciones?)`,
`crear(datos, opciones?)`, `actualizar(id, datos, opciones?)`,
`modificar(id, cambios, opciones?)` y `eliminar(id, opciones?)`.
`PUT` requiere el DTO completo. `PATCH` envía solo los cambios con
`application/merge-patch+json`: usar un objeto literal para conservar la diferencia
entre omitir un campo y enviar `null`. No construir una entidad vacía para PATCH.
En POST no asignar el UUID propio: lo genera Galeno; un UUID propio `null` se acepta.
Las fechas y estados del flujo clínico los genera el servidor.

`opciones` admite opciones de Fetch como `signal`, `headers` y `credentials`.
El constructor también admite `headers` y `fetchImpl` para inyectar el transporte.
Los filtros son los de Galeno, sin paginación ni parámetros adicionales:

```js
import { PersonaService } from "./js/control/index.js";
const personas = new PersonaService();
const respuesta = await personas.listar({ idClinica, idRol });
const controller = new AbortController();
const pendiente = personas.listar({}, { signal: controller.signal });
controller.abort(); // manejar el rechazo de pendiente
```

## Colecciones relacionadas

Cada colección del backend tiene un método que devuelve un servicio del hijo,
con la ruta anidada y la configuración del padre. Se conservan los permisos
específicos: una escritura no habilitada rechaza con `DefaultError` 405.
Los nombres de los métodos son las colecciones REST convertidas a camelCase:

```js
const documentos = personas.documentos(idPersona);
await documentos.listar({ idTipoDocumento });
await documentos.crear({ valor: "12345678-9", idTipoDocumento });
await documentos.modificar(idDocumento, { rutaFisica: null });

const pacientes = clinicas.personas(idClinica);
await pacientes.crear({ nombres: "Ana", apellidos: "Pérez",
    fechaNacimiento: "2000-01-01T06:00:00.000Z" });
```

| Servicio | Métodos de colecciones relacionadas |
| --- | --- |
| ClinicaService | personas, personasRoles, consultas |
| ConsultaService | procedimientos |
| ConsultaProcedimientoService | pasos |
| ConsultaProcedimientoPasoService | ordenesExamen |
| ExamenService | clasificaciones |
| OrdenExamenService | resultados |
| PersonaService | documentos, mediosContacto, personasRoles, consultas |
| PersonaRolService | consultas, pasosConsulta |
| ProcedimientoService | pasos, consultasProcedimientos |
| ProcedimientoPasoService | examenesConfigurados, secuencias, pasosConsulta |
| RolService | personas, personasRoles, procedimientosPasos |
| TipoDocumentoService | documentos |
| TipoExamenService | examenes, clasificaciones |
| TipoMedioContactoService | mediosContacto |

El CRUD directo se conserva para todas las entidades; `PATCH` no está habilitado
en ConsultaProcedimiento, ConsultaProcedimientoPaso, OrdenExamen ni ExamenResultado.
Para el comportamiento de las vistas de Galeno usar las rutas anidadas y acciones:

```js
import { AtencionService, PersonaRolService } from "./js/control/index.js";

const atencion = new AtencionService();
await atencion.cambiarRol(idAsignacionMedica);
const contexto = await atencion.contexto();

const consultas = new PersonaRolService().consultas(idAsignacionPaciente);
const { data: consulta } = await consultas.crear({ observaciones: "Consulta inicial" });
const procedimientos = consultas.procedimientos(consulta.idConsulta);
const { data: procedimiento } = await procedimientos.crear({ idProcedimiento });
const pasos = procedimientos.pasos(procedimiento.idConsultaProcedimiento);
const { data: pendientes } = await pasos.listar();
const paso = pendientes[0]; // seleccionar el paso que corresponde atender
await pasos.asignarResponsable(paso.idConsultaProcedimientoPaso, idAsignacionMedica);
await pasos.registrarExamen(paso.idConsultaProcedimientoPaso, {
    nombre: "Hemograma", idTipoExamen, observaciones: "Control",
});
const { data: orden } = await pasos.ordenesExamen(paso.idConsultaProcedimientoPaso)
    .crear({ indicaciones: "Hemograma" });
await pasos.completar(paso.idConsultaProcedimientoPaso, "Completado");
await pasos.ordenesExamen(paso.idConsultaProcedimientoPaso).resultados(orden.idOrdenExamen)
    .crear({ resultado: "Normal", interpretacion: "Sin hallazgos" });
// Cerrar cuando todos los pasos y procedimientos requeridos hayan terminado.
await consultas.cerrar(consulta.idConsulta, { observaciones: "Atención finalizada" });
// retomar(id) permite cargar posteriormente una consulta que siga abierta.
```

El catálogo, el personal y la sesión deben estar configurados según las reglas
de Galeno. Seleccionar un rol no sustituye la autenticación del servidor.

## Verificación

Desde la raíz, ejecutar `npm test` con Node.js 22 o superior. No hace falta
instalar dependencias. Las pruebas usan Fetch simulado y verifican rutas, cuerpos,
cookies, errores, colecciones anidadas y acciones clínicas; no modifican Galeno.
