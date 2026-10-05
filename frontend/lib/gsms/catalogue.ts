import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toAbsoluteUrl } from '@/lib/helpers';
import type { Measure, ResultsBasis } from './offre';
import type { Decision } from './types';

// Catalogue des formations (backend/app/training/offre.py, /formation/catalogue). Les comptes, la filière,
// l'état de la fiche et les résultats viennent de l'API ; l'écran ne les recalcule pas.

export interface Published {
  taux_reussite: number | null;
  taux_satisfaction: number | null;
  base: ResultsBasis | null;
}

export interface CatalogueFormation {
  id: string;
  code: string;
  title: string;
  catalog_slug: string | null;
  track: string;
  track_label: string;
  pathway: string | null;
  pathway_label: string | null;
  audience: string | null;
  content: string | null;
  access_delay: string | null;
  delivery_mode: string | null;
  delivery_label: string | null;
  duration_hours: number | null;
  price_eur: number | null;
  is_certifying: boolean;
  certification: { basis: string; basis_label: string; code: string | null };
  modules: number;
  prerequisites: number;
  sessions: {
    total: number;
    a_venir: number;
    prochaine: { id: string; reference: string; start_date: string } | null;
  };
  ressources: { total: number; a_rediger: number };
  points_a_arbitrer: number;
  rubriques_manquantes: number;
  fiche: 'VALIDEE' | 'MODIFIEE' | 'JAMAIS_VALIDEE';
  fiche_relue_le: string | null;
  publie: Published;
}

export interface Catalogue {
  formations: CatalogueFormation[];
  totaux: {
    formations: number;
    certification_identifiee: number;
    sessions_a_venir: number;
    points_a_arbitrer: number;
    formations_a_arbitrer: number;
    fiches_validees: number;
  };
  filieres: { value: string; label: string; count: number }[];
  parcours: { value: string; label: string; count: number }[];
  libelles: Record<
    'filieres' | 'parcours' | 'modalites',
    Record<string, string>
  >;
  capabilities: { ecrire: Decision };
}

export interface CatalogueSession {
  id: string;
  reference: string;
  start_date: string;
  end_date: string;
  status: string;
  location: string | null;
  room: string | null;
  trainer_name: string | null;
  capacity: number | null;
  learners: number;
}

export interface CatalogueItem {
  id: string;
  track_label: string;
  pathway_label: string | null;
  sessions: CatalogueSession[];
  periode: { du: string; au: string; mois: number };
  mesure: Measure | null;
  publie: Published;
  ecarts: string[];
}

export interface EvaluationStep {
  title: string;
  description: string | null;
  kind: string | null;
}

export const useCatalogue = () =>
  useQuery({
    queryKey: ['formation', 'catalogue'],
    queryFn: () => api.get<Catalogue>('formation/catalogue'),
  });

export const useCatalogueItem = (id: string | undefined) =>
  useQuery({
    queryKey: ['formation', 'catalogue', id],
    queryFn: () => api.get<CatalogueItem>(`formation/catalogue/${id}`),
    enabled: !!id,
  });

// Visuels des fiches vitrine de GSMS School (public/formations), par identifiant du catalogue.
const VISUALS: Record<string, string> = {
  'tfp-aps': 'tfp-aps.png',
  'mac-aps': 'mac-aps.png',
  'asra-d': 'asra-d.png',
  ovt: 'ovt.jpg',
  'mac-ovt': 'mac-ovt.jpg',
  'h0-b0': 'h0-b0.jpg',
  'bs-be-manoeuvre': 'bs-be-manoeuvre.jpg',
  br: 'br.jpg',
  'ssiap-1-initial': 'ssiap-1-initial.jpg',
  'ssiap-1-recyclage': 'ssiap-1-recyclage.jpg',
  'ssiap-1-ran': 'ssiap-1-ran.jpg',
  'ssiap-2-initial': 'ssiap-2-initial.png',
  'ssiap-2-recyclage': 'ssiap-2-recyclage.png',
  'ssiap-2-ran': 'ssiap-2-ran.png',
  'ssiap-3-initial': 'ssiap-3-initial.png',
  'ssiap-3-recyclage': 'ssiap-3-recyclage.png',
  'ssiap-3-ran': 'ssiap-3-ran.png',
  'sst-initial': 'sst-initial.jpg',
  'mac-sst': 'mac-sst.jpg',
  stu: 'stu.jpg',
  'sst-entreprise': 'sst-entreprise.jpg',
  'guide-file-serre-file': 'guide-file-serre-file.jpg',
  ari: 'ari.jpg',
  'manipulation-extincteur': 'manipulation-extincteur.jpg',
  esi: 'esi.jpg',
  ssi: 'ssi.jpg',
  cssi: 'cssi.jpg',
  'evacuation-incendie': 'evacuation-incendie.jpg',
  epi: 'epi.jpg',
};

export const formationVisual = (slug: string | null) =>
  slug && VISUALS[slug] ? toAbsoluteUrl(`/formations/${VISUALS[slug]}`) : null;

export const euros = (v: number | null | undefined) =>
  v == null
    ? null
    : v.toLocaleString('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
      });

export const hours = (v: number | null | undefined) =>
  v == null ? null : `${v.toLocaleString('fr-FR')} h`;

export const frDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'medium' })
    : null;

// « Aptitude médicale : certificat de moins de 3 mois » → intitulé et détail.
export function splitPrerequisite(text: string): {
  item: string;
  detail: string | null;
} {
  const i = text.indexOf(' : ');
  return i > 0
    ? { item: text.slice(0, i), detail: text.slice(i + 3) }
    : { item: text, detail: null };
}
