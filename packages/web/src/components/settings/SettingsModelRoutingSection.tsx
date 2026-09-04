import { useAppStore } from "@/livestore/store";

import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { normalizeLocalModelUsageTotals } from "@/lib/models/localTokenUsage";
import FeatureModelSettings from "./FeatureModelSettings";
import { SETTINGS_PANEL_CLASS_NAME } from "./settingsClassNames";

export default function SettingsModelRoutingSection() {
  const store = useAppStore();
  const settings = store.useQuery(settingsDocumentQuery$);
  const usage = normalizeLocalModelUsageTotals(settings.localModelTokenUsage);
  const savedTokens = usage ? usage.inputTokens + usage.outputTokens : 0;
  const allTokens = (usage?.allInputTokens ?? 0) + (usage?.allOutputTokens ?? 0);
  const savedPercent = allTokens > 0 ? (savedTokens / allTokens) * 100 : 0;
  const formatTokens = (value: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const metrics = [
    {
      label: "Total commands",
      value:
        usage?.totalCommands === undefined && allTokens > 0
          ? "—"
          : new Intl.NumberFormat("en-US").format(usage?.totalCommands ?? 0),
    },
    { label: "Input tokens", value: formatTokens(usage?.allInputTokens ?? 0) },
    { label: "Output tokens", value: formatTokens(usage?.allOutputTokens ?? 0) },
    {
      label: "Tokens saved",
      value: `${formatTokens(savedTokens)} (${savedPercent.toFixed(1)}%)`,
    },
  ];
  return (
    <section className={SETTINGS_PANEL_CLASS_NAME}>
      <dl
        className="mb-5 space-y-2 border-b border-[var(--color-memora-border)] pb-5"
        aria-live="polite"
      >
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="text-[var(--color-memora-text-muted)]">{metric.label}</dt>
            <dd className="font-semibold tabular-nums text-[var(--color-memora-text-strong)]">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
      <FeatureModelSettings />
    </section>
  );
}
