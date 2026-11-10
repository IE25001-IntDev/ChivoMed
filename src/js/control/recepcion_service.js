import DefaultService from './default_service.js';
import PersonaService from './persona_service.js';
import PersonaRolService from './persona_rol_service.js';
import RolService from './rol_service.js';
import { obtenerSesion } from './auth_service.js';

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
        const actual = await obtenerSesion();
        if (actual.rolActivo.codigo !== 'ADMINISTRACION' || actual.usuario.idUsuario !== sesionEsperada.usuario.idUsuario
            || actual.rolActivo.idPersonaRol !== sesionEsperada.rolActivo.idPersonaRol) throw new Error('La sesión cambió. Recarga la página antes de guardar.');
        if (idPersona) return new PersonaService(this.opciones).modificar(idPersona, datos);
        return this.crear(datos);
    }
}
