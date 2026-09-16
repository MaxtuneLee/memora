import { useId } from "react";
import * as stylex from "@stylexjs/stylex";

import { NativeDialog } from "@/components/ui/NativeDialog";
import type { WriteApprovalRequest } from "@/lib/chat/tools";

const styles = stylex.create({
  panel: {
    backgroundColor: "white",
    border: "1px solid #e4e4e7",
    borderRadius: 16,
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    padding: 24,
    width: "min(460px, 94vw)",
  },
  content: { display: "flex", flexDirection: "column", gap: 16 },
  title: { color: "#18181b", fontSize: 18, fontWeight: 600 },
  description: { color: "#71717a", fontSize: 14, marginTop: 4 },
  details: {
    backgroundColor: "rgb(250 250 250 / 0.8)",
    border: "1px solid #e4e4e7",
    borderRadius: 12,
    color: "#3f3f46",
    fontSize: 12,
    paddingBlock: 10,
    paddingInline: 12,
  },
  detailLine: { marginTop: 4 },
  detailLabel: { color: "#18181b", fontWeight: 500 },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  },
  button: {
    border: "1px solid #e4e4e7",
    borderRadius: 8,
    color: "#3f3f46",
    fontSize: 14,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "#fafafa" },
  },
  sessionButton: { backgroundColor: "white", ":hover": { backgroundColor: "#f4f4f5" } },
  allowButton: {
    backgroundColor: "#18181b",
    borderColor: "#18181b",
    color: "white",
    ":hover": { backgroundColor: "#27272a" },
  },
});

interface ToolWriteApprovalDialogProps {
  request: WriteApprovalRequest | null;
  onAllowOnce: () => void;
  onAllowSession: () => void;
  onDeny: () => void;
}

const describeOperation = (request: WriteApprovalRequest): string => {
  if (request.operation === "append") {
    return "Append text";
  }
  return request.overwrite ? "Write text (overwrite allowed)" : "Write text (create only)";
};

export function ToolWriteApprovalDialog({
  request,
  onAllowOnce,
  onAllowSession,
  onDeny,
}: ToolWriteApprovalDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <NativeDialog
      open={request !== null}
      onOpenChange={(open) => !open && onDeny()}
      labelledBy={titleId}
      describedBy={descriptionId}
      panelClassName={stylex.props(styles.panel).className}
    >
      <div {...stylex.props(styles.content)}>
        <div>
          <h2 id={titleId} {...stylex.props(styles.title)}>
            Approve file modification?
          </h2>
          <p id={descriptionId} {...stylex.props(styles.description)}>
            Memora wants to modify a text file. Review details before allowing.
          </p>
        </div>

        {request && (
          <div {...stylex.props(styles.details)}>
            <p>
              <span {...stylex.props(styles.detailLabel)}>Operation:</span>{" "}
              {describeOperation(request)}
            </p>
            <p {...stylex.props(styles.detailLine)}>
              <span {...stylex.props(styles.detailLabel)}>Path:</span> {request.path}
            </p>
            <p {...stylex.props(styles.detailLine)}>
              <span {...stylex.props(styles.detailLabel)}>Content length:</span>{" "}
              {request.contentLength.toLocaleString()} chars
            </p>
          </div>
        )}

        <div {...stylex.props(styles.actions)}>
          <button type="button" {...stylex.props(styles.button)} onClick={onDeny}>
            Deny
          </button>
          <button
            type="button"
            {...stylex.props(styles.button, styles.sessionButton)}
            onClick={onAllowSession}
          >
            Always allow this session
          </button>
          <button
            type="button"
            {...stylex.props(styles.button, styles.allowButton)}
            onClick={onAllowOnce}
          >
            Allow once
          </button>
        </div>
      </div>
    </NativeDialog>
  );
}
