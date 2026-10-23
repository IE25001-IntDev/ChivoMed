import { componentStyles } from './component_styles.js';

class ThemeToggle extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.media = window.matchMedia('(prefers-color-scheme: dark)');
        this.toggle = () => this.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
        this.sync = () => this.updateButton();
        this.systemChange = () => {
            let saved;
            try { saved = localStorage.getItem('chivomed-theme'); } catch { /* Optional storage. */ }
            if (saved !== 'dark' && saved !== 'light') this.setTheme(this.media.matches ? 'dark' : 'light');
        };
        this.storageChange = (event) => {
            if (event.key === 'chivomed-theme' || event.key === null) {
                this.setTheme(event.newValue === 'dark' || event.newValue === 'light'
                    ? event.newValue : this.media.matches ? 'dark' : 'light');
            }
        };
    }

    connectedCallback() {
        if (!this.root.childElementCount) {
            const template = document.createElement('template');
            template.innerHTML = `<button class="theme-button" type="button" aria-label="Modo oscuro" aria-pressed="false">
                <svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg>
                <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>
                <span class="theme-label"></span>
            </button>`;
            this.root.append(componentStyles(), template.content.cloneNode(true));
        }
        this.root.querySelector('button').addEventListener('click', this.toggle);
        this.media.addEventListener('change', this.systemChange);
        window.addEventListener('storage', this.storageChange);
        window.addEventListener('chivomed-theme-change', this.sync);
        this.updateButton();
    }

    disconnectedCallback() {
        this.root.querySelector('button').removeEventListener('click', this.toggle);
        this.media.removeEventListener('change', this.systemChange);
        window.removeEventListener('storage', this.storageChange);
        window.removeEventListener('chivomed-theme-change', this.sync);
    }

    setTheme(theme, persist = false) {
        document.documentElement.dataset.theme = theme;
        document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#101f25' : '#edf5f2';
        if (persist) {
            try { localStorage.setItem('chivomed-theme', theme); } catch { /* Keep the session theme. */ }
        }
        window.dispatchEvent(new Event('chivomed-theme-change'));
    }

    updateButton() {
        const dark = document.documentElement.dataset.theme === 'dark';
        const button = this.root.querySelector('button');
        button.setAttribute('aria-pressed', String(dark));
        button.title = dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
        this.root.querySelector('.theme-label').textContent = dark ? 'Modo claro' : 'Modo oscuro';
    }
}

customElements.define('theme-toggle', ThemeToggle);
export default ThemeToggle;
