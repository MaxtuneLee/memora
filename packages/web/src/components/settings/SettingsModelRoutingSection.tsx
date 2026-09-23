import { useAppStore } from "@/livestore/store";
import * as stylex from "@stylexjs/stylex";

import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { normalizeLocalModelUsageTotals } from "@/lib/models/localTokenUsage";
import FeatureModelSettings from "./FeatureModelSettings";
import { SETTINGS_PANEL_CLASS_NAME } from "./settingsClassNames";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  metrics: {
    borderBottom: `1px solid ${tokens.border}`,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 20,
    paddingBottom: 20,
  },
  metric: {
    alignItems: "baseline",
    display: "flex",
    fontSize: 14,
    gap: 16,
    justifyContent: "space-between",
  },
  label: { color: tokens.textMuted },
  value: {
    color: tokens.textStrong,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
  },
});

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
      <dl {...stylex.props(styles.metrics)} aria-live="polite">
        {metrics.map((metric) => (
          <div key={metric.label} {...stylex.props(styles.metric)}>
            <dt {...stylex.props(styles.label)}>{metric.label}</dt>
            <dd {...stylex.props(styles.value)}>{metric.value}</dd>
          </div>
        ))}
      </dl>
      <FeatureModelSettings />
    </section>
  );
}
