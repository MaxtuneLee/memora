import { WarningCircleIcon } from "@phosphor-icons/react";

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
import { cn } from "@/lib/cn";

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
    <section className={cn(SETTINGS_PANEL_CLASS_NAME, "space-y-5")}>
      <div className="space-y-2">
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Document editor</h3>
        <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
          Control where new Markdown notes and embedded images go, and keep the editor readable at a
          consistent size.
        </p>
      </div>

      {warnings.length > 0 ? (
        <div className="space-y-2">
          {warnings.map((warning) => (
            <div
              key={warning.id}
              className={cn(
                SETTINGS_ROW_CLASS_NAME,
                "border border-[var(--color-memora-warning-border)] bg-[var(--color-memora-warning-surface)]",
              )}
            >
              <div className="flex items-start gap-3">
                <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-[var(--color-memora-warning-text)]" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-memora-warning-text)]">
                    {warning.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-memora-warning-text)]">
                    {warning.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "space-y-4")}>
        <div className="space-y-2">
          <h4 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>New notes</h4>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Choose where dashboard note creation should place new Markdown files by default.
          </p>
        </div>

        <div>
          <p className={cn(SETTINGS_FIELD_LABEL_CLASS_NAME, "mb-2")}>Default location</p>
          <div className="flex flex-wrap gap-2">
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
              triggerClassName="mt-2"
              options={folderOptions.map((option) => ({ value: option.id, label: option.label }))}
            />
            <p className="mt-2 text-xs leading-5 text-[var(--color-memora-text-soft)]">
              {folderOptions.length > 0
                ? "If this folder becomes unavailable later, note creation falls back to Desktop root."
                : "No folders are available yet. New notes will fall back to Desktop root until you create one."}
            </p>
          </div>
        ) : null}
      </div>

      <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "space-y-4")}>
        <div className="space-y-2">
          <h4 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Attachments</h4>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Decide where the editor stores local images when you insert them into a document.
          </p>
        </div>

        <div>
          <p className={cn(SETTINGS_FIELD_LABEL_CLASS_NAME, "mb-2")}>Placement strategy</p>
          <div className="flex flex-wrap gap-2">
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
              triggerClassName="mt-2"
              options={folderOptions.map((option) => ({ value: option.id, label: option.label }))}
            />
            <p className="mt-2 text-xs leading-5 text-[var(--color-memora-text-soft)]">
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
              className="mt-2"
            />
            <p className="mt-2 text-xs leading-5 text-[var(--color-memora-text-soft)]">
              Memora creates this folder relative to the current document folder when needed.
            </p>
          </div>
        ) : null}
      </div>

      <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "space-y-4")}>
        <div className="space-y-2">
          <h4 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Editor appearance</h4>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Use one shared text size for both source mode and WYSIWYG mode.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-start">
          <div>
            <label htmlFor="document-editor-font-size" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Font size
            </label>
            <div className="mt-2 flex items-center gap-2">
              <Input
                id="document-editor-font-size"
                type="number"
                min={1}
                step={1}
                value={settings.editorFontSizePx}
                onChange={(event) => handleEditorFontSizePxChange(event.target.value)}
              />
              <span className="text-sm text-[var(--color-memora-text-soft)]">px</span>
            </div>
          </div>

          <div className={SETTINGS_ROW_CLASS_NAME}>
            <p
              className="text-[var(--color-memora-text)]"
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
