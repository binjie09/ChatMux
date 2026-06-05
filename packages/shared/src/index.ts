export type Host = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  status: "offline" | "connecting" | "online" | "error";
};

export type TmuxSession = {
  id: string;
  hostId: string;
  name: string;
  windows: number;
  windowList: TmuxWindow[];
  attached: boolean;
  updatedAt: string;
  status: SessionStatus;
  processName: string;
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

export type TranscriptEntry = {
  id: string;
  sessionId: string;
  kind: "command" | "output" | "system";
  text: string;
  createdAt: string;
};
