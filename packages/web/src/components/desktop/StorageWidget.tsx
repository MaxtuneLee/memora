import { useStorageStats } from "@/hooks/settings/useStorageStats";
import { formatBytes } from "@/lib/format";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { useMemo } from "react";

export function StorageWidget() {
  const {
    breakdownSegments,
    storageQuota,
    storageUsage,
    isStoragePersistent,
  } = useStorageStats();
  const { openSettings } = useSettingsDialog();
  const visibleBreakdownSegments = useMemo(() => {
    return breakdownSegments.filter((segment) => segment.size > 0);
  }, [breakdownSegments]);

  const storageSummary = useMemo(() => {
    if (!storageQuota) {
      return "Storage usage not available.";
    }
    return `${formatBytes(storageUsage)} of ${formatBytes(storageQuota)} used`;
  }, [storageQuota, storageUsage]);

  return (
    <div className="absolute bottom-4 right-4 w-72">
      <button
        type="button"
        onClick={() => openSettings("data-storage")}
        className="w-full text-left"
      >
        <div className="rounded-2xl border border-zinc-200/80 bg-white/80 backdrop-blur-md p-4 shadow-sm transition hover:border-zinc-300 hover:bg-white hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Storage</h3>
              <p className="mt-1 text-xs text-zinc-500">{storageSummary}</p>
            </div>
            <div
              className={`
                flex items-center gap-1.5 rounded-full px-2 py-0.5 
                text-[10px] font-medium
                ${isStoragePersistent ? "bg-[#eef2e2] text-[#5f7240]" : "bg-[#f3ebe2] text-[#8a6a4d]"}
              `}
            >
              <span
                className={`size-1.5 rounded-full ${
                  isStoragePersistent ? "bg-[#879a4f]" : "bg-[#b07a63]"
                }`}
              />
              {isStoragePersistent ? "Persistent" : "Temporary"}
            </div>
          </div>

          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
            {visibleBreakdownSegments.map((segment) => (
              <div
                key={segment.id}
                className={segment.color}
                style={{ width: `${segment.fraction * 100}%` }}
              />
            ))}
          </div>

          {visibleBreakdownSegments.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
              {visibleBreakdownSegments.map((segment) => (
                <div key={segment.id} className="flex items-center gap-1">
                  <span className={`size-1.5 rounded-full ${segment.color}`} />
                  <span>{segment.label}</span>
                  <span className="text-zinc-400">
                    {formatBytes(segment.size)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2.5 text-[10px] text-zinc-400">No storage used yet.</p>
          )}
        </div>
      </button>
    </div>
  );
}
