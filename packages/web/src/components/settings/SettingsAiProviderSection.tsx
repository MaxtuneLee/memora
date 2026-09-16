import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

import ProviderManagementSection from "@/components/settings/ProviderManagementSection";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { useAiProviderSettings } from "@/hooks/settings/useAiProviderSettings";
import {
  filterProviderModelGroups,
  getSelectedModelLabel,
  parseProviderModels,
} from "@/lib/settings/dialogHelpers";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: "1rem" },
  picker: { marginTop: "1rem", position: "relative" },
  trigger: {
    alignItems: "center",
    backgroundColor: {
      default: "var(--color-memora-surface-soft)",
      ":hover": "var(--color-memora-hover-strong)",
    },
    borderColor: "var(--color-memora-border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
    textAlign: "left",
    transition:
      "border-color 300ms var(--ease-out-quart), background-color 300ms var(--ease-out-quart)",
    width: "100%",
  },
  triggerLabel: { display: "block", fontSize: "0.875rem", fontWeight: 500, lineHeight: "1.25rem" },
  selectedLabel: { color: "var(--color-memora-text-strong)" },
  placeholderLabel: { color: "var(--color-memora-text-soft)" },
  caret: { color: "var(--color-memora-text-soft)", height: "1rem", width: "1rem" },
  dropdown: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "1.4rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 28px 70px -46px rgba(34,33,29,0.32)",
    left: 0,
    marginTop: "0.5rem",
    position: "absolute",
    top: "100%",
    width: "100%",
    zIndex: 20,
  },
  searchArea: {
    borderBottomColor: "var(--color-memora-border-soft)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    padding: "0.75rem",
  },
  srOnly: {
    borderWidth: 0,
    clip: "rect(0, 0, 0, 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  searchField: {
    alignItems: "center",
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: "0.5rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  searchIcon: { color: "var(--color-memora-text-soft)", height: "0.875rem", width: "0.875rem" },
  searchInput: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    flex: 1,
    minWidth: 0,
    padding: 0,
    ":focus": { borderColor: "transparent", boxShadow: "none" },
  },
  options: {
    maxHeight: "18rem",
    overflowY: "auto",
    paddingBlock: "0.5rem",
    paddingInline: "0.5rem",
    scrollbarGutter: "stable",
  },
  empty: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    paddingBlock: "1rem",
    paddingInline: "0.5rem",
  },
  providerLabel: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "1rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.5rem",
  },
  option: {
    alignItems: "center",
    color: {
      default: "var(--color-memora-text-muted)",
      ":hover": "var(--color-memora-text-muted)",
    },
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    justifyContent: "flex-start",
    paddingBlock: "0.625rem",
    paddingInline: "0.5rem",
    textAlign: "left",
    transition: "background-color 150ms",
    width: "100%",
    ":hover": { backgroundColor: "var(--color-memora-hover-strong)" },
  },
  selectedOption: {
    backgroundColor: "var(--color-memora-surface-soft)",
    color: "var(--color-memora-text-strong)",
    fontWeight: 600,
  },
  checkSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: "1.25rem",
    justifyContent: "center",
    width: "1.25rem",
  },
  checkIcon: { color: "var(--color-memora-olive)", height: "0.875rem", width: "0.875rem" },
  backdrop: { inset: 0, position: "fixed", zIndex: 10 },
  emptyProvider: { marginTop: "1rem" },
});

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
    <div {...stylex.props(styles.root)}>
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Chat model</h3>

        <div {...stylex.props(styles.picker)}>
          <Button
            variant="plain"
            type="button"
            onClick={handleToggleModelDropdown}
            className={`memora-interactive ${stylex.props(styles.trigger).className}`}
          >
            <span
              className={
                stylex.props(
                  styles.triggerLabel,
                  selectedModel ? styles.selectedLabel : styles.placeholderLabel,
                ).className
              }
            >
              {selectedModelLabel}
            </span>
            <CaretDownIcon className={stylex.props(styles.caret).className} />
          </Button>

          <AnimatePresence>
            {modelDropdownOpen && allModels.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className={stylex.props(styles.dropdown).className}
              >
                <div {...stylex.props(styles.searchArea)}>
                  <label
                    className={stylex.props(styles.srOnly).className}
                    htmlFor="model-search-input"
                  >
                    Search models
                  </label>
                  <div {...stylex.props(styles.searchField)}>
                    <MagnifyingGlassIcon className={stylex.props(styles.searchIcon).className} />
                    <Input
                      id="model-search-input"
                      ref={modelSearchInputRef}
                      type="text"
                      value={modelSearchQuery}
                      onChange={(event) => setModelSearchQuery(event.target.value)}
                      placeholder="Search models or providers"
                      className={stylex.props(styles.searchInput).className}
                    />
                  </div>
                </div>
                <div className={`memora-scrollbar ${stylex.props(styles.options).className}`}>
                  {filteredModelGroups.length === 0 ? (
                    <div {...stylex.props(styles.empty)}>No matching models.</div>
                  ) : (
                    filteredModelGroups.map(({ provider, models }) => (
                      <div key={provider.id}>
                        <div {...stylex.props(styles.providerLabel)}>{provider.name}</div>
                        {models.map((model) => {
                          const isSelected =
                            selectedProviderId === provider.id && selectedModel === model.id;

                          return (
                            <Button
                              variant="plain"
                              key={model.id}
                              type="button"
                              onClick={() => handleSelectModel(provider.id, model.id)}
                              className={
                                stylex.props(styles.option, isSelected && styles.selectedOption)
                                  .className
                              }
                            >
                              <span {...stylex.props(styles.checkSlot)}>
                                {isSelected ? (
                                  <CheckIcon className={stylex.props(styles.checkIcon).className} />
                                ) : null}
                              </span>
                              <span>{model.name ?? model.id}</span>
                            </Button>
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
            <div {...stylex.props(styles.backdrop)} onClick={handleCloseModelDropdown} />
          ) : null}
        </div>

        {allModels.length === 0 ? (
          <div
            className={`${SETTINGS_INSET_PANEL_CLASS_NAME} ${stylex.props(styles.emptyProvider).className}`}
          >
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>Add a provider to select a model.</p>
          </div>
        ) : null}
      </section>

      <ProviderManagementSection
        providers={providers}
        editingProviderId={editingProviderId}
        isAddingProvider={isAddingProvider}
        providerForm={providerForm}
        showApiKey={showApiKey}
        fetchingModels={fetchingModels}
        onProviderFormChange={handleProviderFormChange}
        onToggleApiKey={handleToggleApiKey}
        onAddProvider={handleAddProvider}
        onEditProvider={handleEditProvider}
        onCancelProviderForm={handleCancelProviderForm}
        onSaveProvider={handleSaveProvider}
        onDeleteProvider={handleDeleteProvider}
        onFetchProviderModels={handleFetchModels}
      />
    </div>
  );
}
