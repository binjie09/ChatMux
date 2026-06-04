import { isBrowserShell } from "./runtime-platform";

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV || !isBrowserShell()) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error: unknown) => {
      console.error("ChatMux service worker registration failed", error);
    });
  });
}
