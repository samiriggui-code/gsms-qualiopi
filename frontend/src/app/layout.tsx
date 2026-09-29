import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/app/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s · Espace formation", default: "Espace formation" },
  description: "Sessions, parcours des stagiaires, émargement et préparation Qualiopi.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
