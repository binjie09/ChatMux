export type SSHAuthMethod = "password" | "private_key";

export type Host = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  status: "offline" | "connecting" | "online" | "error";
  hostKeyFingerprint: string;
  sshAuthMethod: SSHAuthMethod;
  hasPassword: boolean;
  hasCredential: boolean;
  pinned: boolean;
  owner: string;
  updatedAt: string;
};

export type CreateHostInput = {
  name: string;
  hostname: string;
  password?: string;
  privateKey?: string;
  privateKeyPassphrase?: string;
  port: number;
  sshAuthMethod: SSHAuthMethod;
  username: string;
};

export type UpdateHostInput = Partial<CreateHostInput>;

export type TmuxSession = {
  id: string;
  name: string;
  windows: number;
  windowList: TmuxWindow[];
  attached: boolean;
  updatedAt: string;
  status: SessionStatus;
  processName: string;
  title: string;
  tags: string[];
  owner: string;
  mode: "ssh" | "tmux";
};

export type TmuxWindow = {
  id: string;
  index: number;
  name: string;
  active: boolean;
  updatedAt: string;
  status: SessionStatus;
  processName: string;
};

export type SessionStatus = "done" | "failed" | "idle" | "running" | "unknown" | "waiting";

export type AuditEvent = {
  id: string;
  type: string;
  hostId: string;
  sessionName: string;
  message: string;
  createdAt: string;
};

export type TranscriptChunk = {
  id: string;
  kind: "command" | "output";
  text: string;
};

export type TmuxHistory = {
  chunks: TranscriptChunk[];
  text: string;
};

export type CaptureTmuxHistoryOptions = {
  lines?: number;
  preserveAnsi?: boolean;
  windowIndex?: number;
};

export type TranscriptSummary = {
  model: string;
  summary: string;
};

export type CommandDraft = {
  command: string;
  explanation: string;
  model: string;
  risk: "low" | "medium" | "high";
};

export type SSHCredential = {
  token: string;
  expiresIn: number;
};

export type TerminalTokenResponse = {
  token: string;
  expiresIn: number;
};

export type CreateTerminalTokenInput = {
  credentialToken: string;
  mode?: "ssh" | "tmux";
  recovering: boolean;
  windowIndex?: number;
};

export type UploadTerminalImageInput = {
  credentialToken: string;
  dataBase64: string;
  mimeType: string;
};

export type UploadTerminalImageResponse = {
  remotePath: string;
};

export type SaveSessionMetadataInput = {
  title: string;
  tags: string[];
};

export type TmuxSessionMetadata = {
  hostId: string;
  sessionName: string;
  title: string;
  tags: string[];
  owner: string;
  updatedAt: string;
};
