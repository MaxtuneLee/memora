// Imported by the generated service worker (see workbox.importScripts in vite.config.ts).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path;
  const target = new URL(typeof path === "string" ? path : "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => "focus" in client);
      if (existing) {
        const focused = await existing.focus();
        if ("navigate" in focused) await focused.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
