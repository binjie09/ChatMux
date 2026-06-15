import { fileToBase64 } from "./file-base64";
import { uploadTerminalFile } from "./terminal-file-upload";
import { type TerminalUploadProgressState } from "./useTerminalUploadProgress";

type TerminalUploadProgressHandlers = {
  failUpload: (message: string) => void;
  finishUpload: (message: string) => void;
  startUpload: (fileName: string) => void;
  updateUpload: (next: Partial<Omit<TerminalUploadProgressState, "fileName" | "hidden">>) => void;
};

type UploadTerminalFileWithProgressOptions = {
  credentialToken: string;
  file: File;
  hostId: string;
  progress: TerminalUploadProgressHandlers;
  sessionName: string;
};

const readProgressWeight = 40;
const uploadProgressWeight = 60;

export async function uploadTerminalFileWithProgress(options: UploadTerminalFileWithProgressOptions) {
  options.progress.startUpload(options.file.name);
  const dataBase64 = await readFileWithProgress(options.file, options.progress);
  options.progress.updateUpload({
    message: "Uploading to server",
    percent: readProgressWeight,
    stage: "uploading",
  });
  const response = await uploadTerminalFile(options.hostId, options.sessionName, {
    credentialToken: options.credentialToken,
    dataBase64,
    fileName: options.file.name,
    mimeType: options.file.type,
  }, {
    onUploadProgress: (progress) => {
      options.progress.updateUpload({
        message: "Uploading to server",
        percent: readProgressWeight + weightedPercent(progress.loaded, progress.total, uploadProgressWeight),
        stage: "uploading",
      });
    },
  });
  options.progress.finishUpload("Pasted remote path");
  return response.remotePath;
}

function readFileWithProgress(file: File, progress: TerminalUploadProgressHandlers) {
  return fileToBase64(file, (readProgress) => {
    progress.updateUpload({
      message: "Reading local file",
      percent: weightedPercent(readProgress.loaded, readProgress.total, readProgressWeight),
      stage: "reading",
    });
  });
}

function weightedPercent(loaded: number, total: number, weight: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.min(weight, Math.max(0, (loaded / total) * weight));
}
