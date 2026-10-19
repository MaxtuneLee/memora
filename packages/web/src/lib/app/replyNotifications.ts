const STORAGE_KEY = "memora.reply-notifications.enabled.v1";

export type ReplyNotificationPermission = NotificationPermission | "unsupported";

export const getReplyNotificationPermission = (): ReplyNotificationPermission =>
  typeof Notification === "undefined" || !("serviceWorker" in navigator)
    ? "unsupported"
    : Notification.permission;

// On unless the user turned it off in settings.
export const readReplyNotificationsEnabled = (): boolean => {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
};

export const writeReplyNotificationsEnabled = (enabled: boolean): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Storage can be blocked; the setting then lasts until the next reload.
  }
};

// Asks for permission the first time the user sends a message. Call it from the send click or key
// press, before any await, so browsers that require a user gesture accept the prompt.
export const requestReplyNotificationPermission = (): void => {
  if (getReplyNotificationPermission() !== "default" || !readReplyNotificationsEnabled()) return;
  void Notification.requestPermission().catch(() => undefined);
};

// Turns notifications on from settings, asking for permission if needed. Returns whether they are on.
export const enableReplyNotifications = async (): Promise<boolean> => {
  if (getReplyNotificationPermission() === "unsupported") return false;
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  const granted = permission === "granted";
  writeReplyNotificationsEnabled(granted);
  return granted;
};

const isAppFocused = (): boolean => document.visibilityState === "visible" && document.hasFocus();

// Shows a system notification through the service worker when the user is not looking at the app.
export const notifyReplyReady = async (sessionId: string, title: string): Promise<void> => {
  if (getReplyNotificationPermission() !== "granted" || !readReplyNotificationsEnabled()) return;
  if (isAppFocused()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    await registration.showNotification("Reply ready", {
      body: title,
      icon: "/pwa-192x192.png",
      tag: `reply-${sessionId}`,
      data: { path: `/chat?session=${encodeURIComponent(sessionId)}` },
    });
  } catch {
    // Notifications are best effort; the in-app toast still shows.
  }
};
