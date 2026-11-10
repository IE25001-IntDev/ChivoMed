import DefaultService from './default_service.js';
import PersonaService from './persona_service.js';
import PersonaRolService from './persona_rol_service.js';
import RolService from './rol_service.js';
import { obtenerSesion } from './auth_service.js';

export const PATRON_NOMBRE = String.raw`\p{L}[\p{L}\p{M}]*(?: +\p{L}[\p{L}\p{M}]*)*`;
const nombreValido = new RegExp(`^${PATRON_NOMBRE}$`, 'u');

export default class RecepcionService extends DefaultService {
    constructor(opciones = {}) { super('recepcion/pacientes', null, { ...opciones, metodos: ['POST'] }); this.opciones = opciones; }
    async pacientes(idClinica) {
        const opciones = this.opciones;
        const { data: roles } = await new RolService(opciones).listar();
        const rol = roles.find(r => r.codigo === 'PACIENTE' && r.activo === true);
        if (!rol) throw new Error('No hay un rol de paciente activo configurado.');
        const { data: asignaciones } = await new PersonaRolService(opciones).listar({ idClinica, idRol: rol.idRol });
        const personas = new PersonaService(opciones);
        return Promise.all(asignaciones.map(async asignacion => ({ ...asignacion,
            persona: (await personas.buscarPorId(asignacion.idPersona, { forzarRecarga: true })).data })));
    }
    async guardarPaciente(sesionEsperada, datos, idPersona) {
        for (const campo of ['nombres', 'apellidos']) {
            if (typeof datos[campo] !== 'string' || datos[campo].length > 255 || !nombreValido.test(datos[campo].trim())) {
                throw new Error('Nombres y apellidos solo admiten letras, tildes, ñ y espacios, hasta 255 caracteres.');
            }
        }
        const fecha = datos.fechaNacimiento;
        const nacimiento = new Date(fecha);
        if (typeof fecha !== 'string' || Number.isNaN(nacimiento.getTime()) || nacimiento.toISOString().slice(0, 10) !== fecha.slice(0, 10)) {
            throw new Error('Ingresa una fecha de nacimiento válida.');
        }
        if (fecha.slice(0, 10) > new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' })) {
            throw new Error('La fecha de nacimiento no puede ser futura.');
        }
        const actual = await obtenerSesion();
        if (actual.rolActivo.codigo !== 'ADMINISTRACION' || actual.usuario.idUsuario !== sesionEsperada.usuario.idUsuario
            || actual.rolActivo.idPersonaRol !== sesionEsperada.rolActivo.idPersonaRol) throw new Error('La sesión cambió. Recarga la página antes de guardar.');
        if (idPersona) return new PersonaService(this.opciones).modificar(idPersona, datos);
        return this.crear(datos);
    }
}
