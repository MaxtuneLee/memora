import {
  ChatCircleIcon,
  DesktopIcon,
  FileAudioIcon,
  FileTextIcon,
  ImageIcon,
  GearIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  MicrophoneStageIcon,
  SidebarIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { Button } from "@base-ui/react/button";
import { useStore } from "@livestore/react";
import { Link, useLocation } from "react-router";

import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { useSearchPalette } from "@/hooks/search/useSearchPalette";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { useStorageStats } from "@/hooks/settings/useStorageStats";
import { activeFilesQuery$ } from "@/lib/library/queries";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";

const MAX_RECENT_FILES = 4;

const getRecentFileHref = (fileId: string, fileType: string): string => {
  if (fileType === "audio" || fileType === "video") {
    return `/transcript/file/${fileId}`;
  }

  return "/files";
};

const getRecentFileIcon = (fileType: string): React.ElementType => {
  switch (fileType) {
    case "audio":
      return FileAudioIcon;
    case "video":
      return VideoCameraIcon;
    case "image":
      return ImageIcon;
    default:
      return FileTextIcon;
  }
};

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  to: string;
  isActive?: boolean;
}

function NavItem({ icon: Icon, label, to, isActive }: NavItemProps) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 select-none",
        isActive
          ? "bg-white/80 text-zinc-900 shadow-sm"
          : "text-zinc-500 hover:bg-white/60 hover:text-zinc-900",
      )}
    >
      <Icon
        weight={isActive ? "fill" : "regular"}
        className={cn(
          "size-4 shrink-0 transition-colors",
          isActive
            ? "text-zinc-900"
            : "text-zinc-400 group-hover:text-zinc-600",
        )}
      />
      <span className="truncate">{label}</span>
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
    <div className="mb-5 px-3">
      {title && (
        <div className="mb-2 flex items-center justify-between px-2.5">
          <h3 className="text-[10px] font-bold tracking-[0.18em] text-zinc-400 uppercase select-none">
            {title}
          </h3>
          {action}
        </div>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function Sidebar() {
  const { store } = useStore();
  const location = useLocation();
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
    <aside className="flex h-full w-[260px] flex-col border-r border-zinc-200/70 bg-[#f7f2e9]/80 backdrop-blur-xl">
      <div className="flex h-12 flex-none items-center justify-between px-4">
        <div className="flex items-center gap-2 font-semibold text-zinc-900 select-none">
          <img
            src="/memora-icon.svg"
            alt="Memora"
            className="size-6 rounded-md"
          />
          <span>Memora</span>
        </div>
        <Button
          aria-label="Toggle sidebar"
          className="flex size-6 items-center justify-center rounded-md text-zinc-400 opacity-0 transition-all hover:bg-white/70 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400 outline-none"
        >
          <SidebarIcon className="size-4" />
        </Button>
      </div>

      <div className="mb-4 px-3">
        <Button
          aria-label="Open global search"
          aria-expanded={isSearchOpen}
          aria-haspopup="dialog"
          onClick={(event) => openSearch(event.currentTarget)}
          className={cn(
            "flex w-full items-center gap-2 rounded-full border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-zinc-400 outline-none select-none",
            isSearchOpen
              ? "border-[#aebe79] bg-[#f8f3df] text-[#55672e]"
              : "border-zinc-200/80 bg-white/80 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600",
          )}
        >
          <MagnifyingGlassIcon className="size-4" />
          <span>Search...</span>
          <kbd className="ml-auto min-w-[20px] rounded border border-zinc-200 px-1 text-[10px] font-medium text-zinc-300 text-center">
            ⌘K
          </kbd>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <SidebarSection>
          <NavItem
            icon={HouseIcon}
            label="Home"
            to="/"
            isActive={currentPath === "/"}
          />
          <NavItem
            icon={MicrophoneStageIcon}
            label="Transcription"
            to="/transcript"
            isActive={currentPath.startsWith("/transcript")}
          />
          <NavItem
            icon={ChatCircleIcon}
            label="Chat"
            to="/chat"
            isActive={currentPath.startsWith("/chat")}
          />
          <NavItem
            icon={DesktopIcon}
            label="Desktop"
            to="/desktop"
            isActive={currentPath.startsWith("/desktop")}
          />
        </SidebarSection>

        <SidebarSection
          title="Recent Files"
        >
          {recentFiles.length > 0 ? (
            <div className="space-y-0.5">
              {recentFiles.map((file) => {
                const href = getRecentFileHref(file.id, file.type);
                const Icon = getRecentFileIcon(file.type);
                const isActive =
                  href === "/files"
                    ? currentPath.startsWith("/files")
                    : currentPath === href;

                return (
                  <Link
                    key={file.id}
                    to={href}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1",
                      isActive
                        ? "bg-white/55 text-zinc-900"
                        : "text-zinc-500 hover:bg-white/35 hover:text-zinc-900",
                    )}
                  >
                    <Icon
                      weight="fill"
                      className={cn(
                        "size-4 shrink-0",
                        file.type === "audio"
                          ? "text-[#8cbf67]"
                          : file.type === "video"
                            ? "text-[#6d8fd4]"
                            : file.type === "image"
                              ? "text-[#d0a267]"
                              : "text-zinc-400",
                      )}
                    />
                    <span className="truncate text-[13px] leading-5 font-medium">
                      {file.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-2.5 py-2 text-sm text-zinc-400">
              Recent files will show up here.
            </div>
          )}
        </SidebarSection>
      </div>

      <div className="flex-none border-t border-zinc-200/60 px-6 py-6">
        <button
          type="button"
          onClick={() => openSettings("data-storage")}
          className={cn(
            "w-full text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1",
            isStorageActive
              ? "text-zinc-900"
              : "text-zinc-500 hover:text-zinc-700",
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase">
              Storage
            </span>
            <span className="text-[10px] font-bold">
              {Math.round(storageUsagePercent)}%
            </span>
          </div>

          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-[#ece7dc]">
            <div
              className="h-full rounded-full bg-[#b9b3aa] transition-[width] duration-200"
              style={{ width: `${storageUsagePercent}%` }}
            />
          </div>

          <p className="mt-4 text-[10px] leading-none text-zinc-400">
            {storageSummary}
          </p>
        </button>

        <Button
          onClick={() => openSettings("general")}
          className={cn(
            "group mt-6 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1",
            isSettingsOpen
              ? "bg-white/50 text-zinc-900"
              : "text-zinc-500 hover:bg-white/35 hover:text-zinc-900",
          )}
        >
          <GearIcon
            weight={isSettingsOpen ? "fill" : "regular"}
            className={cn(
              "size-4 shrink-0 transition-colors",
              isSettingsOpen
                ? "text-zinc-900"
                : "text-zinc-400 group-hover:text-zinc-600",
            )}
          />
          <span>Settings</span>
        </Button>
      </div>
    </aside>
  );
}
