Cada pantalla puede cambiar en aspecto pero debe garantizar el
comportamiento, siguiendo los estándares de UI/UX. Su entrega será a través de google classroom, incluyendo un
archivo de texto con el nombre de los integrantes, el identificador del commit y URL del repositorio donde se encuentra
dicho commit. La calificación será una revisión de pares programada fuera del horario de clases posterior a la entrega,
clonando su repositorio con el commit especificado y corriendo en su ambiente de trabajo. La revisión será
exclusivamente en el horario que se le asigne, y se realizará de manera secuencial, es decir, si durante la revisión un
observable falla o falta, no se revisará el resto. Cada comportamiento deberá contar con pruebas de unidad, tal y
como se mostró en clase.
Se pide cree una Progressive Web Application (PWA) que opere como una Single Page Application (SPA) basada
únicamente en Ecmascript, sin el uso de frameworks, librerías, estilos o el uso de componentes de terceros, que utilice
exclusivamente Web Components para cada elemento en la aplicación, la cual debe consumir el API REST de la
aplicación Jakarta EE desarrollada como backend durante la primera mitad del curso. A continuación se definen los
requerimientos básicos de las pantallas, con imágenes de referencia para ejemplificar el flujo. Recuerde que en el
caso de GalenoSV, solo los empleados deben autenticarse y agregar o modificar información.
HU1: Búsqueda de Citas

Como usuario del sistema de salud, quiero una pantalla donde pueda buscar mis citas médicas en GalenoSV. Para
poder filtrarlas quiero se cree un asistente que me permita seleccionar el tipo de documento a buscar, al seleccionarlo
me permita ingresar el número de documento, me permita seleccionar la clínica de una lista donde he sido registrado
como paciente y me permita seleccionar un rango de fechas para buscar. Como resultado, quiero se muestre la lista
de citas, mostradas como cards, donde se indique para cada cita, la fecha y hora, la clínica, y los procedimientos que
se están siguiendo en la misma y me permita descargar un ticket en formato PDF con el resumen de la cita generado
desde el backend.
HU2: login

Como empleado del sistema de salud y usuario de GalenoSV, quiero una pantalla de login para poder ingresar a la
aplicación FrontEnd para poder acceder a las pantallas que necesito de acuerdo a mi rol y clínica donde estoy
asignado para realizar mi trabajo. La pantalla debe permitirme seleccionar un tipo de documento y escribir mi número
de documento para probar mi identidad.
HU3: Dashboard

Como empleado autenticado en la aplicación GalenoSV, quiero una pantalla que me permita seleccionar uno de mis
roles en alguna de las clínicas donde estoy registrado como empleado. Una vez seleccionada la clínica y el rol, quiero
que la pantalla muestre las consultas que debo atender para el día de hoy, pero permitirme filtrar por fechas y buscar
consultas pasadas o futuras. Para cada consulta, debe mostrarse las generales del paciente, la fecha de inicio de la
consulta, y los datos del procedimiento que se está atendiendo, tales como los pasos realizados previamente
mostrados de manera jerárquica, quién los realizó, la fecha en que se realizó y darme la opción para ver qué se
registró en dicho paso para poder tomarlo en cuenta al atender al paciente. Finalmente, debe brindarme la
oportunidad de seleccionar una consulta para poder atenderla.
HU4: Consulta

Como empleado autenticado en la aplicación GalenoSV, habiendo seleccionado una consulta para atender desde mi
dashboard, quiero poder dar seguimiento a la misma, registrando la atención brindada, exámenes administrados de la
lista de los que pueden asignarse, y una vez completado, avanzar al siguiente paso si no fuera el último o retroceder
al anterior si no fuera el primer paso.
Rúbrica de Evaluación del Segundo Examen Parcial PPI115 (Año 2026)
Criterio Observable %

Observaci
on
Calificaci
on

SPA
La navegación dentro del sistema es fluida, intuitiva y consistente. 0.5

PWA
La aplicación es instalable y gestiona correctamente el flujo de
instalación.

0.5

La aplicación mantiene su funcionalidad en modos en línea y fuera de
línea (online/offline).

0.5

Uso
exclusivo y
riguroso
de Web
Componen
ts
La totalidad de la arquitectura de la aplicación se fundamenta en Web
Components.

1

El código fuente presenta una estructura modular, clara y organizada. 0.5
Todos los componentes han sido desarrollados a medida, sin librerías
ni dependencias externas.

1

La lógica de negocio opera de forma reactiva y asíncrona en toda la
solución.

0.5

Pruebas de
Unidad

El código desarrollado cuenta con una cobertura integral mediante
pruebas unitarias.

0.5

Las pruebas son significativas, aportando valor al aseguramiento de
calidad y estabilidad.

0.5

UI
La interfaz es atractiva, coherente y orientada a la experiencia del
usuario.

0.5

Las hojas de estilo son de autoría propia, manteniendo criterios
óptimos de tipografía, color y espaciado.

1

La interfaz es adaptable (responsive) y ofrece una experiencia
uniforme en distintas pantallas.

0.5

UX Cumplimiento cabal de todas las historias de usuario especificadas. 2
La aplicación presenta un diseño ergonómico y accesible para el
usuario final.

0.5
