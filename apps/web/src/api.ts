const desktopGatewayURL = "http://127.0.0.1:19327";
const gatewayURL = import.meta.env.VITE_GATEWAY_URL ?? defaultGatewayURL();

let gatewayAccessToken = "";

export type Host = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  status: "offline" | "connecting" | "online" | "error";
  hostKeyFingerprint: string;
  pinned: boolean;
  owner: string;
  shared: boolean;
};

export type CreateHostInput = {
  name: string;
  hostname: string;
  port: number;
  username: string;
};

export type UpdateHostInput = Partial<CreateHostInput>;

export type TmuxSession = {
  id: string;
  name: string;
  windows: number;
  attached: boolean;
  updatedAt: string;
  status: "idle" | "running" | "waiting" | "failed" | "unknown";
  title: string;
  tags: string[];
};

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

export async function createSSHCredential(hostId: string, password: string): Promise<SSHCredential> {
  return request<SSHCredential>(`/api/hosts/${hostId}/ssh/credentials`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function setHostPinned(hostId: string, pinned: boolean): Promise<Host> {
  return request<Host>(`/api/hosts/${hostId}/pin`, {
    method: "POST",
    body: JSON.stringify({ pinned }),
  });
}

export async function setHostShared(hostId: string, shared: boolean): Promise<Host> {
  return request<Host>(`/api/hosts/${hostId}/share`, {
    method: "POST",
    body: JSON.stringify({ shared }),
  });
}

export async function listTmuxSessions(hostId: string, credentialToken: string): Promise<TmuxSession[]> {
  return request<TmuxSession[]>(`/api/hosts/${hostId}/tmux/sessions/list`, {
    method: "POST",
    body: JSON.stringify({ credentialToken }),
  });
}

export async function createTmuxSession(hostId: string, credentialToken: string, name: string): Promise<TmuxSession> {
  return request<TmuxSession>(`/api/hosts/${hostId}/tmux/sessions`, {
    method: "POST",
    body: JSON.stringify({ credentialToken, name }),
  });
}

export async function saveSessionMetadata(hostId: string, sessionName: string, title: string, tags: string[]): Promise<TmuxSessionMetadata> {
  return request<TmuxSessionMetadata>(`/api/hosts/${hostId}/tmux/sessions/${sessionName}/metadata`, {
    method: "POST",
    body: JSON.stringify({ tags, title }),
  });
}

export type TmuxSessionMetadata = {
  hostId: string;
  sessionName: string;
  title: string;
  tags: string[];
  updatedAt: string;
};

export async function createTerminalToken(hostId: string, sessionName: string, credentialToken: string): Promise<string> {
  const response = await request<TerminalTokenResponse>(`/api/hosts/${hostId}/tmux/sessions/${sessionName}/terminal-token`, {
    method: "POST",
    body: JSON.stringify({ credentialToken }),
  });
  return response.token;
}

export async function captureTmuxHistory(hostId: string, sessionName: string, credentialToken: string): Promise<TmuxHistory> {
  return request<TmuxHistory>(`/api/hosts/${hostId}/tmux/sessions/${sessionName}/history`, {
    method: "POST",
    body: JSON.stringify({ credentialToken }),
  });
}

export async function summarizeTmuxHistory(hostId: string, sessionName: string, credentialToken: string): Promise<TranscriptSummary> {
  return request<TranscriptSummary>(`/api/hosts/${hostId}/tmux/sessions/${sessionName}/summary`, {
    method: "POST",
    body: JSON.stringify({ credentialToken }),
  });
}

export async function draftTmuxCommand(hostId: string, sessionName: string, credentialToken: string, prompt: string): Promise<CommandDraft> {
  return request<CommandDraft>(`/api/hosts/${hostId}/tmux/sessions/${sessionName}/command-draft`, {
    method: "POST",
    body: JSON.stringify({ credentialToken, prompt }),
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

function defaultGatewayURL() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return "";
  }
  return desktopGatewayURL;
}
