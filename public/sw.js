// Service worker mínimo: deixa o navegador oferecer a instalação e recebe os
// avisos push. Não guarda nada em cache, para nunca mostrar tela velha.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {}
  e.waitUntil(
    self.registration.showNotification(d.titulo || "Atalaia", {
      body: d.corpo || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
      for (const a of abas) {
        if ("focus" in a) {
          a.navigate(url).catch(() => {});
          return a.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
