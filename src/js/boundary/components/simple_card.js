class TarjetaSimple extends HTMLElement {
    constructor() {
        super();
        this.root=this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        let titulo=document.createElement('div');
        titulo.setAttribute('class','header');
        let slotTitulo=document.createElement('slot');
        slotTitulo.setAttribute('name','titulo');
        slotTitulo.innerText="agregar encabezado";
        titulo.appendChild(slotTitulo);

        let cuerpo=document.createElement('div');
        cuerpo.setAttribute('class','body');
        let slotCuerpo=document.createElement('slot');
        slotCuerpo.setAttribute('name','contenido');
        slotCuerpo.innerText="agregar contenido";
        cuerpo.appendChild(slotCuerpo);

        let pie=document.createElement('div');
        pie.setAttribute('class','footer');
        let slotPie=document.createElement('slot');
        slotPie.setAttribute('name','pie');
        slotPie.innerText="agregar pie";
        pie.appendChild(slotPie);


        this.root.appendChild(titulo);
        this.root.appendChild(cuerpo);
        this.root.appendChild(pie);

    }

}
customElements.define('tarjeta-simple', TarjetaSimple);
export default TarjetaSimple;

