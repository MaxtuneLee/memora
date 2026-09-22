import { Button } from "@base-ui/react/button";
import { XIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { NativeDialog } from "@/components/ui/NativeDialog";
import { formatBytes } from "@/lib/format";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  panel: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowLarge,
    padding: "1.5rem",
    width: "min(420px, 92vw)",
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "space-between",
  },
  title: {
    color: tokens.textStrong,
    fontSize: "1.125rem",
    fontWeight: 600,
    lineHeight: "1.75rem",
  },
  description: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": tokens.hover,
    },
    borderRadius: "9999px",
    color: {
      default: tokens.textSoft,
      ":hover": tokens.textStrong,
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
    color: tokens.text,
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
  },
  input: {
    borderColor: {
      default: tokens.border,
      ":focus": tokens.focusRing,
    },
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textStrong,
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
      color: tokens.textSoft,
    },
    ":focus": {
      boxShadow: `0 0 0 2px ${tokens.border}`,
    },
  },
  metadata: {
    color: tokens.textMuted,
    columnGap: "1.5rem",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    rowGap: "0.5rem",
  },
  metadataLabel: {
    color: tokens.text,
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
      default: tokens.surface,
      ":hover": tokens.hoverStrong,
    },
    borderColor: tokens.border,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
  },
  confirmButton: {
    backgroundColor: {
      default: tokens.primaryBackground,
      ":hover": `color-mix(in srgb, ${tokens.primaryBackground} 86%, ${tokens.surface})`,
    },
    borderWidth: 0,
    color: tokens.primaryText,
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
