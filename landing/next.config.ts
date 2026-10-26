import type { NextConfig } from "next";
import { resolve } from "node:path";

// La landing est servie à la racine (/) ; l'interface WeKnora (Vue) vit sous /app/.
// En production, la landing est exportée en statique et Caddy sert les deux (deploy/Caddyfile).
// En développement, le serveur Vite de l'interface est l'entrée unique et relaie
// vers cette landing tout ce qui n'est pas /app (voir frontend/vite.config.ts).
const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  ...(isDev ? {} : { output: "export" as const }),
  // Racine du dépôt : la landing importe theme/tokens.css (dossier partagé).
  turbopack: { root: resolve(__dirname, "..") },
  // Ouverture depuis le téléphone, la tablette ou le portable (réseau local et Tailscale) :
  // sans ça, Next refuse le rechargement à chaud venant d'une autre adresse que localhost.
  allowedDevOrigins: ["192.168.1.188", "100.64.0.3", "*.local"],
  // Next 16.4 écrit sinon un AGENTS.md dans landing/ à chaque « next dev » (fichier hors dépôt).
  agentRules: false,
  // Mises à jour de Next.js limitées aux correctifs de sécurité (next upgrade --agent=security).
  experimental: { agentUpgrade: "security" },
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
