import { type CSSProperties, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { listRemoteFiles, type RemoteFileEntry, type RemoteFileList } from "./api";
import { type TreeNodeProps } from "./file-tree-types";
import { formatFileSize } from "./file-tree-utils";
import { errorMessage } from "./view-utils";

export function TreeNode(props: TreeNodeProps) {
  return (
    <div className="file-tree-node-group">
      {props.directory.parent ? <ParentRow {...props} /> : null}
      {props.directory.entries.map((entry) => (
        <FileTreeRow entry={entry} key={entry.path} props={props} />
      ))}
    </div>
  );
}

function ParentRow(props: TreeNodeProps) {
  return (
    <button
      className="file-tree-row parent"
      style={{ "--tree-depth": props.depth } as CSSProperties}
      type="button"
      onClick={() => props.onOpenRoot(props.directory.parent)}
    >
      <ChevronRight size={15} aria-hidden="true" />
      <Folder size={16} aria-hidden="true" />
      <span>..</span>
    </button>
  );
}

function FileTreeRow({ entry, props }: { entry: RemoteFileEntry; props: TreeNodeProps }) {
  const expanded = props.expandedPaths.has(entry.path);
  return (
    <div className="file-tree-node">
      <button
        className={`file-tree-row ${props.selectedPath === entry.path ? "selected" : ""}`}
        style={{ "--tree-depth": props.depth } as CSSProperties}
        type="button"
        onClick={() => props.onSelect(entry)}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onOpenContextMenu(entry, { x: event.clientX, y: event.clientY });
        }}
        onDoubleClick={() => props.onCopyPath(entry.path)}
      >
        {entry.isDir ? directoryChevron(expanded) : <span className="file-tree-spacer" />}
        {entry.isDir ? directoryIcon(expanded) : <File size={16} aria-hidden="true" />}
        <span>{entry.name}</span>
        <small>{entry.isDir ? "" : formatFileSize(entry.size)}</small>
      </button>
      {entry.isDir && expanded ? <DirectoryChildren {...props} depth={props.depth + 1} entry={entry} /> : null}
    </div>
  );
}

function DirectoryChildren(props: Omit<TreeNodeProps, "directory"> & { entry: RemoteFileEntry }) {
  const [directory, setDirectory] = useState<RemoteFileList | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadDirectory({ cancelled: () => cancelled, props, setDirectory, setLoading });
    return () => {
      cancelled = true;
    };
  }, [
    props.entry.path,
    props.onDirectoryLoaded,
    props.onError,
    props.target.getCredentialToken,
    props.target.hostId,
    props.target.sessionName,
  ]);

  if (loading && !directory) {
    return <p className="file-tree-loading" style={{ "--tree-depth": props.depth } as CSSProperties}>Loading</p>;
  }
  if (!directory) {
    return null;
  }
  return <TreeNode {...props} directory={directory} />;
}

async function loadDirectory(options: {
  cancelled: () => boolean;
  props: Omit<TreeNodeProps, "directory"> & { entry: RemoteFileEntry };
  setDirectory: (directory: RemoteFileList) => void;
  setLoading: (loading: boolean) => void;
}) {
  options.setLoading(true);
  try {
    const credentialToken = await options.props.target.getCredentialToken();
    const next = await listRemoteFiles(options.props.target.hostId, options.props.target.sessionName, {
      credentialToken,
      path: options.props.entry.path,
    });
    if (!options.cancelled()) {
      options.setDirectory(next);
      options.props.onDirectoryLoaded(next);
    }
  } catch (error) {
    if (!options.cancelled()) {
      options.props.onError(errorMessage(error));
    }
  } finally {
    if (!options.cancelled()) {
      options.setLoading(false);
    }
  }
}

function directoryChevron(expanded: boolean) {
  return expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />;
}

function directoryIcon(expanded: boolean) {
  return expanded ? <FolderOpen size={16} aria-hidden="true" /> : <Folder size={16} aria-hidden="true" />;
}
