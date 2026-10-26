// Langues de la vitrine et textes d'interface propres à cette landing.
// Les contenus des sections (repris de gsms-school-aps) sont dans content/school.ts.
import { schoolContent, type SchoolContent } from "./school";

export const languages = ["fr", "en"] as const;
export type Lang = (typeof languages)[number];
export const defaultLang: Lang = "fr";
export const isLang = (value: string): value is Lang => (languages as readonly string[]).includes(value);

// Le bouton Connexion mène au back-office.
export const appLoginUrl = "/app/";

export const contactEmail = "contact@exemple.fr";
export const phoneHref = "tel:+33100000000";
export const heroVideoUrl = "https://www.youtube-nocookie.com/embed/VIbMn0QHBlw?autoplay=1";

export type Dictionary = SchoolContent & {
  meta: { title: string; description: string };
  ui: {
    skipToContent: string; home: string; toLight: string; toDark: string; language: string; footerNav: string;
    closeNav: string; playVideo: string; closeVideo: string; videoTitle: string; previousStep: string; socialPending: string;
  };
};

export const dictionaries: Record<Lang, Dictionary> = {
  fr: {
    ...schoolContent.fr,
    meta: {
      title: "GSMS — Centre de formation sécurité",
      description: "Centre de formation professionnelle en sécurité privée, incendie (SSIAP) et secourisme (SST). Parcours certifiants, mises en situation réelles et accompagnement jusqu'à l'emploi.",
    },
    ui: {
      skipToContent: "Aller au contenu", home: "Accueil", toLight: "Mode clair", toDark: "Mode sombre", language: "Langue",
      footerNav: "Navigation du pied de page", closeNav: "Fermer le menu", playVideo: "Lire la vidéo de présentation",
      closeVideo: "Fermer la vidéo", videoTitle: "Vidéo de présentation", previousStep: "Étape", socialPending: "Lien à compléter",
    },
  },
  en: {
    ...schoolContent.en,
    meta: {
      title: "GSMS — Security training centre",
      description: "A professional training centre for private security, fire safety (SSIAP) and first aid (SST). Certified pathways, realistic practical scenarios and support through to employment.",
    },
    ui: {
      skipToContent: "Skip to content", home: "Home", toLight: "Light mode", toDark: "Dark mode", language: "Language",
      footerNav: "Footer navigation", closeNav: "Close menu", playVideo: "Play the presentation video",
      closeVideo: "Close the video", videoTitle: "Presentation video", previousStep: "Step", socialPending: "Link to be added",
    },
  },
};
