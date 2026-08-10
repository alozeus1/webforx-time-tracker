(() => {
  try {
    if (localStorage.getItem('wfx-theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The app
    // still renders with the default light theme in that case.
  }
})();
