import { useRef, useState } from "react";
import { ImageUp } from "lucide-react";

type ComposerImageUploadButtonProps = {
  onUpload: (file: File) => Promise<void>;
};

const acceptedImageTypes = "image/png,image/jpeg,image/gif,image/webp,image/*";

export function ComposerImageUploadButton(props: ComposerImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadFile(file: File | null) {
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      await props.onUpload(file);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        accept={acceptedImageTypes}
        aria-hidden="true"
        className="composer-image-input"
        ref={inputRef}
        tabIndex={-1}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";
          void uploadFile(file);
        }}
      />
      <button
        aria-busy={uploading}
        aria-label={uploading ? "Uploading image" : "Upload image"}
        className="composer-image-button"
        disabled={uploading}
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        <ImageUp size={16} aria-hidden="true" />
      </button>
    </>
  );
}
