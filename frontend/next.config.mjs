/** @type {import('next').NextConfig} */
const nextConfig = {
  // Préfixe optionnel si l'app est servie sous un sous-chemin (reverse proxy)
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

  // Sortie autonome pour le déploiement Docker
  output: 'standalone',

  // Badge de dev Next : à droite pour ne pas masquer l'avatar de la sidebar
  devIndicators: { position: 'bottom-right' },
};

export default nextConfig;
