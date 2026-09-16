import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";

import {
  SETTINGS_FIELD_LABEL_CLASS_NAME,
  SETTINGS_INSET_PANEL_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TabSelect, type TabSelectOption } from "@/components/ui/TabSelect";
import type { ProviderApiFormat, ProviderFormState } from "@/types/settingsDialog";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 20 },
  fields: { display: "grid", gap: 16 },
  label: { display: "block", marginBottom: 8 },
  relative: { position: "relative" },
  apiInput: { paddingRight: 44 },
  toggle: {
    height: 32,
    position: "absolute",
    right: 6,
    top: "50%",
    transform: "translateY(-50%)",
    width: 32,
  },
  icon: { height: 16, width: 16 },
  actions: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", paddingTop: 4 },
});

const API_FORMAT_OPTIONS: readonly TabSelectOption<ProviderApiFormat>[] = [
  { value: "chat-completions", label: "Chat completions" },
  { value: "responses", label: "Responses" },
];

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
    <div className={`${SETTINGS_INSET_PANEL_CLASS_NAME} ${stylex.props(styles.root).className}`}>
      <div {...stylex.props(styles.fields)}>
        <div>
          <label
            htmlFor="provider-name"
            className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.label).className}`}
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
            className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.label).className}`}
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
            className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.label).className}`}
          >
            API key
          </label>
          <div {...stylex.props(styles.relative)}>
            <Input
              id="provider-api-key"
              type={showApiKey ? "text" : "password"}
              value={providerForm.apiKey}
              onChange={(event) => onChange({ apiKey: event.target.value })}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
              aria-describedby="provider-api-key-hint"
              className={stylex.props(styles.apiInput).className}
            />
            <Button
              variant="icon"
              type="button"
              onClick={onToggleApiKey}
              className={stylex.props(styles.toggle).className}
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? (
                <EyeSlashIcon className={stylex.props(styles.icon).className} />
              ) : (
                <EyeIcon className={stylex.props(styles.icon).className} />
              )}
            </Button>
          </div>
        </div>

        <div>
          <p
            className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.label).className}`}
          >
            API format
          </p>
          <TabSelect
            value={providerForm.apiFormat}
            onValueChange={(apiFormat) => onChange({ apiFormat })}
            options={API_FORMAT_OPTIONS}
            aria-label="API format"
          />
        </div>
      </div>

      {actions ?? (
        <div {...stylex.props(styles.actions)}>
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
