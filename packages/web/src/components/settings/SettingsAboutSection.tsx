import { ArrowUpRightIcon, GithubLogoIcon } from "@phosphor-icons/react";

import {
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_PRIMARY_BUTTON_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { cn } from "@/lib/cn";

const APP_DESCRIPTION = "Local-first agent lives in your browser.";
const SUPPORT_URL = "https://github.com/maxtunelee/memora/issues";

const formatBuildChannel = (channel: string): string => {
  return channel
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

function FactItem({ label, description }: { label: string; description: string }) {
  return (
    <div className={SETTINGS_ROW_CLASS_NAME}>
      <h3 className="text-sm font-semibold text-[var(--color-memora-text-strong)]">{label}</h3>
      <p className={cn(SETTINGS_SECTION_BODY_CLASS_NAME, "mt-2")}>{description}</p>
    </div>
  );
}

export default function SettingsAboutSection() {
  const buildChannel = formatBuildChannel(import.meta.env.MODE);

  return (
    <div className="space-y-4">
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="space-y-4">
          <img src="/memora-with-title.png" alt="Memora" className="w-28" />
          <p className="max-w-2xl text-sm leading-6 text-[var(--color-memora-text-muted)]">
            {APP_DESCRIPTION} Memora keeps files, settings, and workspace state in browser storage.
          </p>
          <p className="text-xs text-[var(--color-memora-text-soft)]">
            Version {__APP_VERSION__} · Build {buildChannel}
          </p>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
            className={SETTINGS_PRIMARY_BUTTON_CLASS_NAME}
          >
            <GithubLogoIcon className="size-4" weight="fill" />
            <span>Open GitHub issues</span>
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </div>
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="grid gap-3 md:grid-cols-2">
          <FactItem
            label="Storage and control"
            description="Workspace state lives locally first, with persistence controls available in settings when the browser supports them."
          />
          <FactItem
            label="Offline leaning"
            description="Transcription and media processing stay in-browser when supported by the device, reducing needless round trips."
          />
        </div>
      </section>
    </div>
  );
}
