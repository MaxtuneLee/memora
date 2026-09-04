import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import {
  SETTINGS_FIELD_LABEL_CLASS_NAME,
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
  actions?: ReactNode;
}

export default function SettingsProviderForm({
  isAddingProvider,
  providerForm,
  showApiKey,
  onChange,
  onToggleApiKey,
  onCancel,
  onSave,
  actions,
}: SettingsProviderFormProps) {
  return (
    <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "space-y-5")}>
      <div className="space-y-2">
        <h4 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>
          {isAddingProvider ? "Add provider" : "Edit provider"}
        </h4>
        <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
          Add a remote API endpoint and choose which hosted models Memora should use.
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
          <Input
            id="provider-name"
            type="text"
            value={providerForm.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="e.g. OpenAI, Anthropic, OpenRouter"
          />
        </div>

        <div>
          <label
            htmlFor="provider-base-url"
            className={cn(SETTINGS_FIELD_LABEL_CLASS_NAME, "mb-2 block")}
          >
            Base URL
          </label>
          <Input
            id="provider-base-url"
            type="text"
            value={providerForm.baseUrl}
            onChange={(event) => onChange({ baseUrl: event.target.value })}
            placeholder="https://api.openai.com/v1"
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
            <Input
              id="provider-api-key"
              type={showApiKey ? "text" : "password"}
              value={providerForm.apiKey}
              onChange={(event) => onChange({ apiKey: event.target.value })}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
              aria-describedby="provider-api-key-hint"
              className="pr-11"
            />
            <Button
              variant="icon"
              type="button"
              onClick={onToggleApiKey}
              className={cn("absolute right-1.5 top-1/2 size-8 -translate-y-1/2")}
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </Button>
          </div>
          <p
            id="provider-api-key-hint"
            className="mt-2 text-xs text-[var(--color-memora-text-muted)]"
          >
            Saved only on this device. API keys are never synced or included in workspace exports.
          </p>
        </div>

        <div>
          <p className={cn(SETTINGS_FIELD_LABEL_CLASS_NAME, "mb-2")}>API format</p>
          <div className="flex flex-wrap gap-2">
            {API_FORMATS.map((format) => (
              <Button
                variant="segment"
                active={providerForm.apiFormat === format}
                key={format}
                type="button"
                onClick={() => onChange({ apiFormat: format })}
              >
                {format}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {actions ?? (
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave}>
            {isAddingProvider ? "Add provider" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
