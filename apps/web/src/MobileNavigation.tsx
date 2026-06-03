import { ListTree, Server, TerminalSquare } from "lucide-react";
import "./mobile-navigation.css";

export type MobilePanel = "hosts" | "sessions" | "terminal";

type MobileNavigationProps = {
  activePanel: MobilePanel;
  onPanelChange: (panel: MobilePanel) => void;
};

const mobileItems = [
  { icon: TerminalSquare, label: "Terminal", panel: "terminal" },
  { icon: Server, label: "Hosts", panel: "hosts" },
  { icon: ListTree, label: "Sessions", panel: "sessions" },
] as const;

export function MobileNavigation({ activePanel, onPanelChange }: MobileNavigationProps) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {mobileItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            aria-current={activePanel === item.panel ? "page" : undefined}
            className={activePanel === item.panel ? "active" : ""}
            key={item.panel}
            type="button"
            onClick={() => onPanelChange(item.panel)}
          >
            <Icon size={18} aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
