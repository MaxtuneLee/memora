import { Button } from "@base-ui/react/button";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

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
import { useAiProviderSettings } from "@/hooks/settings/useAiProviderSettings";
import { cn } from "@/lib/cn";
import {
  filterProviderModelGroups,
  getSelectedModelLabel,
  parseProviderModels,
} from "@/lib/settings/dialogHelpers";

interface SettingsAiProviderSectionProps {
  open: boolean;
}

export default function SettingsAiProviderSection({ open }: SettingsAiProviderSectionProps) {
  const {
    providers,
    selectedProviderId,
    selectedModel,
    editingProviderId,
    isAddingProvider,
    providerForm,
    fetchingModels,
    showApiKey,
    modelDropdownOpen,
    modelSearchQuery,
    modelSearchInputRef,
    handleProviderFormChange,
    handleToggleApiKey,
    handleToggleModelDropdown,
    handleCloseModelDropdown,
    handleAddProvider,
    handleEditProvider,
    handleCancelProviderForm,
    handleSaveProvider,
    handleDeleteProvider,
    handleFetchModels,
    handleSelectModel,
    setModelSearchQuery,
  } = useAiProviderSettings({ open });
  const isFormOpen = isAddingProvider || editingProviderId !== null;
  const allModels = useMemo(
    () => providers.flatMap((provider) => parseProviderModels(provider)),
    [providers],
  );
  const filteredModelGroups = useMemo(
    () => filterProviderModelGroups(providers, modelSearchQuery),
    [modelSearchQuery, providers],
  );
  const selectedModelLabel = useMemo(() => {
    return getSelectedModelLabel({
      providers,
      selectedProviderId,
      selectedModel,
    });
  }, [providers, selectedModel, selectedProviderId]);

  return (
    <div className="space-y-4">
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Model</h3>

        <div className="relative mt-4">
          <button
            type="button"
            onClick={handleToggleModelDropdown}
            className="memora-interactive flex w-full items-center justify-between rounded-[1rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface-soft)] px-4 py-3 text-left transition-[border-color,background-color] duration-300 ease-[var(--ease-out-quart)] hover:bg-[var(--color-memora-hover-strong)]"
          >
            <span
              className={cn(
                "block text-sm font-medium",
                selectedModel
                  ? "text-[var(--color-memora-text-strong)]"
                  : "text-[var(--color-memora-text-soft)]",
              )}
            >
              {selectedModelLabel}
            </span>
            <CaretDownIcon className="size-4 text-[var(--color-memora-text-soft)]" />
          </button>

          <AnimatePresence>
            {modelDropdownOpen && allModels.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 top-full z-20 mt-2 w-full rounded-[1.4rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] shadow-[0_28px_70px_-46px_rgba(34,33,29,0.32)]"
              >
                <div className="border-b border-[var(--color-memora-border-soft)] p-3">
                  <label className="sr-only" htmlFor="model-search-input">
                    Search models
                  </label>
                  <div className="flex items-center gap-2 rounded-[1rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface-soft)] px-3 py-2">
                    <MagnifyingGlassIcon className="size-3.5 text-[var(--color-memora-text-soft)]" />
                    <input
                      id="model-search-input"
                      ref={modelSearchInputRef}
                      type="text"
                      value={modelSearchQuery}
                      onChange={(event) => setModelSearchQuery(event.target.value)}
                      placeholder="Search models or providers"
                      className="w-full bg-transparent text-sm text-[var(--color-memora-text)] outline-none placeholder:text-[var(--color-memora-text-soft)]"
                    />
                  </div>
                </div>
                <div className="memora-scrollbar max-h-72 overflow-y-auto py-2">
                  {filteredModelGroups.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-[var(--color-memora-text-soft)]">
                      No matching models.
                    </div>
                  ) : (
                    filteredModelGroups.map(({ provider, models }) => (
                      <div key={provider.id}>
                        <div className="px-4 py-2 text-xs font-medium text-[var(--color-memora-text-soft)]">
                          {provider.name}
                        </div>
                        {models.map((model) => {
                          const isSelected =
                            selectedProviderId === provider.id && selectedModel === model.id;

                          return (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => handleSelectModel(provider.id, model.id)}
                              className={cn(
                                "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition",
                                isSelected
                                  ? "bg-[var(--color-memora-surface-soft)] font-semibold text-[var(--color-memora-text-strong)]"
                                  : "text-[var(--color-memora-text-muted)] hover:bg-[var(--color-memora-hover-strong)]",
                              )}
                            >
                              <span className="flex size-5 shrink-0 items-center justify-center">
                                {isSelected ? (
                                  <CheckIcon className="size-3.5 text-[var(--color-memora-olive)]" />
                                ) : null}
                              </span>
                              <span>{model.name ?? model.id}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {modelDropdownOpen ? (
            <div className="fixed inset-0 z-10" onClick={handleCloseModelDropdown} />
          ) : null}
        </div>

        {allModels.length === 0 ? (
          <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "mt-4")}>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>Add a provider to select a model.</p>
          </div>
        ) : null}
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Providers</h3>
          <Button
            onClick={handleAddProvider}
            disabled={isFormOpen}
            className={SETTINGS_SECONDARY_BUTTON_CLASS_NAME}
          >
            <PlusIcon className="size-3.5" weight="bold" />
            <span>Add provider</span>
          </Button>
        </div>

        {providers.length === 0 && !isAddingProvider ? (
          <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "mt-5")}>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No providers configured yet.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {providers.map((provider) => {
              if (editingProviderId === provider.id) {
                return null;
              }

              const models = parseProviderModels(provider);
              const isFetching = fetchingModels === provider.id;
              const isSelectedProvider = provider.id === selectedProviderId;

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
                      {isSelectedProvider ? "Current provider" : `${models.length} cached`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-start gap-1">
                    <button
                      type="button"
                      onClick={() => void handleFetchModels(provider)}
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
                      onClick={() => handleEditProvider(provider)}
                      disabled={isFormOpen}
                      title="Edit"
                      className={SETTINGS_ICON_BUTTON_CLASS_NAME}
                    >
                      <PencilSimpleIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProvider(provider.id)}
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
                onChange={handleProviderFormChange}
                onToggleApiKey={handleToggleApiKey}
                onCancel={handleCancelProviderForm}
                onSave={handleSaveProvider}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}
