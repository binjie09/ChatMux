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
  attached: boolean;
  updatedAt: string;
  status: "idle" | "running" | "waiting" | "failed" | "unknown";
};

export type TranscriptEntry = {
  id: string;
  sessionId: string;
  kind: "command" | "output" | "system";
  text: string;
  createdAt: string;
};
