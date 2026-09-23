import { TrashIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";

import {
  SETTINGS_FIELD_LABEL_CLASS_NAME,
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usePersonalizationProfile } from "@/hooks/settings/usePersonalizationProfile";
import { useMemorySettings } from "@/hooks/settings/useMemorySettings";
import { formatMemoryTimestamp } from "@/lib/settings/dialogHelpers";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 16 },
  endRow: { display: "flex", justifyContent: "flex-end" },
  heading: { display: "flex", flexDirection: "column", gap: 8 },
  twoColumn: {
    display: "grid",
    gap: 16,
    marginTop: 20,
    "@media (min-width: 640px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  fullColumn: { "@media (min-width: 640px)": { gridColumn: "span 2 / span 2" } },
  inputMargin: { marginTop: 8 },
  textarea: {
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 16,
    color: tokens.text,
    fontSize: 14,
    marginTop: 20,
    outline: "none",
    paddingBlock: 10,
    paddingInline: 14,
    transitionDuration: "300ms",
    transitionProperty: "background-color, border-color, box-shadow",
    transitionTimingFunction: "var(--ease-out-quart)",
    width: "100%",
    "::placeholder": { color: tokens.textSoft },
    ":focus": {
      borderColor: tokens.oliveSoft,
      boxShadow: `0 0 0 1px ${tokens.oliveSoft}`,
    },
  },
  noticeHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    "@media (min-width: 1024px)": {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  buttonRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  notices: { display: "flex", flexDirection: "column", gap: 12, marginTop: 20 },
  notice: { alignItems: "flex-start", display: "flex", gap: 12 },
  noticeBody: { flex: 1, minWidth: 0 },
  noticeText: { color: tokens.text, fontSize: 14, lineHeight: "24px", margin: 0 },
  timestamp: { color: tokens.textSoft, fontSize: 11, marginTop: 8 },
  icon: { height: 16, width: 16 },
  insetMargin: { marginTop: 20 },
});

interface SettingsMemorySectionProps {
  open: boolean;
}

export default function SettingsMemorySection({ open }: SettingsMemorySectionProps) {
  const {
    memoryData,
    isMemoryLoading,
    refreshMemoryData,
    handleDeleteNotice,
    handleClearNotices,
    handleClearAllMemory,
  } = useMemorySettings({ open });
  const {
    name,
    primaryUseCase,
    assistantStyle,
    customInstructions,
    handleNameChange,
    handleUseCaseChange,
    handleStyleChange,
    handleCustomInstructionsChange,
  } = usePersonalizationProfile();
  const sortedNotices = useMemo(() => {
    return [...(memoryData?.notices ?? [])].sort((left, right) => right.updatedAt - left.updatedAt);
  }, [memoryData]);
  const hasStoredMemory = !!memoryData?.personality || sortedNotices.length > 0;

  return (
    <div {...stylex.props(styles.stack)}>
      <div {...stylex.props(styles.endRow)}>
        <Button
          variant="secondary"
          onClick={() => void refreshMemoryData()}
          disabled={isMemoryLoading}
        >
          {isMemoryLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.heading)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Personality</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            How Memora addresses you and the tone it responds with. Included in every conversation.
          </p>
        </div>

        <div {...stylex.props(styles.twoColumn)}>
          <div>
            <label htmlFor="personalization-name" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Name
            </label>
            <Input
              id="personalization-name"
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="What should Memora call you?"
              className={stylex.props(styles.inputMargin).className}
            />
          </div>
          <div>
            <label htmlFor="personalization-use-case" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Use case
            </label>
            <Input
              id="personalization-use-case"
              value={primaryUseCase}
              onChange={(event) => handleUseCaseChange(event.target.value)}
              placeholder="What do you use Memora for?"
              className={stylex.props(styles.inputMargin).className}
            />
          </div>
          <div {...stylex.props(styles.fullColumn)}>
            <label htmlFor="personalization-style" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Tone
            </label>
            <Input
              id="personalization-style"
              value={assistantStyle}
              onChange={(event) => handleStyleChange(event.target.value)}
              placeholder="How should Memora reply to you?"
              className={stylex.props(styles.inputMargin).className}
            />
          </div>
        </div>
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.heading)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Custom instructions</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Anything else Memora should always keep in mind when responding to you.
          </p>
        </div>
        <textarea
          value={customInstructions}
          onChange={(event) => handleCustomInstructionsChange(event.target.value)}
          placeholder="e.g. Always cite the source file when summarizing a document."
          rows={4}
          {...stylex.props(styles.textarea)}
        />
      </section>

      {!hasStoredMemory && !isMemoryLoading ? (
        <section className={SETTINGS_INSET_PANEL_CLASS_NAME}>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No saved memory yet.</p>
        </section>
      ) : null}

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.noticeHeader)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Notices</h3>
          <div {...stylex.props(styles.buttonRow)}>
            <Button
              variant="secondary"
              onClick={() => void handleClearNotices()}
              disabled={sortedNotices.length === 0}
            >
              Clear notices
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleClearAllMemory()}
              disabled={!hasStoredMemory}
            >
              Clear all memory
            </Button>
          </div>
        </div>

        {sortedNotices.length > 0 ? (
          <div {...stylex.props(styles.notices)}>
            {sortedNotices.map((notice) => (
              <div
                key={notice.id}
                className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.notice).className}`}
              >
                <div {...stylex.props(styles.noticeBody)}>
                  <p {...stylex.props(styles.noticeText)}>{notice.text}</p>
                  <p {...stylex.props(styles.timestamp)}>
                    Updated {formatMemoryTimestamp(notice.updatedAt)}
                  </p>
                </div>
                <Button
                  variant="destructiveIcon"
                  type="button"
                  onClick={() => void handleDeleteNotice(notice.id)}
                  aria-label="Delete notice"
                >
                  <TrashIcon className={stylex.props(styles.icon).className} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`${SETTINGS_INSET_PANEL_CLASS_NAME} ${stylex.props(styles.insetMargin).className}`}
          >
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No saved notices.</p>
          </div>
        )}
      </section>
    </div>
  );
}
