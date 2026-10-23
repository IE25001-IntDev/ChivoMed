import TarjetaConsulta from "./componets/card_consulta";
import ConsultaService from "../control/consulta_service";

class ConsultaModel extends HTMLElement {
    constructor() {
        super();
        this.root=this.attachShadow({ mode: 'open' });
        this.consultaService= new ConsultaService();
    }
    
    connectedCallback(){
        this.consultaService.getConsulta().then((consulta)=>{
            let tarjetaConsulta= new TarjetaConsulta();
            tarjetaConsulta.consulta=consulta;
            this.root.appendChild(tarjetaConsulta);
        }
        );
    }
}s