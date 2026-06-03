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
};

export type CreateHostInput = {
  name: string;
  hostname: string;
  port: number;
  username: string;
};

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

export async function trustHost(hostId: string): Promise<Host> {
  const response = await request<{ host: Host }>(`/api/hosts/${hostId}/ssh/trust`, {
    method: "POST",
  });
  return response.host;
}

export async function setHostPinned(hostId: string, pinned: boolean): Promise<Host> {
  return request<Host>(`/api/hosts/${hostId}/pin`, {
    method: "POST",
    body: JSON.stringify({ pinned }),
  });
}

export async function listTmuxSessions(hostId: string, password: string): Promise<TmuxSession[]> {
  return request<TmuxSession[]>(`/api/hosts/${hostId}/tmux/sessions/list`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function createTmuxSession(hostId: string, password: string, name: string): Promise<TmuxSession> {
  return request<TmuxSession>(`/api/hosts/${hostId}/tmux/sessions`, {
    method: "POST",
    body: JSON.stringify({ name, password }),
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

export async function createTerminalToken(hostId: string, sessionName: string, password: string): Promise<string> {
  const response = await request<TerminalTokenResponse>(`/api/hosts/${hostId}/tmux/sessions/${sessionName}/terminal-token`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  return response.token;
}

export async function captureTmuxHistory(hostId: string, sessionName: string, password: string): Promise<TmuxHistory> {
  return request<TmuxHistory>(`/api/hosts/${hostId}/tmux/sessions/${sessionName}/history`, {
    method: "POST",
    body: JSON.stringify({ password }),
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
