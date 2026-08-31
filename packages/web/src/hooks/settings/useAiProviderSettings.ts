import { Toast } from "@base-ui/react/toast";
import { useAppStore } from "@/livestore/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProviderModels } from "@/lib/settings/providerModels";
import { normalizeProviderEndpoint } from "@/lib/settings/providerEndpoint";
import { settingsDocumentQuery$, settingsProvidersQuery$ } from "@/lib/settings/queries";
import { providerEvents, type provider as ProviderRow } from "@/livestore/provider";
import { providerCredentialEvents } from "@/livestore/providerCredential";
import { useProviderCredentials } from "./useProviderCredentials";
import { useModelRouting } from "./useModelRouting";
import { settingEvents, type setting } from "@/livestore/setting";
import type { ProviderFormState } from "@/types/settingsDialog";

const EMPTY_PROVIDER_FORM: ProviderFormState = {
  name: "",
  baseUrl: "",
  apiKey: "",
  apiFormat: "chat-completions",
};

interface UseAiProviderSettingsOptions {
  open: boolean;
}

export const useAiProviderSettings = ({ open }: UseAiProviderSettingsOptions) => {
  const store = useAppStore();
  const providers = store.useQuery(settingsProvidersQuery$) as ProviderRow[];
  const settings = store.useQuery(settingsDocumentQuery$) as setting;
  const getProviderApiKey = useProviderCredentials();
  const { routing, setFeatureModel } = useModelRouting();
  const { add } = Toast.useToastManager();

  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(EMPTY_PROVIDER_FORM);
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

  const handleProviderFormChange = useCallback((patch: Partial<ProviderFormState>) => {
    setProviderForm((current) => ({
      ...current,
      ...patch,
    }));
  }, []);

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

  const handleEditProvider = useCallback(
    (provider: ProviderRow) => {
      setEditingProviderId(provider.id);
      setIsAddingProvider(false);
      setProviderForm({
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: getProviderApiKey(provider),
        apiFormat: provider.apiFormat,
      });
      setShowApiKey(false);
    },
    [getProviderApiKey],
  );

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

    let baseUrl: string;
    try {
      baseUrl = normalizeProviderEndpoint(providerForm.baseUrl);
    } catch (error) {
      add({
        title: "Check the base URL",
        description: error instanceof Error ? error.message : "Invalid endpoint.",
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
          baseUrl,
          apiFormat: providerForm.apiFormat,
          createdAt: new Date(),
        }),
        providerCredentialEvents.providerCredentialSet({
          providerId: id,
          baseUrl,
          apiKey: providerForm.apiKey.trim(),
        }),
      );
      add({ title: "Provider added", type: "success" });
    } else if (editingProviderId) {
      store.commit(
        providerEvents.providerUpdated({
          id: editingProviderId,
          name: providerForm.name.trim(),
          baseUrl,
          apiFormat: providerForm.apiFormat,
          updatedAt: new Date(),
        }),
        providerCredentialEvents.providerCredentialSet({
          providerId: editingProviderId,
          baseUrl,
          apiKey: providerForm.apiKey.trim(),
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
      store.commit(
        providerEvents.providerDeleted({ id, deletedAt: new Date() }),
        providerCredentialEvents.providerCredentialDeleted({ providerId: id }),
      );
      if (routing.assistant.providerId === id || settings.selectedProviderId === id) {
        setFeatureModel("assistant", { source: "cloud", providerId: "", modelId: "" });
        store.commit(
          settingEvents.settingsSet({
            selectedProviderId: "",
            selectedModel: "",
          }),
        );
      }
      if (editingProviderId === id) {
        setEditingProviderId(null);
      }
      add({ title: "Provider removed", type: "success" });
    },
    [
      add,
      editingProviderId,
      routing.assistant.providerId,
      setFeatureModel,
      settings.selectedProviderId,
      store,
    ],
  );

  const handleFetchModels = useCallback(
    async (provider: ProviderRow) => {
      setFetchingModels(provider.id);
      try {
        const models = await fetchProviderModels(provider.baseUrl, getProviderApiKey(provider));

        if (import.meta.env.DEV) {
          console.info("[provider] models:fetched", {
            providerId: provider.id,
            providerName: provider.name,
            parsedCount: models.length,
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
    [add, getProviderApiKey, store],
  );

  const handleSelectModel = useCallback(
    (providerId: string, modelId: string) => {
      setFeatureModel("assistant", { source: "cloud", providerId, modelId });
      store.commit(
        settingEvents.settingsSet({
          selectedProviderId: providerId,
          selectedModel: modelId,
        }),
      );
      setModelDropdownOpen(false);
    },
    [setFeatureModel, store],
  );

  return {
    providers,
    selectedProviderId: routing.assistant.providerId,
    selectedModel: routing.assistant.modelId,
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
