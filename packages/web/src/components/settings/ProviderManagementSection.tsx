import { Button } from "@base-ui/react/button";
import { ArrowsClockwiseIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";

import SettingsProviderForm from "@/components/settings/SettingsProviderForm";
import {
  SETTINGS_ICON_BUTTON_CLASS_NAME,
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
  SETTINGS_SECONDARY_BUTTON_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { cn } from "@/lib/cn";
import { parseProviderModels } from "@/lib/settings/dialogHelpers";
import type { provider as ProviderRow } from "@/livestore/provider";
import type { ProviderFormState } from "@/types/settingsDialog";

interface ProviderManagementSectionProps {
  title?: string;
  emptyMessage?: string;
  className?: string;
  providers: ProviderRow[];
  editingProviderId: string | null;
  isAddingProvider: boolean;
  providerForm: ProviderFormState;
  showApiKey: boolean;
  fetchingModels: string | null;
  onProviderFormChange: (patch: Partial<ProviderFormState>) => void;
  onToggleApiKey: () => void;
  onAddProvider: () => void;
  onEditProvider: (provider: ProviderRow) => void;
  onCancelProviderForm: () => void;
  onSaveProvider: () => void;
  onDeleteProvider: (providerId: string) => void;
  onFetchProviderModels: (provider: ProviderRow) => void | Promise<void>;
}

export default function ProviderManagementSection({
  title = "Providers",
  emptyMessage = "No providers configured yet.",
  className,
  providers,
  editingProviderId,
  isAddingProvider,
  providerForm,
  showApiKey,
  fetchingModels,
  onProviderFormChange,
  onToggleApiKey,
  onAddProvider,
  onEditProvider,
  onCancelProviderForm,
  onSaveProvider,
  onDeleteProvider,
  onFetchProviderModels,
}: ProviderManagementSectionProps) {
  const isFormOpen = isAddingProvider || editingProviderId !== null;

  return (
    <section className={cn(SETTINGS_PANEL_CLASS_NAME, className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>{title}</h3>
        <Button
          onClick={onAddProvider}
          disabled={isFormOpen}
          className={SETTINGS_SECONDARY_BUTTON_CLASS_NAME}
        >
          <PlusIcon className="size-3.5" weight="bold" />
          <span>Add provider</span>
        </Button>
      </div>

      {providers.length === 0 && !isAddingProvider ? (
        <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "mt-5")}>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>{emptyMessage}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {providers.map((provider) => {
            if (editingProviderId === provider.id) {
              return null;
            }

            const models = parseProviderModels(provider);
            const isFetching = fetchingModels === provider.id;

            return (
              <div key={provider.id} className={cn(SETTINGS_ROW_CLASS_NAME, "flex gap-4")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--color-memora-text-strong)]">
                    {provider.name}
                  </p>
                  <p className="mt-1 truncate text-sm text-[var(--color-memora-text-muted)]">
                    {provider.baseUrl}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-memora-text-soft)]">
                    {`${models.length} cached`}
                  </p>
                </div>

                <div className="flex shrink-0 items-start gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      void onFetchProviderModels(provider);
                    }}
                    disabled={isFetching || isFormOpen}
                    title="Fetch models"
                    className={SETTINGS_ICON_BUTTON_CLASS_NAME}
                  >
                    <ArrowsClockwiseIcon
                      className={cn("size-4", isFetching ? "animate-spin" : "")}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditProvider(provider)}
                    disabled={isFormOpen}
                    title="Edit"
                    className={SETTINGS_ICON_BUTTON_CLASS_NAME}
                  >
                    <PencilSimpleIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteProvider(provider.id)}
                    disabled={isFormOpen}
                    title="Remove"
                    className={cn(
                      SETTINGS_ICON_BUTTON_CLASS_NAME,
                      "hover:bg-[var(--color-memora-warning-surface)] hover:text-[var(--color-memora-warning-text)]",
                    )}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {isFormOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-4 overflow-hidden"
          >
            <SettingsProviderForm
              isAddingProvider={isAddingProvider}
              providerForm={providerForm}
              showApiKey={showApiKey}
              onChange={onProviderFormChange}
              onToggleApiKey={onToggleApiKey}
              onCancel={onCancelProviderForm}
              onSave={onSaveProvider}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
