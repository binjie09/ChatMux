import { useState } from "react";
import { KeyRound, Monitor, Pencil, Plus, Server, ShieldCheck, Smartphone, TerminalSquare, Trash2 } from "lucide-react";
import { type CreateHostInput, type Host } from "./api";
import { GatewayTokenControl } from "./GatewayTokenControl";
import { HostForm } from "./HostForm";
import { PWAInstallPrompt } from "./PWAInstallPrompt";
import { type GatewayTokenState } from "./useGatewayAccessToken";
import { type PWAInstallPromptState } from "./usePWAInstallPrompt";
import "./sidebar-host-actions.css";

type SidebarProps = {
  error: string;
  hosts: Host[];
  gatewayToken: GatewayTokenState;
  mobileOpen: boolean;
  pwaInstallPrompt: PWAInstallPromptState;
  selectedHostId: string;
  showHostForm: boolean;
  onCreateHost: (input: CreateHostInput) => Promise<void>;
  onDeleteHost: (hostId: string) => Promise<void>;
  onSelectHost: (hostId: string) => void;
  onShowHostForm: (show: boolean) => void;
  onUpdateHost: (hostId: string, input: CreateHostInput) => Promise<void>;
};

export function Sidebar(props: SidebarProps) {
  return (
    <aside className={`sidebar ${props.mobileOpen ? "mobile-open" : ""}`}>
      <div className="brand">
        <TerminalSquare aria-hidden="true" />
        <div>
          <strong>ChatMux</strong>
          <span>SSH tmux workspaces</span>
        </div>
      </div>

      <button className="primary-action" type="button" onClick={() => props.onShowHostForm(true)}>
        <Plus size={18} aria-hidden="true" />
        Add host
      </button>
      {props.showHostForm ? <HostForm onCancel={() => props.onShowHostForm(false)} onSubmit={props.onCreateHost} /> : null}
      <GatewayTokenControl tokenState={props.gatewayToken} />

      <section className="nav-section">
        <h2>Hosts</h2>
        <div className="host-list">
          {props.hosts.map((host) => (
            <HostEntry
              host={host}
              isSelected={props.selectedHostId === host.id}
              key={host.id}
              onDeleteHost={props.onDeleteHost}
              onSelectHost={props.onSelectHost}
              onUpdateHost={props.onUpdateHost}
            />
          ))}
        </div>
        {props.error ? <p className="sidebar-error">{props.error}</p> : null}
      </section>

      <PWAInstallPrompt installPrompt={props.pwaInstallPrompt} />

      <section className="platforms">
        <h2>Targets</h2>
        <div>
          <Monitor size={16} aria-hidden="true" />
          Web, macOS, Windows
        </div>
        <div>
          <Smartphone size={16} aria-hidden="true" />
          iOS, Android
        </div>
        <div>
          <ShieldCheck size={16} aria-hidden="true" />
          Gateway secured SSH
        </div>
      </section>
    </aside>
  );
}

type HostEntryProps = {
  host: Host;
  isSelected: boolean;
  onDeleteHost: (hostId: string) => Promise<void>;
  onSelectHost: (hostId: string) => void;
  onUpdateHost: (hostId: string, input: CreateHostInput) => Promise<void>;
};

function HostEntry(props: HostEntryProps) {
  const [isEditing, setIsEditing] = useState(false);

  async function handleDeleteHost() {
    if (!window.confirm(`Delete ${props.host.name}?`)) {
      return;
    }
    await props.onDeleteHost(props.host.id);
    setIsEditing(false);
  }

  return (
    <article className="host-entry">
      <div className="host-entry-main">
        <button className={`host-row ${props.isSelected ? "selected" : ""}`} type="button" onClick={() => props.onSelectHost(props.host.id)}>
          <Server size={18} aria-hidden="true" />
          <span>
            <strong>{props.host.name}</strong>
            <small>{hostAddress(props.host)}</small>
          </span>
          <KeyRound className={`host-credential-icon ${props.host.hasCredential ? "saved" : ""}`} size={14} aria-hidden="true" />
          <i className={`status-dot ${props.host.status}`} />
        </button>
        <div className="host-row-actions">
          <button className="host-action-button" type="button" onClick={() => setIsEditing(!isEditing)} aria-label={`Edit ${props.host.name}`} title="Edit host">
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button className="host-action-button danger" type="button" onClick={() => void handleDeleteHost()} aria-label={`Delete ${props.host.name}`} title="Delete host">
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      {isEditing ? (
        <HostForm
          initialValue={hostFormValue(props.host)}
          savedCredential={props.host.hasCredential}
          onCancel={() => setIsEditing(false)}
          onSubmit={async (input) => {
            await props.onUpdateHost(props.host.id, input);
            setIsEditing(false);
          }}
        />
      ) : null}
    </article>
  );
}

function hostFormValue(host: Host): CreateHostInput {
  return {
    hostname: host.hostname,
    name: host.name,
    port: host.port,
    sshAuthMethod: host.sshAuthMethod,
    username: host.username,
  };
}

function hostAddress(host: Host) {
  return `${host.username}@${host.hostname}:${host.port} · ${host.shared ? "shared" : host.owner}`;
}
