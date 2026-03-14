import { useMemo } from "react";

import { listBuiltInSkills } from "@/lib/skills/builtInSkills";

export default function SettingsSkillsSection() {
  const skills = useMemo(() => listBuiltInSkills(), []);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div>
          <h4 className="text-sm font-semibold text-zinc-900">Built-in skills</h4>
          <p className="mt-1 text-sm text-zinc-500">
            Skills shipped with Memora. The assistant only sees their names and
            descriptions up front, then loads full instructions on demand.
          </p>
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-6 text-sm text-zinc-500">
          No built-in skills are bundled with this build.
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-zinc-900">
                      {skill.name}
                    </h4>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                      Built-in
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">
                    {skill.description}
                  </p>
                </div>
                <div className="rounded-full bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                  {skill.resourceCount} resource
                  {skill.resourceCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
