import './theme_toggle.js';

const transitionKey = 'chivomed-patient-nav-transition';

class PatientNav extends HTMLElement {
    constructor() {
        super();
        this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.realign = () => {
            this.cancelFrames();
            this.positionBubble(this.currentLink, false);
        };
    }

    connectedCallback() {
        if (!this.shadowRoot) {
            const root = this.attachShadow({mode:'open'});
            const style = document.createElement('link'); style.rel='stylesheet';
            style.href=new URL('../../../resources/patient.css', import.meta.url).href;
            const nav=document.createElement('header'); nav.className='navbar';
            nav.innerHTML=`<a class="brand" href="homepage-user.html"><span class="brand-mark">✚</span> ChivoMed <small>Mi salud</small></a><nav class="patient-links" aria-label="Navegación del paciente"><span class="nav-bubble" aria-hidden="true"></span>${[['homepage-user.html','Inicio'],['documentos.html','Documentos'],['consultas.html','Citas y consultas'],['examenes.html','Exámenes']].map(([url,label])=>`<a href="${url}" ${location.pathname.endsWith(url)?'aria-current="page"':''}>${label}</a>`).join('')}</nav><theme-toggle></theme-toggle>`;
            root.append(style,nav);
        }

        this.events = new AbortController();
        const { signal } = this.events;
        this.links = this.shadowRoot.querySelector('.patient-links');
        this.bubble = this.shadowRoot.querySelector('.nav-bubble');
        this.currentLink = this.links.querySelector('[aria-current="page"]');
        this.links.addEventListener('click', event => this.rememberSelection(event), { signal });
        window.addEventListener('pageshow', event => {
            if (event.persisted) this.realign();
        }, { signal });
        window.addEventListener('resize', this.realign, { signal });
        this.motion.addEventListener('change', this.realign, { signal });

        // Measure only after the stylesheet and fonts establish the link sizes.
        const style = this.shadowRoot.querySelector('link');
        if (style.sheet) this.initializeBubble();
        else style.addEventListener('load', () => this.initializeBubble(), { once: true, signal });
    }

    initializeBubble() {
        if (!this.isConnected || !this.currentLink) return;
        const generation = this.events;
        document.fonts.ready.then(() => {
            if (!this.isConnected || generation.signal.aborted) return;
            let previous;
            try {
                previous = JSON.parse(sessionStorage.getItem(transitionKey));
                sessionStorage.removeItem(transitionKey);
            } catch { /* Navigation also works when session storage is unavailable. */ }
            const origin = previous?.to === this.currentLink.getAttribute('href')
                && Date.now() - previous.at < 10000
                ? [...this.links.querySelectorAll('a')].find(a => a.getAttribute('href') === previous.from)
                : null;
            this.positionBubble(origin || this.currentLink, false);
            const sizes = new WeakMap();
            this.observer = new ResizeObserver(entries => {
                let changed = false;
                for (const entry of entries) {
                    const size = `${entry.contentRect.width}:${entry.contentRect.height}`;
                    if (sizes.has(entry.target) && sizes.get(entry.target) !== size) changed = true;
                    sizes.set(entry.target, size);
                }
                if (changed) this.realign();
            });
            this.observer.observe(this.links);
            this.links.querySelectorAll('a').forEach(link => this.observer.observe(link));
            if (origin && origin !== this.currentLink && !this.motion.matches) {
                // Two frames paint the previous selection before sliding on the new page.
                this.firstFrame = requestAnimationFrame(() => {
                    this.secondFrame = requestAnimationFrame(() => this.positionBubble(this.currentLink));
                });
            }
        });
    }

    positionBubble(link, animate = true) {
        if (!link || !this.bubble) return;
        const bounds = link.getBoundingClientRect();
        const container = this.links.getBoundingClientRect();
        this.links.classList.toggle('bubble-animated', animate && !this.motion.matches);
        this.bubble.style.setProperty('--bubble-x', `${bounds.left - container.left}px`);
        this.bubble.style.setProperty('--bubble-y', `${bounds.top - container.top}px`);
        this.bubble.style.setProperty('--bubble-width', `${bounds.width}px`);
        this.bubble.style.setProperty('--bubble-height', `${bounds.height}px`);
        this.links.classList.add('bubble-ready');
    }

    rememberSelection(event) {
        const link = event.target.closest('a');
        // Keep native keyboard, new-tab and modified-click navigation intact.
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey
            || event.ctrlKey || event.shiftKey || event.altKey || !this.currentLink) return;
        try {
            sessionStorage.setItem(transitionKey, JSON.stringify({
                from: this.currentLink.getAttribute('href'), to: link.getAttribute('href'), at: Date.now(),
            }));
        } catch { /* The active bubble still works without storage. */ }
        this.positionBubble(link);
    }

    cancelFrames() {
        cancelAnimationFrame(this.firstFrame);
        cancelAnimationFrame(this.secondFrame);
    }

    disconnectedCallback() {
        this.events.abort();
        this.observer?.disconnect();
        this.cancelFrames();
    }
}
customElements.define('patient-nav', PatientNav);
