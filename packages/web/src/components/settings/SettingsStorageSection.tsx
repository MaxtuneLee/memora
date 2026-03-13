import { Button } from "@base-ui/react/button";
import { useMemo, useState } from "react";

import { useStorageSettings } from "@/hooks/settings/useStorageSettings";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

interface SettingsStorageSectionProps {
  open: boolean;
}

export default function SettingsStorageSection({
  open,
}: SettingsStorageSectionProps) {
  const {
    storageUsage,
    storageQuota,
    isStoragePersistent,
    isStorageSupported,
    categories,
    handleRequestPersistence,
  } = useStorageSettings({ open });
  const [isPersistRequesting, setIsPersistRequesting] = useState(false);
  const storageSummary = useMemo(() => {
    if (!storageQuota) {
      return "Storage usage not available.";
    }

    return `${formatBytes(storageUsage)} of ${formatBytes(storageQuota)} used`;
  }, [storageQuota, storageUsage]);
  const usagePercentage = useMemo(() => {
    if (!storageQuota) {
      return 0;
    }

    return Math.min(100, Math.round((storageUsage / storageQuota) * 100));
  }, [storageQuota, storageUsage]);

  const handlePersistClick = async (): Promise<void> => {
    if (isPersistRequesting) {
      return;
    }

    setIsPersistRequesting(true);
    try {
      await handleRequestPersistence();
    } finally {
      setIsPersistRequesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">
              Local storage usage
            </h4>
            <p className="mt-1 text-sm text-zinc-500">{storageSummary}</p>
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
            <div key={category.id} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${category.color}`} />
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
                isStoragePersistent ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {isStoragePersistent ? "Enabled" : "Not enabled"}
          </div>
        </div>
        <div className="mt-4">
          <Button
            disabled={
              !isStorageSupported || isStoragePersistent || isPersistRequesting
            }
            onClick={() => void handlePersistClick()}
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
  );
}
