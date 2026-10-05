import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TONE } from './labels';
import type { Decision, ReadinessStatus } from './types';

// Audits internes figés (backend/app/qualiopi/ecrans.py, audit/service.py) : photo des résultats et
// des preuves à l'ouverture, jugement de l'auditeur indicateur par indicateur, clôture et constats.

export type Judgment =
  | 'CONFORME'
  | 'NC_MINEURE'
  | 'NC_MAJEURE'
  | 'NON_APPLICABLE';

export interface AuditSummary {
  id: string;
  reference: string;
  titre: string;
  type: 'INTERNE' | 'BLANC';
  type_libelle: string;
  statut: 'EN_COURS' | 'CLOS';
  statut_libelle: string;
  auditeur: string;
  referentiel: string;
  prevu_le: string | null;
  photo_le: string | null;
  clos_le: string | null;
  periode: { du: string | null; au: string | null };
  echantillon: string[];
  progression: { juges: number; total: number };
  jugements: { jugement: Judgment; libelle: string; nombre: number }[];
  conclusion: string | null;
  capabilities: { juger: Decision; clore: Decision };
}

export interface AuditItem {
  numero: number;
  titre: string;
  critere: number | null;
  etat_moteur: ReadinessStatus;
  jugement: Judgment | null;
  jugement_libelle: string | null;
  commentaire: string | null;
  par: string | null;
  le: string | null;
  resultats: {
    control: string;
    target: string;
    status: ReadinessStatus;
    expected: string;
    observed: string;
    explanation: string;
  }[];
  preuves: { reference: string; type: string; status: string; label: string }[];
  ecarts_ouverts: string[];
  revue_humaine: string | null;
  constat: string | null;
}

export interface AuditDetail extends AuditSummary {
  jugements_possibles: {
    jugement: Judgment;
    libelle: string;
    motif_obligatoire: boolean;
  }[];
  indicateurs: AuditItem[];
  criteres: { numero: number; titre: string }[];
  avertissement: string;
}

export interface AuditComparison {
  audits: {
    id: string;
    reference: string;
    titre: string;
    photo_le: string | null;
  }[];
  indicateurs: {
    indicator: number;
    title: string | null;
    points: {
      audit: string;
      date: string;
      engine: ReadinessStatus | null;
      judgment: Judgment | null;
      jugement_libelle: string | null;
    }[];
  }[];
}

export interface SampleSession {
  id: string;
  reference: string;
  formation: string | null;
  du: string;
  au: string;
  statut: string;
  proposee: boolean;
}

export interface NewAudit {
  titre: string;
  type: 'INTERNE' | 'BLANC';
  auditeur: string;
  prevu_le: string | null;
  sessions: string[];
}

// Jugement de l'auditeur interne → couleur. Le libellé vient de l'API (jamais « conforme »).
export const JUDGMENT_TONE: Record<Judgment, string> = {
  CONFORME: TONE.ok,
  NC_MINEURE: TONE.warn,
  NC_MAJEURE: TONE.danger,
  NON_APPLICABLE: TONE.neutral,
};

const keys = {
  list: ['qualiopi', 'audits'] as const,
  detail: (id: string) => ['qualiopi', 'audits', id] as const,
  sample: ['qualiopi', 'audits', 'echantillon'] as const,
  comparison: ['qualiopi', 'audits', 'comparaison'] as const,
};

export const useAudits = () =>
  useQuery({
    queryKey: keys.list,
    queryFn: () =>
      api.get<{
        audits: AuditSummary[];
        capabilities: { creer: Decision };
        avertissement: string;
      }>('qualiopi/audits'),
  });

export const useAudit = (id: string) =>
  useQuery({
    queryKey: keys.detail(id),
    queryFn: () => api.get<AuditDetail>(`qualiopi/audits/${id}`),
  });

export const useAuditSample = (enabled: boolean) =>
  useQuery({
    queryKey: keys.sample,
    queryFn: () =>
      api.get<{
        periode: { label: string };
        sessions: SampleSession[];
      }>('qualiopi/audits/echantillon'),
    enabled,
  });

export const useAuditComparison = (enabled: boolean) =>
  useQuery({
    queryKey: keys.comparison,
    queryFn: () => api.get<AuditComparison>('qualiopi/audits/comparaison'),
    enabled,
  });

function useRefresh() {
  const qc = useQueryClient();
  return (audit: AuditDetail) => {
    qc.setQueryData(keys.detail(audit.id), audit);
    qc.invalidateQueries({ queryKey: keys.list, exact: true });
    qc.invalidateQueries({ queryKey: keys.comparison });
  };
}

export function useOpenAudit() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: NewAudit) =>
      api.post<AuditDetail>('qualiopi/audits', {
        ...body,
        sessions: body.sessions.length ? body.sessions : null,
      }),
    onSuccess: refresh,
  });
}

export function useJudge(auditId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({
      numero,
      jugement,
      commentaire,
    }: {
      numero: number;
      jugement: Judgment;
      commentaire: string;
    }) =>
      api.post<AuditDetail>(
        `qualiopi/audits/${auditId}/indicateurs/${numero}`,
        {
          jugement,
          commentaire: commentaire || null,
        },
      ),
    onSuccess: refresh,
  });
}

export function useCloseAudit(auditId: string) {
  const qc = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (conclusion: string) =>
      api.post<AuditDetail>(`qualiopi/audits/${auditId}/cloture`, {
        conclusion,
      }),
    onSuccess: (audit) => {
      refresh(audit);
      // La clôture crée les constats d'audit : actions correctives et tableau de bord à relire.
      qc.invalidateQueries({ queryKey: ['qualiopi'] });
    },
  });
}
