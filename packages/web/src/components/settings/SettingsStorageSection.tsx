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
    breakdownSegments,
    contentCategories,
    contentUsage,
    storageUsage,
    storageQuota,
    usagePercentageLabel,
    isStoragePersistent,
    isStorageSupported,
    handleRequestPersistence,
  } = useStorageSettings({ open });
  const [isPersistRequesting, setIsPersistRequesting] = useState(false);
  const storageSummary = useMemo(() => {
    if (!storageQuota) {
      return "Storage usage not available.";
    }

    return `${formatBytes(storageUsage)} of ${formatBytes(storageQuota)} used`;
  }, [storageQuota, storageUsage]);
  const visibleBreakdownSegments = useMemo(() => {
    return breakdownSegments.filter((segment) => segment.size > 0);
  }, [breakdownSegments]);
  const visibleContentCategories = useMemo(() => {
    return contentCategories.filter((category) => category.size > 0);
  }, [contentCategories]);

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">
              Browser storage
            </h4>
            <p className="mt-1 text-sm text-zinc-500">{storageSummary}</p>
            <p className="mt-2 text-xs text-zinc-400">
              Includes user content, local databases, caches, and service
              workers.
            </p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 shadow-sm">
            {usagePercentageLabel}
          </span>
        </div>
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-zinc-200">
          {visibleBreakdownSegments.map((segment) => (
            <div
              key={segment.id}
              className={segment.color}
              style={{ width: `${segment.fraction * 100}%` }}
            />
          ))}
        </div>
        {visibleBreakdownSegments.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">
            {visibleBreakdownSegments.map((segment) => (
              <div key={segment.id} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", segment.color)} />
                <span>{segment.label}</span>
                <span className="text-[11px] text-zinc-400">
                  {formatBytes(segment.size)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">No browser storage used yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">
              User content
            </h4>
            <p className="mt-1 text-sm text-zinc-500">
              Files and downloaded models saved by Memora.
            </p>
          </div>
          <span className="text-sm font-semibold text-zinc-900">
            {formatBytes(contentUsage)}
          </span>
        </div>
        {visibleContentCategories.length > 0 ? (
          <div className="mt-4 space-y-3">
            {visibleContentCategories.map((category) => (
              <div key={category.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 text-zinc-700">
                    <span className={cn("size-2 rounded-full", category.color)} />
                    <span>{category.label}</span>
                  </div>
                  <span className="text-xs font-medium text-zinc-400">
                    {formatBytes(category.size)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={cn("h-full rounded-full", category.color)}
                    style={{ width: `${category.fraction * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 p-4 text-sm text-zinc-500">
            No user files stored yet.
          </div>
        )}
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
                isStoragePersistent ? "bg-[#879a4f]" : "bg-[#b07a63]",
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
