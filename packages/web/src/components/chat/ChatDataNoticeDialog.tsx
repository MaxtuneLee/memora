import { useId } from "react";
import * as stylex from "@stylexjs/stylex";

import IllustratedCard from "@/components/ui/IllustratedCard";
import { NativeDialog } from "@/components/ui/NativeDialog";
import { answerChatDataNotice, usePendingChatDataNotice } from "@/lib/chat/chatDataNotice";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  list: {
    color: tokens.text,
    display: "flex",
    flexDirection: "column",
    fontSize: 14,
    gap: 4,
    lineHeight: 1.5,
    listStyleType: "disc",
    margin: 0,
    paddingInlineStart: 20,
  },
  note: { color: tokens.textMuted, fontSize: 13, lineHeight: 1.5, margin: 0 },
  host: { color: tokens.textStrong, fontWeight: 500 },
});

const PANEL_RESET = {
  background: "transparent",
  border: "none",
  boxShadow: "none",
  width: "auto",
} as const;

/** Shown before chat first sends to a cloud API, listing what leaves this device. */
export default function ChatDataNoticeDialog() {
  const request = usePendingChatDataNotice();
  const titleId = useId();

  return (
    <NativeDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) answerChatDataNotice(false);
      }}
      labelledBy={titleId}
      // The card brings its own surface; inline style wins over the dialog panel's CSS.
      panelStyle={PANEL_RESET}
    >
      {request && (
        <IllustratedCard
          imageSrc="/chat-data.webp"
          titleId={titleId}
          title={`Chat connects to ${request.providerName}`}
          description={
            <>
              To answer, Memora sends content to{" "}
              <span {...stylex.props(styles.host)}>{request.host}</span>. This may include:
            </>
          }
          actionLabel="I understand"
          busy={false}
          onAction={() => answerChatDataNotice(true)}
        >
          <ul {...stylex.props(styles.list)}>
            <li>Your messages and the conversation so far</li>
            <li>Images you attach</li>
            <li>Your profile and saved memory from Personalization</li>
            <li>
              Text the assistant reads from your library to answer, such as file names, search
              results, and the notes or transcripts it opens
            </li>
          </ul>
          <p {...stylex.props(styles.note)}>
            Your files themselves aren't uploaded. Recordings, videos, PDFs, and other originals
            stay on this device; only the text the assistant reads is sent, which can be a whole
            note.
          </p>
        </IllustratedCard>
      )}
    </NativeDialog>
  );
}
