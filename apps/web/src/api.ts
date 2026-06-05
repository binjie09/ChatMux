const desktopGatewayURL = "http://127.0.0.1:19327";
const gatewayURL = import.meta.env.VITE_GATEWAY_URL ?? defaultGatewayURL();

let gatewayAccessToken = "";

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

type TerminalTokenResponse = {
  token: string;
  expiresIn: number;
};

export type CreateTerminalTokenInput = {
  credentialToken: string;
  recovering: boolean;
  windowIndex?: number;
};

export async function listHosts(): Promise<Host[]> {
  return request<Host[]>("/api/hosts");
}

export async function listAuditEvents(): Promise<AuditEvent[]> {
  return request<AuditEvent[]>("/api/audit-events");
}

export async function createHost(input: CreateHostInput): Promise<Host> {
  return request<Host>("/api/hosts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateHost(hostId: string, input: UpdateHostInput): Promise<Host> {
  return request<Host>(`/api/hosts/${hostId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteHost(hostId: string): Promise<void> {
  await requestWithoutBody(`/api/hosts/${hostId}`, {
    method: "DELETE",
  });
}

export async function trustHost(hostId: string): Promise<Host> {
  const response = await request<{ host: Host }>(`/api/hosts/${hostId}/ssh/trust`, {
    method: "POST",
  });
  return response.host;
}

export async function createSSHCredential(hostId: string): Promise<SSHCredential> {
  return request<SSHCredential>(`/api/hosts/${hostId}/ssh/credentials`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function setHostPinned(hostId: string, pinned: boolean): Promise<Host> {
  return request<Host>(`/api/hosts/${hostId}/pin`, {
    method: "POST",
    body: JSON.stringify({ pinned }),
  });
}

export type SaveSessionMetadataInput = {
  title: string;
  tags: string[];
};

export async function saveSessionMetadata(hostId: string, sessionName: string, input: SaveSessionMetadataInput): Promise<TmuxSessionMetadata> {
  return request<TmuxSessionMetadata>(`${tmuxSessionPath(hostId, sessionName)}/metadata`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type TmuxSessionMetadata = {
  hostId: string;
  sessionName: string;
  title: string;
  tags: string[];
  owner: string;
  updatedAt: string;
};

export async function createTerminalToken(hostId: string, sessionName: string, input: CreateTerminalTokenInput): Promise<string> {
  const response = await request<TerminalTokenResponse>(`${tmuxSessionPath(hostId, sessionName)}/terminal-token`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.token;
}

export async function captureTmuxHistory(
  hostId: string,
  sessionName: string,
  credentialToken: string,
  options: CaptureTmuxHistoryOptions = {},
): Promise<TmuxHistory> {
  return request<TmuxHistory>(`${tmuxSessionPath(hostId, sessionName)}/history`, {
    method: "POST",
    body: JSON.stringify({ credentialToken, ...options }),
  });
}

export async function summarizeTmuxHistory(
  hostId: string,
  sessionName: string,
  credentialToken: string,
  options: { windowIndex?: number } = {},
): Promise<TranscriptSummary> {
  return request<TranscriptSummary>(`${tmuxSessionPath(hostId, sessionName)}/summary`, {
    method: "POST",
    body: JSON.stringify({ credentialToken, ...options }),
  });
}

export async function draftTmuxCommand(
  hostId: string,
  sessionName: string,
  credentialToken: string,
  prompt: string,
  options: { windowIndex?: number } = {},
): Promise<CommandDraft> {
  return request<CommandDraft>(`${tmuxSessionPath(hostId, sessionName)}/command-draft`, {
    method: "POST",
    body: JSON.stringify({ credentialToken, prompt, ...options }),
  });
}

export function setGatewayAccessToken(token: string) {
  gatewayAccessToken = token.trim();
}

export function terminalWebSocketURL(token: string) {
  const url = new URL(gatewayURL || window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/terminal";
  url.search = "";
  url.searchParams.set("token", token);
  return url.toString();
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(gatewayURL + path, {
    ...init,
    headers: requestHeaders(init.headers),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

async function requestWithoutBody(path: string, init: RequestInit = {}) {
  const response = await fetch(gatewayURL + path, {
    ...init,
    headers: requestHeaders(init.headers),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function requestHeaders(initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders);
  headers.set("Content-Type", "application/json");
  if (gatewayAccessToken) {
    headers.set("Authorization", `Bearer ${gatewayAccessToken}`);
  }
  return headers;
}

export function tmuxSessionPath(hostId: string, sessionName: string) {
  return `/api/hosts/${hostId}/tmux/sessions/${encodeURIComponent(sessionName)}`;
}

function defaultGatewayURL() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return "";
  }
  return desktopGatewayURL;
}
