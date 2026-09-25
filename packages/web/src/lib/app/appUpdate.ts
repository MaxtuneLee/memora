// AppUpdateDialog listens for this to reopen after the user chose "Later" on a waiting update.
export const SHOW_APP_UPDATE_EVENT = "memora:show-app-update";

export type AppUpdateCheckResult = "ready" | "downloading" | "latest" | "unavailable" | "failed";

// Asks the browser to fetch the service worker script now instead of waiting for the next
// navigation or the hourly check. A found update then flows through AppUpdateDialog as usual.
export const checkForAppUpdate = async (): Promise<AppUpdateCheckResult> => {
  if (!("serviceWorker" in navigator)) return "unavailable";
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return "unavailable";
    await registration.update();
    if (registration.waiting) {
      window.dispatchEvent(new Event(SHOW_APP_UPDATE_EVENT));
      return "ready";
    }
    return registration.installing ? "downloading" : "latest";
  } catch {
    return "failed";
  }
};
