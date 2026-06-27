import { type ReactNode, useState } from "react";
import { Download } from "lucide-react";
import { type Host, type RemoteFileEntry, type SaveSessionMetadataInput } from "./api";
import { Composer, type ComposerMode } from "./Composer";
import { CommandDraftPanel } from "./CommandDraftPanel";
import { FileTreePanel } from "./FileTreePanel";
import { downloadRemoteFileEntry } from "./file-tree-utils";
import { HostActions } from "./HostActions";
import { MobileTerminalBar, MobileTerminalSheetPanel, type MobileTerminalSheet } from "./MobileTerminalChrome";
import { NativeTerminal, type QueuedTerminalInput } from "./NativeTerminal";
import { SessionMetadataEditor } from "./SessionMetadataEditor";
import { TerminalWindowTabs } from "./TerminalWindowTabs";
import { OverflowText } from "./OverflowText";
import { type DisplayTmuxSession } from "./session-state-machine";
import { type ConnectionStatus } from "./useTerminalSocket";
import { type TerminalUploadProgressState } from "./useTerminalUploadProgress";
import { errorMessage } from "./view-utils";

type CredentialTarget = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  sshReady: boolean;
  windowIndex: number | null;
};

type ConversationPaneProps = {
  composerMode: ComposerMode;
  composerValue: string;
  createTerminalWebSocketURL: ((status: ConnectionStatus) => Promise<string>) | null;
  host: Host | undefined;
  loadScrollbackHistory: ((lines: number) => Promise<string>) | null;
  mobileSheet: MobileTerminalSheet | null;
  queuedInput: QueuedTerminalInput | null;
  selectedSession: DisplayTmuxSession | undefined;
  selectedWindowName: string;
  terminalLoading: boolean;
  terminalSessionKey: string;
  target: CredentialTarget;
  terminalUploadProgressHandlers: {
    failUpload: (message: string) => void;
    finishUpload: (message: string) => void;
    startUpload: (fileName: string) => void;
    updateUpload: (next: Partial<Omit<TerminalUploadProgressState, "fileName" | "hidden">>) => void;
  };
  tmuxFallbackActive: boolean;
  tmuxInstallPending: boolean;
  onBackToSessions: () => void;
  onComposerModeChange: (mode: ComposerMode) => void;
  onComposerSubmit: (data: string) => void;
  onComposerUploadImage: ((file: File) => Promise<void>) | null;
  onComposerValueChange: (value: string) => void;
  onConnectionError: (message: string) => void;
  onConnectionReady: (status: ConnectionStatus) => void;
  onConnectionClosed: () => void;
  onConnectionBlocked?: (message: string) => boolean;
  onCreateWindow: (sessionName: string) => void;
  onDeleteWindow: (sessionName: string, windowIndex: number) => void;
  onDrafted: () => void;
  onInstallTmux: () => void;
  onMobileSheetChange: (sheet: MobileTerminalSheet | null) => void;
  onMoveWindow: (sessionName: string, fromWindowIndex: number, toWindowIndex: number) => void;
  onOpenWindow: (sessionName: string, windowIndex: number) => void;
  onPasteTerminalFile: ((file: File) => Promise<string>) | null;
  onQueuedInputSent: (inputId: number) => void;
  onUploadTerminalFile: ((file: File) => Promise<void>) | null;
  onRenameWindow: (sessionName: string, windowIndex: number, name: string) => Promise<void> | void;
  onSaveSessionMetadata: (input: SaveSessionMetadataInput) => Promise<void>;
  onTogglePin: () => void;
  onTrustHost: () => void;
  terminalReconnectSignal: number;
};

