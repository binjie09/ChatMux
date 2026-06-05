export function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read image")));
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Image reader returned non-text data"));
        return;
      }
      resolve(reader.result.split(",", 2)[1] ?? "");
    });
    reader.readAsDataURL(file);
  });
}
