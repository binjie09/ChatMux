import { useEffect, useState } from "react";
import { isBrowserShell } from "./runtime-platform";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_DISMISSED_STORAGE_KEY = "chatmux:pwa-install-dismissed";

export type PWAInstallPromptState = {
  canInstall: boolean;
  dismissInstallPrompt: () => void;
  installApp: () => Promise<void>;
};

export function usePWAInstallPrompt(): PWAInstallPromptState {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(INSTALL_DISMISSED_STORAGE_KEY) === "true");
  const canInstall = Boolean(installPrompt && !dismissed && !isStandaloneDisplay());

  useEffect(() => {
    if (!isBrowserShell()) {
      return;
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstallPrompt(null);
      setDismissed(true);
      sessionStorage.setItem(INSTALL_DISMISSED_STORAGE_KEY, "true");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) {
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "dismissed") {
      dismissInstallPrompt();
    }
  }

  function dismissInstallPrompt() {
    setDismissed(true);
    sessionStorage.setItem(INSTALL_DISMISSED_STORAGE_KEY, "true");
  }

  return { canInstall, dismissInstallPrompt, installApp };
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