export function ConversationPane(props: ConversationPaneProps) {
  const [mobileSelectedFile, setMobileSelectedFile] = useState<RemoteFileEntry | null>(null);
  const fileTree = renderFileTree(props, false, undefined);
  const draftPanel = renderDraftPanel(props);
  const mobileFileTree = renderFileTree(props, true, setMobileSelectedFile);

  return (
    <section className={`conversation ${props.terminalLoading ? "terminal-loading" : ""}`}>
      <MobileTerminalBar
        hostName={props.host?.name ?? "No host"}
        loading={props.terminalLoading}
        sessionName={props.terminalLoading ? "Loading" : props.selectedSession?.name ?? "No session"}
        title={props.terminalLoading ? "Terminal" : sessionTitle(props.selectedSession)}
        windowName={props.selectedWindowName}
        windows={props.selectedSession?.windowList ?? []}
        tmuxFallbackActive={props.tmuxFallbackActive}
        tmuxInstallPending={props.tmuxInstallPending}
        selectedWindowIndex={props.target.windowIndex}
        onBack={props.onBackToSessions}
        onCreateWindow={() => props.selectedSession ? props.onCreateWindow(props.selectedSession.name) : undefined}
        onInstallTmux={props.onInstallTmux}
        onOpenSheet={props.onMobileSheetChange}
        onOpenWindow={(windowIndex) => {
          if (props.selectedSession) {
            props.onOpenWindow(props.selectedSession.name, windowIndex);
          }
        }}
        onUploadFile={props.onUploadTerminalFile}
      />
      <header className="conversation-header">
        <div>
          <OverflowText as="p">{conversationSubtitle(props.host?.name, props.selectedWindowName)}</OverflowText>
          <OverflowText as="h2">{sessionTitle(props.selectedSession)}</OverflowText>
          <SessionMetadataEditor session={props.selectedSession} onSave={props.onSaveSessionMetadata} />
        </div>
        <HostActions host={props.host} onTogglePin={props.onTogglePin} onTrustHost={props.onTrustHost} />
      </header>

      <div className="terminal-workspace">
        <div className={`terminal-column ${props.tmuxFallbackActive ? "tmux-fallback" : ""}`}>
          <TmuxFallbackBanner
            active={props.tmuxFallbackActive}
            installing={props.tmuxInstallPending}
            onInstall={props.onInstallTmux}
          />
          <TerminalWindowTabs
            selectedWindowIndex={props.target.windowIndex}
            session={props.selectedSession}
            onCreateWindow={props.onCreateWindow}
            onDeleteWindow={props.onDeleteWindow}
            onMoveWindow={props.onMoveWindow}
            onOpenWindow={props.onOpenWindow}
            onRenameWindow={props.onRenameWindow}
          />
          <NativeTerminal
            createWebSocketURL={props.terminalSessionKey ? props.createTerminalWebSocketURL : null}
            loadScrollbackHistory={props.loadScrollbackHistory}
            loading={props.terminalLoading}
            queuedInput={props.queuedInput}
            sessionKey={props.terminalSessionKey}
            onConnectionClosed={props.onConnectionClosed}
            onConnectionBlocked={props.onConnectionBlocked}
            onConnectionError={props.onConnectionError}
            onConnectionReady={props.onConnectionReady}
            onPasteFile={props.onPasteTerminalFile}
            onQueuedInputSent={props.onQueuedInputSent}
            reconnectSignal={props.terminalReconnectSignal}
          />
        </div>
        <div className="context-stack">{fileTree}</div>
      </div>

      {props.terminalLoading ? null : (
        <Composer
          draftPanel={draftPanel}
          mode={props.composerMode}
          value={props.composerValue}
          onModeChange={props.onComposerModeChange}
          onSubmit={props.onComposerSubmit}
          onUploadImage={props.onComposerUploadImage}
          onValueChange={props.onComposerValueChange}
        />
      )}
      <MobileSheet
        action={mobileSelectedFile ? (
          <button
            type="button"
            aria-label="Download selected file"
            onClick={() => {
              void downloadRemoteFileEntry(props.target, mobileSelectedFile).catch((error) => props.onConnectionError(errorMessage(error)));
            }}
          >
            <Download size={19} aria-hidden="true" />
          </button>
        ) : null}
        open={props.mobileSheet === "files"}
        title="Files"
        onClose={() => props.onMobileSheetChange(null)}
      >
        {mobileFileTree}
      </MobileSheet>
      <MobileSheet open={props.mobileSheet === "draft"} title="Command Draft" onClose={() => props.onMobileSheetChange(null)}>
        {draftPanel}
      </MobileSheet>
    </section>
  );
}

function TmuxFallbackBanner(props: { active: boolean; installing: boolean; onInstall: () => void }) {
  if (!props.active) {
    return null;
  }
  return (
    <div className="tmux-fallback-banner">
      <div>
        <strong>SSH fallback tabs</strong>
        <span>Gateway keeps SSH shells running across refreshes. Install tmux for remote sessions, history, and summaries.</span>
      </div>
      <button type="button" disabled={props.installing} onClick={props.onInstall}>
        <Download size={15} aria-hidden="true" />
        {props.installing ? "Installing" : "Install tmux"}
      </button>
    </div>
  );
}

function renderFileTree(
  props: ConversationPaneProps,
  isMobile: boolean,
  onFileSelected: ((entry: RemoteFileEntry | null) => void) | undefined,
) {
  return (
    <FileTreePanel
      isMobile={isMobile}
      target={props.target}
      uploadProgress={props.terminalUploadProgressHandlers}
      onError={props.onConnectionError}
      onFileSelected={onFileSelected}
    />
  );
}

function renderDraftPanel(props: ConversationPaneProps) {
  return (
    <CommandDraftPanel
      target={props.target}
      onDrafted={props.onDrafted}
      onInsert={(command) => {
        props.onComposerModeChange("enter");
        props.onComposerValueChange(command);
        props.onMobileSheetChange(null);
      }}
    />
  );
}

function MobileSheet(props: { action?: ReactNode; children: ReactNode; open: boolean; title: string; onClose: () => void }) {
  return (
    <MobileTerminalSheetPanel action={props.action} open={props.open} title={props.title} onClose={props.onClose}>
      {props.children}
    </MobileTerminalSheetPanel>
  );
}

function sessionTitle(session: DisplayTmuxSession | undefined) {
  return session?.title || session?.name || "Terminal";
}

function conversationSubtitle(hostName: string | undefined, windowName: string) {
  if (windowName) {
    return `${hostName ?? "No host"} · ${windowName}`;
  }
  return hostName ?? "No host";
}
