import { useState } from "react";
import {
  type CreateHostInput,
  type Host,
  type SaveSessionMetadataInput,
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
import { TerminalUploadProgressToast } from "./TerminalUploadProgressToast";
import { type GatewayTokenState } from "./useGatewayAccessToken";
import { usePWAInstallPrompt } from "./usePWAInstallPrompt";
import { type SessionNotificationStatus } from "./useSessionNotifications";
import { type SSHCredentialStatus } from "./useSSHCredentialToken";
import { type ConnectionStatus } from "./useTerminalSocket";
import { type TerminalUploadProgressState } from "./useTerminalUploadProgress";

type CredentialTarget = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  sshReady: boolean;
  windowIndex: number | null;
};

type AppShellProps = {
  composerMode: ComposerMode;
  composerValue: string;
  createTerminalWebSocketURL: ((status: ConnectionStatus) => Promise<string>) | null;
  credentialStatus: SSHCredentialStatus;
  error: string;
  gatewayToken: GatewayTokenState;
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
  terminalLoading: boolean;
  terminalUploadProgress: TerminalUploadProgressState | null;
  terminalUploadProgressHandlers: {
    failUpload: (message: string) => void;
    finishUpload: (message: string) => void;
    startUpload: (fileName: string) => void;
    updateUpload: (next: Partial<Omit<TerminalUploadProgressState, "fileName" | "hidden">>) => void;
  };
  terminalSessionKey: string;
  tmuxFallbackActive: boolean;
  tmuxInstallPending: boolean;
  windowListSessionName: string;
  sessionHandlers: {
    onBackToSessions: () => void;
    onConnectionClosed: () => void;
    onConnectionReady: (status: ConnectionStatus) => void;
    onCreateWindow: (sessionName: string) => void;
    onDeleteWindow: (sessionName: string, windowIndex: number) => void;
    onDeleteSession: (sessionName: string) => void;
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
    onComposerUploadImage: ((file: File) => Promise<void>) | null;
    onComposerValueChange: (value: string) => void;
  };
  onConnectionError: (message: string) => void;
  onConnectionBlocked?: (message: string) => boolean;
  onCreateHost: (input: CreateHostInput) => Promise<void>;
  onDeleteHost: (hostId: string) => Promise<void>;
  onDrafted: () => void;
  onMobilePanelChange: (panel: MobilePanel) => void;
  onMobileSheetChange: (sheet: MobileTerminalSheet | null) => void;
  onNewSessionNameChange: (value: string) => void;
  onNotificationsEnabledChange: (enabled: boolean) => void;
  onPasteTerminalFile: ((file: File) => Promise<string>) | null;
  onQueuedInputSent: (inputId: number) => void;
  onSaveSessionMetadata: (input: SaveSessionMetadataInput) => Promise<void>;
  onSelectHost: (hostId: string) => void;
  onShowHostForm: (show: boolean) => void;
  onTogglePin: () => void;
  onTrustHost: () => void;
  onUploadTerminalFile: ((file: File) => Promise<void>) | null;
  onUpdateHost: (hostId: string, input: CreateHostInput) => Promise<void>;
  onInstallTmux: () => void;
  onTerminalUploadProgressHide: () => void;
  terminalReconnectSignal: number;
};

