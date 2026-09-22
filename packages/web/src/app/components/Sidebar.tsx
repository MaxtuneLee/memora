import {
  ChatCircleIcon,
  DesktopIcon,
  FlaskIcon,
  GearIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  MicrophoneStageIcon,
  SidebarIcon,
} from "@phosphor-icons/react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { useAppStore } from "@/livestore/store";
import { Link, useLocation } from "react-router";

import { formatBytes } from "@/lib/format";
import { getDocumentEditorHref, isEditableTextDocument } from "@/lib/editor/editableTextDocument";
import { getFileIcon } from "@/lib/library/fileIcon";
import { useSearchPalette } from "@/hooks/search/useSearchPalette";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { useStorageStats } from "@/hooks/settings/useStorageStats";
import { activeFilesQuery$ } from "@/lib/library/queries";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import type { FileMeta } from "@/types/library";
import { tokens } from "../../styles/stylex.stylex";

const MAX_RECENT_FILES = 4;
const PRIMARY_NAV_HIGHLIGHT_TRANSITION = {
  type: "spring",
  stiffness: 430,
  damping: 36,
  mass: 0.72,
} as const;

const FOCUS_RING = `0 0 0 2px ${tokens.focusRing}`;
const FOCUS_RING_OFFSET = `0 0 0 2px ${tokens.rail}, 0 0 0 4px ${tokens.focusRing}`;

const styles = stylex.create({
  sidebar: {
    backgroundColor: tokens.rail,
    borderRightColor: tokens.border,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: 260,
  },
  header: {
    alignItems: "center",
    display: "flex",
    flex: "none",
    height: 48,
    justifyContent: "space-between",
    paddingInline: 16,
  },
  brand: {
    alignItems: "center",
    color: tokens.textStrong,
    display: "flex",
    fontWeight: 600,
    gap: 8,
    userSelect: "none",
  },
  brandIcon: { borderRadius: 6, height: 24, width: 24 },
  collapseButton: {
    alignItems: "center",
    borderRadius: 6,
    color: tokens.textSoft,
    display: "flex",
    height: 24,
    justifyContent: "center",
    opacity: 0,
    outline: "none",
    transition: "all 150ms",
    width: 24,
    ":hover": { backgroundColor: tokens.hover, color: tokens.text },
    ":focus-visible": { boxShadow: FOCUS_RING },
  },
  icon: { flexShrink: 0, height: 16, width: 16 },
  searchArea: { marginBottom: 16, paddingInline: 12 },
  searchButton: {
    alignItems: "center",
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: 9999,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowSmall,
    color: tokens.textMuted,
    display: "flex",
    fontSize: 14,
    gap: 8,
    outline: "none",
    paddingBlock: 8,
    paddingInline: 12,
    transition: "colors 150ms",
    userSelect: "none",
    width: "100%",
    ":hover": { borderColor: tokens.borderStrong, color: tokens.text },
    ":focus-visible": { boxShadow: FOCUS_RING },
  },
  searchButtonOpen: {
    backgroundColor: tokens.selected,
    borderColor: tokens.oliveSoft,
    color: tokens.text,
  },
  shortcut: {
    borderColor: tokens.border,
    borderRadius: 4,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    fontSize: 10,
    fontWeight: 500,
    marginLeft: "auto",
    minWidth: 20,
    paddingInline: 4,
    textAlign: "center",
  },
  content: { flex: 1, overflowX: "hidden", overflowY: "auto" },
  section: { marginBottom: 20, paddingInline: 12 },
  sectionHeading: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingInline: 10,
  },
  sectionTitle: {
    color: tokens.textMuted,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    userSelect: "none",
  },
  list: { display: "flex", flexDirection: "column", gap: 2 },
  navItem: {
    alignItems: "center",
    borderRadius: 12,
    color: tokens.textMuted,
    display: "flex",
    fontSize: 14,
    fontWeight: 500,
    gap: 10,
    outline: "none",
    paddingBlock: 8,
    paddingInline: 10,
    position: "relative",
    textDecoration: "none",
    transition: "color 150ms, background-color 150ms",
    userSelect: "none",
    ":hover": { backgroundColor: tokens.hoverStrong, color: tokens.textStrong },
    ":focus-visible": { boxShadow: FOCUS_RING_OFFSET },
  },
  navItemActive: { color: tokens.textStrong },
  navHighlight: {
    backgroundColor: tokens.card,
    borderColor: tokens.borderSoft,
    borderRadius: 12,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowSmall,
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  navIcon: {
    color: tokens.textSoft,
    flexShrink: 0,
    height: 16,
    position: "relative",
    width: 16,
    zIndex: 10,
  },
  navIconActive: { color: tokens.textStrong },
  navLabel: {
    overflow: "hidden",
    position: "relative",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    zIndex: 10,
  },
  recentItem: {
    alignItems: "center",
    borderRadius: 12,
    color: tokens.textMuted,
    display: "flex",
    fontSize: 14,
    gap: 12,
    outline: "none",
    paddingBlock: 8,
    paddingInline: 10,
    textDecoration: "none",
    transition: "color 150ms, background-color 150ms",
    ":hover": { backgroundColor: tokens.hoverStrong, color: tokens.textStrong },
    ":focus-visible": { boxShadow: FOCUS_RING_OFFSET },
  },
  recentItemActive: { backgroundColor: tokens.card, color: tokens.textStrong },
  audioIcon: { color: tokens.contentAudio },
  videoIcon: { color: tokens.contentVideo },
  imageIcon: { color: tokens.contentImage },
  neutralIcon: { color: tokens.textSoft },
  fileName: {
    fontSize: 13,
    fontWeight: 500,
    lineHeight: "20px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  emptyFiles: { color: tokens.textMuted, fontSize: 14, paddingBlock: 8, paddingInline: 10 },
  footer: {
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    flex: "none",
    padding: 24,
  },
  storageButton: {
    color: tokens.textMuted,
    outline: "none",
    textAlign: "left",
    transition: "color 150ms",
    width: "100%",
    ":hover": { color: tokens.text },
    ":focus-visible": { boxShadow: FOCUS_RING_OFFSET },
  },
  storageButtonActive: { color: tokens.textStrong },
  storageHeader: {
    alignItems: "center",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
  },
  storageLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  storagePercent: { fontSize: 10, fontWeight: 700 },
  storageTrack: {
    backgroundColor: tokens.border,
    borderRadius: 9999,
    height: 8,
    marginTop: 20,
    overflow: "hidden",
    width: "100%",
  },
  storageFill: {
    backgroundColor: tokens.textSoft,
    borderRadius: 9999,
    height: "100%",
    transition: "width 200ms",
  },
  storageSummary: { color: tokens.textMuted, fontSize: 10, lineHeight: 1, marginTop: 16 },
  settingsButton: {
    alignItems: "center",
    borderRadius: 12,
    color: tokens.textMuted,
    display: "flex",
    fontSize: 14,
    fontWeight: 500,
    gap: 12,
    marginTop: 24,
    outline: "none",
    paddingBlock: 8,
    paddingInline: 12,
    transition: "color 150ms, background-color 150ms",
    width: "100%",
    ":hover": { backgroundColor: tokens.hoverStrong, color: tokens.textStrong },
    ":focus-visible": { boxShadow: FOCUS_RING_OFFSET },
  },
  settingsButtonOpen: { backgroundColor: tokens.card, color: tokens.textStrong },
  settingsIcon: {
    color: tokens.textSoft,
    flexShrink: 0,
    height: 16,
    transition: "color 150ms",
    width: 16,
  },
  settingsIconOpen: { color: tokens.textStrong },
});

interface PrimaryNavItem {
  icon: React.ElementType;
  label: string;
  to: string;
  matches: (pathname: string) => boolean;
}

const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  {
    icon: HouseIcon,
    label: "Home",
    to: "/",
    matches: (pathname) => pathname === "/",
  },
  {
    icon: MicrophoneStageIcon,
    label: "Transcription",
    to: "/transcript",
    matches: (pathname) => pathname.startsWith("/transcript"),
  },
  {
    icon: ChatCircleIcon,
    label: "Chat",
    to: "/chat",
    matches: (pathname) => pathname.startsWith("/chat"),
  },
  {
    icon: DesktopIcon,
    label: "Desktop",
    to: "/desktop",
    matches: (pathname) => pathname.startsWith("/desktop"),
  },
  ...(import.meta.env.DEV
    ? [
        {
          icon: FlaskIcon,
          label: "Playground",
          to: "/playground",
          matches: (pathname: string) => pathname.startsWith("/playground"),
        },
      ]
    : []),
] as const;

