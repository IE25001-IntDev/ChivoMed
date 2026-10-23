import TarjetaSimple  from "./simple_card";
import Consulta from "../../entities/consulta.js";

class TarjetaConsulta extends HTMLElement {
    constructor() {
        super();
        this.tarjeta= new TarjetaSimple();
        this.consulta= new Consulta();
        this.root=this.attachShadow({ mode: 'open' });
    }
    
    connectedCallback(){
        let titulo=document.createElement('p');
        titulo.setAttribute('slot','titulo');
        titulo.innerText=this.consulta.idConsulta;
        this.tarjeta.appendChild(titulo);
        let contenido=document.createElement('p');
        contenido.setAttribute('slot','contenido');
        contenido.innerText=`Paciente: ${this.consulta.idPersonaRol.identificadorPersona}`


    } 
}
export default TarjetaConsulta;
