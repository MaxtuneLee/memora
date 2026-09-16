import { WarningCircleIcon } from "@phosphor-icons/react";
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
import { Select } from "@/components/ui/Select";
import { useDocumentEditorSettings } from "@/hooks/settings/useDocumentEditorSettings";

const styles = stylex.create({
  panelStack: { display: "flex", flexDirection: "column", gap: 20 },
  heading: { display: "flex", flexDirection: "column", gap: 8 },
  warning: {
    backgroundColor: "var(--color-memora-warning-surface)",
    border: "1px solid var(--color-memora-warning-border)",
  },
  warningRow: { alignItems: "flex-start", display: "flex", gap: 12 },
  warningIcon: {
    color: "var(--color-memora-warning-text)",
    flexShrink: 0,
    height: 16,
    marginTop: 2,
    width: 16,
  },
  warningBody: { minWidth: 0 },
  warningTitle: {
    color: "var(--color-memora-warning-text)",
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
  },
  warningText: {
    color: "var(--color-memora-warning-text)",
    fontSize: 14,
    lineHeight: "24px",
    marginTop: 4,
  },
  insetStack: { display: "flex", flexDirection: "column", gap: 16 },
  fieldLabelMargin: { marginBottom: 8 },
  optionRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  inputMargin: { marginTop: 8 },
  softHelp: {
    color: "var(--color-memora-text-soft)",
    fontSize: 12,
    lineHeight: "20px",
    marginTop: 8,
  },
  previewGrid: {
    display: "grid",
    gap: 16,
    "@media (min-width: 640px)": {
      alignItems: "flex-start",
      gridTemplateColumns: "minmax(0, 12rem) minmax(0, 1fr)",
    },
  },
  inputRow: { alignItems: "center", display: "flex", gap: 8, marginTop: 8 },
  unit: { color: "var(--color-memora-text-soft)", fontSize: 14 },
  preview: { color: "var(--color-memora-text)", margin: 0 },
});

const DEFAULT_NOTE_LOCATION_OPTIONS = [
  { id: "root", label: "Desktop root" },
  { id: "folder", label: "Specific folder" },
] as const;

const ATTACHMENT_PLACEMENT_OPTIONS = [
  { id: "root", label: "Desktop root" },
  { id: "fixed-folder", label: "Fixed folder" },
  { id: "current-folder", label: "Current folder" },
  { id: "current-subfolder", label: "Current subfolder" },
] as const;

