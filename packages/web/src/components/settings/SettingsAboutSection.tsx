import {
  ArrowClockwiseIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  GithubLogoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";

import { useAppStore } from "@/livestore/store";
import { settingEvents } from "@/livestore/setting";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { downloadAppLog } from "@/lib/appLog/appLogCollector";
import { checkForAppUpdate, type AppUpdateCheckResult } from "@/lib/app/appUpdate";
import { Switch } from "@/components/ui/Switch";

import {
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { hasWebAssembly, hasWebGpu } from "@/lib/device/browserSupport";
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
  actions: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12 },
  updateStatus: { color: tokens.textMuted, fontSize: "0.8125rem" },
  externalIcon: { height: 14, width: 14 },
  checks: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12 },
  checkRow: { alignItems: "flex-start", display: "flex", gap: 16, justifyContent: "space-between" },
  status: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: "0.8125rem",
    fontWeight: 500,
    gap: 6,
  },
  statusSupported: { color: tokens.successText },
  statusMissing: { color: tokens.warningText },
  statusPending: { color: tokens.textSoft },
  statusIcon: { height: 16, width: 16 },
  toggleRow: { alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" },
});

const APP_DESCRIPTION = "Local-first agent lives in your browser.";
const SUPPORT_URL = "https://github.com/maxtunelee/memora/issues/new";

const formatBuildChannel = (channel: string): string => {
  return channel
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const UPDATE_STATUS_TEXT: Record<AppUpdateCheckResult, string> = {
  ready: "A new version is ready.",
  downloading: "Downloading the new version. You'll be asked to reload when it's ready.",
  latest: "You're on the latest version.",
  unavailable: "Updates aren't available in this build.",
  failed: "Couldn't check for updates. Check your connection and try again.",
};

type CheckStatus = "checking" | "supported" | "missing";

function BrowserCheckRow({
  label,
  description,
  status,
}: {
  label: string;
  description: string;
  status: CheckStatus;
}) {
  return (
    <div className={cn(SETTINGS_ROW_CLASS_NAME, stylex.props(styles.checkRow).className)}>
      <div>
        <h4 {...stylex.props(styles.title)}>{label}</h4>
        <p
          className={cn(
            SETTINGS_SECTION_BODY_CLASS_NAME,
            stylex.props(styles.bodyMargin).className,
          )}
        >
          {description}
        </p>
      </div>
      <span
        {...stylex.props(
          styles.status,
          status === "supported"
            ? styles.statusSupported
            : status === "missing"
              ? styles.statusMissing
              : styles.statusPending,
        )}
      >
        {status === "supported" ? (
          <CheckCircleIcon {...stylex.props(styles.statusIcon)} weight="fill" />
        ) : status === "missing" ? (
          <WarningCircleIcon {...stylex.props(styles.statusIcon)} weight="fill" />
        ) : null}
        {status === "supported"
          ? "Supported"
          : status === "missing"
            ? "Not available"
            : "Checking…"}
      </span>
    </div>
  );
}

function BrowserSupportSection() {
  const [webGpu, setWebGpu] = useState<CheckStatus>("checking");
  const webAssembly: CheckStatus = hasWebAssembly() ? "supported" : "missing";

  useEffect(() => {
    let cancelled = false;
    void hasWebGpu().then((supported) => {
      if (!cancelled) setWebGpu(supported ? "supported" : "missing");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={SETTINGS_PANEL_CLASS_NAME}>
      <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Browser support</h3>
      <div {...stylex.props(styles.checks)}>
        <BrowserCheckRow
          label="WebGPU"
          description="Runs transcription and local models on your graphics card. Without it, features that need local models are unavailable."
          status={webGpu}
        />
        <BrowserCheckRow
          label="WebAssembly"
          description="Required to run Memora."
          status={webAssembly}
        />
      </div>
    </section>
  );
}

function LogCollectionSection() {
  const store = useAppStore();
  const settings = store.useQuery(settingsDocumentQuery$);
  const enabled = settings.logCollectionEnabled ?? false;

  return (
    <section className={SETTINGS_PANEL_CLASS_NAME}>
      <div className={cn(SETTINGS_ROW_CLASS_NAME, stylex.props(styles.toggleRow).className)}>
        <div>
          <h3 {...stylex.props(styles.title)}>Collect debug logs</h3>
          <p
            className={cn(
              SETTINGS_SECTION_BODY_CLASS_NAME,
              stylex.props(styles.bodyMargin).className,
            )}
          >
            Collect logs in background so that you can attach them in bug reports.
          </p>
        </div>
        <Switch
          checked={enabled}
          aria-label="Collect debug logs"
          onCheckedChange={(checked) =>
            store.commit(settingEvents.settingsSet({ logCollectionEnabled: checked }))
          }
        />
      </div>
    </section>
  );
}

export default function SettingsAboutSection() {
  const store = useAppStore();
  const buildChannel = formatBuildChannel(import.meta.env.MODE);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<AppUpdateCheckResult | null>(null);

  const handleCheckForUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateResult(null);
    setUpdateResult(await checkForAppUpdate());
    setIsCheckingUpdate(false);
  };

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
          <div {...stylex.props(styles.actions)}>
            <Button
              variant="primary"
              render={
                <a
                  href={SUPPORT_URL}
                  target="_blank"
                  rel="noreferrer"
                  // The link opens natively; the log download runs alongside it.
                  onClick={() => void downloadAppLog(store).catch(() => false)}
                />
              }
            >
              <GithubLogoIcon {...stylex.props(styles.githubIcon)} weight="fill" />
              <span>Report an issue</span>
              <ArrowUpRightIcon {...stylex.props(styles.externalIcon)} />
            </Button>
            <Button onClick={() => void handleCheckForUpdate()} disabled={isCheckingUpdate}>
              <ArrowClockwiseIcon {...stylex.props(styles.githubIcon)} />
              <span>{isCheckingUpdate ? "Checking…" : "Check for updates"}</span>
            </Button>
          </div>
          {updateResult && (
            <p role="status" {...stylex.props(styles.updateStatus)}>
              {UPDATE_STATUS_TEXT[updateResult]}
            </p>
          )}
        </div>
      </section>

      <BrowserSupportSection />
      <LogCollectionSection />
    </div>
  );
}
