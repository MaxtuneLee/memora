import { useContext, createContext } from "react";
import type { SettingsSectionId } from "@/types/settings";

interface SettingsDialogContextValue {
  isSettingsOpen: boolean;
  activeSection: SettingsSectionId;
  setActiveSection: (section: SettingsSectionId) => void;
  openSettings: (section: SettingsSectionId) => void;
  setIsSettingsOpen: (open: boolean) => void;
}

const SettingsDialogContext = createContext<SettingsDialogContextValue | null>(
  null,
);

export const useSettingsDialog = () => {
  const context = useContext(SettingsDialogContext);
  if (!context) {
    throw new Error("useSettingsDialog must be used within AppLayout.");
  }
  return context;
};

export const SettingsDialogContextProvider = SettingsDialogContext.Provider;