export default function SettingsGeneralSection() {
  const {
    settings,
    folderOptions,
    warnings,
    handleDefaultNoteLocationModeChange,
    handleDefaultNoteFolderIdChange,
    handleAttachmentPlacementModeChange,
    handleAttachmentFolderIdChange,
    handleAttachmentSubfolderNameChange,
    handleEditorFontSizePxChange,
  } = useDocumentEditorSettings();

  return (
    <section
      className={`${SETTINGS_PANEL_CLASS_NAME} ${stylex.props(styles.panelStack).className}`}
    >
      <div {...stylex.props(styles.heading)}>
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Document editor</h3>
        <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
          Control where new Markdown notes and embedded images go, and keep the editor readable at a
          consistent size.
        </p>
      </div>

      {warnings.length > 0 ? (
        <div {...stylex.props(styles.heading)}>
          {warnings.map((warning) => (
            <div
              key={warning.id}
              className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.warning).className}`}
            >
              <div {...stylex.props(styles.warningRow)}>
                <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
                <div {...stylex.props(styles.warningBody)}>
                  <p {...stylex.props(styles.warningTitle)}>{warning.title}</p>
                  <p {...stylex.props(styles.warningText)}>{warning.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className={`${SETTINGS_INSET_PANEL_CLASS_NAME} ${stylex.props(styles.insetStack).className}`}
      >
        <div {...stylex.props(styles.heading)}>
          <h4 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>New notes</h4>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Choose where dashboard note creation should place new Markdown files by default.
          </p>
        </div>

        <div>
          <p
            className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.fieldLabelMargin).className}`}
          >
            Default location
          </p>
          <div {...stylex.props(styles.optionRow)}>
            {DEFAULT_NOTE_LOCATION_OPTIONS.map((option) => (
              <Button
                variant="segment"
                active={settings.defaultNoteLocationMode === option.id}
                key={option.id}
                type="button"
                aria-pressed={settings.defaultNoteLocationMode === option.id}
                onClick={() => handleDefaultNoteLocationModeChange(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {settings.defaultNoteLocationMode === "folder" ? (
          <div>
            <label
              htmlFor="document-editor-default-folder"
              className={SETTINGS_FIELD_LABEL_CLASS_NAME}
            >
              Default note folder
            </label>
            <Select
              id="document-editor-default-folder"
              value={settings.defaultNoteFolderId}
              onValueChange={(value) => handleDefaultNoteFolderIdChange(value ?? "")}
              placeholder="Choose a folder"
              triggerClassName={stylex.props(styles.inputMargin).className}
              options={folderOptions.map((option) => ({ value: option.id, label: option.label }))}
            />
            <p {...stylex.props(styles.softHelp)}>
              {folderOptions.length > 0
                ? "If this folder becomes unavailable later, note creation falls back to Desktop root."
                : "No folders are available yet. New notes will fall back to Desktop root until you create one."}
            </p>
          </div>
        ) : null}
      </div>

      <div
        className={`${SETTINGS_INSET_PANEL_CLASS_NAME} ${stylex.props(styles.insetStack).className}`}
      >
        <div {...stylex.props(styles.heading)}>
          <h4 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Attachments</h4>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Decide where the editor stores local images when you insert them into a document.
          </p>
        </div>

        <div>
          <p
            className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.fieldLabelMargin).className}`}
          >
            Placement strategy
          </p>
          <div {...stylex.props(styles.optionRow)}>
            {ATTACHMENT_PLACEMENT_OPTIONS.map((option) => (
              <Button
                variant="segment"
                active={settings.attachmentPlacementMode === option.id}
                key={option.id}
                type="button"
                aria-pressed={settings.attachmentPlacementMode === option.id}
                onClick={() => handleAttachmentPlacementModeChange(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {settings.attachmentPlacementMode === "fixed-folder" ? (
          <div>
            <label
              htmlFor="document-editor-attachment-folder"
              className={SETTINGS_FIELD_LABEL_CLASS_NAME}
            >
              Attachment folder
            </label>
            <Select
              id="document-editor-attachment-folder"
              value={settings.attachmentFolderId}
              onValueChange={(value) => handleAttachmentFolderIdChange(value ?? "")}
              placeholder="Choose a folder"
              triggerClassName={stylex.props(styles.inputMargin).className}
              options={folderOptions.map((option) => ({ value: option.id, label: option.label }))}
            />
            <p {...stylex.props(styles.softHelp)}>
              {folderOptions.length > 0
                ? "If this folder becomes unavailable later, attachments fall back to Desktop root."
                : "No folders are available yet. Attachments will fall back to Desktop root until you create one."}
            </p>
          </div>
        ) : null}

        {settings.attachmentPlacementMode === "current-subfolder" ? (
          <div>
            <label
              htmlFor="document-editor-attachment-subfolder"
              className={SETTINGS_FIELD_LABEL_CLASS_NAME}
            >
              Subfolder name
            </label>
            <Input
              id="document-editor-attachment-subfolder"
              type="text"
              value={settings.attachmentSubfolderName}
              onChange={(event) => handleAttachmentSubfolderNameChange(event.target.value)}
              placeholder="images"
              className={stylex.props(styles.inputMargin).className}
            />
            <p {...stylex.props(styles.softHelp)}>
              Memora creates this folder relative to the current document folder when needed.
            </p>
          </div>
        ) : null}
      </div>

      <div
        className={`${SETTINGS_INSET_PANEL_CLASS_NAME} ${stylex.props(styles.insetStack).className}`}
      >
        <div {...stylex.props(styles.heading)}>
          <h4 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Editor appearance</h4>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Use one shared text size for both source mode and WYSIWYG mode.
          </p>
        </div>

        <div {...stylex.props(styles.previewGrid)}>
          <div>
            <label htmlFor="document-editor-font-size" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Font size
            </label>
            <div {...stylex.props(styles.inputRow)}>
              <Input
                id="document-editor-font-size"
                type="number"
                min={1}
                step={1}
                value={settings.editorFontSizePx}
                onChange={(event) => handleEditorFontSizePxChange(event.target.value)}
              />
              <span {...stylex.props(styles.unit)}>px</span>
            </div>
          </div>

          <div className={SETTINGS_ROW_CLASS_NAME}>
            <p
              {...stylex.props(styles.preview)}
              style={{ fontSize: `${settings.editorFontSizePx}px`, lineHeight: 1.6 }}
            >
              The quick brown fox jumps over the lazy dog. This preview matches the base text size
              the editor will use.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
