// Service worker mínimo: só existe para o navegador oferecer a instalação.
// Não guarda nada em cache, para nunca mostrar tela velha.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
