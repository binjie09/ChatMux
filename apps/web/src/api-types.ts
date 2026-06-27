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
  createdAt: string;
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
  autoRename: boolean;
  paneTitle: string;
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

export type HostHeartbeatResponse = {
  error?: string;
  host: Host;
  ok: boolean;
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

export type UploadTerminalFileInput = {
  credentialToken: string;
  dataBase64: string;
  fileName: string;
  mimeType: string;
};

export type UploadTerminalFileResponse = {
  remotePath: string;
};

export type RemoteFileEntry = {
  name: string;
  path: string;
  size: number;
  mode: string;
  modTime: string;
  isDir: boolean;
};

export type RemoteFileList = {
  path: string;
  parent: string;
  entries: RemoteFileEntry[];
};

export type ResolveRemoteFilePathInput = {
  credentialToken: string;
  path?: string;
  windowIndex?: number;
};

export type ListRemoteFilesInput = {
  credentialToken: string;
  path: string;
};

export type UploadRemoteFileInput = {
  credentialToken: string;
  dataBase64: string;
  directory: string;
  fileName: string;
};

export type UploadRemoteFileResponse = {
  remotePath: string;
};

export type DownloadRemoteFileInput = {
  credentialToken: string;
  path: string;
};

export type DeleteRemoteFileInput = {
  credentialToken: string;
  path: string;
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

export type HostLastWindow = {
  hostId: string;
  sessionName: string;
  windowIndex: number;
  updatedAt: string;
};
