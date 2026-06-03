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
