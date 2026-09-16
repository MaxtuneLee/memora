import { Button } from "@base-ui/react/button";
import { XIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { NativeDialog } from "@/components/ui/NativeDialog";
import { formatBytes } from "@/lib/format";

const styles = stylex.create({
  panel: {
    backgroundColor: "white",
    borderColor: "#e4e4e7",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    padding: "1.5rem",
    width: "min(420px, 92vw)",
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "space-between",
  },
  title: {
    color: "#18181b",
    fontSize: "1.125rem",
    fontWeight: 600,
    lineHeight: "1.75rem",
  },
  description: {
    color: "#71717a",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": "#f4f4f5",
    },
    borderRadius: "9999px",
    color: {
      default: "#a1a1aa",
      ":hover": "#18181b",
    },
    cursor: "pointer",
    display: "flex",
    height: "2rem",
    justifyContent: "center",
    transitionDuration: "150ms",
    transitionProperty: "color, background-color",
    width: "2rem",
  },
  closeIcon: {
    height: "1rem",
    width: "1rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    marginTop: "1.25rem",
  },
  label: {
    color: "#3f3f46",
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
  },
  input: {
    borderColor: {
      default: "#e4e4e7",
      ":focus": "#a1a1aa",
    },
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "#18181b",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
    outline: "none",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    transitionDuration: "150ms",
    transitionProperty: "border-color, box-shadow",
    width: "100%",
    "::placeholder": {
      color: "#a1a1aa",
    },
    ":focus": {
      boxShadow: "0 0 0 2px #e4e4e7",
    },
  },
  metadata: {
    color: "#71717a",
    columnGap: "1.5rem",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    rowGap: "0.5rem",
  },
  metadataLabel: {
    color: "#3f3f46",
    fontWeight: 500,
  },
  actions: {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "flex-end",
    marginTop: "1.5rem",
  },
  button: {
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: "1rem",
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, border-color, opacity",
    ":disabled": {
      opacity: 0.5,
    },
  },
  cancelButton: {
    backgroundColor: {
      default: "white",
      ":hover": "#fafafa",
    },
    borderColor: "#e4e4e7",
    borderStyle: "solid",
    borderWidth: 1,
    color: "#3f3f46",
  },
  confirmButton: {
    backgroundColor: {
      default: "#18181b",
      ":hover": "#27272a",
    },
    borderWidth: 0,
    color: "white",
  },
});

const resolveFileLabel = (file: File | null): string => {
  if (!file) return "File";
  if (file.type.startsWith("video/")) return "Video";
  if (file.type.startsWith("image/")) return "Image";
  if (file.type.startsWith("text/") || file.type.startsWith("application/")) return "Document";
  const ext = file.name.toLowerCase();
  if (
    ext.endsWith(".md") ||
    ext.endsWith(".pdf") ||
    ext.endsWith(".doc") ||
    ext.endsWith(".docx") ||
    ext.endsWith(".txt")
  )
    return "Document";
  if (file.type.startsWith("audio/")) return "Audio";
  return "File";
};

interface UploadDialogProps {
  isOpen: boolean;
  selectedFile: File | null;
  uploadName: string;
  setUploadName: (name: string) => void;
  isUploading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UploadDialog({
  isOpen,
  selectedFile,
  uploadName,
  setUploadName,
  isUploading,
  onCancel,
  onConfirm,
}: UploadDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <NativeDialog
      open={isOpen}
      onOpenChange={(open) => !open && onCancel()}
      labelledBy={titleId}
      describedBy={descriptionId}
      panelClassName={stylex.props(styles.panel).className}
    >
      <div {...stylex.props(styles.header)}>
        <div>
          <h2 id={titleId} {...stylex.props(styles.title)}>
            Upload {resolveFileLabel(selectedFile)}
          </h2>
          <p id={descriptionId} {...stylex.props(styles.description)}>
            Confirm the file details before uploading.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          {...stylex.props(styles.closeButton)}
          aria-label="Close upload dialog"
        >
          <XIcon {...stylex.props(styles.closeIcon)} />
        </button>
      </div>

      {selectedFile ? (
        <div {...stylex.props(styles.form)}>
          <div>
            <label htmlFor="upload-name" {...stylex.props(styles.label)}>
              Name
            </label>
            <input
              id="upload-name"
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              {...stylex.props(styles.input)}
              placeholder="Enter file name"
            />
          </div>
          <div {...stylex.props(styles.metadata)}>
            <span>
              <span {...stylex.props(styles.metadataLabel)}>Type:</span>{" "}
              {selectedFile.type || "audio/*"}
            </span>
            <span>
              <span {...stylex.props(styles.metadataLabel)}>Size:</span>{" "}
              {formatBytes(selectedFile.size)}
            </span>
          </div>
        </div>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          onClick={onCancel}
          disabled={isUploading}
          {...stylex.props(styles.button, styles.cancelButton)}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isUploading}
          {...stylex.props(styles.button, styles.confirmButton)}
        >
          {isUploading ? "Uploading..." : "Upload"}
        </Button>
      </div>
    </NativeDialog>
  );
}
