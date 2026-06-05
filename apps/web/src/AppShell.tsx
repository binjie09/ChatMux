import {
  type AuditEvent,
  type CreateHostInput,
  type Host,
  type SaveSessionMetadataInput,
  type TranscriptChunk,
} from "./api";
import { type ComposerMode } from "./Composer";
import { ConversationPane } from "./ConversationPane";
import { GatewayUnlockPage } from "./GatewayUnlockPage";
import { MobileNavigation, type MobilePanel } from "./MobileNavigation";
import { type MobileTerminalSheet } from "./MobileTerminalChrome";
import { type QueuedTerminalInput } from "./NativeTerminal";
import { SessionList } from "./SessionList";
import { type DisplayTmuxSession } from "./session-state-machine";
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
  windowIndex: number | null;
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
  expandedSessionNames: ReadonlySet<string>;
  isMobileTerminalActive: boolean;
  loadScrollbackHistory: ((lines: number) => Promise<string>) | null;
  mobilePanel: MobilePanel;
  mobileSheet: MobileTerminalSheet | null;
  mobileWindowList: boolean;
  newSessionName: string;
  notifications: {
    enabled: boolean;
    status: SessionNotificationStatus;
  };
  queuedInput: QueuedTerminalInput | null;
  selectedHost: Host | undefined;
  selectedSession: DisplayTmuxSession | undefined;
  selectedSessionName: string;
  selectedWindowIndex: number | null;
  selectedWindowName: string;
  sessions: DisplayTmuxSession[];
  showHostForm: boolean;
  target: CredentialTarget;
  terminalSessionKey: string;
  windowListSessionName: string;
  sessionHandlers: {
    onBackToSessions: () => void;
    onConnectionClosed: () => void;
    onConnectionReady: (status: ConnectionStatus) => void;
    onCreateWindow: (sessionName: string) => void;
    onDeleteWindow: (sessionName: string, windowIndex: number) => void;
    onCreateSession: () => void;
    onExpandSession: (sessionName: string) => void;
    onListSessions: () => void;
    onOpenWindow: (sessionName: string, windowIndex: number) => void;
    onRenameSession: (sessionName: string, name: string) => Promise<void> | void;
    onRenameWindow: (sessionName: string, windowIndex: number, name: string) => Promise<void> | void;
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
  onPasteTerminalImage: ((file: File) => Promise<string>) | null;
  onSaveSessionMetadata: (input: SaveSessionMetadataInput) => Promise<void>;
  onSelectHost: (hostId: string) => void;
  onShowHostForm: (show: boolean) => void;
  onTogglePin: () => void;
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
        expandedSessionNames={props.expandedSessionNames}
        mobileOpen={props.mobilePanel === "sessions"}
        mobileWindowList={props.mobileWindowList}
        newSessionName={props.newSessionName}
        notificationsEnabled={props.notifications.enabled}
        notificationStatus={props.notifications.status}
        selectedSessionName={props.selectedSessionName}
        selectedWindowIndex={props.selectedWindowIndex}
        sessions={props.sessions}
        windowListSessionName={props.windowListSessionName}
        onCreateSession={props.sessionHandlers.onCreateSession}
        onDeleteWindow={props.sessionHandlers.onDeleteWindow}
        onExpandSession={props.sessionHandlers.onExpandSession}
        onListSessions={props.sessionHandlers.onListSessions}
        onNewSessionNameChange={props.onNewSessionNameChange}
        onNotificationsEnabledChange={props.onNotificationsEnabledChange}
        onOpenWindow={props.sessionHandlers.onOpenWindow}
        onRenameSession={props.sessionHandlers.onRenameSession}
        onRenameWindow={props.sessionHandlers.onRenameWindow}
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
        selectedWindowName={props.selectedWindowName}
        target={props.target}
        terminalSessionKey={props.terminalSessionKey}
        onBackToSessions={props.sessionHandlers.onBackToSessions}
        onComposerModeChange={props.composerHandlers.onComposerModeChange}
        onComposerSubmit={props.composerHandlers.onComposerSubmit}
        onComposerValueChange={props.composerHandlers.onComposerValueChange}
        onConnectionError={props.onConnectionError}
        onConnectionClosed={props.sessionHandlers.onConnectionClosed}
        onConnectionReady={props.sessionHandlers.onConnectionReady}
        onCreateWindow={props.sessionHandlers.onCreateWindow}
        onDeleteWindow={props.sessionHandlers.onDeleteWindow}
        onDrafted={props.onDrafted}
        onHistoryQueryChange={props.onHistoryQueryChange}
        onMobileSheetChange={props.onMobileSheetChange}
        onOpenWindow={props.sessionHandlers.onOpenWindow}
        onPasteTerminalImage={props.onPasteTerminalImage}
        onRenameWindow={props.sessionHandlers.onRenameWindow}
        onSaveSessionMetadata={props.onSaveSessionMetadata}
        onTogglePin={props.onTogglePin}
        onTrustHost={props.onTrustHost}
      />
      <MobileNavigation activePanel={props.mobilePanel} hidden={props.isMobileTerminalActive} onPanelChange={props.onMobilePanelChange} />
    </main>
  );
}
