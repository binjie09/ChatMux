import {
  type AuditEvent,
  type CreateHostInput,
  type Host,
  type SaveSessionMetadataInput,
  type TranscriptChunk,
  type TmuxSession,
} from "./api";
import { type ComposerMode } from "./Composer";
import { ConversationPane } from "./ConversationPane";
import { GatewayUnlockPage } from "./GatewayUnlockPage";
import { MobileNavigation, type MobilePanel } from "./MobileNavigation";
import { type MobileTerminalSheet } from "./MobileTerminalChrome";
import { type QueuedTerminalInput } from "./NativeTerminal";
import { SessionList } from "./SessionList";
import { Sidebar } from "./Sidebar";
import { type GatewayTokenState } from "./useGatewayAccessToken";
import { usePWAInstallPrompt } from "./usePWAInstallPrompt";
import { type SessionNotificationStatus } from "./useSessionNotifications";
import { type SSHCredentialStatus } from "./useSSHCredentialToken";
import { type ConnectionStatus } from "./useTerminalSocket";

type CredentialTarget = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  sshReady: boolean;
};

type AppShellProps = {
  auditEvents: AuditEvent[];
  composerMode: ComposerMode;
  composerValue: string;
  createTerminalWebSocketURL: ((status: ConnectionStatus) => Promise<string>) | null;
  credentialStatus: SSHCredentialStatus;
  error: string;
  gatewayToken: GatewayTokenState;
  historyChunks: TranscriptChunk[];
  historyQuery: string;
  historyText: string;
  hosts: Host[];
  isMobileTerminalActive: boolean;
  loadScrollbackHistory: ((lines: number) => Promise<string>) | null;
  mobilePanel: MobilePanel;
  mobileSheet: MobileTerminalSheet | null;
  newSessionName: string;
  notifications: {
    enabled: boolean;
    status: SessionNotificationStatus;
  };
  queuedInput: QueuedTerminalInput | null;
  selectedHost: Host | undefined;
  selectedSession: TmuxSession | undefined;
  selectedSessionName: string;
  sessions: TmuxSession[];
  showHostForm: boolean;
  target: CredentialTarget;
  terminalSessionKey: string;
  sessionHandlers: {
    onBackToSessions: () => void;
    onConnectionReady: (status: ConnectionStatus) => void;
    onCreateSession: () => void;
    onListSessions: () => void;
    onOpenSession: (sessionName: string) => void;
  };
  composerHandlers: {
    onComposerModeChange: (mode: ComposerMode) => void;
    onComposerSubmit: (data: string) => void;
    onComposerValueChange: (value: string) => void;
  };
  onConnectionError: (message: string) => void;
  onCreateHost: (input: CreateHostInput) => Promise<void>;
  onDeleteHost: (hostId: string) => Promise<void>;
  onDrafted: () => void;
  onMobilePanelChange: (panel: MobilePanel) => void;
  onMobileSheetChange: (sheet: MobileTerminalSheet | null) => void;
  onNewSessionNameChange: (value: string) => void;
  onNotificationsEnabledChange: (enabled: boolean) => void;
  onSaveSessionMetadata: (input: SaveSessionMetadataInput) => Promise<void>;
  onSelectHost: (hostId: string) => void;
  onShowHostForm: (show: boolean) => void;
  onTogglePin: () => void;
  onToggleShare: () => void;
  onTrustHost: () => void;
  onUpdateHost: (hostId: string, input: CreateHostInput) => Promise<void>;
  onHistoryQueryChange: (query: string) => void;
};

export function AppShell(props: AppShellProps) {
  const pwaInstallPrompt = usePWAInstallPrompt();

  if (!props.gatewayToken.ready) {
    return <GatewayUnlockPage error={props.error} tokenState={props.gatewayToken} />;
  }

  return (
    <main className={`app-shell ${props.isMobileTerminalActive ? "mobile-terminal-active" : ""}`}>
      <Sidebar
        error={props.error}
        gatewayToken={props.gatewayToken}
        hosts={props.hosts}
        mobileOpen={props.mobilePanel === "hosts"}
        pwaInstallPrompt={pwaInstallPrompt}
        selectedHostId={props.selectedHost?.id ?? ""}
        showHostForm={props.showHostForm}
        onCreateHost={props.onCreateHost}
        onDeleteHost={props.onDeleteHost}
        onSelectHost={props.onSelectHost}
        onShowHostForm={props.onShowHostForm}
        onUpdateHost={props.onUpdateHost}
      />

      <SessionList
        credentialStatus={props.credentialStatus}
        mobileOpen={props.mobilePanel === "sessions"}
        newSessionName={props.newSessionName}
        notificationsEnabled={props.notifications.enabled}
        notificationStatus={props.notifications.status}
        selectedSessionName={props.selectedSessionName}
        sessions={props.sessions}
        onCreateSession={props.sessionHandlers.onCreateSession}
        onListSessions={props.sessionHandlers.onListSessions}
        onNewSessionNameChange={props.onNewSessionNameChange}
        onNotificationsEnabledChange={props.onNotificationsEnabledChange}
        onOpenSession={props.sessionHandlers.onOpenSession}
      />

      <ConversationPane
        auditEvents={props.auditEvents}
        composerMode={props.composerMode}
        composerValue={props.composerValue}
        createTerminalWebSocketURL={props.createTerminalWebSocketURL}
        historyChunks={props.historyChunks}
        historyQuery={props.historyQuery}
        historyText={props.historyText}
        host={props.selectedHost}
        loadScrollbackHistory={props.loadScrollbackHistory}
        mobileSheet={props.mobileSheet}
        queuedInput={props.queuedInput}
        selectedSession={props.selectedSession}
        target={props.target}
        terminalSessionKey={props.terminalSessionKey}
        onBackToSessions={props.sessionHandlers.onBackToSessions}
        onComposerModeChange={props.composerHandlers.onComposerModeChange}
        onComposerSubmit={props.composerHandlers.onComposerSubmit}
        onComposerValueChange={props.composerHandlers.onComposerValueChange}
        onConnectionError={props.onConnectionError}
        onConnectionReady={props.sessionHandlers.onConnectionReady}
        onDrafted={props.onDrafted}
        onHistoryQueryChange={props.onHistoryQueryChange}
        onMobileSheetChange={props.onMobileSheetChange}
        onSaveSessionMetadata={props.onSaveSessionMetadata}
        onTogglePin={props.onTogglePin}
        onToggleShare={props.onToggleShare}
        onTrustHost={props.onTrustHost}
      />
      <MobileNavigation activePanel={props.mobilePanel} hidden={props.isMobileTerminalActive} onPanelChange={props.onMobilePanelChange} />
    </main>
  );
}
