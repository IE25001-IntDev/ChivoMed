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
