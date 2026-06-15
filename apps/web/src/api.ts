import { usesLocalGateway } from "./runtime-platform";
import type {
  AuditEvent,
  CaptureTmuxHistoryOptions,
  CommandDraft,
  CreateHostInput,
  CreateTerminalTokenInput,
  DeleteRemoteFileInput,
  DownloadRemoteFileInput,
  Host,
  HostHeartbeatResponse,
  HostLastWindow,
  ListRemoteFilesInput,
  RemoteFileList,
  ResolveRemoteFilePathInput,
  SaveSessionMetadataInput,
  SSHCredential,
  TerminalTokenResponse,
  TmuxHistory,
  TmuxSessionMetadata,
  TranscriptSummary,
  UpdateHostInput,
  UploadRemoteFileInput,
  UploadRemoteFileResponse,
  UploadTerminalImageInput,
  UploadTerminalImageResponse,
} from "./api-types";

export type {
  AuditEvent,
  CaptureTmuxHistoryOptions,
  CommandDraft,
  CreateHostInput,
  CreateTerminalTokenInput,
  Host,
  HostHeartbeatResponse,
  HostLastWindow,
  DeleteRemoteFileInput,
  DownloadRemoteFileInput,
  ListRemoteFilesInput,
  RemoteFileEntry,
  RemoteFileList,
  ResolveRemoteFilePathInput,
  SaveSessionMetadataInput,
  SessionStatus,
  SSHAuthMethod,
  SSHCredential,
  TmuxHistory,
  TmuxSession,
  TmuxSessionMetadata,
  TmuxWindow,
  TranscriptChunk,
  TranscriptSummary,
  UpdateHostInput,
  UploadRemoteFileInput,
  UploadRemoteFileResponse,
  UploadTerminalFileInput,
  UploadTerminalFileResponse,
  UploadTerminalImageInput,
  UploadTerminalImageResponse,
} from "./api-types";

const localGatewayURL = "http://127.0.0.1:19327";
const gatewayURL = import.meta.env.VITE_GATEWAY_URL ?? defaultGatewayURL();
const jsonContentType = "application/json";

let gatewayAccessToken = "";

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

export async function heartbeatHost(hostId: string): Promise<HostHeartbeatResponse> {
  return request<HostHeartbeatResponse>(`/api/hosts/${hostId}/ssh/heartbeat`, {
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

export async function saveSessionMetadata(hostId: string, sessionName: string, input: SaveSessionMetadataInput): Promise<TmuxSessionMetadata> {
  return request<TmuxSessionMetadata>(`${tmuxSessionPath(hostId, sessionName)}/metadata`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getHostLastWindow(hostId: string): Promise<HostLastWindow | null> {
  try {
    return await request<HostLastWindow>(`/api/hosts/${hostId}/last-window`);
  } catch {
    // No last window recorded yet (404) or the request failed — nothing to restore.
    return null;
  }
}

export async function saveHostLastWindow(hostId: string, sessionName: string, windowIndex: number): Promise<HostLastWindow> {
  return request<HostLastWindow>(`/api/hosts/${hostId}/last-window`, {
    method: "POST",
    body: JSON.stringify({ sessionName, windowIndex }),
  });
}

export async function createTerminalToken(hostId: string, sessionName: string, input: CreateTerminalTokenInput): Promise<string> {
  const response = await request<TerminalTokenResponse>(`${tmuxSessionPath(hostId, sessionName)}/terminal-token`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.token;
}

export async function resolveRemoteFilePath(
  hostId: string,
  sessionName: string,
  input: ResolveRemoteFilePathInput,
): Promise<string> {
  const response = await request<{ path: string }>(`${tmuxSessionPath(hostId, sessionName)}/files/resolve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.path;
}

export async function listRemoteFiles(
  hostId: string,
  sessionName: string,
  input: ListRemoteFilesInput,
): Promise<RemoteFileList> {
  return request<RemoteFileList>(`${tmuxSessionPath(hostId, sessionName)}/files/list`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadRemoteFile(
  hostId: string,
  sessionName: string,
  input: UploadRemoteFileInput,
): Promise<UploadRemoteFileResponse> {
  return request<UploadRemoteFileResponse>(`${tmuxSessionPath(hostId, sessionName)}/files/upload`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function downloadRemoteFile(
  hostId: string,
  sessionName: string,
  input: DownloadRemoteFileInput,
): Promise<Blob> {
  return requestBlob(`${tmuxSessionPath(hostId, sessionName)}/files/download`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteRemoteFile(
  hostId: string,
  sessionName: string,
  input: DeleteRemoteFileInput,
): Promise<void> {
  await requestWithoutBody(`${tmuxSessionPath(hostId, sessionName)}/files/delete`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadTerminalImage(
  hostId: string,
  sessionName: string,
  input: UploadTerminalImageInput,
): Promise<UploadTerminalImageResponse> {
  return request<UploadTerminalImageResponse>(`${tmuxSessionPath(hostId, sessionName)}/terminal-images`, {
    method: "POST",
    body: JSON.stringify(input),
  });
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
  validateJSONResponse(response, path);
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

async function requestBlob(path: string, init: RequestInit = {}) {
  const response = await fetch(gatewayURL + path, {
    ...init,
    headers: requestHeaders(init.headers),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.blob();
}

export function requestHeaders(initHeaders?: HeadersInit) {
  return new Headers(requestHeaderEntries(initHeaders));
}

function requestHeaderEntries(initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders);
  headers.set("Content-Type", jsonContentType);
  if (gatewayAccessToken) {
    headers.set("Authorization", `Bearer ${gatewayAccessToken}`);
  }
  return Array.from(headers.entries());
}

export function tmuxSessionPath(hostId: string, sessionName: string) {
  return `/api/hosts/${hostId}/tmux/sessions/${encodeURIComponent(sessionName)}`;
}

export function uploadRequestURL(path: string) {
  return gatewayURL + path;
}

function defaultGatewayURL() {
  if (usesLocalGateway()) {
    return localGatewayURL;
  }
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return "";
  }
  return localGatewayURL;
}

function validateJSONResponse(response: Response, path: string) {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes(jsonContentType)) {
    return;
  }
  throw new Error(`Gateway returned non-JSON for ${path}: ${response.status} ${contentType}`);
}
