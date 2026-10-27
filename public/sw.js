// Service worker: deixa o navegador oferecer a instalação e recebe as
// notificações push. Não guarda nada em cache, para nunca mostrar tela velha.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { titulo: "Atalaia", corpo: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(dados.titulo || "Atalaia", {
      body: dados.corpo || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: dados.tag || undefined,
      data: { url: dados.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if ("focus" in j && j.url.startsWith(self.location.origin)) {
          return j.navigate(alvo).then((c) => (c || j).focus());
        }
      }
      return self.clients.openWindow(alvo);
    }),
  );
});
