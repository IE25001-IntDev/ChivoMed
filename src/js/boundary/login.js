import "./theme.js";
import { iniciarSesion } from "../control/auth_service.js";

const form = document.querySelector("#login-form");
const username = document.querySelector("#username");
const password = document.querySelector("#password");
const feedback = document.querySelector("#form-feedback");
const passwordToggle = document.querySelector("#password-toggle");
const submit = document.querySelector("#login-submit");
const submitLabel = document.querySelector("#login-submit-label");
let enviando = false;

function mostrarError(message) {
  feedback.textContent = message;
  feedback.dataset.state = "error";
  feedback.hidden = false;
  feedback.focus();
}

if (new URLSearchParams(location.search).get("sesion") === "finalizada") {
  mostrarError("Tu sesión ha finalizado. Vuelve a iniciar sesión.");
}

passwordToggle.addEventListener("click", () => {
  const visible = password.type === "password";
  password.type = visible ? "text" : "password";
  passwordToggle.setAttribute("aria-pressed", String(visible));
  passwordToggle.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
  passwordToggle.querySelector("use").setAttribute("href", visible ? "#icon-eye-off" : "#icon-eye");
});
passwordToggle.hidden = false;

function validate(field) {
  const valid = field === username ? Boolean(field.value.trim()) : Boolean(field.value);
  const error = document.querySelector(`#${field.id}-error`);
  field.setAttribute("aria-invalid", String(!valid));
  error.textContent = valid ? "" : field === username ? "Escribe tu usuario o correo electrónico." : "Escribe tu contraseña.";
  error.hidden = valid;
  return valid;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (enviando) return;
  feedback.hidden = true;
  const usernameValid = validate(username);
  const passwordValid = validate(password);
  if (!usernameValid || !passwordValid) {
    (usernameValid ? password : username).focus();
    return;
  }
  enviando = true;
  form.setAttribute("aria-busy", "true");
  for (const control of [username, password, passwordToggle, submit]) control.disabled = true;
  submitLabel.textContent = "Iniciando sesión…";
  try {
    await iniciarSesion(username.value.trim(), password.value);
    location.replace("./inicio.html");
  } catch (error) {
    mostrarError(error.message);
  } finally {
    password.value = "";
    password.type = "password";
    passwordToggle.setAttribute("aria-pressed", "false");
    passwordToggle.setAttribute("aria-label", "Mostrar contraseña");
    passwordToggle.querySelector("use").setAttribute("href", "#icon-eye");
    for (const control of [username, password, passwordToggle, submit]) control.disabled = false;
    submitLabel.textContent = "Iniciar sesión";
    form.setAttribute("aria-busy", "false");
    enviando = false;
  }
});
for (const field of [username, password]) {
  field.addEventListener("input", () => {
    feedback.hidden = true;
    if (field.hasAttribute("aria-invalid")) validate(field);
  });
}
form.noValidate = true;
submit.disabled = false;

const dialog = document.querySelector("#help-dialog");
const helpContent = {
  recovery: ["Recupera tu acceso", "Comunícate con tu clínica para recibir ayuda con tu usuario o contraseña. Por ahora, la recuperación de acceso en línea no está disponible."],
  access: ["Tu clínica te acompaña", "Solicita tu acceso al personal de tu clínica. Ellos podrán orientarte sobre cómo ingresar a ChivoMed."],
};
for (const button of document.querySelectorAll("[data-help]")) {
  button.addEventListener("click", () => {
    const [title, description] = helpContent[button.dataset.help];
    document.querySelector("#help-title").textContent = title;
    document.querySelector("#help-description").textContent = description;
    dialog.showModal();
  });
  button.hidden = false;
}
document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
document.querySelector("#dialog-done").addEventListener("click", () => dialog.close());
document.querySelector("#script-notice").hidden = true;
