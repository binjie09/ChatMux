import { useRef, useState } from "react";
import { FileUp } from "lucide-react";

type TerminalFileUploadButtonProps = {
  disabled?: boolean;
  onUpload: (file: File) => Promise<void>;
};

export function TerminalFileUploadButton(props: TerminalFileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const disabled = props.disabled || uploading;

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
        aria-hidden="true"
        className="terminal-file-input"
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
        aria-label={uploading ? "Uploading file" : "Upload file"}
        className="terminal-file-upload-button"
        disabled={disabled}
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        <FileUp size={19} aria-hidden="true" />
      </button>
    </>
  );
}
