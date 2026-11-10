import { componentStyles, icon } from './component_styles.js';

class ClinicFeature extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        if (this.root.childElementCount) return;
        const template = document.createElement('template');
        template.innerHTML = `
            <article class="feature-card">
                <div class="feature-top"><span class="feature-icon">${icon(this.getAttribute('icon'))}</span><span class="feature-number"></span></div>
                <slot name="titulo"></slot><slot name="contenido"></slot>
                <div class="feature-footer"><slot name="pie"></slot><span aria-hidden="true">↗</span></div>
            </article>`;
        template.content.querySelector('.feature-number').textContent = this.getAttribute('number') || '';
        this.root.append(componentStyles(), template.content.cloneNode(true));
    }
}

customElements.define('clinic-feature', ClinicFeature);
export default ClinicFeature;
