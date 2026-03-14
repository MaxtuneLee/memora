import { Toast } from "@base-ui/react/toast";
import { useCallback, useEffect } from "react";

import { useStorageStats } from "@/hooks/settings/useStorageStats";

interface UseStorageSettingsOptions {
  open: boolean;
}

export const useStorageSettings = ({ open }: UseStorageSettingsOptions) => {
  const { add } = Toast.useToastManager();
  const {
    storageUsage,
    storageQuota,
    isStoragePersistent,
    isStorageSupported,
    breakdownSegments,
    contentCategories,
    contentUsage,
    usagePercentageLabel,
    refreshStorageState,
  } = useStorageStats({ autoRefresh: false });

  useEffect(() => {
    if (!open) {
      return;
    }

    void refreshStorageState();
  }, [open, refreshStorageState]);

  const handleRequestPersistence = useCallback(async () => {
    if (!navigator.storage?.persist) {
      add({
        title: "Persistence not supported",
        description: "This browser cannot request persistent storage.",
        type: "error",
      });
      return;
    }

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
      void refreshStorageState();
    }
  }, [add, refreshStorageState]);

  return {
    storageUsage,
    storageQuota,
    isStoragePersistent,
    isStorageSupported,
    breakdownSegments,
    contentCategories,
    contentUsage,
    usagePercentageLabel,
    handleRequestPersistence,
  };
};
