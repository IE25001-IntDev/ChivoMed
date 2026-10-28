// Runs before styles load to prevent flashing the opposite theme.
(() => {
    let preference;
    try { preference = localStorage.getItem('chivomed-theme'); } catch { /* Optional storage. */ }
    const theme = preference === 'light' || preference === 'dark'
        ? preference
        : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#101f25' : '#edf5f2';
})();
