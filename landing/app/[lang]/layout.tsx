import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { isLang, languages } from "../../content/i18n";

// Layout racine de chaque langue : la langue du document est écrite par le serveur.
export const metadata: Metadata = { icons: { icon: [{ url: "/favicon.ico" }, { url: "/brand/gsms-icon.png", type: "image/png" }], apple: "/brand/gsms-icon.png" } };

export function generateStaticParams() {
  return languages.map(lang => ({ lang }));
}

export default async function LangLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ lang: string }> }>) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <html lang={lang} className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {/* Thème clair/sombre : fichier externe chargé en async (aucun script inline). */}
        <script async src="/theme-init.js" />
        {children}
      </body>
    </html>
  );
}
