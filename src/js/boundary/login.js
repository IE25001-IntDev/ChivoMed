const form = document.querySelector("#login-form");
const username = document.querySelector("#username");
const password = document.querySelector("#password");
const feedback = document.querySelector("#form-feedback");
const passwordToggle = document.querySelector("#password-toggle");
const themeToggle = document.querySelector("#theme-toggle");
const themeLabel = document.querySelector("#theme-label");
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function updateTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = dark ? "#101f25" : "#edf5f2";
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeToggle.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo oscuro");
  themeToggle.querySelector("use").setAttribute("href", dark ? "#icon-sun" : "#icon-moon");
  themeLabel.textContent = dark ? "Modo claro" : "Modo oscuro";
}

function preferredTheme() {
  let saved;
  try { saved = localStorage.getItem("chivomed-theme"); } catch { /* El almacenamiento es opcional. */ }
  return saved === "light" || saved === "dark" ? saved : systemTheme.matches ? "dark" : "light";
}

themeToggle.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  updateTheme(theme);
  try { localStorage.setItem("chivomed-theme", theme); } catch { /* Conserva el tema de esta vista. */ }
});
systemTheme.addEventListener("change", () => updateTheme(preferredTheme()));
window.addEventListener("storage", event => {
  if (event.key === "chivomed-theme" || event.key === null) updateTheme(preferredTheme());
});
updateTheme(preferredTheme());
themeToggle.hidden = false;

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

form.addEventListener("submit", event => {
  event.preventDefault();
  feedback.hidden = true;
  const usernameValid = validate(username);
  const passwordValid = validate(password);
  if (!usernameValid || !passwordValid) {
    (usernameValid ? password : username).focus();
    return;
  }
  // GalenoSV aún no define autenticación; no enviar ni almacenar credenciales.
  feedback.textContent = "Esta es una vista previa del acceso. Aún no se ha iniciado una sesión.";
  feedback.hidden = false;
  feedback.focus();
});
for (const field of [username, password]) {
  field.addEventListener("input", () => {
    feedback.hidden = true;
    if (field.hasAttribute("aria-invalid")) validate(field);
  });
}
form.noValidate = true;
document.querySelector("#login-submit").disabled = false;

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
