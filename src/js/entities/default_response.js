/** Respuesta del cliente; Galeno devuelve el DTO directamente en el cuerpo HTTP. */
class DefaultResponse {
    constructor({ status = null, message = "", data = null, headers = {} } = {}) {
        this.status = status;
        this.message = message;
        this.data = data;
        this.headers = headers;
    }

    get ok() {
        return this.status >= 200 && this.status < 300;
    }
}
export default DefaultResponse;
