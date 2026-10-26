// Section « Comment ça fonctionne » : le parcours du stagiaire, tel que GSMS Qualiopi le suit
// (analyse du besoin, positionnement, convention, convocation, émargement, évaluations,
// attestation, satisfaction à chaud et à froid — voir backend/app/journey).
import type { Lang } from "./i18n";

type Step = { icon: string; title: string; text: string; deliverable: string };
type Phase = { label: string; title: string; steps: Step[] };
type ParcoursContent = { badge: string; title: string; subtitle: string; phases: Phase[]; footnote: string; cta: string };

export const parcoursContent: Record<Lang, ParcoursContent> = {
  fr: {
    badge: "Parcours de formation",
    title: "Comment ça fonctionne",
    subtitle: "De la préinscription à l'emploi, un parcours clair en trois temps. À chaque étape, vous savez où vous en êtes et ce que vous recevez.",
    phases: [
      {
        label: "Avant", title: "Préparer votre entrée",
        steps: [
          { icon: "clipboard", title: "Préinscription et analyse du besoin", text: "Vous déposez votre candidature en ligne, puis un questionnaire nous permet de comprendre votre projet et vos contraintes.", deliverable: "Questionnaire en ligne" },
          { icon: "handshake", title: "Positionnement et financement", text: "Un positionnement situe vos acquis ; nous montons avec vous le financement : CPF, OPCO, France Travail ou entreprise.", deliverable: "Dossier de financement" },
          { icon: "mail", title: "Convention et convocation", text: "Vous signez votre convention, puis recevez votre convocation : dates, horaires, lieu et conditions d'accessibilité.", deliverable: "Convocation détaillée" },
        ],
      },
      {
        label: "Pendant", title: "Vous former",
        steps: [
          { icon: "book", title: "Cours et mises en situation", text: "Théorie en petits groupes et pratique sur le terrain, avec des formateurs du métier. Vous émargez à chaque demi-journée.", deliverable: "Émargement par QR code" },
          { icon: "shieldCheck", title: "Évaluations", text: "Évaluations régulières pour mesurer vos progrès, puis préparation ciblée aux épreuves de certification.", deliverable: "Résultats suivis" },
        ],
      },
      {
        label: "Après", title: "Valider et avancer",
        steps: [
          { icon: "badge", title: "Certification et attestation", text: "Vous passez l'examen ; votre attestation de fin reprend la durée suivie et vos résultats.", deliverable: "Attestation de fin" },
          { icon: "trend", title: "Suivi et insertion", text: "Vos retours à chaud puis à froid nous aident à progresser ; nous vous orientons vers les employeurs partenaires.", deliverable: "Accompagnement emploi" },
        ],
      },
    ],
    footnote: "Chaque étape est suivie par notre moteur qualité GSMS Qualiopi : rien ne se perd entre deux interlocuteurs.",
    cta: "Commencer ma préinscription",
  },
  en: {
    badge: "Training pathway",
    title: "How it works",
    subtitle: "From pre-registration to employment, a clear pathway in three stages. At every step you know where you stand and what you receive.",
    phases: [
      {
        label: "Before", title: "Getting started",
        steps: [
          { icon: "clipboard", title: "Pre-registration and needs analysis", text: "You apply online, then a short questionnaire helps us understand your project and constraints.", deliverable: "Online questionnaire" },
          { icon: "handshake", title: "Placement and funding", text: "A placement test assesses your current skills; we set up funding with you: CPF, OPCO, France Travail or employer.", deliverable: "Funding file" },
          { icon: "mail", title: "Agreement and joining instructions", text: "You sign your training agreement, then receive your joining instructions: dates, times, venue and accessibility.", deliverable: "Detailed joining instructions" },
        ],
      },
      {
        label: "During", title: "Training",
        steps: [
          { icon: "book", title: "Classes and practical scenarios", text: "Theory in small groups and hands-on practice with trainers from the trade. You sign in every half-day.", deliverable: "QR code attendance" },
          { icon: "shieldCheck", title: "Assessments", text: "Regular assessments to measure your progress, then targeted preparation for the certification exams.", deliverable: "Results tracked" },
        ],
      },
      {
        label: "After", title: "Certify and move on",
        steps: [
          { icon: "badge", title: "Certification and certificate", text: "You sit the exam; your completion certificate states the hours attended and your results.", deliverable: "Completion certificate" },
          { icon: "trend", title: "Follow-up and employment", text: "Your immediate and delayed feedback helps us improve; we point you to partner employers.", deliverable: "Employment support" },
        ],
      },
    ],
    footnote: "Every step is tracked by our GSMS Qualiopi quality engine: nothing gets lost between two contacts.",
    cta: "Start my pre-registration",
  },
};
