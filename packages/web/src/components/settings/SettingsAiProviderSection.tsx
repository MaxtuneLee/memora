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

export default function SettingsAiProviderSection({
  open,
}: SettingsAiProviderSectionProps) {
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
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-zinc-900">Active model</h4>
        </div>
        <div className="relative mt-3">
          <button
            type="button"
            onClick={handleToggleModelDropdown}
            className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-900 transition hover:border-zinc-300"
          >
            <span className={selectedModel ? "" : "text-zinc-400"}>
              {selectedModelLabel}
            </span>
            <CaretDownIcon className="size-4 text-zinc-400" />
          </button>
          <AnimatePresence>
            {modelDropdownOpen && allModels.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg"
              >
                <div className="border-b border-zinc-100 p-2">
                  <label className="sr-only" htmlFor="model-search-input">
                    Search models
                  </label>
                  <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
                    <MagnifyingGlassIcon className="size-3.5 text-zinc-400" />
                    <input
                      id="model-search-input"
                      ref={modelSearchInputRef}
                      type="text"
                      value={modelSearchQuery}
                      onChange={(event) => setModelSearchQuery(event.target.value)}
                      placeholder="Search models or providers"
                      className="w-full bg-transparent text-xs text-zinc-700 outline-none placeholder:text-zinc-400"
                    />
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {filteredModelGroups.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-zinc-400">
                      No matching models.
                    </div>
                  ) : (
                    filteredModelGroups.map(({ provider, models }) => (
                      <div key={provider.id}>
                        <div className="bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          {provider.name}
                        </div>
                        {models.map((model) => {
                          const isSelected =
                            selectedProviderId === provider.id &&
                            selectedModel === model.id;
                          return (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => handleSelectModel(provider.id, model.id)}
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition",
                                isSelected
                                  ? "bg-zinc-100 font-medium text-zinc-900"
                                  : "text-zinc-600 hover:bg-zinc-50",
                              )}
                            >
                              {isSelected ? (
                                <CheckIcon className="size-3.5 shrink-0 text-zinc-900" />
                              ) : null}
                              <span className={isSelected ? "" : "pl-5.5"}>
                                {model.name ?? model.id}
                              </span>
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
            <div className="fixed inset-0 z-[9]" onClick={handleCloseModelDropdown} />
          ) : null}
        </div>
        {allModels.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-400">
            Add a provider and fetch models to select one.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-zinc-900">Providers</h4>
          <Button
            onClick={handleAddProvider}
            disabled={isFormOpen}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="size-3.5" weight="bold" />
            Add
          </Button>
        </div>

        {providers.length === 0 && !isAddingProvider ? (
          <p className="mt-3 text-xs text-zinc-400">No providers configured yet.</p>
        ) : null}

        <div className="mt-3 space-y-2">
          {providers.map((provider) => {
            if (editingProviderId === provider.id) {
              return null;
            }

            const models = parseProviderModels(provider);
            const isFetching = fetchingModels === provider.id;

            return (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-lg border border-zinc-100 bg-white px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900">
                      {provider.name}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {models.length} models
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-400">
                    {provider.baseUrl}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleFetchModels(provider)}
                    disabled={isFetching || isFormOpen}
                    title="Fetch models"
                    className="flex size-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
                  >
                    <ArrowsClockwiseIcon
                      className={cn("size-4", isFetching && "animate-spin")}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditProvider(provider)}
                    disabled={isFormOpen}
                    title="Edit"
                    className="flex size-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
                  >
                    <PencilSimpleIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProvider(provider.id)}
                    disabled={isFormOpen}
                    title="Remove"
                    className="flex size-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {isFormOpen ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-3 overflow-hidden"
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
      </div>
    </div>
  );
}
