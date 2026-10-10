import { useId } from "react";
import * as stylex from "@stylexjs/stylex";

import { NativeDialog } from "@/components/ui/NativeDialog";
import { useTabAccessRequest } from "@/lib/chat/tabAccessRequests";
import {
  availableDecisions,
  type AccessDecision,
  type AccessRequest,
  type AccessWrite,
} from "@/lib/chat/permissions";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  panel: {
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.border}`,
    borderRadius: 16,
    boxShadow: tokens.shadowLarge,
    padding: 24,
    width: "min(460px, 94vw)",
  },
  content: { display: "flex", flexDirection: "column", gap: 16 },
  title: { color: tokens.textStrong, fontSize: 18, fontWeight: 600 },
  description: { color: tokens.textMuted, fontSize: 14, marginTop: 4 },
  details: {
    backgroundColor: tokens.surfaceMuted,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    color: tokens.textStrong,
    fontSize: 12,
    paddingBlock: 10,
    paddingInline: 12,
  },
  detailLine: { marginTop: 4 },
  detailLabel: { color: tokens.textStrong, fontWeight: 500 },
  diff: {
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    gap: 1,
    maxHeight: 280,
    overflow: "auto",
  },
  diffLines: { margin: 0, paddingBlock: 6, paddingInline: 10, whiteSpace: "pre-wrap" },
  removed: { backgroundColor: tokens.dangerSurface, color: tokens.dangerText },
  added: { backgroundColor: tokens.successSurface, color: tokens.successText },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  },
  button: {
    border: `1px solid ${tokens.border}`,
    borderRadius: 8,
    color: tokens.textStrong,
    fontSize: 14,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: tokens.hover },
  },
  hint: { color: tokens.textMuted, fontSize: 12 },
  allowButton: {
    backgroundColor: tokens.primaryBackground,
    borderColor: tokens.primaryBackground,
    color: tokens.primaryText,
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.primaryBackground} 86%, ${tokens.surface})`,
    },
  },
});

interface ToolAccessDialogProps {
  request: AccessRequest | null;
  onDecide: (decision: AccessDecision) => void;
  /** Who is asking, when it is not Memora's own chat. */
  requester?: string;
}

const prefixLines = (text: string, prefix: string): string =>
  text
    .split("\n")
    .map((line) => `${prefix} ${line}`)
    .join("\n");

const describeWrite = (write: AccessWrite): string => {
  if (write.operation === "create") return "Create a document";
  if (write.operation === "append") return "Append text";
  if (write.operation === "replace") return "Replace text";
  return write.overwrite ? "Write text (overwrite allowed)" : "Write text (create only)";
};

const describeTarget = (request: AccessRequest): string[] => {
  const { target } = request;
  if (target.kind === "library") return ["Your whole library"];
  if (target.kind === "path") return [target.path];
  if (target.kind === "new-file")
    return [`${target.name} in ${target.folder ? target.folder.name : "your library"}`];
  return target.files.map((file) =>
    file.folderName ? `${file.name} in ${file.folderName}` : file.name,
  );
};

const decisionLabel = (request: AccessRequest, decision: AccessDecision): string => {
  if (decision === "allow_once") return "Allow once";
  if (decision === "deny") return "Deny";
  if (decision === "allow_library") return "Always allow the whole library";
  if (decision === "allow_folder") return "Always allow this folder";
  return request.target.kind === "files" && request.target.files.length > 1
    ? "Always allow these files"
    : "Always allow this file";
};

export function ToolAccessDialog({
  request,
  onDecide,
  requester = "Memora",
}: ToolAccessDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const isRead = request?.access === "read";
  const action = request?.search ? "search" : isRead ? "read" : "change";

  return (
    <NativeDialog
      open={request !== null}
      onOpenChange={(open) => !open && onDecide("deny")}
      labelledBy={titleId}
      describedBy={descriptionId}
      panelClassName={stylex.props(styles.panel).className}
    >
      <div {...stylex.props(styles.content)}>
        <div>
          <h2 id={titleId} {...stylex.props(styles.title)}>
            {isRead ? "Allow reading your files?" : "Allow this change?"}
          </h2>
          <p id={descriptionId} {...stylex.props(styles.description)}>
            {`${requester} wants to ${action} ${isRead ? "these files" : "a file"} with ${request?.tool ?? "a tool"}.`}
          </p>
        </div>

        {request && (
          <div {...stylex.props(styles.details)}>
            <p>
              <span {...stylex.props(styles.detailLabel)}>Access:</span>{" "}
              {request.search ? "Search (read)" : isRead ? "Read" : "Write"}
            </p>
            {describeTarget(request).map((line) => (
              <p key={line} {...stylex.props(styles.detailLine)}>
                <span {...stylex.props(styles.detailLabel)}>
                  {request.target.kind === "path" ? "Path:" : "Target:"}
                </span>{" "}
                {line}
              </p>
            ))}
            {request.write && (
              <>
                <p {...stylex.props(styles.detailLine)}>
                  <span {...stylex.props(styles.detailLabel)}>Operation:</span>{" "}
                  {describeWrite(request.write)}
                </p>
                <p {...stylex.props(styles.detailLine)}>
                  <span {...stylex.props(styles.detailLabel)}>Content length:</span>{" "}
                  {request.write.contentLength.toLocaleString()} chars
                </p>
              </>
            )}
          </div>
        )}

        {request?.write?.edits && request.write.edits.length > 0 && (
          <div {...stylex.props(styles.diff)}>
            {request.write.edits.map((edit, index) => (
              <div key={index}>
                <pre {...stylex.props(styles.diffLines, styles.removed)}>
                  {prefixLines(edit.oldText, "-")}
                </pre>
                {edit.newText && (
                  <pre {...stylex.props(styles.diffLines, styles.added)}>
                    {prefixLines(edit.newText, "+")}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {request && (
          <p {...stylex.props(styles.hint)}>
            {`"Always" choices allow ${isRead ? "reading" : "changes"} only. You can remove them in Settings.`}
          </p>
        )}

        <div {...stylex.props(styles.actions)}>
          {request &&
            availableDecisions(request).map((decision) => (
              <button
                key={decision}
                type="button"
                {...stylex.props(styles.button, decision === "allow_once" && styles.allowButton)}
                onClick={() => onDecide(decision)}
              >
                {decisionLabel(request, decision)}
              </button>
            ))}
        </div>
      </div>
    </NativeDialog>
  );
}

/** Asks about requests from the browser's agent through WebMCP. */
export function TabAccessDialog() {
  const { request, decide } = useTabAccessRequest();
  return (
    <ToolAccessDialog request={request} onDecide={decide} requester="Your browser's assistant" />
  );
}
