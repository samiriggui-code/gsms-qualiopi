import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Relances et e-mails (backend/app/relances/router.py).

export type MessageStatus =
  | 'A_VALIDER'
  | 'PREVU'
  | 'ENVOYE'
  | 'ECHEC'
  | 'ANNULE'
  | 'SANS_ADRESSE';

export interface Message {
  id: string;
  reference: string;
  regle: string;
  modele: string;
  version_modele: number;
  externe: boolean;
  destinataire: { type: string; nom: string | null; email: string | null };
  objet: string;
  statut: MessageStatus;
  prevu_le: string;
  session_id: string | null;
  inscription_id: string | null;
  indicateurs: number[];
  valide_par: string | null;
  valide_le: string | null;
  envoye_le: string | null;
  identifiant_envoi: string | null;
  tentatives: number;
  erreur: string | null;
  motif_annulation: string | null;
  empreinte: string;
  cree_le: string | null;
  html?: string;
  texte?: string;
}

export const useMessages = () =>
  useQuery({
    queryKey: ['communications'],
    queryFn: () =>
      api.get<{
        compteurs: Partial<Record<MessageStatus, number>>;
        messages: Message[];
      }>('communications'),
  });

export const useMessage = (id: string | null) =>
  useQuery({
    queryKey: ['communications', id],
    queryFn: () => api.get<Message>(`communications/${id}`),
    enabled: !!id,
  });

export function useMessageAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      motif,
    }: {
      id: string;
      action: 'valider' | 'annuler' | 'renvoyer';
      motif?: string;
    }) =>
      api.post<Message>(
        `communications/${id}/${action}`,
        motif ? { motif } : {},
      ),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['communications'] }),
  });
}

export function usePlanNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<Record<string, number | boolean>>('communications/planifier'),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['communications'] }),
  });
}
