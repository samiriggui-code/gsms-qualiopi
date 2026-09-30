import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ReadinessStatus } from './types';

// Carnet d'audit (backend/app/qualiopi/carnet.py) : une fiche par indicateur.

export interface CarnetEvolution {
  type: 'MODIFIE' | 'NOUVEAU';
  enonce: string;
  prestations?: string | null;
  ampleur?: 'FOND' | 'REDACTION';
  segments?: { texte: string; ajout: boolean }[];
}

export interface CarnetFiche {
  numero: number;
  code: string;
  titre: string;
  critere: { numero: number; titre: string | null };
  enonce: string;
  guide: { section: string; texte: string }[];
  ponderation: string | null;
  nouvel_entrant_adapte: boolean;
  etat: ReadinessStatus | 'A_VENIR';
  revue_humaine: string | null;
  preuves_attendues: { type: string; libelle: string; disponibles: number }[];
  preuves: {
    total: number;
    exploitables: number;
    liste: {
      id: string;
      reference: string;
      libelle: string;
      type: string;
      statut: string;
      produite_le: string | null;
      document_id: string | null;
    }[];
  };
  ecarts: {
    id: string;
    reference: string;
    titre: string;
    gravite: string;
    statut: string;
    actions: {
      id: string;
      reference: string;
      statut: string;
      statut_libelle: string;
      echeance: string;
    }[];
  }[];
  evolution: CarnetEvolution | null;
}

export interface Carnet {
  organisme: {
    nom: string;
    nda: string | null;
    siret: string | null;
    categories: string[];
    nouvel_entrant: boolean;
  } | null;
  referentiel: { version: string; en_vigueur_le: string; source: string };
  prochaine_version: {
    version: string;
    en_vigueur_le: string;
    source: string;
  } | null;
  session: {
    id: string;
    reference: string;
    formation: string | null;
    debut: string;
    fin: string;
  } | null;
  edite_le: string;
  fiches: CarnetFiche[];
  avertissement: string;
}

export const useCarnet = (sessionId?: string) =>
  useQuery({
    queryKey: ['qualiopi', 'carnet', sessionId ?? 'organisme'],
    queryFn: () =>
      api.get<Carnet>(
        sessionId
          ? `qualiopi/carnet?session_id=${encodeURIComponent(sessionId)}`
          : 'qualiopi/carnet',
      ),
  });
