import { fileToBase64 } from "./file-base64";
import { uploadRemoteFile } from "./api";
import { type TerminalUploadProgressState } from "./useTerminalUploadProgress";

type RemoteFileUploadProgressHandlers = {
  failUpload: (message: string) => void;
  finishUpload: (message: string) => void;
  startUpload: (fileName: string) => void;
  updateUpload: (next: Partial<Omit<TerminalUploadProgressState, "fileName" | "hidden">>) => void;
};

type UploadRemoteFileWithProgressOptions = {
  credentialToken: string;
  directory: string;
  file: File;
  hostId: string;
  progress: RemoteFileUploadProgressHandlers;
  sessionName: string;
};

const readProgressWeight = 45;

export async function uploadRemoteFileWithProgress(options: UploadRemoteFileWithProgressOptions) {
  options.progress.startUpload(options.file.name);
  const dataBase64 = await fileToBase64(options.file, (readProgress) => {
    options.progress.updateUpload({
      message: "Reading local file",
      percent: weightedPercent(readProgress.loaded, readProgress.total, readProgressWeight),
      stage: "reading",
    });
  });
  options.progress.updateUpload({
    message: "Uploading to remote directory",
    percent: readProgressWeight,
    stage: "uploading",
  });
  const response = await uploadRemoteFile(options.hostId, options.sessionName, {
    credentialToken: options.credentialToken,
    dataBase64,
    directory: options.directory,
    fileName: options.file.name,
  });
  options.progress.finishUpload("Uploaded to file tree");
  return response.remotePath;
}

function weightedPercent(loaded: number, total: number, weight: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.min(weight, Math.max(0, (loaded / total) * weight));
}
