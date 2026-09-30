import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// Types alignés sur backend/app/qualiopi/referential/router.py

export type Scope = 'ORGANISME' | 'FORMATION' | 'SESSION';

export interface Criterion {
  number: number;
  title: string;
}

export interface ReferentialVersion {
  id: string;
  code: string;
  version: string;
  title: string;
  effective_from: string;
  source_label: string;
  source_url: string | null;
  upstream_ref: string | null;
  imported_at: string;
  criteria: Criterion[];
}

export interface Applicability {
  certifying_only?: boolean;
  action_categories?: string[];
}

export interface IndicatorSummary {
  number: number;
  code: string;
  criterion_number: number;
  title: string;
  scope: Scope;
  ponderation: string;
  new_entrant_adapted: boolean;
  subcontracting: string;
  applicability: Applicability;
  expected_evidence: string[];
  controls_count: number;
}

export interface IndicatorControl {
  key: string;
  label: string;
  check: string;
  scope: Scope;
  severity: 'majeure' | 'mineure';
  remediation: string;
  guide_section: string | null;
  new_entrant_mode: 'same' | 'only';
}

export interface IndicatorDetail extends IndicatorSummary {
  criterion_title: string;
  editorial_note: string | null;
  human_review: string;
  texts: { section: string; body: string }[];
  controls: IndicatorControl[];
}

export function useActiveReferential() {
  return useQuery({
    queryKey: ['referentiel', 'active'],
    queryFn: () => apiFetch<ReferentialVersion>('/v1/referentials/active'),
    staleTime: Infinity,
  });
}

export function useIndicators() {
  return useQuery({
    queryKey: ['referentiel', 'indicators'],
    queryFn: () =>
      apiFetch<IndicatorSummary[]>('/v1/referentials/active/indicators'),
    staleTime: Infinity,
  });
}

export function useIndicator(number: number) {
  return useQuery({
    queryKey: ['referentiel', 'indicators', number],
    queryFn: () =>
      apiFetch<IndicatorDetail>(`/v1/referentials/active/indicators/${number}`),
    staleTime: Infinity,
  });
}

// --- Libellés ---

export const SCOPE_LABELS: Record<Scope, { label: string; color: string }> = {
  ORGANISME: { label: 'Organisme', color: 'bg-secondary dark:bg-secondary/50 text-secondary-foreground' },
  FORMATION: { label: 'Formation', color: 'bg-secondary dark:bg-secondary/50 text-secondary-foreground' },
  SESSION: { label: 'Session', color: 'bg-secondary dark:bg-secondary/50 text-secondary-foreground' },
};

export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  ADAPTATION: 'Adaptation de la prestation',
  ASSESSMENT: 'Évaluation des acquis',
  ATTENDANCE: 'Émargements',
  CERTIFICATE: 'Attestation / certificat',
  CERTIFICATION_ALIGNMENT: 'Adéquation à la certification',
  CERTIFICATION_RESULTS: 'Résultats de certification',
  COMPLAINT_HANDLING: 'Traitement des réclamations',
  CONTENT: 'Contenus et modalités',
  CONVOCATION: 'Convocation',
  DISABILITY_REFERENT: 'Référent handicap',
  DROPOUT_FOLLOWUP: 'Suivi des abandons',
  EXAM_PRESENTATION: "Présentation à l'examen",
  HANDICAP_PARTNER: 'Réseau handicap',
  IMPROVEMENT_ACTION: "Action d'amélioration",
  NEEDS_ANALYSIS: 'Analyse du besoin',
  OBJECTIVES: 'Objectifs opérationnels',
  POSITIONING: 'Positionnement',
  PUBLIC_INFO: 'Information publique',
  RESULTS_PUBLISHED: 'Résultats publiés',
  SESSION_RESOURCES: 'Moyens de la session',
  SOCIO_PARTNER: 'Partenaires socio-économiques',
  STAFF_DEVELOPMENT: 'Développement des compétences',
  SUBCONTRACTOR: 'Sous-traitance',
  SURVEY_RESPONSE: 'Enquête de satisfaction',
  TRAINER_QUALIFICATION: 'Qualification des formateurs',
  WATCH: 'Veille',
};

export function evidenceTypeLabel(type: string) {
  return EVIDENCE_TYPE_LABELS[type] ?? type;
}

const ACTION_CATEGORY_LABELS: Record<string, string> = {
  APPRENTISSAGE: 'Apprentissage',
};

// Conditions d'application lisibles ; vide = applicable à tous.
export function applicabilityLabels(a: Applicability): string[] {
  const out: string[] = [];
  if (a.certifying_only) out.push('Formations certifiantes');
  for (const c of a.action_categories ?? []) {
    out.push(ACTION_CATEGORY_LABELS[c] ?? c);
  }
  return out;
}

const SUBCONTRACTING_LABELS: Record<string, string> = {
  applicable: 'Applicable',
  'non concerne': 'Non concerné',
};

export function subcontractingLabel(value: string) {
  return SUBCONTRACTING_LABELS[value] ?? capitalize(value);
}

export function capitalize(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
