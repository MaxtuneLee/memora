import { useStorageStats } from "@/hooks/settings/useStorageStats";
import { formatBytes } from "@/lib/format";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { useMemo } from "react";

export function StorageWidget() {
  const { storageQuota, isStoragePersistent, categories } =
    useStorageStats();
  const { openSettings } = useSettingsDialog();

  const fileUsage = useMemo(
    () => categories.reduce((total, category) => total + category.size, 0),
    [categories],
  );

  const storageSummary = useMemo(() => {
    if (!storageQuota) {
      return "Storage usage not available.";
    }
    return `${formatBytes(fileUsage)} of ${formatBytes(storageQuota)} used`;
  }, [fileUsage, storageQuota]);

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
                ${isStoragePersistent ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}
              `}
            >
              <span
                className={`size-1.5 rounded-full ${
                  isStoragePersistent ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {isStoragePersistent ? "Persistent" : "Temporary"}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
            {categories.map((category) => (
              <div
                key={category.id}
                className={category.color}
                style={{ width: `${category.fraction * 100}%` }}
              />
            ))}
          </div>

          {/* Category legend */}
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center gap-1">
                <span className={`size-1.5 rounded-full ${category.color}`} />
                <span>{category.label}</span>
                <span className="text-zinc-400">
                  {formatBytes(category.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </button>
    </div>
  );
}
