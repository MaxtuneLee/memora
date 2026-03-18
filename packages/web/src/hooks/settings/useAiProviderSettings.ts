import { Toast } from "@base-ui/react/toast";
import { useClientDocument, useStore } from "@livestore/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { parseProviderModel } from "@/lib/settings/dialogHelpers";
import { settingsProvidersQuery$ } from "@/lib/settings/queries";
import { providerEvents, type provider as ProviderRow } from "@/livestore/provider";
import { settingsTable } from "@/livestore/setting";
import type { ModelInfo, ProviderFormState } from "@/types/settingsDialog";

const EMPTY_PROVIDER_FORM: ProviderFormState = {
  name: "",
  baseUrl: "",
  apiKey: "",
  apiFormat: "chat-completions",
};

interface UseAiProviderSettingsOptions {
  open: boolean;
}

export const useAiProviderSettings = ({
  open,
}: UseAiProviderSettingsOptions) => {
  const { store } = useStore();
  const providers = store.useQuery(settingsProvidersQuery$) as ProviderRow[];
  const [settings, setSettings] = useClientDocument(settingsTable);
  const { add } = Toast.useToastManager();

  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(
    EMPTY_PROVIDER_FORM,
  );
  const [fetchingModels, setFetchingModels] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const modelSearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      return;
    }

    setEditingProviderId(null);
    setIsAddingProvider(false);
    setShowApiKey(false);
    setModelDropdownOpen(false);
    setModelSearchQuery("");
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

  const handleProviderFormChange = useCallback(
    (patch: Partial<ProviderFormState>) => {
      setProviderForm((current) => ({
        ...current,
        ...patch,
      }));
    },
    [],
  );

  const handleToggleApiKey = useCallback(() => {
    setShowApiKey((current) => !current);
  }, []);

  const handleToggleModelDropdown = useCallback(() => {
    setModelDropdownOpen((current) => !current);
  }, []);

  const handleCloseModelDropdown = useCallback(() => {
    setModelDropdownOpen(false);
  }, []);

  const handleAddProvider = useCallback(() => {
    setIsAddingProvider(true);
    setEditingProviderId(null);
    setProviderForm(EMPTY_PROVIDER_FORM);
    setShowApiKey(false);
  }, []);

  const handleEditProvider = useCallback((provider: ProviderRow) => {
    setEditingProviderId(provider.id);
    setIsAddingProvider(false);
    setProviderForm({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      apiFormat: provider.apiFormat,
    });
    setShowApiKey(false);
  }, []);

  const handleCancelProviderForm = useCallback(() => {
    setIsAddingProvider(false);
    setEditingProviderId(null);
    setShowApiKey(false);
  }, []);

  const handleSaveProvider = useCallback(() => {
    if (!providerForm.name.trim() || !providerForm.baseUrl.trim()) {
      add({
        title: "Missing fields",
        description: "Name and base URL are required.",
        type: "error",
      });
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
    [add, editingProviderId, setSettings, settings.selectedProviderId, store],
  );

  const handleFetchModels = useCallback(
    async (provider: ProviderRow) => {
      setFetchingModels(provider.id);
      try {
        const baseUrl = provider.baseUrl.replace(/\/+$/, "");
        const headers: Record<string, string> = {};
        if (provider.apiKey) {
          headers.Authorization = `Bearer ${provider.apiKey}`;
        }

        const response = await fetch(`${baseUrl}/models`, { headers });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status}: ${text.slice(0, 200)}`);
        }

        const json = (await response.json()) as {
          data?: unknown[];
          models?: unknown[];
        };
        const rawModels = json.data ?? json.models ?? [];
        const models: ModelInfo[] = rawModels.flatMap((model) => {
          const parsedModel = parseProviderModel(model);
          return parsedModel ? [parsedModel] : [];
        });

        if (import.meta.env.DEV) {
          console.info("[provider] models:fetched", {
            providerId: provider.id,
            providerName: provider.name,
            parsedCount: models.length,
            rawSample: rawModels.slice(0, 12),
            parsedSample: models.slice(0, 12),
          });
        }

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        add({
          title: "Failed to fetch models",
          description: message,
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

  return {
    providers,
    selectedProviderId: settings.selectedProviderId,
    selectedModel: settings.selectedModel,
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
  };
};
