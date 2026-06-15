import { downloadRemoteFile, type RemoteFileEntry } from "./api";
import { type FileTreeCredentialTarget, type FileTreePanelProps } from "./file-tree-types";
import { errorMessage } from "./view-utils";

export async function downloadEntry(props: FileTreePanelProps, entry: RemoteFileEntry) {
  try {
    await downloadRemoteFileEntry(props.target, entry);
  } catch (error) {
    props.onError(errorMessage(error));
  }
}

export async function downloadRemoteFileEntry(target: FileTreeCredentialTarget, entry: RemoteFileEntry) {
  const credentialToken = await target.getCredentialToken();
  const blob = await downloadRemoteFile(target.hostId, target.sessionName, {
    credentialToken,
    path: entry.path,
  });
  downloadBlob(blob, entry.name);
}

export function firstClipboardFile(data: DataTransfer) {
  for (const item of Array.from(data.items)) {
    if (item.kind === "file") {
      return item.getAsFile();
    }
  }
  return null;
}

export function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
