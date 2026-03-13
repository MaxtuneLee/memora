import { Button } from "@base-ui/react/button";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/cn";
import type {
  ProviderApiFormat,
  ProviderFormState,
} from "@/types/settingsDialog";

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
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900">
          {isAddingProvider ? "Add provider" : "Edit provider"}
        </h4>
      </div>
      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Name
          </label>
          <input
            type="text"
            value={providerForm.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="e.g. OpenAI, Anthropic, Local LLM"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Base URL
          </label>
          <input
            type="text"
            value={providerForm.baseUrl}
            onChange={(event) => onChange({ baseUrl: event.target.value })}
            placeholder="https://api.openai.com/v1"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={providerForm.apiKey}
              onChange={(event) => onChange({ apiKey: event.target.value })}
              placeholder="sk-..."
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 pr-9 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
            <button
              type="button"
              onClick={onToggleApiKey}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? (
                <EyeSlashIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            API Format
          </label>
          <div className="flex gap-2">
            {API_FORMATS.map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => onChange({ apiFormat: format })}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  providerForm.apiFormat === format
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
                )}
              >
                {format}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button
          onClick={onCancel}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          Cancel
        </Button>
        <Button
          onClick={onSave}
          className="rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          {isAddingProvider ? "Add" : "Save"}
        </Button>
      </div>
    </div>
  );
}
