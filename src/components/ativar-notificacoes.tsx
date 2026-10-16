"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { removerInscricaoPush, salvarInscricaoPush } from "@/app/push-actions";

const CHAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function chaveEmBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function AtivarNotificacoes() {
  const [estado, setEstado] = useState<"indisponivel" | "desligada" | "ligada" | "bloqueada">("indisponivel");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!CHAVE || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return setEstado("bloqueada");
    navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setEstado(s ? "ligada" : "desligada"))
      .catch(() => {});
  }, []);

  if (estado === "indisponivel") return null;

  async function alternar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const atual = await reg.pushManager.getSubscription();
      if (atual) {
        await removerInscricaoPush(atual.endpoint);
        await atual.unsubscribe();
        setEstado("desligada");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") return setEstado("bloqueada");
      const s = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveEmBytes(CHAVE!),
      });
      const j = s.toJSON();
      const r = await salvarInscricaoPush({ endpoint: s.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth });
      if (!r.ok) await s.unsubscribe();
      else setEstado("ligada");
    } finally {
      setOcupado(false);
    }
  }

  const bloqueada = estado === "bloqueada";
  const Icone = estado === "ligada" ? Bell : BellOff;
  return (
    <button
      type="button"
      onClick={alternar}
      disabled={ocupado || bloqueada}
      title={bloqueada ? "Notificações bloqueadas nas configurações do navegador" : undefined}
      className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
    >
      <Icone className="h-4 w-4 shrink-0" aria-hidden />
      {bloqueada ? "Notificações bloqueadas" : estado === "ligada" ? "Notificações ligadas" : "Ativar notificações"}
    </button>
  );
}
