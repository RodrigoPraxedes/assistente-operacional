import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atalaia",
  description: "Atalaia · Veja antes, aja a tempo",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#15171b" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // tema escolhido no menu (claro/escuro); sem cookie segue o sistema.
  // A central pública do QR sempre segue o sistema (marcada no middleware).
  const sistema = (await headers()).get("x-tema-sistema") === "1";
  const tema = sistema ? undefined : (await cookies()).get("tema")?.value;
  return (
    <html lang="pt-BR" data-tema={tema === "claro" || tema === "escuro" ? tema : undefined}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
