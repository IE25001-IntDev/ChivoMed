import DefaultService from "./default_service.js";
import Persona from "../entities/persona.js";
import ConsultaService from "./consulta_service.js";
import DocumentoService from "./documento_service.js";
import MedioContactoService from "./medio_contacto_service.js";
import PersonaRolService from "./persona_rol_service.js";

/** Gestor de límite de concurrencia para evitar saturación de conexiones HTTP */
class ColaConcurrencia {
    constructor(limite = 4) {
        this.limite = limite;
        this.activas = 0;
        this.cola = [];
    }

    ejecutar(tarea) {
        return new Promise((resolve, reject) => {
            this.cola.push({ tarea, resolve, reject });
            this._despachar();
        });
    }

    _despachar() {
        if (this.activas >= this.limite || this.cola.length === 0) return;
        this.activas++;
        const { tarea, resolve, reject } = this.cola.shift();
        tarea()
            .then(resolve, reject)
            .finally(() => {
                this.activas--;
                this._despachar();
            });
    }
}

/** Servicio REST de Persona con caché en memoria, deduplicación de peticiones y control de concurrencia */
class PersonaService extends DefaultService {
    static _cache = new Map();
    static _enVuelo = new Map();
    static _versiones = new Map();
    static _cola = new ColaConcurrencia(4);

    constructor(opciones = {}) {
        super("personas", Persona, opciones);
    }

    static limpiarCache() {
        PersonaService._cache.clear();
        PersonaService._enVuelo.clear();
        PersonaService._versiones.clear();
    }

    static tamanoCache() {
        return PersonaService._cache.size;
    }

    _generarClave(id) {
        return `${this.baseUrl || ''}::${String(id).trim()}`;
    }

    _invalidar(id) {
        if (id === null || id === undefined || id === "") return;
        const clave = this._generarClave(id);
        PersonaService._versiones.set(clave, (PersonaService._versiones.get(clave) || 0) + 1);
        PersonaService._cache.delete(clave);
        // Si hay una petición en vuelo previa a la mutación, desvincularla para que búsquedas
        // posteriores no compartan una respuesta obsoleta
        PersonaService._enVuelo.delete(clave);
    }

    /**
     * Búsqueda por ID con caché en memoria, deduplicación de peticiones simultáneas
     * y límite de concurrencia para resolver el cuello de botella N+1.
     */
    async buscarPorId(id, opciones = {}) {
        if (id === null || id === undefined || id === "") {
            return super.buscarPorId(id, opciones);
        }
        const clave = this._generarClave(id);

        // 1. Si está en caché y no se solicita forzar recarga, devolver inmediatamente
        if (!opciones.forzarRecarga && PersonaService._cache.has(clave)) {
            return PersonaService._cache.get(clave);
        }

        // 2. Si ya hay una petición para esta clave en vuelo, compartir la promesa (deduplicación)
        if (PersonaService._enVuelo.has(clave)) {
            return PersonaService._enVuelo.get(clave);
        }

        // Versión al momento de iniciar la petición para prevenir condición de carrera en invalidación
        const versionInicio = PersonaService._versiones.get(clave) || 0;

        // 3. Programar en la cola con límite de concurrencia
        let promesa;
        promesa = PersonaService._cola.ejecutar(async () => {
            try {
                const respuesta = await super.buscarPorId(id, opciones);
                // Si la versión cambió durante el vuelo (mutación concurrente), descartar la respuesta vieja
                if ((PersonaService._versiones.get(clave) || 0) === versionInicio) {
                    PersonaService._cache.set(clave, respuesta);
                }
                return respuesta;
            } finally {
                // Solo remover del mapa en vuelo si sigue siendo exactamente esta misma promesa
                if (PersonaService._enVuelo.get(clave) === promesa) {
                    PersonaService._enVuelo.delete(clave);
                }
            }
        });

        PersonaService._enVuelo.set(clave, promesa);
        return promesa;
    }

    async actualizar(id, datos, opciones = {}) {
        this._invalidar(id);
        return super.actualizar(id, datos, opciones);
    }

    async modificar(id, cambios, opciones = {}) {
        this._invalidar(id);
        return super.modificar(id, cambios, opciones);
    }

    async eliminar(id, opciones = {}) {
        this._invalidar(id);
        return super.eliminar(id, opciones);
    }

    /** Servicio de /personas/{id}/documentos. */
    documentos(id) {
        return this.relacionados(id, "documentos", DocumentoService, ["POST", "PUT", "PATCH", "DELETE"]);
    }

    /** Servicio de /personas/{id}/medios-contacto. */
    mediosContacto(id) {
        return this.relacionados(id, "medios-contacto", MedioContactoService, ["POST", "PUT", "PATCH", "DELETE"]);
    }

    /** Servicio de /personas/{id}/personas-roles. */
    personasRoles(id) {
        return this.relacionados(id, "personas-roles", PersonaRolService, ["POST", "PUT", "PATCH", "DELETE"]);
    }

    /** Servicio de /personas/{id}/consultas. */
    consultas(id) {
        return this.relacionados(id, "consultas", ConsultaService, []);
    }
}

export default PersonaService;