export const getFileHref = (file: Pick<FileMeta, "id" | "mimeType" | "name" | "type">): string => {
  if (file.type === "audio" || file.type === "video") {
    return `/transcript/file/${file.id}`;
  }

  if (isEditableTextDocument(file)) {
    return getDocumentEditorHref(file.id);
  }

  return "/desktop";
};

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  to: string;
  isActive: boolean;
  reducedMotion: boolean;
}

function NavItem({ icon: Icon, label, to, isActive, reducedMotion }: NavItemProps) {
  return (
    <Link to={to} {...stylex.props(styles.navItem, isActive && styles.navItemActive)}>
      {isActive ? (
        <motion.div
          layoutId="sidebar-active-item"
          {...stylex.props(styles.navHighlight)}
          transition={reducedMotion ? { duration: 0.12 } : PRIMARY_NAV_HIGHLIGHT_TRANSITION}
        />
      ) : null}

      <Icon
        weight={isActive ? "fill" : "regular"}
        className={stylex.props(styles.navIcon, isActive && styles.navIconActive).className}
      />
      <span {...stylex.props(styles.navLabel)}>{label}</span>
    </Link>
  );
}

interface SidebarSectionProps {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

function SidebarSection({ title, children, action }: SidebarSectionProps) {
  return (
    <div {...stylex.props(styles.section)}>
      {title && (
        <div {...stylex.props(styles.sectionHeading)}>
          <h3 {...stylex.props(styles.sectionTitle)}>{title}</h3>
          {action}
        </div>
      )}
      <div {...stylex.props(styles.list)}>{children}</div>
    </div>
  );
}

export function Sidebar() {
  const store = useAppStore();
  const location = useLocation();
  const reducedMotion = useReducedMotion() ?? false;
  const currentPath = location.pathname;
  const fileRows = store.useQuery(activeFilesQuery$);
  const { openSettings, isSettingsOpen, activeSection } = useSettingsDialog();
  const { openSearch, isSearchOpen } = useSearchPalette();
  const { storageQuota, storageUsage } = useStorageStats();

  const recentFiles = useMemo(() => {
    return fileRows
      .map(mapLiveStoreFileToMeta)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_RECENT_FILES);
  }, [fileRows]);

