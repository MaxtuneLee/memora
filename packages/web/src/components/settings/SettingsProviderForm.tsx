import { Button } from "@base-ui/react/button";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";

import {
  SETTINGS_FIELD_LABEL_CLASS_NAME,
  SETTINGS_ICON_BUTTON_CLASS_NAME,
  SETTINGS_INPUT_CLASS_NAME,
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PRIMARY_BUTTON_CLASS_NAME,
  SETTINGS_SECONDARY_BUTTON_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
  SETTINGS_SEGMENT_BUTTON_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { cn } from "@/lib/cn";
import type { ProviderApiFormat, ProviderFormState } from "@/types/settingsDialog";

const API_FORMATS: ProviderApiFormat[] = ["chat-completions", "responses"];

interface SettingsProviderFormProps {
  isAddingProvider: boolean;
  providerForm: ProviderFormState;
  showApiKey: boolean;
  onChange: (patch: Partial<ProviderFormState>) => void;
  onToggleApiKey: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export default function SettingsProviderForm({
  isAddingProvider,
  providerForm,
  showApiKey,
  onChange,
  onToggleApiKey,
  onCancel,
  onSave,
}: SettingsProviderFormProps) {
  return (
    <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "space-y-5")}>
      <div className="space-y-2">
        <h4 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>
          {isAddingProvider ? "Add provider" : "Edit provider"}
        </h4>
        <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
          Give the provider a clear name, endpoint, and API format so it fits cleanly into the
          workspace runtime.
        </p>
      </div>

      <div className="grid gap-4">
        <div>
          <label
            htmlFor="provider-name"
            className={cn(SETTINGS_FIELD_LABEL_CLASS_NAME, "mb-2 block")}
          >
            Name
          </label>
          <input
            id="provider-name"
            type="text"
            value={providerForm.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="e.g. OpenAI, Anthropic, Local LLM"
            className={SETTINGS_INPUT_CLASS_NAME}
          />
        </div>

        <div>
          <label
            htmlFor="provider-base-url"
            className={cn(SETTINGS_FIELD_LABEL_CLASS_NAME, "mb-2 block")}
          >
            Base URL
          </label>
          <input
            id="provider-base-url"
            type="text"
            value={providerForm.baseUrl}
            onChange={(event) => onChange({ baseUrl: event.target.value })}
            placeholder="https://api.openai.com/v1"
            className={SETTINGS_INPUT_CLASS_NAME}
          />
        </div>

        <div>
          <label
            htmlFor="provider-api-key"
            className={cn(SETTINGS_FIELD_LABEL_CLASS_NAME, "mb-2 block")}
          >
            API key
          </label>
          <div className="relative">
            <input
              id="provider-api-key"
              type={showApiKey ? "text" : "password"}
              value={providerForm.apiKey}
              onChange={(event) => onChange({ apiKey: event.target.value })}
              placeholder="sk-..."
              className={cn(SETTINGS_INPUT_CLASS_NAME, "pr-11")}
            />
            <button
              type="button"
              onClick={onToggleApiKey}
              className={cn(
                SETTINGS_ICON_BUTTON_CLASS_NAME,
                "absolute right-1.5 top-1/2 size-8 -translate-y-1/2",
              )}
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>

        <div>
          <p className={cn(SETTINGS_FIELD_LABEL_CLASS_NAME, "mb-2")}>API format</p>
          <div className="flex flex-wrap gap-2">
            {API_FORMATS.map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => onChange({ apiFormat: format })}
                className={cn(
                  SETTINGS_SEGMENT_BUTTON_CLASS_NAME,
                  providerForm.apiFormat === format
                    ? "border-[var(--color-memora-text-strong)] bg-[var(--color-memora-text-strong)] text-[var(--color-memora-surface)]"
                    : "border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] text-[var(--color-memora-text-muted)] hover:-translate-y-0.5 hover:bg-[var(--color-memora-hover-strong)] hover:text-[var(--color-memora-text)]",
                )}
              >
                {format}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button onClick={onCancel} className={SETTINGS_SECONDARY_BUTTON_CLASS_NAME}>
          Cancel
        </Button>
        <Button onClick={onSave} className={SETTINGS_PRIMARY_BUTTON_CLASS_NAME}>
          {isAddingProvider ? "Add provider" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
