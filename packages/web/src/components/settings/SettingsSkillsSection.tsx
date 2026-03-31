import { useMemo } from "react";

import {
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { cn } from "@/lib/cn";
import { listBuiltInSkills } from "@/lib/skills/builtInSkills";

export default function SettingsSkillsSection() {
  const skills = useMemo(() => listBuiltInSkills(), []);

  return (
    <div className="space-y-4">
      {skills.length === 0 ? (
        <section className={SETTINGS_INSET_PANEL_CLASS_NAME}>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No built-in skills are bundled with this build.</p>
        </section>
      ) : (
        <section className={cn(SETTINGS_PANEL_CLASS_NAME, "space-y-2")}>
          {skills.map((skill) => (
            <div
              key={skill.name}
              className={cn(
                SETTINGS_ROW_CLASS_NAME,
                "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between",
              )}
            >
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-[var(--color-memora-text-strong)]">
                  {skill.name}
                </h4>
                <p className="mt-1 text-sm leading-6 text-[var(--color-memora-text-muted)]">
                  {skill.description}
                </p>
              </div>
              <span className="shrink-0 text-xs text-[var(--color-memora-text-soft)]">
                {skill.resourceCount} resource{skill.resourceCount === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
