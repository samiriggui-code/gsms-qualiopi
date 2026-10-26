// Section « moteur qualité » : ce que fait GSMS Qualiopi derrière la vitrine.
// Uniquement des fonctions qui existent dans backend/ (voir README.md et docs/API.md) ;
// le moteur prépare et explique, il ne prononce jamais la conformité.
import type { Lang } from "./i18n";

type Item = { icon: string; title: string; text: string };
type QualiopiContent = {
  badge: string; title: string; subtitle: string; heroChip: string; nav: string;
  chain: Item[]; stats: { value: string; label: string }[]; advantagesTitle: string;
  advantages: Item[]; disclaimer: string; cta: string;
};

export const qualiopiContent: Record<Lang, QualiopiContent> = {
  fr: {
    badge: "Engagement qualité",
    title: "Notre engagement qualité",
    subtitle: "Nos formations sont pilotées par GSMS Qualiopi : chaque étape de votre parcours alimente ce moteur qualité, qui transforme les données du quotidien en preuves traçables et les confronte au référentiel national qualité.",
    heroChip: "Qualité pilotée par le moteur GSMS Qualiopi",
    nav: "Moteur Qualiopi",
    chain: [
      { icon: "clipboard", title: "Données du quotidien", text: "Inscriptions, positionnements, émargements, évaluations : rien n'est ressaisi." },
      { icon: "shieldCheck", title: "Preuves traçables", text: "Chaque donnée devient une preuve datée, relue et validée par une personne." },
      { icon: "book", title: "Référentiel national", text: "Confrontation aux indicateurs Qualiopi : V9, puis V10 au 1er novembre 2026." },
      { icon: "activity", title: "Écarts expliqués", text: "Chaque écart dit ce qui manque, où et pourquoi, avant l'audit." },
      { icon: "check", title: "Actions correctives", text: "Une action issue d'un contrôle n'est close que si le moteur constate que l'écart a disparu." },
    ],
    stats: [
      { value: "7", label: "critères du référentiel suivis" },
      { value: "32", label: "indicateurs Qualiopi (V9)" },
      { value: "9", label: "contrôles automatiques paramétrés" },
    ],
    advantagesTitle: "Ce que le moteur apporte à votre formation",
    advantages: [
      { icon: "clipboard", title: "Émargement électronique", text: "Signature avec le code de salle (QR) et votre lien personnel, dans la fenêtre horaire. Absences motivées par le formateur, contre-validation qui verrouille." },
      { icon: "badge", title: "Documents rédigés et figés", text: "Convocation et attestation de fin rédigées à partir des données réelles (horaires, durée suivie, résultats), figées par empreinte SHA-256 et versionnées." },
      { icon: "graduation", title: "Un parcours suivi pas à pas", text: "Analyse du besoin, positionnement, convention, évaluations, satisfaction à chaud et à froid : chaque étape a ses règles et ses refus motivés." },
      { icon: "mail", title: "Relances et questionnaires", text: "Rappels au bon moment et questionnaires en ligne par lien personnel, sans compte. La relance s'annule dès que vous avez répondu." },
      { icon: "handshake", title: "Financements suivis", text: "CPF, OPCO, France Travail (AIF), entreprise ou reste à charge : un dossier par inscription, cofinancements suivis, sur-financement bloqué." },
      { icon: "trend", title: "Prêt pour l'audit", text: "Échéancier par session (J-15 à J+45), dossier d'audit par session, audit interne figé et comparable, journal des modifications champ par champ." },
    ],
    disclaimer: "Le moteur prépare et explique : il ne prononce jamais la conformité, seul l'organisme certificateur en décide.",
    cta: "Demander ma préinscription",
  },
  en: {
    badge: "Quality commitment",
    title: "Our quality commitment",
    subtitle: "Our courses are run with GSMS Qualiopi: every step of your pathway feeds this quality engine, which turns day-to-day data into traceable evidence and checks it against the French national quality framework.",
    heroChip: "Quality driven by the GSMS Qualiopi engine",
    nav: "Qualiopi engine",
    chain: [
      { icon: "clipboard", title: "Day-to-day data", text: "Enrolments, placement tests, attendance, assessments: nothing is typed twice." },
      { icon: "shieldCheck", title: "Traceable evidence", text: "Each piece of data becomes dated evidence, reviewed and approved by a person." },
      { icon: "book", title: "National framework", text: "Checked against the Qualiopi indicators: V9, then V10 from 1 November 2026." },
      { icon: "activity", title: "Explained gaps", text: "Each gap states what is missing, where and why, before the audit." },
      { icon: "check", title: "Corrective actions", text: "An action raised by a check is only closed once the engine sees the gap has gone." },
    ],
    stats: [
      { value: "7", label: "framework criteria tracked" },
      { value: "32", label: "Qualiopi indicators (V9)" },
      { value: "9", label: "configured automatic checks" },
    ],
    advantagesTitle: "What the engine brings to your training",
    advantages: [
      { icon: "clipboard", title: "Electronic attendance", text: "Sign in with the room code (QR) and your personal link, within the time window. Absences justified by the trainer, counter-validation that locks the record." },
      { icon: "badge", title: "Documents drafted and sealed", text: "Joining instructions and completion certificate drafted from real data (times, hours attended, results), sealed with a SHA-256 fingerprint and versioned." },
      { icon: "graduation", title: "A pathway followed step by step", text: "Needs analysis, placement, agreement, assessments, immediate and delayed satisfaction: each step has its own rules and explained refusals." },
      { icon: "mail", title: "Reminders and surveys", text: "Timely reminders and online surveys through a personal link, no account needed. The reminder is cancelled as soon as you answer." },
      { icon: "handshake", title: "Funding tracked", text: "CPF, OPCO, France Travail (AIF), employer or self-funded: one file per enrolment, co-funding tracked, over-funding blocked." },
      { icon: "trend", title: "Audit-ready", text: "Per-session schedule (D-15 to D+45), per-session audit file, frozen and comparable internal audit, field-by-field change log." },
    ],
    disclaimer: "The engine prepares and explains: it never declares compliance — only the certification body decides.",
    cta: "Request pre-registration",
  },
};
