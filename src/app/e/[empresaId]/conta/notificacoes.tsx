"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Botao } from "@/components/ui";
import { cancelarPush, guardarPush } from "./actions";

function chaveParaBytes(base64: string) {
  const preenchida = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(preenchida);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

type Estado = "carregando" | "sem-suporte" | "ios-instalar" | "bloqueado" | "desligado" | "ligado";

export function Notificacoes({ empresaId, chavePublica }: { empresaId: string; chavePublica: string }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const ua = navigator.userAgent;
      const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
      const instalado =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      // no iPhone/iPad só existe push com o app instalado na tela inicial (iOS 16.4+)
      if (ios && !instalado) return setEstado("ios-instalar");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEstado("sem-suporte");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setEstado(sub && Notification.permission === "granted" ? "ligado" : "desligado");
    })();
  }, []);

  async function ligar() {
    setErro("");
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePublica) }));
      const j = sub.toJSON();
      const r = await guardarPush(empresaId, {
        endpoint: sub.endpoint,
        p256dh: j.keys?.p256dh ?? "",
        auth: j.keys?.auth ?? "",
        aparelho: navigator.userAgent.slice(0, 200),
      });
      if (r.erro) setErro(r.erro);
      else setEstado("ligado");
    } catch {
      setErro("Não foi possível ligar as notificações neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await cancelarPush(empresaId, sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando") return <p className="text-sm text-slate-500">Verificando…</p>;
  if (estado === "ios-instalar")
    return (
      <p className="text-sm text-slate-600">
        No iPhone e no iPad as notificações só funcionam com o Atalaia instalado na tela inicial (iOS 16.4 ou mais novo). No Safari, toque em
        Compartilhar, depois em Adicionar à Tela de Início, abra o Atalaia por esse ícone e volte aqui.
      </p>
    );
  if (estado === "sem-suporte")
    return <p className="text-sm text-slate-600">Este navegador não oferece notificações. Tente o Chrome, o Edge ou o Safari atualizado.</p>;
  if (estado === "bloqueado")
    return (
      <p className="text-sm text-slate-600">
        As notificações estão bloqueadas neste navegador. Libere nas configurações do site (ícone de cadeado ao lado do endereço) e volte aqui.
      </p>
    );

  return (
    <div className="space-y-3">
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {estado === "ligado" ? (
        <>
          <p className="flex items-center gap-2 text-sm text-green-600">
            <Bell size={16} /> Ligadas neste aparelho.
          </p>
          <Botao type="button" variante="secundario" onClick={desligar} disabled={ocupado}>
            <BellOff size={16} /> Desligar neste aparelho
          </Botao>
        </>
      ) : (
        <Botao type="button" onClick={ligar} disabled={ocupado}>
          <Bell size={16} /> Ativar notificações neste aparelho
        </Botao>
      )}
    </div>
  );
}
