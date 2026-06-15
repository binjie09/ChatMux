import { type ClipboardEvent, type DragEvent, type KeyboardEvent, useState } from "react";
import { type RemoteFileEntry } from "./api";
import { FileTreeContextMenu } from "./FileTreeContextMenu";
import { TreeNode } from "./FileTreeNode";
import { FileTreeBody, FileTreeHeader, FileTreePathForm } from "./FileTreePanelParts";
import { type FileTreeContextMenuState, type FileTreePanelProps } from "./file-tree-types";
import { downloadEntry, firstClipboardFile } from "./file-tree-utils";
import { useFileTreePanel } from "./useFileTreePanel";
import { errorMessage } from "./view-utils";
import "./file-tree-panel.css";

export function FileTreePanel(props: FileTreePanelProps) {
  const state = useFileTreePanel(props);
  const [dragActive, setDragActive] = useState(false);
  const [contextMenu, setContextMenu] = useState<FileTreeContextMenuState | null>(null);

  function copySelectedPath(path: string) {
    void navigator.clipboard.writeText(path).catch((error) => props.onError(errorMessage(error)));
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    void state.uploadFile(event.dataTransfer.files.item(0));
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const file = firstClipboardFile(event.clipboardData);
    if (!file) {
      return;
    }
    event.preventDefault();
    void state.uploadFile(file);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && contextMenu) {
      setContextMenu(null);
      return;
    }
    if (!state.selectedPath || event.key.toLowerCase() !== "c" || !(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    copySelectedPath(state.selectedPath);
  }

  function handleDeleteFromMenu() {
    if (!contextMenu || !window.confirm(`Delete ${contextMenu.entry.path}?\n\nThis cannot be undone.`)) {
      setContextMenu(null);
      return;
    }
    const entry = contextMenu.entry;
    setContextMenu(null);
    void state.deleteEntry(entry);
  }

  function handleDownloadFromMenu() {
    if (!contextMenu) {
      return;
    }
    const entry = contextMenu.entry;
    setContextMenu(null);
    void downloadEntry(props, entry);
  }

  return (
    <section
      className={`file-tree-panel ${props.isMobile ? "mobile" : ""} ${dragActive ? "drag-active" : ""}`}
      tabIndex={0}
      onDragLeave={() => setDragActive(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    >
      <FileTreeHeader
        fileInputRef={state.fileInputRef}
        loading={state.loading}
        rootPath={state.rootPath}
        sshReady={props.target.sshReady}
        onRefresh={() => void state.refreshRoot()}
      />
      <FileTreePathForm
        loading={state.loading}
        pathInput={state.pathInput}
        sshReady={props.target.sshReady}
        onPathInputChange={state.setPathInput}
        onSubmit={() => void state.openRoot(state.pathInput.trim() || ".")}
      />
      <input
        aria-hidden="true"
        className="file-tree-input"
        ref={state.fileInputRef}
        tabIndex={-1}
        type="file"
        onChange={(event) => handleFileInputChange(event.currentTarget, state.uploadFile)}
      />
      <div className="file-tree-drop-hint">Drop or paste a file to upload</div>
      <FileTreeBody loading={state.loading} rootDirectory={state.rootDirectory} sshReady={props.target.sshReady}>
        {state.rootDirectory ? (
          <TreeNode
            depth={0}
            directory={state.rootDirectory}
            expandedPaths={state.expandedPaths}
            selectedPath={state.selectedPath}
            target={props.target}
            onCopyPath={copySelectedPath}
            onDirectoryLoaded={state.saveDirectory}
            onError={props.onError}
            onOpenContextMenu={(entry, position) => setContextMenu({ entry, ...position })}
            onOpenRoot={(path) => void state.openRoot(path)}
            onSelect={state.selectOrOpen}
          />
        ) : null}
      </FileTreeBody>
      <FileTreeContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onDelete={handleDeleteFromMenu}
        onDownload={handleDownloadFromMenu}
      />
    </section>
  );
}

function handleFileInputChange(input: HTMLInputElement, uploadFile: (file: File | null) => Promise<void>) {
  const file = input.files?.[0] ?? null;
  input.value = "";
  void uploadFile(file);
}
