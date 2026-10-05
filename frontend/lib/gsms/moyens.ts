import { TONE } from '@/components/resource/columns';

// Libellés des lieux et équipements (backend/app/training/models.py : PREMISES_KINDS, PLACE_STATUSES,
// EQUIPMENT_CATEGORIES). Les listes de l'API renvoient déjà les libellés ; ces options servent aux formulaires.
export const PREMISES_KINDS = [
  { value: 'SITE', label: 'Site' },
  { value: 'SALLE', label: 'Salle de formation' },
  { value: 'PLATEAU_TECHNIQUE', label: 'Plateau technique' },
  { value: 'STOCKAGE', label: 'Stockage du matériel' },
  { value: 'AUTRE', label: 'Autre' },
];

export const PLACE_STATUSES = [
  { value: 'A_VERIFIER', label: 'À vérifier sur place', color: TONE.amber },
  { value: 'EN_SERVICE', label: 'En service', color: TONE.green },
  { value: 'EN_MAINTENANCE', label: 'En maintenance', color: TONE.gray },
  { value: 'HORS_SERVICE', label: 'Hors service', color: TONE.red },
];

export const EQUIPMENT_CATEGORIES = [
  { value: 'SECOURISME', label: 'Secourisme' },
  { value: 'INCENDIE', label: 'Incendie' },
  { value: 'SECURITE_PRIVEE', label: 'Sécurité privée' },
  { value: 'EPI', label: 'Équipements de protection' },
  { value: 'INFORMATIQUE', label: 'Informatique et audiovisuel' },
  { value: 'MOBILIER', label: 'Mobilier' },
  { value: 'AUTRE', label: 'Autre' },
];

export const STATUS_OPTIONS = PLACE_STATUSES.map(({ value, label }) => ({
  value,
  label,
}));
