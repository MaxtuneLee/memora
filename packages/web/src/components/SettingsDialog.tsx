import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Toast } from "@base-ui/react/toast";
import {
  XIcon,
  PlusIcon,
  TrashIcon,
  PencilSimpleIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, useClientDocument } from "@livestore/react";
import { queryDb } from "@livestore/livestore";

import { cn } from "../lib/cn";
import { formatBytes } from "../lib/format";
import { useStorageStats } from "../hooks/useStorageStats";
import ToastStack from "./ToastStack";
import { providerTable, providerEvents, type provider as ProviderRow } from "../livestore/provider";
import { settingsTable } from "../livestore/setting";

import { motion, AnimatePresence } from "motion/react";

export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    description: "Profile, workspace, and appearance settings.",
  },
  {
    id: "hotkeys",
    label: "Hotkeys",
    description: "Shortcuts and command palette preferences.",
  },
  {
    id: "ai-provider",
    label: "AI Service Provider",
    description: "Manage AI runtime and model endpoints.",
  },
  {
    id: "data-storage",
    label: "Data Storage",
    description: "Storage usage and persistence options.",
  },
  {
    id: "about",
    label: "About",
    description: "Version, build, and support information.",
  },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSection: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
}

interface ProviderFormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: "chat-completions" | "responses";
}

interface ModelInfo {
  id: string;
  name?: string;
}

const providersQuery$ = queryDb(
  () => providerTable.where({ deletedAt: null }).orderBy("createdAt", "desc"),
  { label: "settings:providers" },
);


