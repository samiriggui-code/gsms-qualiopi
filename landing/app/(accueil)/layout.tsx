import type { Metadata } from "next";
import "../globals.css";
import { dictionaries, defaultLang } from "../../content/i18n";

// Layout racine de la page « / », qui redirige vers /fr/.
export const metadata: Metadata = {
  title: dictionaries[defaultLang].meta.title,
  description: dictionaries[defaultLang].meta.description,
  icons: { icon: [{ url: "/favicon.ico" }, { url: "/brand/gsms-icon.png", type: "image/png" }], apple: "/brand/gsms-icon.png" },
};

export default function RedirectLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang={defaultLang}><body>{children}</body></html>;
}
