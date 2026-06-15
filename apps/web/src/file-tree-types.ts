import { type RemoteFileEntry, type RemoteFileList } from "./api";
import { type TerminalUploadProgressState } from "./useTerminalUploadProgress";

export type FileTreeCredentialTarget = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  sshReady: boolean;
  windowIndex: number | null;
};

export type FileTreeUploadProgressHandlers = {
  failUpload: (message: string) => void;
  finishUpload: (message: string) => void;
  startUpload: (fileName: string) => void;
  updateUpload: (next: Partial<Omit<TerminalUploadProgressState, "fileName" | "hidden">>) => void;
};

export type FileTreePanelProps = {
  isMobile?: boolean;
  target: FileTreeCredentialTarget;
  uploadProgress: FileTreeUploadProgressHandlers;
  onFileSelected?: (entry: RemoteFileEntry | null) => void;
  onError: (message: string) => void;
};

export type TreeNodeProps = {
  depth: number;
  directory: RemoteFileList;
  expandedPaths: ReadonlySet<string>;
  selectedPath: string;
  target: FileTreeCredentialTarget;
  onCopyPath: (path: string) => void;
  onDirectoryLoaded: (directory: RemoteFileList) => void;
  onError: (message: string) => void;
  onOpenRoot: (path: string) => void;
  onOpenContextMenu: (entry: RemoteFileEntry, position: FileTreeContextMenuPosition) => void;
  onSelect: (entry: RemoteFileEntry) => void;
};

export type FileTreeContextMenuPosition = {
  x: number;
  y: number;
};

export type FileTreeContextMenuState = FileTreeContextMenuPosition & {
  entry: RemoteFileEntry;
};
