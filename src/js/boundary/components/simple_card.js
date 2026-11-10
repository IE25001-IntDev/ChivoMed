import { componentStyles } from './component_styles.js';
class TarjetaSimple extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({mode: 'open'});
        this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
        this.move = (event) => {
            if (this.motion.matches || !this.finePointer.matches) return;
            this.pointer = { x: event.clientX, y: event.clientY };
            if (this.frame) return;
            this.frame = requestAnimationFrame(() => {
                this.frame = null;
                const rect = this.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (this.pointer.x - rect.left) / rect.width));
                const y = Math.max(0, Math.min(1, (this.pointer.y - rect.top) / rect.height));
                const card = this.root.querySelector('article');
                card.style.setProperty('--pointer-x', `${x * 100}%`);
                card.style.setProperty('--pointer-y', `${y * 100}%`);
                card.style.setProperty('--tilt-x', `${(0.5 - y) * 4}deg`);
                card.style.setProperty('--tilt-y', `${(x - 0.5) * 4}deg`);
            });
        };
        this.reset = () => {
            cancelAnimationFrame(this.frame);
            this.frame = null;
            this.root.querySelector('article')?.removeAttribute('style');
        };
    }
    connectedCallback() {
        this.addEventListener('pointermove', this.move);
        this.addEventListener('pointerleave', this.reset);
        this.motion.addEventListener('change', this.reset);
        if (this.root.childElementCount) return;
        const template = document.createElement('template');
        template.innerHTML = `<article class="patient-card"><header><slot name="titulo"></slot></header><div class="card-body"><slot name="contenido"></slot></div><footer><slot name="pie"></slot></footer></article>`;
        this.root.append(componentStyles(), template.content.cloneNode(true));
    }
    disconnectedCallback() {
        this.removeEventListener('pointermove', this.move);
        this.removeEventListener('pointerleave', this.reset);
        this.motion.removeEventListener('change', this.reset);
        this.reset();
    }
}
customElements.define('tarjeta-simple', TarjetaSimple);
export default TarjetaSimple;
