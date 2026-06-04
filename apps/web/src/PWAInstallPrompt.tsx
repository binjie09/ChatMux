import { Download, X } from "lucide-react";
import { type PWAInstallPromptState } from "./usePWAInstallPrompt";
import "./pwa-install-prompt.css";

export function PWAInstallPrompt(props: { installPrompt: PWAInstallPromptState }) {
  if (!props.installPrompt.canInstall) {
    return null;
  }

  return (
    <section className="pwa-install-prompt" aria-label="Install ChatMux">
      <div>
        <strong>Install ChatMux</strong>
        <span>Open as a standalone app.</span>
      </div>
      <div className="pwa-install-actions">
        <button type="button" onClick={() => void props.installPrompt.installApp()}>
          <Download size={16} aria-hidden="true" />
          Install
        </button>
        <button type="button" aria-label="Dismiss install prompt" onClick={props.installPrompt.dismissInstallPrompt}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
