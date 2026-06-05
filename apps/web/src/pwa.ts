import { isBrowserShell } from "./runtime-platform";

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (import.meta.env.DEV) {
    unregisterDevelopmentServiceWorkers();
    return;
  }

  if (!isBrowserShell()) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error: unknown) => {
      console.error("ChatMux service worker registration failed", error);
    });
  });
}

function unregisterDevelopmentServiceWorkers() {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        if (registration.scope.startsWith(window.location.origin)) {
          void registration.unregister();
        }
      });
    }).catch((error: unknown) => {
      console.error("ChatMux service worker cleanup failed", error);
    });
  });
}
