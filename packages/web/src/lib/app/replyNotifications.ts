const isSupported = (): boolean => typeof Notification !== "undefined" && "serviceWorker" in navigator;

// Asks for permission the first time the user sends a message. Call it from the send click or key
// press, before any await, so browsers that require a user gesture accept the prompt.
export const requestReplyNotificationPermission = (): void => {
  if (!isSupported() || Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => undefined);
};

const isAppFocused = (): boolean => document.visibilityState === "visible" && document.hasFocus();

// Shows a system notification through the service worker when the user is not looking at the app.
export const notifyReplyReady = async (sessionId: string, title: string): Promise<void> => {
  if (!isSupported() || Notification.permission !== "granted" || isAppFocused()) return;
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
