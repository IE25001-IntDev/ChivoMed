import { componentStyles, icon } from './component_styles.js';

class CarePreview extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        if (this.root.childElementCount) return;
        const template = document.createElement('template');
        template.innerHTML = `
            <div class="care-scene" role="img" aria-label="Ilustración: ChivoMed conecta pacientes, consultas y exámenes alrededor de las personas.">
                <div class="scene-orbit orbit-outer"></div><div class="scene-orbit orbit-inner"></div>
                <span class="scene-spark spark-one">+</span><span class="scene-spark spark-two">+</span>
                <div class="scene-caption"><span class="tiny-dot"></span> UNA VISIÓN MÁS HUMANA</div>
                <div class="care-window">
                    <div class="window-heading"><span class="window-brand">+ <strong>ChivoMed</strong></span><span class="window-dots">•••</span></div>
                    <div class="window-content"><span class="care-label">EN EL CENTRO DE TODO</span><div class="central-symbol">${icon('heart')}</div><h2>Las personas.</h2><p>Cada historia merece<br>una atención conectada.</p><div class="care-line"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div></div>
                    <div class="window-footer"><span class="tiny-dot"></span> Un mismo espacio. Un mejor recorrido.</div>
                </div>
                <div class="floating-card floating-patients"><span class="floating-icon mint">${icon('people')}</span><div><strong>Pacientes</strong><small>Cada historia importa</small></div><span class="connection-dot"></span></div>
                <div class="floating-card floating-consultations"><span class="floating-icon blue">${icon('heart')}</span><div><strong>Consultas</strong><small>El cuidado continúa</small></div><span class="connection-dot"></span></div>
                <div class="floating-card floating-lab"><span class="floating-icon lavender">${icon('lab')}</span><div><strong>Exámenes</strong><small>Información que conecta</small></div><span class="connection-dot"></span></div>
                <div class="scene-bottom"><span aria-hidden="true">✦</span> Todo conectado, con propósito.</div>
            </div>`;
        this.root.append(componentStyles(), template.content.cloneNode(true));
    }
}

customElements.define('care-preview', CarePreview);
export default CarePreview;