  const storageSummary = useMemo(() => {
    if (!storageQuota) {
      return "Storage usage not available";
    }

    return `${formatBytes(storageUsage)} of ${formatBytes(storageQuota)} used`;
  }, [storageQuota, storageUsage]);

  const storageUsagePercent = useMemo(() => {
    if (!storageQuota || storageUsage <= 0) {
      return 0;
    }

    return Math.min(100, (storageUsage / storageQuota) * 100);
  }, [storageQuota, storageUsage]);

  const isStorageActive = isSettingsOpen && activeSection === "data-storage";

  return (
    <aside {...stylex.props(styles.sidebar)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.brand)}>
          <img src="/memora-icon.svg" alt="Memora" {...stylex.props(styles.brandIcon)} />
          <span>Memora</span>
        </div>
        <Button
          aria-label="Toggle sidebar"
          className={stylex.props(styles.collapseButton).className}
        >
          <SidebarIcon className={stylex.props(styles.icon).className} />
        </Button>
      </div>

      <div {...stylex.props(styles.searchArea)}>
        <Button
          aria-label="Open global search"
          aria-expanded={isSearchOpen}
          aria-haspopup="dialog"
          onClick={(event) => openSearch(event.currentTarget)}
          className={
            stylex.props(styles.searchButton, isSearchOpen && styles.searchButtonOpen).className
          }
        >
          <MagnifyingGlassIcon className={stylex.props(styles.icon).className} />
          <span>Search...</span>
          <kbd {...stylex.props(styles.shortcut)}>⌘K</kbd>
        </Button>
      </div>

      <div {...stylex.props(styles.content)}>
        <SidebarSection>
          <LayoutGroup id="sidebar-primary-navigation">
            <div {...stylex.props(styles.list)}>
              {PRIMARY_NAV_ITEMS.map((item) => (
                <NavItem
                  key={item.to}
                  icon={item.icon}
                  label={item.label}
                  to={item.to}
                  isActive={item.matches(currentPath)}
                  reducedMotion={reducedMotion}
                />
              ))}
            </div>
          </LayoutGroup>
        </SidebarSection>

        <SidebarSection title="Recent Files">
          {recentFiles.length > 0 ? (
            <div {...stylex.props(styles.list)}>
              {recentFiles.map((file) => {
                const href = getFileHref(file);
                const Icon = getFileIcon(file);
                const isActive = currentPath === href;

                return (
                  <Link
                    key={file.id}
                    to={href}
                    {...stylex.props(styles.recentItem, isActive && styles.recentItemActive)}
                  >
                    <Icon
                      weight="fill"
                      className={
                        stylex.props(
                          styles.icon,
                          file.type === "audio"
                            ? styles.audioIcon
                            : file.type === "video"
                              ? styles.videoIcon
                              : file.type === "image"
                                ? styles.imageIcon
                                : styles.neutralIcon,
                        ).className
                      }
                    />
                    <span {...stylex.props(styles.fileName)}>{file.name}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div {...stylex.props(styles.emptyFiles)}>Recent files will show up here.</div>
          )}
        </SidebarSection>
      </div>

      <div {...stylex.props(styles.footer)}>
        <button
          type="button"
          onClick={() => openSettings("data-storage")}
          {...stylex.props(styles.storageButton, isStorageActive && styles.storageButtonActive)}
        >
          <div {...stylex.props(styles.storageHeader)}>
            <span {...stylex.props(styles.storageLabel)}>Storage</span>
            <span {...stylex.props(styles.storagePercent)}>{Math.round(storageUsagePercent)}%</span>
          </div>

          <div {...stylex.props(styles.storageTrack)}>
            <div
              {...stylex.props(styles.storageFill)}
              style={{ width: `${storageUsagePercent}%` }}
            />
          </div>

          <p {...stylex.props(styles.storageSummary)}>{storageSummary}</p>
        </button>

        <Button
          onClick={() => openSettings("general")}
          className={
            stylex.props(styles.settingsButton, isSettingsOpen && styles.settingsButtonOpen)
              .className
          }
        >
          <GearIcon
            weight={isSettingsOpen ? "fill" : "regular"}
            className={
              stylex.props(styles.settingsIcon, isSettingsOpen && styles.settingsIconOpen).className
            }
          />
          <span>Settings</span>
        </Button>
      </div>
    </aside>
  );
}
