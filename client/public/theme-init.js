// Runs before first paint (loaded as a blocking external script, allowed by the strict CSP) so the
// saved theme is applied without a flash. "system" (no attribute) follows the OS setting.
(() => {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch {
    /* storage unavailable: fall back to the system preference */
  }
})();
