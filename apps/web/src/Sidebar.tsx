import { Monitor, Plus, Server, ShieldCheck, Smartphone, TerminalSquare } from "lucide-react";
import { type CreateHostInput, type Host } from "./api";
import { GatewayTokenControl } from "./GatewayTokenControl";
import { HostForm } from "./HostForm";
import { type GatewayTokenState } from "./useGatewayAccessToken";

type SidebarProps = {
  error: string;
  hosts: Host[];
  gatewayToken: GatewayTokenState;
  mobileOpen: boolean;
  showHostForm: boolean;
  onCreateHost: (input: CreateHostInput) => Promise<void>;
  onSelectHost: (hostId: string) => void;
  onShowHostForm: (show: boolean) => void;
};

export function Sidebar(props: SidebarProps) {
  return (
    <aside className={`sidebar ${props.mobileOpen ? "mobile-open" : ""}`}>
      <div className="brand">
        <TerminalSquare aria-hidden="true" />
        <div>
          <strong>MuxChat</strong>
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
            <button className="host-row" type="button" key={host.id} onClick={() => props.onSelectHost(host.id)}>
              <Server size={18} aria-hidden="true" />
              <span>
                <strong>{host.name}</strong>
                <small>{host.username}@{host.hostname}:{host.port}</small>
              </span>
              <i className={`status-dot ${host.status}`} />
            </button>
          ))}
        </div>
        {props.error ? <p className="sidebar-error">{props.error}</p> : null}
      </section>

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
