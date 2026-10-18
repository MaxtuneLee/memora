import { ChatCircleTextIcon, FileTextIcon, ImageIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useId } from "react";
import * as stylex from "@stylexjs/stylex";

import IllustratedCard, {
  illustratedCardPanelStyle,
  illustratedCardSecondaryButtonClassName,
} from "@/components/ui/IllustratedCard";
import { NativeDialog } from "@/components/ui/NativeDialog";
import { answerChatDataNotice, usePendingChatDataNotice } from "@/lib/chat/chatDataNotice";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  list: {
    color: tokens.text,
    display: "flex",
    flexDirection: "column",
    fontSize: 14,
    gap: 8,
    lineHeight: 1.5,
    listStyleType: "none",
    margin: 0,
    padding: 0,
  },
  item: { alignItems: "flex-start", display: "flex", gap: 10 },
  icon: { color: tokens.textMuted, flexShrink: 0, height: 18, marginTop: 2, width: 18 },
  note: { color: tokens.textMuted, fontSize: 13, lineHeight: 1.5, margin: 0 },
  host: { color: tokens.textStrong, fontWeight: 500 },
});

const SENT_DATA = [
  { icon: ChatCircleTextIcon, text: "Your messages and the conversation so far" },
  { icon: ImageIcon, text: "Images you attach" },
  { icon: UserCircleIcon, text: "Your profile and saved memory" },
  { icon: FileTextIcon, text: "Text the assistant reads from your library" },
] as const;

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
      panelStyle={illustratedCardPanelStyle}
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
          secondary={
            <button
              type="button"
              className={illustratedCardSecondaryButtonClassName}
              onClick={() => answerChatDataNotice(false)}
            >
              Cancel
            </button>
          }
        >
          <ul {...stylex.props(styles.list)}>
            {SENT_DATA.map(({ icon: Icon, text }) => (
              <li key={text} {...stylex.props(styles.item)}>
                <Icon aria-hidden {...stylex.props(styles.icon)} />
                {text}
              </li>
            ))}
          </ul>
          <p {...stylex.props(styles.note)}>Your entire files stay on this device.</p>
        </IllustratedCard>
      )}
    </NativeDialog>
  );
}
