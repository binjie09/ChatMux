import { type RefObject } from "react";
import { FileUp, RefreshCw } from "lucide-react";
import { type RemoteFileList } from "./api";

type FileTreeHeaderProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  rootPath: string;
  sshReady: boolean;
  onRefresh: () => void;
};

type FileTreePathFormProps = {
  loading: boolean;
  pathInput: string;
  sshReady: boolean;
  onPathInputChange: (path: string) => void;
  onSubmit: () => void;
};

type FileTreeBodyProps = {
  children: React.ReactNode;
  loading: boolean;
  rootDirectory: RemoteFileList | null;
  sshReady: boolean;
};

export function FileTreeHeader(props: FileTreeHeaderProps) {
  return (
    <header className="file-tree-header">
      <div>
        <strong>Files</strong>
        <span>{props.sshReady ? props.rootPath || "Resolving current directory" : "Select a terminal session"}</span>
      </div>
      <div className="file-tree-actions">
        <button type="button" title="Refresh files" aria-label="Refresh files" disabled={!props.sshReady || props.loading} onClick={props.onRefresh}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
        <button type="button" title="Upload file" aria-label="Upload file" disabled={!props.sshReady} onClick={() => props.fileInputRef.current?.click()}>
          <FileUp size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export function FileTreePathForm(props: FileTreePathFormProps) {
  return (
    <form
      className="file-tree-path-form"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <input
        aria-label="Remote directory path"
        disabled={!props.sshReady}
        placeholder="/path/to/project"
        value={props.pathInput}
        onChange={(event) => props.onPathInputChange(event.target.value)}
      />
      <button type="submit" disabled={!props.sshReady || props.loading}>Go</button>
    </form>
  );
}

export function FileTreeBody(props: FileTreeBodyProps) {
  return (
    <div className="file-tree-body">
      {props.loading && !props.rootDirectory ? <p className="file-tree-state">Loading files</p> : null}
      {!props.loading && props.sshReady && !props.rootDirectory ? <p className="file-tree-state">No directory loaded</p> : null}
      {!props.sshReady ? <p className="file-tree-state">Open a terminal window to browse files.</p> : null}
      {props.children}
    </div>
  );
}
