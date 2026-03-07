import { Outlet } from "react-router";
import { Toast } from "@base-ui/react/toast";
import { useCallback, useMemo, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import SettingsDialog, {
  type SettingsSectionId,
} from "../components/SettingsDialog";
import { SettingsDialogContextProvider } from "@/hooks/useSettingDialog";

export default function AppLayout() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("general");

  const openSettings = useCallback((section: SettingsSectionId) => {
    setActiveSection(section);
    setIsSettingsOpen(true);
  }, []);

  const settingsValue = useMemo(
    () => ({
      isSettingsOpen,
      activeSection,
      setActiveSection,
      openSettings,
      setIsSettingsOpen,
    }),
    [activeSection, isSettingsOpen, openSettings]
  );

  return (
    <Toast.Provider limit={3}>
      <SettingsDialogContextProvider value={settingsValue}>
        <div className="flex h-dvh w-full overflow-hidden bg-[#fffbf2] text-zinc-950 font-sans selection:bg-[#879a4f] selection:text-zinc-950">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-200">
              <Outlet />
            </div>
          </main>
        </div>
        <SettingsDialog
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
      </SettingsDialogContextProvider>
    </Toast.Provider>
  );
}
