import "./theme.js";
import { obtenerSesion, cerrarSesion, ROLES, destinoSesion } from "../control/auth_service.js";

const details = document.querySelector("#session-details");
const status = document.querySelector("#session-status");
const volver = document.querySelector("#session-return");
const logout = document.querySelector("#logout");
let sesion;

async function cargarSesion() {
  sesion = null;
  details.hidden = true;
  volver.hidden = false;
  status.hidden = false;
  delete status.dataset.state;
  status.textContent = "Verificando tu sesión…";
  try {
    sesion = await obtenerSesion();
    document.querySelector("#account-name").textContent = `${sesion.usuario.nombres} ${sesion.usuario.apellidos}`.trim();
    document.querySelector("#account-role").textContent = ROLES[sesion.rolActivo.codigo];
    document.querySelector("#account-clinic").textContent = sesion.rolActivo.nombreClinica;
    document.title = `${ROLES[sesion.rolActivo.codigo]} | ChivoMed`;
    document.querySelector("#open-workspace").href = destinoSesion(sesion);
    details.hidden = false;
    volver.hidden = true;
    status.hidden = true;
    logout.disabled = false;
  } catch (error) {
    if (error.status === 401) {
      location.replace("./?sesion=finalizada");
      return;
    }
    status.textContent = error.message;
    status.dataset.state = "error";
    status.focus();
  }
}

logout.addEventListener("click", async () => {
  if (!sesion || logout.disabled) return;
  logout.disabled = true;
  logout.textContent = "Cerrando sesión…";
  status.hidden = true;
  try {
    await cerrarSesion(sesion.csrfToken);
    sesion = null;
    details.hidden = true;
    location.replace("./");
  } catch (error) {
    if (error.status === 401) {
      location.replace("./?sesion=finalizada");
      return;
    }
    status.textContent = error.message;
    status.dataset.state = "error";
    status.hidden = false;
    status.focus();
    logout.disabled = false;
    logout.textContent = "Cerrar sesión";
  }
});

window.addEventListener("pagehide", () => { details.hidden = true; });
window.addEventListener("pageshow", event => { if (event.persisted) cargarSesion(); });
cargarSesion();