export default function SettingsDialog({
  open,
  onOpenChange,
  activeSection,
  onSectionChange,
}: SettingsDialogProps) {
  const { store } = useStore();
  const providers = store.useQuery(providersQuery$) as ProviderRow[];
  const [settings, setSettings] = useClientDocument(settingsTable);
  const [isPersistRequesting, setIsPersistRequesting] = useState(false);
  const { add, close } = Toast.useToastManager();
  const {
    storageUsage,
    storageQuota,
    isStoragePersistent,
    isStorageSupported,
    categories,
    refreshStorageState,
  } = useStorageStats({ autoRefresh: false });

  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderFormState>({
    name: "",
    baseUrl: "",
    apiKey: "",
    apiFormat: "chat-completions",
  });
  const [fetchingModels, setFetchingModels] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const modelSearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    void refreshStorageState();
  }, [open, refreshStorageState]);

  useEffect(() => {
    if (!open) {
      setEditingProviderId(null);
      setIsAddingProvider(false);
      setShowApiKey(false);
      setModelDropdownOpen(false);
      setModelSearchQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!modelDropdownOpen) {
      setModelSearchQuery("");
      return;
    }
    const timer = window.setTimeout(() => {
      modelSearchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [modelDropdownOpen]);

  const storageSummary = useMemo(() => {
    if (!storageQuota) return "Storage usage not available.";
    return `${formatBytes(storageUsage)} of ${formatBytes(storageQuota)} used`;
  }, [storageQuota, storageUsage]);

  const usagePercentage = useMemo(() => {
    if (!storageQuota) return 0;
    return Math.min(100, Math.round((storageUsage / storageQuota) * 100));
  }, [storageQuota, storageUsage]);

  const activeSectionData = useMemo(
    () => SETTINGS_SECTIONS.find((section) => section.id === activeSection),
    [activeSection],
  );

  const handleRequestPersistence = useCallback(async () => {
    if (!navigator.storage?.persist || isPersistRequesting) {
      add({
        title: "Persistence not supported",
        description: "This browser cannot request persistent storage.",
        type: "error",
      });
      return;
    }

    setIsPersistRequesting(true);
    try {
      const granted = await navigator.storage.persist();
      add({
        title: granted ? "Persistent storage enabled" : "Persistence denied",
        description: granted
          ? "Your data will be kept for longer periods."
          : "The browser did not grant persistent storage.",
        type: granted ? "success" : "error",
      });
    } catch {
      add({
        title: "Persistence request failed",
        description: "Please try again or check browser permissions.",
        type: "error",
      });
    } finally {
      setIsPersistRequesting(false);
      void refreshStorageState();
    }
  }, [add, isPersistRequesting, refreshStorageState]);

  const handleAddProvider = useCallback(() => {
    setIsAddingProvider(true);
    setEditingProviderId(null);
    setProviderForm({ name: "", baseUrl: "", apiKey: "", apiFormat: "chat-completions" });
    setShowApiKey(false);
  }, []);

  const handleEditProvider = useCallback(
    (provider: ProviderRow) => {
      setEditingProviderId(provider.id);
      setIsAddingProvider(false);
      setProviderForm({
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        apiFormat: provider.apiFormat as "chat-completions" | "responses",
      });
      setShowApiKey(false);
    },
    [],
  );

  const handleCancelForm = useCallback(() => {
    setIsAddingProvider(false);
    setEditingProviderId(null);
    setShowApiKey(false);
  }, []);

  const handleSaveProvider = useCallback(() => {
    if (!providerForm.name.trim() || !providerForm.baseUrl.trim()) {
      add({ title: "Missing fields", description: "Name and base URL are required.", type: "error" });
      return;
    }

    if (isAddingProvider) {
      const id = crypto.randomUUID();
      store.commit(
        providerEvents.providerCreated({
          id,
          name: providerForm.name.trim(),
          baseUrl: providerForm.baseUrl.trim().replace(/\/+$/, ""),
          apiKey: providerForm.apiKey,
          apiFormat: providerForm.apiFormat,
          createdAt: new Date(),
        }),
      );
      add({ title: "Provider added", type: "success" });
    } else if (editingProviderId) {
      store.commit(
        providerEvents.providerUpdated({
          id: editingProviderId,
          name: providerForm.name.trim(),
          baseUrl: providerForm.baseUrl.trim().replace(/\/+$/, ""),
          apiKey: providerForm.apiKey,
          apiFormat: providerForm.apiFormat,
          updatedAt: new Date(),
        }),
      );
      add({ title: "Provider updated", type: "success" });
    }

    setIsAddingProvider(false);
    setEditingProviderId(null);
    setShowApiKey(false);
  }, [add, editingProviderId, isAddingProvider, providerForm, store]);

  const handleDeleteProvider = useCallback(
    (id: string) => {
      store.commit(providerEvents.providerDeleted({ id, deletedAt: new Date() }));
      if (settings.selectedProviderId === id) {
        setSettings({ selectedProviderId: "", selectedModel: "" });
      }
      if (editingProviderId === id) {
        setEditingProviderId(null);
      }
      add({ title: "Provider removed", type: "success" });
    },
    [add, editingProviderId, setSettings, settings, store],
  );

  const handleFetchModels = useCallback(
    async (provider: ProviderRow) => {
      setFetchingModels(provider.id);
      try {
        const baseUrl = provider.baseUrl.replace(/\/+$/, "");
        const headers: Record<string, string> = {};
        if (provider.apiKey) {
          headers["Authorization"] = `Bearer ${provider.apiKey}`;
        }

        const res = await fetch(`${baseUrl}/models`, { headers });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status}: ${text.slice(0, 200)}`);
        }

        const json = await res.json();
        const models: ModelInfo[] = (json.data ?? json.models ?? []).map(
          (m: { id: string; name?: string }) => ({
            id: m.id,
            name: m.name ?? m.id,
          }),
        );

        store.commit(
          providerEvents.providerUpdated({
            id: provider.id,
            models: JSON.stringify(models),
            updatedAt: new Date(),
          }),
        );

        add({
          title: `Fetched ${models.length} model${models.length === 1 ? "" : "s"}`,
          type: "success",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        add({
          title: "Failed to fetch models",
          description: msg,
          type: "error",
        });
      } finally {
        setFetchingModels(null);
      }
    },
    [add, store],
  );

  const handleSelectModel = useCallback(
    (providerId: string, modelId: string) => {
      setSettings({ selectedProviderId: providerId, selectedModel: modelId });
      setModelDropdownOpen(false);
    },
    [setSettings],
  );

  const allModels = useMemo(() => {
    const result: { providerId: string; providerName: string; model: ModelInfo }[] = [];
    for (const p of providers) {
      const models: ModelInfo[] = (() => {
        try {
          return JSON.parse(p.models || "[]");
        } catch {
          return [];
        }
      })();
      for (const m of models) {
        result.push({ providerId: p.id, providerName: p.name, model: m });
      }
    }
    return result;
  }, [providers]);

  const filteredModelGroups = useMemo(() => {
    const query = modelSearchQuery.trim().toLowerCase();
    return providers
      .map((provider) => {
        const models: ModelInfo[] = (() => {
          try {
            return JSON.parse(provider.models || "[]");
          } catch {
            return [];
          }
        })();

        if (!query) {
          return { provider, models };
        }

        const filteredModels = models.filter((model) => {
          const modelName = (model.name ?? "").toLowerCase();
          const modelId = model.id.toLowerCase();
          const providerName = provider.name.toLowerCase();
          return (
            modelName.includes(query) ||
            modelId.includes(query) ||
            providerName.includes(query)
          );
        });

        return { provider, models: filteredModels };
      })
      .filter((entry) => entry.models.length > 0);
  }, [modelSearchQuery, providers]);

  const selectedModelLabel = useMemo(() => {
    if (!settings.selectedModel) return "Select a model...";
    const entry = allModels.find(
      (m) => m.providerId === settings.selectedProviderId && m.model.id === settings.selectedModel,
    );
    if (entry) return `${entry.providerName} / ${entry.model.name ?? entry.model.id}`;
    return settings.selectedModel;
  }, [allModels, settings.selectedModel, settings.selectedProviderId]);

  const toastIconColor = (type?: string) => {
    switch (type) {
      case "success":
        return "bg-emerald-500";
      case "error":
        return "bg-rose-500";
      default:
        return "bg-zinc-400";
    }
  };

  const isFormOpen = isAddingProvider || editingProviderId !== null;

  const renderProviderForm = () => (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900">
          {isAddingProvider ? "Add provider" : "Edit provider"}
        </h4>
      </div>
      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Name</label>
          <input
            type="text"
            value={providerForm.name}
            onChange={(e) => setProviderForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. OpenAI, Anthropic, Local LLM"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Base URL</label>
          <input
            type="text"
            value={providerForm.baseUrl}
            onChange={(e) => setProviderForm((p) => ({ ...p, baseUrl: e.target.value }))}
            placeholder="https://api.openai.com/v1"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">API Key</label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={providerForm.apiKey}
              onChange={(e) => setProviderForm((p) => ({ ...p, apiKey: e.target.value }))}
              placeholder="sk-..."
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 pr-9 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              {showApiKey ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">API Format</label>
          <div className="flex gap-2">
            {(["chat-completions", "responses"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setProviderForm((p) => ({ ...p, apiFormat: fmt }))}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  providerForm.apiFormat === fmt
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
                )}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button
          onClick={handleCancelForm}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSaveProvider}
          className="rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          {isAddingProvider ? "Add" : "Save"}
        </Button>
      </div>
    </div>
  );

  const renderAiProviderSection = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-zinc-900">Active model</h4>
        </div>
        <div className="relative mt-3">
          <button
            type="button"
            onClick={() => setModelDropdownOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-900 transition hover:border-zinc-300"
          >
            <span className={settings.selectedModel ? "" : "text-zinc-400"}>
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
                            settings.selectedProviderId === provider.id &&
                            settings.selectedModel === model.id;
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
                              {isSelected && <CheckIcon className="size-3.5 shrink-0 text-zinc-900" />}
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
          {modelDropdownOpen && (
            <div className="fixed inset-0 z-[9]" onClick={() => setModelDropdownOpen(false)} />
          )}
        </div>
        {allModels.length === 0 && (
          <p className="mt-2 text-xs text-zinc-400">
            Add a provider and fetch models to select one.
          </p>
        )}
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

        {providers.length === 0 && !isAddingProvider && (
          <p className="mt-3 text-xs text-zinc-400">
            No providers configured yet.
          </p>
        )}

        <div className="mt-3 space-y-2">
          {providers.map((provider) => {
            if (editingProviderId === provider.id) return null;
            const models: ModelInfo[] = (() => {
              try {
                return JSON.parse(provider.models || "[]");
              } catch {
                return [];
              }
            })();
            const isFetching = fetchingModels === provider.id;
            return (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-lg border border-zinc-100 bg-white px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900">{provider.name}</span>
                    <span className="text-[11px] text-zinc-400">{models.length} models</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-400">{provider.baseUrl}</div>
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
          {isFormOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-3 overflow-hidden"
            >
              {renderProviderForm()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          render={(props, state) => {
            const {
              onDrag,
              onDragEnd,
              onDragStart,
              onAnimationStart,
              onAnimationEnd,
              onAnimationIteration,
              ...rest
            } = props;
            return (
              <motion.div
                {...rest}
                className={props.className}
                initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                animate={
                  state.open
                    ? { opacity: 1, backdropFilter: "blur(6px)" }
                    : { opacity: 0, backdropFilter: "blur(0px)" }
                }
                transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
              />
            );
          }}
          className="fixed inset-0 z-40 bg-zinc-900/30"
        />
        <Dialog.Popup
          render={(props, state) => {
            const {
              onDrag,
              onDragEnd,
              onDragStart,
              onAnimationStart,
              onAnimationEnd,
              onAnimationIteration,
              ...rest
            } = props;
            return (
              <motion.div
                {...rest}
                className={props.className}
                initial={{ opacity: 0, scale: 0.96, y: 18 }}
                animate={
                  state.open
                    ? { opacity: 1, scale: 1, y: 0 }
                    : { opacity: 0, scale: 0.98, y: 10 }
                }
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
              />
            );
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(960px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        >
          <div className="grid min-h-130 grid-cols-[220px_1fr]">
            <div className="border-r border-zinc-200 bg-zinc-50/70 p-4">
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Settings
              </div>
              <nav className="space-y-1">
                {SETTINGS_SECTIONS.map((section) => {
                  const isActive = section.id === activeSection;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => onSectionChange(section.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors",
                        isActive
                          ? "bg-white text-zinc-900 shadow-sm"
                          : "text-zinc-500 hover:bg-white/70 hover:text-zinc-900",
                      )}
                    >
                      <span>{section.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="flex flex-col">
              <div className="flex items-start justify-between border-b border-zinc-200/70 px-6 py-5">
                <div>
                  <Dialog.Title className="text-xl font-semibold text-zinc-900">
                    {activeSectionData?.label ?? "Settings"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm text-zinc-500">
                    {activeSectionData?.description ??
                      "Manage your workspace preferences."}
                  </Dialog.Description>
                </div>
                <Dialog.Close className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">
                  <XIcon className="size-4" />
                </Dialog.Close>
              </div>
              <div className="max-h-[60vh] flex-1 space-y-6 overflow-y-auto px-6 py-6">
                {activeSection === "ai-provider" ? (
                  renderAiProviderSection()
                ) : activeSection === "data-storage" ? (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">
                            Local storage usage
                          </h4>
                          <p className="mt-1 text-sm text-zinc-500">
                            {storageSummary}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-zinc-500">
                          {usagePercentage}%
                        </span>
                      </div>
                      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                        {categories.map((category) => (
                          <div
                            key={category.id}
                            className={category.color}
                            style={{ width: `${category.fraction * 100}%` }}
                          />
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">
                        {categories.map((category) => (
                          <div
                            key={category.id}
                            className="flex items-center gap-1.5"
                          >
                            <span
                              className={`size-2 rounded-full ${category.color}`}
                            />
                            <span>{category.label}</span>
                            <span className="text-[11px] text-zinc-400">
                              {formatBytes(category.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-6">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">
                            Persistent storage
                          </h4>
                          <p className="mt-1 text-sm text-zinc-500">
                            {isStorageSupported
                              ? isStoragePersistent
                                ? "Your browser granted persistent storage."
                                : "Request persistence to reduce eviction risk."
                              : "Persistent storage is not supported in this browser."}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              isStoragePersistent
                                ? "bg-emerald-500"
                                : "bg-amber-500",
                            )}
                          />
                          {isStoragePersistent ? "Enabled" : "Not enabled"}
                        </div>
                      </div>
                      <div className="mt-4">
                        <Button
                          disabled={
                            !isStorageSupported ||
                            isStoragePersistent ||
                            isPersistRequesting
                          }
                          onClick={handleRequestPersistence}
                          className="rounded-full border border-zinc-900 bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300"
                        >
                          {isStoragePersistent
                            ? "Persistence enabled"
                            : isPersistRequesting
                              ? "Requesting..."
                              : "Request persistence"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-6 text-sm text-zinc-500">
                    {activeSectionData?.description ??
                      "Settings are coming soon."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>

      <ToastStack
        render={(toast) => (
          <Toast.Content className="flex items-start gap-3 transition">
            <span
              className={cn(
                "mt-1 size-2 rounded-full",
                toastIconColor(toast.type),
              )}
            />
            <div className="space-y-1">
              <Toast.Title className="text-sm font-semibold text-zinc-900">
                {toast.title}
              </Toast.Title>
              {toast.description ? (
                <Toast.Description className="text-xs text-zinc-500">
                  {toast.description}
                </Toast.Description>
              ) : null}
            </div>
            <Toast.Close
              className="ml-auto text-zinc-400 hover:text-zinc-700"
              onClick={() => close(toast.id)}
            >
              <XIcon className="size-3" />
            </Toast.Close>
          </Toast.Content>
        )}
      />
    </Dialog.Root>
  );
}
