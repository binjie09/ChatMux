import { useCallback, useEffect, useRef, useState } from "react";
import { deleteRemoteFile, listRemoteFiles, resolveRemoteFilePath, type RemoteFileEntry, type RemoteFileList } from "./api";
import { type FileTreePanelProps } from "./file-tree-types";
import { uploadRemoteFileWithProgress } from "./remote-file-upload-workflow";
import { errorMessage } from "./view-utils";

const defaultDirectoryPath = ".";

export function useFileTreePanel(props: FileTreePanelProps) {
  const { getCredentialToken, hostId, sessionName, sshReady, windowIndex } = props.target;
  const { onError, onFileSelected, uploadProgress } = props;
  const [pathInput, setPathInput] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [directories, setDirectories] = useState<Record<string, RemoteFileList>>({});
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedEntry, setSelectedEntry] = useState<RemoteFileEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const saveDirectory = useCallback((directory: RemoteFileList) => {
    setDirectories((current) => ({ ...current, [directory.path]: directory }));
  }, []);

  const loadDirectory = useCallback(async (path: string) => {
    const credentialToken = await getCredentialToken();
    const directory = await listRemoteFiles(hostId, sessionName, { credentialToken, path });
    saveDirectory(directory);
    return directory;
  }, [getCredentialToken, hostId, saveDirectory, sessionName]);

  const openRoot = useCallback(async (path: string) => {
    if (!sshReady) {
      return;
    }
    setLoading(true);
    try {
      applyRootDirectory(await loadDirectory(path), { onFileSelected, setExpandedPaths, setPathInput, setRootPath, setSelectedEntry });
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [loadDirectory, onError, onFileSelected, sshReady]);

  const resolveDefaultPath = useCallback(async () => {
    if (!sshReady) {
      return;
    }
    setLoading(true);
    try {
      const credentialToken = await getCredentialToken();
      const path = await resolveRemoteFilePath(hostId, sessionName, {
        credentialToken,
        windowIndex: windowIndex ?? undefined,
      });
      await openRoot(path || defaultDirectoryPath);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [getCredentialToken, hostId, onError, openRoot, sessionName, sshReady, windowIndex]);

  useEffect(() => {
    void resolveDefaultPath();
  }, [resolveDefaultPath]);

  async function refreshRoot() {
    await openRoot(rootPath || pathInput || defaultDirectoryPath);
  }

  async function uploadFile(file: File | null) {
    if (!file || !sshReady) {
      return;
    }
    try {
      await uploadSelectedFile({ file, getCredentialToken, hostId, pathInput, rootPath, sessionName, uploadProgress });
      await refreshRoot();
    } catch (error) {
      uploadProgress.failUpload(errorMessage(error));
      onError(errorMessage(error));
    }
  }

  async function deleteEntry(entry: RemoteFileEntry) {
    try {
      const credentialToken = await getCredentialToken();
      await deleteRemoteFile(hostId, sessionName, { credentialToken, path: entry.path });
      setSelectedEntry(null);
      onFileSelected?.(null);
      await refreshRoot();
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  function selectOrOpen(entry: RemoteFileEntry) {
    setSelectedEntry(entry);
    onFileSelected?.(entry.isDir ? null : entry);
    if (entry.isDir) {
      toggleDirectory(entry);
    }
  }

  function toggleDirectory(entry: RemoteFileEntry) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
        void loadDirectory(entry.path).catch((error) => onError(errorMessage(error)));
      }
      return next;
    });
  }

  return {
    expandedPaths,
    deleteEntry,
    fileInputRef,
    loading,
    openRoot,
    pathInput,
    refreshRoot,
    rootDirectory: rootPath ? directories[rootPath] : null,
    rootPath,
    saveDirectory,
    selectedPath: selectedEntry?.path ?? "",
    selectOrOpen,
    setPathInput,
    uploadFile,
  };
}

function applyRootDirectory(directory: RemoteFileList, options: {
  onFileSelected: FileTreePanelProps["onFileSelected"];
  setExpandedPaths: (paths: ReadonlySet<string>) => void;
  setPathInput: (path: string) => void;
  setRootPath: (path: string) => void;
  setSelectedEntry: (entry: RemoteFileEntry | null) => void;
}) {
  options.setRootPath(directory.path);
  options.setPathInput(directory.path);
  options.setExpandedPaths(new Set([directory.path]));
  options.setSelectedEntry(null);
  options.onFileSelected?.(null);
}

async function uploadSelectedFile(options: {
  file: File;
  getCredentialToken: () => Promise<string>;
  hostId: string;
  pathInput: string;
  rootPath: string;
  sessionName: string;
  uploadProgress: FileTreePanelProps["uploadProgress"];
}) {
  const credentialToken = await options.getCredentialToken();
  await uploadRemoteFileWithProgress({
    credentialToken,
    directory: options.rootPath || options.pathInput || defaultDirectoryPath,
    file: options.file,
    hostId: options.hostId,
    progress: options.uploadProgress,
    sessionName: options.sessionName,
  });
}
