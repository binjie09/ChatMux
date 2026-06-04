import { type ReactNode } from "react";
import { type AuditEvent, type Host, type SaveSessionMetadataInput, type TranscriptChunk, type TmuxSession } from "./api";
import { AuditPanel } from "./AuditPanel";
import { Composer, type ComposerMode } from "./Composer";
import { CommandDraftPanel } from "./CommandDraftPanel";
import { HistoryPanel } from "./HistoryPanel";
import { HostActions } from "./HostActions";
import { MobileTerminalBar, MobileTerminalSheetPanel, type MobileTerminalSheet } from "./MobileTerminalChrome";
import { NativeTerminal, type QueuedTerminalInput } from "./NativeTerminal";
import { SessionMetadataEditor } from "./SessionMetadataEditor";
import { type ConnectionStatus } from "./useTerminalSocket";

type CredentialTarget = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  sshReady: boolean;
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
  mobileSheet: MobileTerminalSheet | null;
  queuedInput: QueuedTerminalInput | null;
  selectedSession: TmuxSession | undefined;
  terminalSessionKey: string;
  target: CredentialTarget;
  onBackToSessions: () => void;
  onComposerModeChange: (mode: ComposerMode) => void;
  onComposerSubmit: (data: string) => void;
  onComposerValueChange: (value: string) => void;
  onConnectionError: (message: string) => void;
  onConnectionReady: (status: ConnectionStatus) => void;
  onDrafted: () => void;
  onHistoryQueryChange: (query: string) => void;
  onMobileSheetChange: (sheet: MobileTerminalSheet | null) => void;
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
        onBack={props.onBackToSessions}
        onOpenSheet={props.onMobileSheetChange}
      />
      <header className="conversation-header">
        <div>
          <p>{props.host?.name ?? "No host"}</p>
          <h2>{sessionTitle(props.selectedSession)}</h2>
          <SessionMetadataEditor session={props.selectedSession} onSave={props.onSaveSessionMetadata} />
        </div>
        <HostActions host={props.host} onTogglePin={props.onTogglePin} onToggleShare={props.onToggleShare} onTrustHost={props.onTrustHost} />
      </header>

      <div className="terminal-workspace">
        <NativeTerminal
          createWebSocketURL={props.terminalSessionKey ? props.createTerminalWebSocketURL : null}
          queuedInput={props.queuedInput}
          sessionKey={props.terminalSessionKey}
          onConnectionError={props.onConnectionError}
          onConnectionReady={props.onConnectionReady}
        />
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

function sessionTitle(session: TmuxSession | undefined) {
  return session?.title || session?.name || "Terminal";
}
