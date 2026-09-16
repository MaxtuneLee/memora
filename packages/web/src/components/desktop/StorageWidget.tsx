import { useStorageStats } from "@/hooks/settings/useStorageStats";
import { formatBytes } from "@/lib/format";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  root: { bottom: 16, position: "absolute", right: 16, width: 288 },
  button: { textAlign: "left", width: "100%" },
  card: {
    backdropFilter: "blur(12px)",
    backgroundColor: "rgb(255 255 255 / 0.8)",
    border: "1px solid rgb(228 228 231 / 0.8)",
    borderRadius: 16,
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    padding: 16,
    transition: "background-color 150ms, border-color 150ms, box-shadow 150ms",
    ":hover": {
      backgroundColor: "#fff",
      borderColor: "#d4d4d8",
      boxShadow: "0 4px 6px rgb(0 0 0 / 0.1)",
    },
  },
  header: { alignItems: "flex-start", display: "flex", gap: 12, justifyContent: "space-between" },
  title: { color: "#18181b", fontSize: 14, fontWeight: 600, margin: 0 },
  summary: { color: "#71717a", fontSize: 12, marginTop: 4 },
  status: {
    alignItems: "center",
    borderRadius: 9999,
    display: "flex",
    fontSize: 10,
    fontWeight: 500,
    gap: 6,
    paddingBlock: 2,
    paddingInline: 8,
  },
  persistentStatus: { backgroundColor: "#eef2e2", color: "#5f7240" },
  temporaryStatus: { backgroundColor: "#f3ebe2", color: "#8a6a4d" },
  dot: { borderRadius: 9999, height: 6, width: 6 },
  bar: {
    backgroundColor: "#f4f4f5",
    borderRadius: 9999,
    display: "flex",
    height: 6,
    marginTop: 12,
    overflow: "hidden",
    width: "100%",
  },
  segment: { height: "100%" },
  legend: {
    color: "#71717a",
    display: "flex",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 4,
    fontSize: 10,
    marginTop: 10,
  },
  legendItem: { alignItems: "center", display: "flex", gap: 4 },
  legendDot: { borderRadius: 9999, height: 6, width: 6 },
  legendValue: { color: "#a1a1aa" },
  empty: { color: "#a1a1aa", fontSize: 10, marginTop: 10 },
});

export function StorageWidget() {
  const { breakdownSegments, storageQuota, storageUsage, isStoragePersistent } = useStorageStats();
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
    <div {...stylex.props(styles.root)}>
      <button
        type="button"
        onClick={() => openSettings("data-storage")}
        {...stylex.props(styles.button)}
      >
        <div {...stylex.props(styles.card)}>
          <div {...stylex.props(styles.header)}>
            <div>
              <h3 {...stylex.props(styles.title)}>Storage</h3>
              <p {...stylex.props(styles.summary)}>{storageSummary}</p>
            </div>
            <div
              {...stylex.props(
                styles.status,
                isStoragePersistent ? styles.persistentStatus : styles.temporaryStatus,
              )}
            >
              <span
                {...stylex.props(styles.dot)}
                style={{ backgroundColor: isStoragePersistent ? "#879a4f" : "#b07a63" }}
              />
              {isStoragePersistent ? "Persistent" : "Temporary"}
            </div>
          </div>

          <div {...stylex.props(styles.bar)}>
            {visibleBreakdownSegments.map((segment) => (
              <div
                key={segment.id}
                {...stylex.props(styles.segment)}
                style={{ backgroundColor: segment.color, width: `${segment.fraction * 100}%` }}
              />
            ))}
          </div>

          {visibleBreakdownSegments.length > 0 ? (
            <div {...stylex.props(styles.legend)}>
              {visibleBreakdownSegments.map((segment) => (
                <div key={segment.id} {...stylex.props(styles.legendItem)}>
                  <span
                    {...stylex.props(styles.legendDot)}
                    style={{ backgroundColor: segment.color }}
                  />
                  <span>{segment.label}</span>
                  <span {...stylex.props(styles.legendValue)}>{formatBytes(segment.size)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p {...stylex.props(styles.empty)}>No storage used yet.</p>
          )}
        </div>
      </button>
    </div>
  );
}
