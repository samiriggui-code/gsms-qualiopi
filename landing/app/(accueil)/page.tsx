"use client";

import { useEffect } from "react";
import { defaultLang } from "../../content/i18n";

// Le site est exporté en statique : la racine renvoie toujours vers le français.
// L'anglais ne s'obtient que par le sélecteur de langue, jamais d'après le navigateur.
export default function RootRedirect() {
  useEffect(() => {
    window.location.replace(`/${defaultLang}/${window.location.hash}`);
  }, []);
  return <main style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
    <p><a href="/fr/">Français</a> · <a href="/en/">English</a></p>
  </main>;
}
