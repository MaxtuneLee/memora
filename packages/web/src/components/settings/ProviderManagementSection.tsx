import { ArrowsClockwiseIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import * as stylex from "@stylexjs/stylex";

import SettingsProviderForm from "@/components/settings/SettingsProviderForm";
import {
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { parseProviderModels } from "@/lib/settings/dialogHelpers";
import type { provider as ProviderRow } from "@/livestore/provider";
import type { ProviderFormState } from "@/types/settingsDialog";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
  heading: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    "@media (min-width: 640px)": {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  iconSmall: { height: 14, width: 14 },
  icon: { height: 16, width: 16 },
  spin: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
  empty: { marginTop: 20 },
  list: { display: "flex", flexDirection: "column", gap: 8, marginTop: 16 },
  row: { display: "flex", gap: 16 },
  provider: { flex: 1, minWidth: 0 },
  providerName: { color: "var(--color-memora-text-strong)", fontSize: "0.875rem", fontWeight: 600 },
  providerUrl: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  providerModels: { color: "var(--color-memora-text-soft)", fontSize: "0.75rem", marginTop: 4 },
  actions: { alignItems: "flex-start", display: "flex", flexShrink: 0, gap: 4 },
  form: { marginTop: 16, overflow: "hidden" },
});

interface ProviderManagementSectionProps {
  title?: string;
  emptyMessage?: string;
  className?: string;
  providers: ProviderRow[];
  editingProviderId: string | null;
  isAddingProvider: boolean;
  providerForm: ProviderFormState;
  showApiKey: boolean;
  fetchingModels: string | null;
  onProviderFormChange: (patch: Partial<ProviderFormState>) => void;
  onToggleApiKey: () => void;
  onAddProvider: () => void;
  onEditProvider: (provider: ProviderRow) => void;
  onCancelProviderForm: () => void;
  onSaveProvider: () => void;
  onDeleteProvider: (providerId: string) => void;
  onFetchProviderModels: (provider: ProviderRow) => void | Promise<void>;
}

export default function ProviderManagementSection({
  title = "Providers",
  emptyMessage = "No providers configured yet.",
  className,
  providers,
  editingProviderId,
  isAddingProvider,
  providerForm,
  showApiKey,
  fetchingModels,
  onProviderFormChange,
  onToggleApiKey,
  onAddProvider,
  onEditProvider,
  onCancelProviderForm,
  onSaveProvider,
  onDeleteProvider,
  onFetchProviderModels,
}: ProviderManagementSectionProps) {
  const isFormOpen = isAddingProvider || editingProviderId !== null;

  return (
    <section className={cn(SETTINGS_PANEL_CLASS_NAME, className)}>
      <div {...stylex.props(styles.heading)}>
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>{title}</h3>
        <Button variant="secondary" onClick={onAddProvider} disabled={isFormOpen}>
          <PlusIcon {...stylex.props(styles.iconSmall)} weight="bold" />
          <span>Add provider</span>
        </Button>
      </div>

      {providers.length === 0 && !isAddingProvider ? (
        <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, stylex.props(styles.empty).className)}>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>{emptyMessage}</p>
        </div>
      ) : (
        <div {...stylex.props(styles.list)}>
          {providers.map((provider) => {
            if (editingProviderId === provider.id) {
              return null;
            }

            const models = parseProviderModels(provider);
            const isFetching = fetchingModels === provider.id;

            return (
              <div
                key={provider.id}
                className={cn(SETTINGS_ROW_CLASS_NAME, stylex.props(styles.row).className)}
              >
                <div {...stylex.props(styles.provider)}>
                  <p {...stylex.props(styles.providerName)}>{provider.name}</p>
                  <p {...stylex.props(styles.providerUrl)}>{provider.baseUrl}</p>
                  <p {...stylex.props(styles.providerModels)}>{`${models.length} cached`}</p>
                </div>

                <div {...stylex.props(styles.actions)}>
                  <Button
                    variant="icon"
                    type="button"
                    onClick={() => {
                      void onFetchProviderModels(provider);
                    }}
                    disabled={isFetching || isFormOpen}
                    title="Fetch models"
                  >
                    <ArrowsClockwiseIcon
                      {...stylex.props(styles.icon, isFetching && styles.spin)}
                    />
                  </Button>
                  <Button
                    variant="icon"
                    type="button"
                    onClick={() => onEditProvider(provider)}
                    disabled={isFormOpen}
                    title="Edit"
                  >
                    <PencilSimpleIcon {...stylex.props(styles.icon)} />
                  </Button>
                  <Button
                    variant="destructiveIcon"
                    type="button"
                    onClick={() => onDeleteProvider(provider.id)}
                    disabled={isFormOpen}
                    title="Remove"
                  >
                    <TrashIcon {...stylex.props(styles.icon)} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {isFormOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            {...stylex.props(styles.form)}
          >
            <SettingsProviderForm
              isAddingProvider={isAddingProvider}
              providerForm={providerForm}
              showApiKey={showApiKey}
              onChange={onProviderFormChange}
              onToggleApiKey={onToggleApiKey}
              onCancel={onCancelProviderForm}
              onSave={onSaveProvider}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
