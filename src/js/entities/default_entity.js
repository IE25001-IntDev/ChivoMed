/** Base de los contratos JSON. Las relaciones son UUID y las fechas son cadenas ISO. */
class DefaultEntity {
    constructor(campos, datos = {}) {
        for (const [campo, valor] of Object.entries(campos)) {
            this[campo] = Object.hasOwn(datos, campo) && datos[campo] !== undefined
                ? datos[campo] : valor;
        }
    }
}

export default DefaultEntity;
