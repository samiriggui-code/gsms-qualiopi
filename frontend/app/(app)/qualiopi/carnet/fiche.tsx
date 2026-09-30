'use client';

// Blocs du carnet d'audit réutilisés à l'écran : états, statuts de preuve, textes du guide, évolution V10.
// La version imprimable est produite par le serveur (config/qualiopi/carnet.html).
import * as React from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { CarnetFiche } from '@/lib/gsms/carnet';
import { READINESS, TONE } from '@/lib/gsms/labels';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';

export const STATE_BAR: { key: string; label: string; bar: string }[] = [
  { key: 'DEMONTRABLE', label: 'Démontrables', bar: 'bg-green-500' },
  { key: 'A_RISQUE', label: 'À risque', bar: 'bg-yellow-500' },
  {
    key: 'PREUVES_INSUFFISANTES',
    label: 'Preuves insuffisantes',
    bar: 'bg-destructive',
  },
  { key: 'NON_EVALUABLE', label: 'Revue humaine', bar: 'bg-primary' },
  { key: 'NON_EVALUE', label: 'Non évalués', bar: 'bg-zinc-400' },
];

export const EVIDENCE_STATUS: Record<string, { label: string; color: string }> =
  {
    DETECTEE: { label: 'Détectée', color: TONE.neutral },
    DOCUMENTEE: { label: 'Documentée', color: TONE.info },
    EXPLOITABLE: { label: 'Exploitable', color: TONE.ok },
    VALIDEE: { label: 'Validée', color: TONE.ok },
    EXPIREE: { label: 'Expirée', color: TONE.warn },
    REJETEE: { label: 'Rejetée', color: TONE.danger },
  };

export const GUIDE_TITLES: Record<string, string> = {
  'Niveau attendu': 'Niveau attendu',
  'Exemples de preuves': 'Preuves citées par le guide',
  'Non-conformité': 'Non-conformité',
  'Obligations spécifiques': 'Obligations spécifiques (publics, BC, VAE, CFA…)',
  'Sous-traitance': 'Sous-traitance',
};

export function stateBadge(etat: CarnetFiche['etat']) {
  if (etat === 'A_VENIR') return { label: 'À venir', color: TONE.brand };
  return READINESS[etat];
}

export function GuideBlock({
  section,
  texte,
}: {
  section: string;
  texte: string;
}) {
  if (section === 'Non-conformité') {
    return (
      <Alert variant="destructive" appearance="light" size="sm">
        <AlertIcon>
          <TriangleAlert />
        </AlertIcon>
        <AlertContent>
          <AlertTitle>Non-conformité</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {texte}
          </AlertDescription>
        </AlertContent>
      </Alert>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">
        {GUIDE_TITLES[section] ?? section}
      </div>
      <div className="text-sm text-secondary-foreground whitespace-pre-line">
        {texte}
      </div>
    </div>
  );
}

export function Evolution({
  fiche,
  date,
  version,
}: {
  fiche: CarnetFiche;
  date: string;
  version: string;
}) {
  const e = fiche.evolution;
  if (!e) return null;
  const label =
    e.type === 'NOUVEAU'
      ? `Nouvel indicateur au ${formatDate(date)}`
      : e.ampleur === 'FOND'
        ? `Exigence modifiée au ${formatDate(date)}`
        : `Rédaction ajustée au ${formatDate(date)}`;
  return (
    <Alert
      variant="info"
      appearance="light"
      size="sm"
      className="break-inside-avoid"
    >
      <AlertIcon>
        <Info />
      </AlertIcon>
      <AlertContent>
        <AlertTitle>
          {label} ({version})
        </AlertTitle>
        <AlertDescription>
          <p>
            {e.segments?.length
              ? e.segments.map((s, i) =>
                  s.ajout ? (
                    <React.Fragment key={i}>
                      <strong className="font-semibold text-foreground">
                        {s.texte}
                      </strong>{' '}
                    </React.Fragment>
                  ) : (
                    <span key={i}>{s.texte} </span>
                  ),
                )
              : e.enonce}
          </p>
          {e.prestations && e.type === 'NOUVEAU' && (
            <p className="mt-1">{e.prestations}</p>
          )}
          {e.segments?.some((s) => s.ajout) && (
            <p className="mt-1">En gras : ce qui est ajouté ou reformulé.</p>
          )}
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}
