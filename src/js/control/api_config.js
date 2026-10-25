// A browser cannot read .env or access process.env. The local server proxies
// this path to API_URL; deployments can override it before loading the modules.
export const API_CONFIG = {
    baseUrl: globalThis.CHIVOMED_CONFIG?.baseUrl
        ?? (typeof process !== 'undefined' ? process.env?.API_URL : undefined)
        ?? '/galenosv/api',
    credentials: "include",
};
