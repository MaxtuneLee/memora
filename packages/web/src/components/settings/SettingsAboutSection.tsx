import { ArrowUpRightIcon, GithubLogoIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";

import {
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 16 },
  panelStack: { display: "flex", flexDirection: "column", gap: 16 },
  title: { color: tokens.textStrong, fontSize: "0.875rem", fontWeight: 600 },
  bodyMargin: { marginTop: 8 },
  logo: { width: 112 },
  description: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: 1.5,
    maxWidth: "42rem",
  },
  version: { color: tokens.textSoft, fontSize: "0.75rem" },
  githubIcon: { height: 16, width: 16 },
  externalIcon: { height: 14, width: 14 },
  facts: {
    display: "grid",
    gap: 12,
    "@media (min-width: 768px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
});

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
      <h3 {...stylex.props(styles.title)}>{label}</h3>
      <p
        className={cn(SETTINGS_SECTION_BODY_CLASS_NAME, stylex.props(styles.bodyMargin).className)}
      >
        {description}
      </p>
    </div>
  );
}

export default function SettingsAboutSection() {
  const buildChannel = formatBuildChannel(import.meta.env.MODE);

  return (
    <div {...stylex.props(styles.stack)}>
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.panelStack)}>
          <img src="/memora-with-title.png" alt="Memora" {...stylex.props(styles.logo)} />
          <p {...stylex.props(styles.description)}>
            {APP_DESCRIPTION} Memora keeps files, settings, and workspace state in browser storage.
          </p>
          <p {...stylex.props(styles.version)}>
            Version {__APP_VERSION__} · Build {buildChannel}
          </p>
          <Button
            variant="primary"
            render={<a href={SUPPORT_URL} target="_blank" rel="noreferrer" />}
          >
            <GithubLogoIcon {...stylex.props(styles.githubIcon)} weight="fill" />
            <span>Open GitHub issues</span>
            <ArrowUpRightIcon {...stylex.props(styles.externalIcon)} />
          </Button>
        </div>
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.facts)}>
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
