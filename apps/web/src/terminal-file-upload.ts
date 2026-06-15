import {
  requestHeaders,
  tmuxSessionPath,
  uploadRequestURL,
  type UploadTerminalFileInput,
  type UploadTerminalFileResponse,
} from "./api";

export type UploadProgress = {
  loaded: number;
  total: number;
};

type UploadTerminalFileOptions = {
  onUploadProgress?: ((progress: UploadProgress) => void) | null;
};

export function uploadTerminalFile(
  hostId: string,
  sessionName: string,
  input: UploadTerminalFileInput,
  options: UploadTerminalFileOptions = {},
): Promise<UploadTerminalFileResponse> {
  return new Promise((resolve, reject) => {
    const path = `${tmuxSessionPath(hostId, sessionName)}/terminal-files`;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadRequestURL(path));
    for (const [key, value] of requestHeaders().entries()) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && options.onUploadProgress) {
        options.onUploadProgress({ loaded: event.loaded, total: event.total });
      }
    });
    xhr.addEventListener("error", () => reject(new Error(`Gateway request failed for ${path}`)));
    xhr.addEventListener("load", () => handleUploadResponse(xhr, path, resolve, reject));
    xhr.send(JSON.stringify(input));
  });
}

function handleUploadResponse(
  xhr: XMLHttpRequest,
  path: string,
  resolve: (value: UploadTerminalFileResponse) => void,
  reject: (reason?: unknown) => void,
) {
  if (xhr.status < 200 || xhr.status >= 300) {
    reject(new Error(xhr.responseText));
    return;
  }
  const contentType = xhr.getResponseHeader("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    reject(new Error(`Gateway returned non-JSON for ${path}: ${xhr.status} ${contentType}`));
    return;
  }
  resolve(JSON.parse(xhr.responseText) as UploadTerminalFileResponse);
}
