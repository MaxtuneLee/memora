import { useStore } from "@livestore/react";

import {
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { normalizeSettingsValue, settingEvents, settingsTable, type setting } from "@/livestore/setting";

export default function SettingsIndexingSection() {
  const { store } = useStore();
  const settings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );

  return (
    <section className={`${SETTINGS_PANEL_CLASS_NAME} space-y-5`}>
      <div className="space-y-2">
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Indexing</h3>
        <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
          Choose whether new files should be processed in the background. You can always start an
          index manually from a file's details or context menu.
        </p>
      </div>
      <label className={`${SETTINGS_ROW_CLASS_NAME} flex cursor-pointer items-start gap-3`}>
        <input
          type="checkbox"
          checked={settings.autoIndex}
          onChange={(event) => store.commit(settingEvents.settingsSet({ autoIndex: event.target.checked }))}
          className="mt-1 size-4 accent-zinc-900"
        />
        <span>
          <span className="block text-sm font-medium text-[var(--color-memora-text)]">
            Automatically index new and changed files
          </span>
          <span className="mt-1 block text-sm leading-6 text-[var(--color-memora-text-muted)]">
            Extract text, run OCR where supported, and add the result to local search when files are
            imported or updated.
          </span>
        </span>
      </label>
      <div className={`${SETTINGS_INSET_PANEL_CLASS_NAME} text-sm leading-6 text-[var(--color-memora-text-muted)]`}>
        The small icon on a Desktop file shows its current state. Open the file details to see the
        full label, latest result, and a manual Reindex button.
      </div>
    </section>
  );
}
