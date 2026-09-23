import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";

import {
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { listBuiltInSkills } from "@/lib/skills/builtInSkills";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 16 },
  panel: { display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    "@media (min-width: 640px)": {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  detail: { flex: 1, minWidth: 0 },
  title: { color: tokens.textStrong, fontSize: 14, fontWeight: 600, margin: 0 },
  description: {
    color: tokens.textMuted,
    fontSize: 14,
    lineHeight: "24px",
    marginTop: 4,
  },
  count: { color: tokens.textSoft, flexShrink: 0, fontSize: 12 },
});

export default function SettingsSkillsSection() {
  const skills = useMemo(() => listBuiltInSkills(), []);

  return (
    <div {...stylex.props(styles.root)}>
      {skills.length === 0 ? (
        <section className={SETTINGS_INSET_PANEL_CLASS_NAME}>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            No built-in skills are bundled with this build.
          </p>
        </section>
      ) : (
        <section className={`${SETTINGS_PANEL_CLASS_NAME} ${stylex.props(styles.panel).className}`}>
          {skills.map((skill) => (
            <div
              key={skill.name}
              className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row).className}`}
            >
              <div {...stylex.props(styles.detail)}>
                <h4 {...stylex.props(styles.title)}>{skill.name}</h4>
                <p {...stylex.props(styles.description)}>{skill.description}</p>
              </div>
              <span {...stylex.props(styles.count)}>
                {skill.resourceCount} resource{skill.resourceCount === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
