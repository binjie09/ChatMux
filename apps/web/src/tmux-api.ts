import { request, tmuxSessionPath, type TmuxSession } from "./api";

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

export async function renameTmuxSession(hostId: string, sessionName: string, credentialToken: string, name: string): Promise<TmuxSession[]> {
  return request<TmuxSession[]>(`${tmuxSessionPath(hostId, sessionName)}/rename`, {
    method: "POST",
    body: JSON.stringify({ credentialToken, name }),
  });
}

export async function createTmuxWindow(hostId: string, sessionName: string, credentialToken: string, name: string): Promise<TmuxSession[]> {
  return request<TmuxSession[]>(`${tmuxSessionPath(hostId, sessionName)}/windows`, {
    method: "POST",
    body: JSON.stringify({ credentialToken, name }),
  });
}

export async function deleteTmuxWindow(hostId: string, sessionName: string, credentialToken: string, windowIndex: number): Promise<TmuxSession[]> {
  return request<TmuxSession[]>(`${tmuxSessionPath(hostId, sessionName)}/windows/delete`, {
    method: "POST",
    body: JSON.stringify({ credentialToken, windowIndex }),
  });
}

export async function renameTmuxWindow(hostId: string, sessionName: string, credentialToken: string, windowIndex: number, name: string): Promise<TmuxSession[]> {
  return request<TmuxSession[]>(`${tmuxSessionPath(hostId, sessionName)}/windows/rename`, {
    method: "POST",
    body: JSON.stringify({ credentialToken, windowIndex, name }),
  });
}
