const gatewayURL = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8080";

export type Host = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  status: "offline" | "connecting" | "online" | "error";
  hostKeyFingerprint: string;
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
};

type TerminalTokenResponse = {
  token: string;
  expiresIn: number;
};

export async function listHosts(): Promise<Host[]> {
  return request<Host[]>("/api/hosts");
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

export async function createTerminalToken(hostId: string, sessionName: string, password: string): Promise<string> {
  const response = await request<TerminalTokenResponse>(`/api/hosts/${hostId}/tmux/sessions/${sessionName}/terminal-token`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  return response.token;
}

export function terminalWebSocketURL(token: string) {
  const url = new URL(gatewayURL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/terminal";
  url.search = "";
  url.searchParams.set("token", token);
  return url.toString();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(gatewayURL + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}
