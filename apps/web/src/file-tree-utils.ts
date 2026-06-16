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

export function relativeRemotePath(basePath: string, targetPath: string) {
  const base = splitRemotePath(basePath);
  const target = splitRemotePath(targetPath);
  if (base.absolute !== target.absolute) {
    return targetPath;
  }
  let shared = 0;
  while (base.parts[shared] && base.parts[shared] === target.parts[shared]) {
    shared += 1;
  }
  const parents = base.parts.slice(shared).map(() => "..");
  const children = target.parts.slice(shared);
  return [...parents, ...children].join("/") || ".";
}

function splitRemotePath(value: string) {
  const path = value.trim().replace(/\/+/g, "/");
  const absolute = path.startsWith("/");
  const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = normalized && normalized !== "." ? normalized.split("/") : [];
  return { absolute, parts };
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
