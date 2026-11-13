import { obtenerSesion, cerrarSesion, destinoSesion, urlAplicacion, ROLES, fijarSesionVista } from "../control/auth_service.js";
import PersonaService from "../control/persona_service.js";

const login = () => location.replace(urlAplicacion("index.html?sesion=finalizada"));
document.addEventListener("sesion-expirada", login);
export async function exigirVista(rol) {
    try {
        const sesion = await obtenerSesion();
        if (sesion.rolActivo.codigo !== rol) {
            location.replace(destinoSesion(sesion));
            throw new Error("Redirigiendo a tu espacio…");
        }
        fijarSesionVista(sesion);
        PersonaService.limpiarCache();
        document.body.hidden = false;
        window.addEventListener("pagehide", () => { document.body.hidden = true; });
        window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
        return sesion;
    } catch (error) {
        if (error.status === 401) login();
        const main = document.querySelector("main");
        if (main) {
            const message = document.createElement("p"); message.setAttribute("role", "alert"); message.textContent = error.message;
            const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Volver a intentar"; retry.onclick = () => location.reload();
            main.replaceChildren(message, retry);
        }
        document.body.hidden = false;
        throw error;
    }
}

class SessionBar extends HTMLElement {
    async connectedCallback() {
        try {
            const sesion = await obtenerSesion();
            const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
            root.innerHTML = `<style>:host([hidden]) { display: none !important; }:host{display:block}nav{display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:.7rem 1rem;background:var(--surface-solid,#edf5f2);color:var(--text,#183f35);font:inherit}a,button{color:inherit;font:inherit}button{cursor:pointer;min-height:44px;padding:.5rem 1rem;border:1px solid currentColor;border-radius:.6rem;background:transparent}p{margin:0}</style><nav aria-label="Tu sesión"><span></span><a>Mi cuenta</a><button type="button">Cerrar sesión</button><p role="status"></p></nav>`;
            root.querySelector("span").textContent = `${sesion.usuario.nombres} · ${ROLES[sesion.rolActivo.codigo]} · ${sesion.rolActivo.nombreClinica}`;
            root.querySelector("a").href = urlAplicacion("inicio.html");
            root.querySelector("button").onclick = async event => {
                event.target.disabled = true;
                try { await cerrarSesion((await obtenerSesion()).csrfToken); PersonaService.limpiarCache(); login(); }
                catch (error) { if (error.status === 401) login(); root.querySelector("p").textContent = error.message; event.target.disabled = false; }
            };
        } catch (error) { if (error.status === 401) login(); }
    }
}
customElements.define("session-bar", SessionBar);
