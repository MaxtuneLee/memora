import { Toast } from "@base-ui/react/toast";
import { useCallback, useEffect, useState } from "react";

import {
  clearGlobalMemory,
  clearGlobalMemoryNotices,
  deleteGlobalMemoryNotice,
  deleteGlobalMemoryPersonality,
  loadGlobalMemoryData,
  type GlobalMemoryData,
} from "@/lib/settings/personalityStorage";

interface UseMemorySettingsOptions {
  open: boolean;
}

export const useMemorySettings = ({ open }: UseMemorySettingsOptions) => {
  const { add } = Toast.useToastManager();
  const [memoryData, setMemoryData] = useState<GlobalMemoryData | null>(null);
  const [isMemoryLoading, setIsMemoryLoading] = useState(false);

  const refreshMemoryData = useCallback(async (): Promise<void> => {
    setIsMemoryLoading(true);
    try {
      const nextMemory = await loadGlobalMemoryData();
      setMemoryData(nextMemory);
    } finally {
      setIsMemoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setIsMemoryLoading(false);
      return;
    }

    void refreshMemoryData();
  }, [open, refreshMemoryData]);

  const handleDeletePersonality = useCallback(async () => {
    const nextMemory = await deleteGlobalMemoryPersonality();
    setMemoryData(nextMemory);
    add({ title: "Personality removed", type: "success" });
  }, [add]);

  const handleDeleteNotice = useCallback(
    async (noticeId: string) => {
      const nextMemory = await deleteGlobalMemoryNotice(noticeId);
      setMemoryData(nextMemory);
      add({ title: "Notice removed", type: "success" });
    },
    [add],
  );

  const handleClearNotices = useCallback(async () => {
    const nextMemory = await clearGlobalMemoryNotices();
    setMemoryData(nextMemory);
    add({ title: "Notices cleared", type: "success" });
  }, [add]);

  const handleClearAllMemory = useCallback(async () => {
    await clearGlobalMemory();
    setMemoryData(null);
    add({ title: "Memory cleared", type: "success" });
  }, [add]);

  return {
    memoryData,
    isMemoryLoading,
    refreshMemoryData,
    handleDeletePersonality,
    handleDeleteNotice,
    handleClearNotices,
    handleClearAllMemory,
  };
};
