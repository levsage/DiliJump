/**
 * Registers the build-generated service worker (offline play + install).
 * Production only — the dev server must never be cached.
 *
 * When a new deploy is picked up while the game is open, `onUpdate()` is
 * called so the UI can offer a reload (never forced mid-run).
 */
export function registerServiceWorker({ onUpdate = () => {} } = {}) {
  if (!import.meta.env?.PROD || !('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) onUpdate();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        // look for new deploys when the player comes back to the tab
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) reg.update().catch(() => {});
        });
      })
      .catch((err) => console.warn('[sw] registration failed:', err.message));
  });
}
