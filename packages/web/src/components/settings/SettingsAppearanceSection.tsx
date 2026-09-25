import * as stylex from "@stylexjs/stylex";

import {
  SETTINGS_FIELD_LABEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import type { ThemePreference } from "@/lib/theme/documentTheme";
import { settingEvents } from "@/livestore/setting";
import { useAppStore } from "@/livestore/store";

const styles = stylex.create({
  panelStack: { display: "flex", flexDirection: "column", gap: 16 },
  heading: { display: "flex", flexDirection: "column", gap: 8 },
  fieldLabelMargin: { marginBottom: 8 },
  optionRow: { display: "flex", flexWrap: "wrap", gap: 8 },
});

const THEME_OPTIONS = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
] as const satisfies readonly { id: ThemePreference; label: string }[];

export default function SettingsAppearanceSection() {
  const store = useAppStore();
  const settings = store.useQuery(settingsDocumentQuery$);
  const theme = settings.theme ?? "system";

  return (
    <section
      className={`${SETTINGS_PANEL_CLASS_NAME} ${stylex.props(styles.panelStack).className}`}
    >
      <div {...stylex.props(styles.heading)}>
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Appearance</h3>
        <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
          System follows your device and changes with it.
        </p>
      </div>
      <div>
        <p
          id="settings-theme-label"
          className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.fieldLabelMargin).className}`}
        >
          Theme
        </p>
        <div
          role="group"
          aria-labelledby="settings-theme-label"
          {...stylex.props(styles.optionRow)}
        >
          {THEME_OPTIONS.map((option) => (
            <Button
              variant="segment"
              active={theme === option.id}
              key={option.id}
              type="button"
              aria-pressed={theme === option.id}
              onClick={() => store.commit(settingEvents.settingsSet({ theme: option.id }))}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
