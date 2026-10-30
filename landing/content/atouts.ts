// Section « Pourquoi choisir notre école » : points forts sans chiffre inventé.
// Les chiffres viennent du catalogue (content/fiches.json) : 32 formations, 6 filières,
// effectif 4 à 12 stagiaires pour la majorité des sessions (20 sur 32).
import type { Lang } from "./i18n";

type Point = { icon: string; title: string; text: string };
type AtoutsContent = {
  badge: string; title: string; subtitle: string;
  highlight: { tag: string; title: string; text: string; bullets: string[]; imageAlt: string };
  points: Point[];
  stats: { value: string; label: string }[];
};

export const atoutsContent: Record<Lang, AtoutsContent> = {
  fr: {
    badge: "Nos points forts",
    title: "Pourquoi choisir notre école",
    subtitle: "Une formation complète et concrète pour devenir agent de sécurité privée ou agent de sécurité incendie opérationnel.",
    highlight: {
      tag: "Pédagogie terrain",
      title: "Apprendre en situation réelle",
      text: "La théorie prend tout son sens sur le terrain : mises en situation, cas concrets et exercices pratiques encadrés par des formateurs du métier.",
      bullets: ["Rondes, contrôle d'accès et gestion des conflits", "Manipulation des moyens de secours et d'extinction", "Gestes de premiers secours et alerte"],
      imageAlt: "Agents en formation de sécurité privée",
    },
    points: [
      { icon: "users", title: "Formateurs du métier", text: "Anciens professionnels de la sécurité privée, sapeurs-pompiers et secouristes : ils transmettent ce qu'ils ont vécu." },
      { icon: "clipboard", title: "Petits groupes", text: "Des sessions à effectif réduit pour que chacun pratique, pose ses questions et soit suivi individuellement." },
      { icon: "handshake", title: "Financement simplifié", text: "CPF, OPCO, France Travail ou entreprise : nous montons le dossier de financement avec vous." },
      { icon: "library", title: "Toutes les filières de la sécurité", text: "Sûreté, incendie (SSIAP), habilitation électrique, secourisme et formations pour les entreprises." },
      { icon: "trend", title: "Accompagnement vers l'emploi", text: "Aide aux démarches CNAPS, préparation aux entretiens et mise en relation avec des employeurs partenaires." },
    ],
    stats: [
      { value: "32", label: "formations au catalogue" },
      { value: "6", label: "filières métier" },
      { value: "4 à 12", label: "stagiaires dans la plupart des sessions" },
    ],
  },
  en: {
    badge: "Our strengths",
    title: "Why choose our school",
    subtitle: "Complete, hands-on training to become an operational private security officer or fire safety officer.",
    highlight: {
      tag: "Hands-on teaching",
      title: "Learning in real situations",
      text: "Theory makes sense in the field: practical scenarios, real cases and supervised exercises led by trainers from the trade.",
      bullets: ["Patrols, access control and conflict management", "Using rescue and fire-fighting equipment", "First-aid procedures and raising the alarm"],
      imageAlt: "Officers in private security training",
    },
    points: [
      { icon: "users", title: "Trainers from the trade", text: "Former private security professionals, firefighters and first-aiders who pass on what they have lived." },
      { icon: "clipboard", title: "Small groups", text: "Small sessions so everyone practises, asks questions and gets individual follow-up." },
      { icon: "handshake", title: "Simplified funding", text: "CPF, OPCO, France Travail or employer: we put the funding file together with you." },
      { icon: "library", title: "Every security field", text: "Security, fire safety (SSIAP), electrical clearance, first aid and courses for companies." },
      { icon: "trend", title: "Support into employment", text: "Help with CNAPS procedures, interview preparation and introductions to partner employers." },
    ],
    stats: [
      { value: "32", label: "courses in the catalogue" },
      { value: "6", label: "career fields" },
      { value: "4 to 12", label: "trainees in most sessions" },
    ],
  },
};
