import {
  ChatCircleIcon,
  FilesIcon,
  GearIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  MicrophoneStageIcon,
  PlusIcon,
  SidebarIcon,
} from "@phosphor-icons/react";
import { Button } from "@base-ui/react/button";
import { Link, useLocation } from "react-router";
import { cn } from "../lib/cn";
import { useSettingsDialog } from "@/hooks/useSettingDialog";

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
          : "text-zinc-500 hover:bg-white/60 hover:text-zinc-900"
      )}
    >
      <Icon
        weight={isActive ? "fill" : "regular"}
        className={cn(
          "size-4 shrink-0 transition-colors",
          isActive ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"
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
    <div className="mb-6 px-3">
      {title && (
        <div className="mb-2 flex items-center justify-between px-2.5">
          <h3 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase select-none">
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
  const location = useLocation();
  const currentPath = location.pathname;
  const { openSettings, isSettingsOpen } = useSettingsDialog();

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-zinc-200/70 bg-[#f7f2e9]/80 backdrop-blur-xl">
      <div className="flex h-12 flex-none items-center justify-between px-4">
        <div className="flex items-center gap-2 font-semibold text-zinc-900 select-none">
          <div className="flex size-6 items-center justify-center rounded-md bg-zinc-900 text-white shadow-sm">
            <span className="text-xs font-bold leading-none">M</span>
          </div>
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
        <Button className="flex w-full items-center gap-2 rounded-full border border-zinc-200/80 bg-white/80 px-3 py-2 text-sm text-zinc-400 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-zinc-400 outline-none select-none">
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
            icon={FilesIcon}
            label="Files"
            to="/files"
            isActive={currentPath.startsWith("/files")}
          />
        </SidebarSection>

        <SidebarSection
          title="Favorites"
          action={
            <Button
              aria-label="Add favorite"
              className="rounded-sm text-zinc-400 outline-none hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              <PlusIcon className="size-3" />
            </Button>
          }
        >
          <div className="px-2.5 py-8 text-center text-xs text-zinc-400 italic">
            No favorites yet
          </div>
        </SidebarSection>
      </div>

      <div className="flex-none border-t border-zinc-200/50 p-3">
        <Button
          onClick={() => openSettings("general")}
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1",
            isSettingsOpen
              ? "bg-white/80 text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:bg-white/60 hover:text-zinc-900"
          )}
        >
          <GearIcon
            weight={isSettingsOpen ? "fill" : "regular"}
            className={cn(
              "size-4 shrink-0 transition-colors",
              isSettingsOpen
                ? "text-zinc-900"
                : "text-zinc-400 group-hover:text-zinc-600"
            )}
          />
          <span>Settings</span>
        </Button>
      </div>
    </aside>
  );
}
