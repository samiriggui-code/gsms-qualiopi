// Saisies demandées par chaque étape du parcours (les noms de champs sont ceux de l'API).
import type { JourneyStepKey } from "./types";

export type FieldSpec =
  | { name: string; label: string; kind: "date"; required?: boolean; hint?: string }
  | { name: string; label: string; kind: "text" | "textarea"; required?: boolean; hint?: string }
  | {
      name: string;
      label: string;
      kind: "number";
      min: number;
      max: number;
      step?: number;
      required?: boolean;
      hint?: string;
    }
  | {
      name: string;
      label: string;
      kind: "select";
      options: { value: string; label: string }[];
      required?: boolean;
      hint?: string;
    }
  | { name: string; label: string; kind: "tristate"; hint?: string } // oui / non / non renseigné
  | { name: string; label: string; kind: "checkbox"; reveals?: string; hint?: string };

export type ActionSpec = { label: string; submit: string; fields: FieldSpec[]; success: string };

const today = { name: "date", label: "Date", kind: "date", required: true } as const;

export const ACTIONS: Record<string, ActionSpec> = {
  analyse_besoin: {
    label: "Analyse du besoin",
    submit: "Enregistrer l'analyse",
    success: "Analyse du besoin enregistrée",
    fields: [
      { ...today, label: "Réalisée le" },
      { name: "synthese", label: "Synthèse du besoin", kind: "textarea", required: true },
      {
        name: "adaptation",
        label: "Besoin d'adaptation (handicap, contrainte particulière)",
        kind: "checkbox",
        reveals: "adaptation_notes",
      },
      { name: "adaptation_notes", label: "Adaptation à prévoir", kind: "textarea", required: true },
    ],
  },
  positionnement: {
    label: "Positionnement à l'entrée",
    submit: "Enregistrer le positionnement",
    success: "Positionnement enregistré",
    fields: [
      { ...today, label: "Réalisé le" },
      {
        name: "methode",
        label: "Méthode",
        kind: "text",
        required: true,
        hint: "QCM d'entrée, entretien, mise en situation…",
      },
      { name: "niveau", label: "Niveau constaté", kind: "text" },
      { name: "prerequis_ok", label: "Prérequis atteints", kind: "tristate" },
    ],
  },
  convention_envoyer: {
    label: "Envoyer la convention ou le contrat",
    submit: "Marquer comme envoyé",
    success: "Envoi enregistré",
    fields: [
      {
        name: "type",
        label: "Document",
        kind: "select",
        options: [
          { value: "CONVENTION", label: "Convention (entreprise ou financeur)" },
          { value: "CONTRAT", label: "Contrat de formation (particulier)" },
        ],
      },
      { ...today, label: "Envoyé le" },
    ],
  },
  convention_signer: {
    label: "Signature de la convention",
    submit: "Enregistrer la signature",
    success: "Signature enregistrée",
    fields: [
      { ...today, label: "Signée le" },
      { name: "signataire", label: "Signataire", kind: "text", required: true, hint: "Nom et fonction côté client" },
    ],
  },
  convocation: { label: "Émettre la convocation", submit: "Émettre", success: "Convocation émise", fields: [] },
  evaluation: {
    label: "Évaluation des acquis",
    submit: "Enregistrer l'évaluation",
    success: "Évaluation enregistrée",
    fields: [
      { name: "intitule", label: "Intitulé", kind: "text", required: true, hint: "Ex. QCM final, cas pratique n°2" },
      {
        name: "nature",
        label: "Nature",
        kind: "select",
        options: [
          { value: "SOMMATIVE", label: "Sommative (fin de formation)" },
          { value: "FORMATIVE", label: "Formative (en cours)" },
          { value: "EXAMEN", label: "Examen / épreuve certificative" },
        ],
      },
      { ...today, label: "Évaluée le" },
      { name: "note", label: "Note (facultatif)", kind: "number", min: 0, max: 100, step: 0.5 },
      { name: "reussi", label: "Résultat", kind: "tristate" },
    ],
  },
  attestation: { label: "Émettre l'attestation de fin", submit: "Émettre", success: "Attestation émise", fields: [] },
  satisfaction_chaud: {
    label: "Satisfaction à chaud",
    submit: "Enregistrer",
    success: "Satisfaction enregistrée",
    fields: [
      { ...today, label: "Répondu le" },
      { name: "note", label: "Note sur 5", kind: "number", min: 0, max: 5, step: 0.5, required: true },
      { name: "commentaire", label: "Commentaire", kind: "textarea" },
    ],
  },
  satisfaction_froid: {
    label: "Satisfaction à froid",
    submit: "Enregistrer",
    success: "Satisfaction à froid enregistrée",
    fields: [
      { ...today, label: "Répondu le" },
      { name: "note", label: "Note sur 5", kind: "number", min: 0, max: 5, step: 0.5, required: true },
      { name: "commentaire", label: "Commentaire", kind: "textarea" },
    ],
  },
  confirmer: { label: "Confirmer l'inscription", submit: "Confirmer", success: "Inscription confirmée", fields: [] },
  terminer: {
    label: "Constater la fin de formation",
    submit: "Confirmer",
    success: "Fin de formation constatée",
    fields: [],
  },
  abandonner: {
    label: "Enregistrer un abandon",
    submit: "Enregistrer l'abandon",
    success: "Abandon enregistré",
    fields: [
      { ...today, label: "Date du départ" },
      { name: "motif", label: "Motif", kind: "textarea", required: true },
    ],
  },
  annuler: {
    label: "Annuler l'inscription",
    submit: "Annuler l'inscription",
    success: "Inscription annulée",
    fields: [{ name: "motif", label: "Motif", kind: "textarea", required: true }],
  },
};

export const REISSUE_REASON: FieldSpec = {
  name: "motif",
  label: "Motif de la réémission",
  kind: "textarea",
  required: true,
  hint: "La version précédente est conservée, marquée remplacée.",
};

/** Étape du parcours → actions qui la font avancer. */
export const STEP_ACTIONS: Record<JourneyStepKey, string[]> = {
  analyse_besoin: ["analyse_besoin"],
  positionnement: ["positionnement"],
  convention: ["convention_envoyer", "convention_signer"],
  convocation: ["convocation"],
  emargement: [],
  evaluations: ["evaluation"],
  attestation: ["attestation"],
  satisfaction_chaud: ["satisfaction_chaud"],
  satisfaction_froid: ["satisfaction_froid"],
};

export const STATUS_ACTIONS = ["confirmer", "terminer", "abandonner", "annuler"];

// Actions sans saisie qui produisent un document ou changent le statut : confirmation explicite.
export const CONFIRM_TEXT: Record<string, string> = {
  convocation:
    "Le moteur rédige la convocation à partir de la session (dates, horaires des demi-journées, lieu, accessibilité) et la fige.",
  attestation:
    "Le moteur rédige l'attestation (objectifs, nature, durée suivie d'après l'émargement, résultats des évaluations) et la fige.",
  confirmer: "L'inscription passe au statut confirmé.",
  terminer: "Le stagiaire est noté comme ayant terminé la formation.",
};
