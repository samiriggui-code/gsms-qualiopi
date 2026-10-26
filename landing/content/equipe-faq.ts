// Textes d'organisation des sections Équipe et FAQ (rôle de chaque équipe, thèmes des questions).
// Les fiches équipe et les questions elles-mêmes restent dans content/school.ts.
import type { Lang } from "./i18n";

type Volet = "direction" | "formateur" | "pedagogique" | "rh";
type EquipeFaq = {
  teams: Record<Volet, { tab: string; role: string }>;
  memberCount: (n: number) => string;
  faqGroups: { title: string; icon: string; ids: string[] }[];
  faqAside: { title: string; text: string; write: string; call: string; register: string };
};

export const equipeFaqContent: Record<Lang, EquipeFaq> = {
  fr: {
    teams: {
      direction: { tab: "Direction", role: "Pilote la stratégie de l'école, la démarche qualité et les relations avec les financeurs et les entreprises." },
      formateur: { tab: "Formateurs", role: "Des professionnels de terrain (sécurité privée, incendie, secourisme) qui transmettent leur expérience du métier." },
      pedagogique: { tab: "Pédagogie", role: "Conçoit les parcours, suit votre progression et coordonne les formateurs tout au long de la session." },
      rh: { tab: "Ressources humaines", role: "Vous accompagne dans vos démarches administratives, votre financement et votre insertion professionnelle." },
    },
    memberCount: n => `${n} ${n > 1 ? "membres" : "membre"}`,
    faqGroups: [
      { title: "Les formations", icon: "book", ids: ["1", "3", "5", "6"] },
      { title: "Qualité et Qualiopi", icon: "shieldCheck", ids: ["13", "9", "10", "11", "12"] },
      { title: "Inscription et financement", icon: "handshake", ids: ["2", "4"] },
      { title: "Après la formation", icon: "trend", ids: ["7", "8"] },
    ],
    faqAside: { title: "Encore une question ?", text: "Notre équipe vous répond et vous aide à choisir le parcours adapté à votre projet.", write: "Nous écrire", call: "Nous appeler", register: "Demander ma préinscription" },
  },
  en: {
    teams: {
      direction: { tab: "Management", role: "Leads the school's strategy, quality approach and relations with funders and employers." },
      formateur: { tab: "Trainers", role: "Field professionals (private security, fire safety, first aid) who pass on their experience of the trade." },
      pedagogique: { tab: "Teaching", role: "Designs the pathways, tracks your progress and coordinates trainers throughout the session." },
      rh: { tab: "Human resources", role: "Supports you with paperwork, funding and getting into work." },
    },
    memberCount: n => `${n} ${n > 1 ? "members" : "member"}`,
    faqGroups: [
      { title: "Courses", icon: "book", ids: ["1", "3", "5", "6"] },
      { title: "Quality and Qualiopi", icon: "shieldCheck", ids: ["13", "9", "10", "11", "12"] },
      { title: "Registration and funding", icon: "handshake", ids: ["2", "4"] },
      { title: "After the course", icon: "trend", ids: ["7", "8"] },
    ],
    faqAside: { title: "Still have a question?", text: "Our team will answer and help you choose the right pathway for your project.", write: "Write to us", call: "Call us", register: "Request pre-registration" },
  },
};
