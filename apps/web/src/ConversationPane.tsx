import { type ReactNode } from "react";
import { type AuditEvent, type Host, type SaveSessionMetadataInput, type TranscriptChunk } from "./api";
import { AuditPanel } from "./AuditPanel";
import { Composer, type ComposerMode } from "./Composer";
import { CommandDraftPanel } from "./CommandDraftPanel";
import { HistoryPanel } from "./HistoryPanel";
import { HostActions } from "./HostActions";
import { MobileTerminalBar, MobileTerminalSheetPanel, type MobileTerminalSheet } from "./MobileTerminalChrome";
import { NativeTerminal, type QueuedTerminalInput } from "./NativeTerminal";
import { SessionMetadataEditor } from "./SessionMetadataEditor";
import { TerminalWindowTabs } from "./TerminalWindowTabs";
import { type DisplayTmuxSession } from "./session-state-machine";
import { type ConnectionStatus } from "./useTerminalSocket";

type CredentialTarget = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  sshReady: boolean;
  windowIndex: number | null;
};

type ConversationPaneProps = {
  auditEvents: AuditEvent[];
  composerMode: ComposerMode;
  composerValue: string;
  createTerminalWebSocketURL: ((status: ConnectionStatus) => Promise<string>) | null;
  historyChunks: TranscriptChunk[];
  historyQuery: string;
  historyText: string;
  host: Host | undefined;
  loadScrollbackHistory: ((lines: number) => Promise<string>) | null;
  mobileSheet: MobileTerminalSheet | null;
  queuedInput: QueuedTerminalInput | null;
  selectedSession: DisplayTmuxSession | undefined;
  selectedWindowName: string;
  terminalSessionKey: string;
  target: CredentialTarget;
  onBackToSessions: () => void;
  onComposerModeChange: (mode: ComposerMode) => void;
  onComposerSubmit: (data: string) => void;
  onComposerValueChange: (value: string) => void;
  onConnectionError: (message: string) => void;
  onConnectionReady: (status: ConnectionStatus) => void;
  onConnectionClosed: () => void;
  onCreateWindow: (sessionName: string) => void;
  onDeleteWindow: (sessionName: string, windowIndex: number) => void;
  onDrafted: () => void;
  onHistoryQueryChange: (query: string) => void;
  onMobileSheetChange: (sheet: MobileTerminalSheet | null) => void;
  onOpenWindow: (sessionName: string, windowIndex: number) => void;
  onRenameWindow: (sessionName: string, windowIndex: number, name: string) => Promise<void> | void;
  onSaveSessionMetadata: (input: SaveSessionMetadataInput) => Promise<void>;
  onTogglePin: () => void;
  onToggleShare: () => void;
  onTrustHost: () => void;
};

export function ConversationPane(props: ConversationPaneProps) {
  const contextPanels = renderContextPanels(props);
  const draftPanel = renderDraftPanel(props);

  return (
    <section className="conversation">
      <MobileTerminalBar
        hostName={props.host?.name ?? "No host"}
        sessionName={props.selectedSession?.name ?? "No session"}
        title={sessionTitle(props.selectedSession)}
        windowName={props.selectedWindowName}
        windows={props.selectedSession?.windowList ?? []}
        selectedWindowIndex={props.target.windowIndex}
        onBack={props.onBackToSessions}
        onCreateWindow={() => props.selectedSession ? props.onCreateWindow(props.selectedSession.name) : undefined}
        onOpenSheet={props.onMobileSheetChange}
        onOpenWindow={(windowIndex) => {
          if (props.selectedSession) {
            props.onOpenWindow(props.selectedSession.name, windowIndex);
          }
        }}
      />
      <header className="conversation-header">
        <div>
          <p>{conversationSubtitle(props.host?.name, props.selectedWindowName)}</p>
          <h2>{sessionTitle(props.selectedSession)}</h2>
          <SessionMetadataEditor session={props.selectedSession} onSave={props.onSaveSessionMetadata} />
        </div>
        <HostActions host={props.host} onTogglePin={props.onTogglePin} onToggleShare={props.onToggleShare} onTrustHost={props.onTrustHost} />
      </header>

      <div className="terminal-workspace">
        <div className="terminal-column">
          <TerminalWindowTabs
            selectedWindowIndex={props.target.windowIndex}
            session={props.selectedSession}
            onCreateWindow={props.onCreateWindow}
            onDeleteWindow={props.onDeleteWindow}
            onOpenWindow={props.onOpenWindow}
            onRenameWindow={props.onRenameWindow}
          />
          <NativeTerminal
            createWebSocketURL={props.terminalSessionKey ? props.createTerminalWebSocketURL : null}
            loadScrollbackHistory={props.loadScrollbackHistory}
            queuedInput={props.queuedInput}
            sessionKey={props.terminalSessionKey}
            onConnectionClosed={props.onConnectionClosed}
            onConnectionError={props.onConnectionError}
            onConnectionReady={props.onConnectionReady}
          />
        </div>
        <div className="context-stack">{contextPanels}</div>
      </div>

      <Composer
        draftPanel={draftPanel}
        mode={props.composerMode}
        value={props.composerValue}
        onModeChange={props.onComposerModeChange}
        onSubmit={props.onComposerSubmit}
        onValueChange={props.onComposerValueChange}
      />
      <MobileSheet open={props.mobileSheet === "context"} title="Context" onClose={() => props.onMobileSheetChange(null)}>
        {contextPanels}
      </MobileSheet>
      <MobileSheet open={props.mobileSheet === "draft"} title="Command Draft" onClose={() => props.onMobileSheetChange(null)}>
        {draftPanel}
      </MobileSheet>
    </section>
  );
}

function renderContextPanels(props: ConversationPaneProps) {
  return (
    <>
      <HistoryPanel
        chunks={props.historyChunks}
        query={props.historyQuery}
        summaryTarget={props.target}
        text={props.historyText}
        onQueryChange={props.onHistoryQueryChange}
        onSummarized={props.onDrafted}
      />
      <AuditPanel events={props.auditEvents} />
    </>
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

function MobileSheet(props: { children: ReactNode; open: boolean; title: string; onClose: () => void }) {
  return (
    <MobileTerminalSheetPanel open={props.open} title={props.title} onClose={props.onClose}>
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
