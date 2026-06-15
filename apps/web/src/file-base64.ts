export type FileReadProgress = {
  loaded: number;
  total: number;
};

export function fileToBase64(
  file: File,
  onProgress?: ((progress: FileReadProgress) => void) | null,
) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read file")));
    reader.addEventListener("progress", (event) => {
      if (!event.lengthComputable || !onProgress) {
        return;
      }
      onProgress({ loaded: event.loaded, total: event.total });
    });
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("File reader returned non-text data"));
        return;
      }
      if (onProgress) {
        onProgress({ loaded: file.size, total: file.size });
      }
      resolve(reader.result.split(",", 2)[1] ?? "");
    });
    reader.readAsDataURL(file);
  });
}
