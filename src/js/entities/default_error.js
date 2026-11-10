/** Error HTTP de Galeno o de transporte (status 0). Se recibe mediante catch. */
class DefaultError extends Error {
    constructor({ status = null, code = null, error = null, message = "", path = null,
        timestamp = null, details = [], headers = {}, data = null, cause } = {}) {
        super(message, { cause });
        this.name = "DefaultError";
        this.status = status;
        this.code = code ?? error;
        this.error = this.code;
        this.path = path;
        this.timestamp = timestamp;
        this.details = details;
        this.headers = headers;
        this.data = data;
    }
}
export default DefaultError;