export function AppShell(props: AppShellProps) {
  const pwaInstallPrompt = usePWAInstallPrompt();
  const [hostsCollapsed, setHostsCollapsed] = useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);

  if (!props.gatewayToken.ready) {
    return <GatewayUnlockPage error={props.error} tokenState={props.gatewayToken} />;
  }

  return (
    <main className={appShellClassName({
      hostsCollapsed,
      isMobileTerminalActive: props.isMobileTerminalActive,
      sessionsCollapsed,
    })}>
      <Sidebar
        desktopCollapsed={hostsCollapsed}
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
        onDesktopCollapsedChange={setHostsCollapsed}
        onUpdateHost={props.onUpdateHost}
      />

      <SessionList
        credentialStatus={props.credentialStatus}
        desktopCollapsed={sessionsCollapsed}
        expandedSessionNames={props.expandedSessionNames}
        mobileOpen={props.mobilePanel === "sessions"}
        mobileWindowList={props.mobileWindowList}
        newSessionName={props.newSessionName}
        notificationsEnabled={props.notifications.enabled}
        notificationStatus={props.notifications.status}
        selectedSessionName={props.selectedSessionName}
        selectedWindowIndex={props.selectedWindowIndex}
        sessions={props.sessions}
        tmuxFallbackActive={props.tmuxFallbackActive}
        windowListSessionName={props.windowListSessionName}
        onCreateSession={props.sessionHandlers.onCreateSession}
        onCreateWindow={props.sessionHandlers.onCreateWindow}
        onDeleteWindow={props.sessionHandlers.onDeleteWindow}
        onDeleteSession={props.sessionHandlers.onDeleteSession}
        onDesktopCollapsedChange={setSessionsCollapsed}
        onExpandSession={props.sessionHandlers.onExpandSession}
        onListSessions={props.sessionHandlers.onListSessions}
        onNewSessionNameChange={props.onNewSessionNameChange}
        onNotificationsEnabledChange={props.onNotificationsEnabledChange}
        onOpenWindow={props.sessionHandlers.onOpenWindow}
        onRenameSession={props.sessionHandlers.onRenameSession}
        onRenameWindow={props.sessionHandlers.onRenameWindow}
      />

      <ConversationPane
        composerMode={props.composerMode}
        composerValue={props.composerValue}
        createTerminalWebSocketURL={props.createTerminalWebSocketURL}
        host={props.selectedHost}
        loadScrollbackHistory={props.loadScrollbackHistory}
        mobileSheet={props.mobileSheet}
        queuedInput={props.queuedInput}
        selectedSession={props.selectedSession}
        selectedWindowName={props.selectedWindowName}
        target={props.target}
        terminalLoading={props.terminalLoading}
        terminalUploadProgressHandlers={props.terminalUploadProgressHandlers}
        terminalSessionKey={props.terminalSessionKey}
        tmuxFallbackActive={props.tmuxFallbackActive}
        tmuxInstallPending={props.tmuxInstallPending}
        onBackToSessions={props.sessionHandlers.onBackToSessions}
        onComposerModeChange={props.composerHandlers.onComposerModeChange}
        onComposerSubmit={props.composerHandlers.onComposerSubmit}
        onComposerUploadImage={props.composerHandlers.onComposerUploadImage}
        onComposerValueChange={props.composerHandlers.onComposerValueChange}
        onConnectionError={props.onConnectionError}
        onConnectionBlocked={props.onConnectionBlocked}
        onConnectionClosed={props.sessionHandlers.onConnectionClosed}
        onConnectionReady={props.sessionHandlers.onConnectionReady}
        onCreateWindow={props.sessionHandlers.onCreateWindow}
        onDeleteWindow={props.sessionHandlers.onDeleteWindow}
        onDrafted={props.onDrafted}
        onInstallTmux={props.onInstallTmux}
        onMobileSheetChange={props.onMobileSheetChange}
        onOpenWindow={props.sessionHandlers.onOpenWindow}
        onPasteTerminalFile={props.onPasteTerminalFile}
        onQueuedInputSent={props.onQueuedInputSent}
        onRenameWindow={props.sessionHandlers.onRenameWindow}
        onSaveSessionMetadata={props.onSaveSessionMetadata}
        onTogglePin={props.onTogglePin}
        onTrustHost={props.onTrustHost}
        onUploadTerminalFile={props.onUploadTerminalFile}
        terminalReconnectSignal={props.terminalReconnectSignal}
      />
      <TerminalUploadProgressToast
        progress={props.terminalUploadProgress}
        onHide={props.onTerminalUploadProgressHide}
      />
      <MobileNavigation activePanel={props.mobilePanel} hidden={props.isMobileTerminalActive} onPanelChange={props.onMobilePanelChange} />
    </main>
  );
}

function appShellClassName(options: {
  hostsCollapsed: boolean;
  isMobileTerminalActive: boolean;
  sessionsCollapsed: boolean;
}) {
  return [
    "app-shell",
    options.hostsCollapsed ? "hosts-collapsed" : "",
    options.sessionsCollapsed ? "sessions-collapsed" : "",
    options.isMobileTerminalActive ? "mobile-terminal-active" : "",
  ].filter(Boolean).join(" ");
}
