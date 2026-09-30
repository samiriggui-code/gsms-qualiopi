'use client';

// Éléments du carnet d'audit : fiche complète d'un indicateur (version imprimée) et ses blocs, réutilisés
// par le détail à l'écran.
import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CircleAlert,
  FileCheck2,
  Info,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { type CarnetFiche } from '@/lib/gsms/carnet';
import { READINESS, TONE } from '@/lib/gsms/labels';
import { cn } from '@/lib/utils';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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

export function Fiche({
  fiche,
  next,
}: {
  fiche: CarnetFiche;
  next: { version: string; en_vigueur_le: string } | null;
}) {
  const s = stateBadge(fiche.etat);
  const main = fiche.guide.filter(
    (g) =>
      g.section !== 'Obligations spécifiques' && g.section !== 'Sous-traitance',
  );
  const extra = fiche.guide.filter(
    (g) =>
      g.section === 'Obligations spécifiques' || g.section === 'Sous-traitance',
  );
  const majorOnly = fiche.ponderation?.includes('majeure');

  return (
    <Card id={fiche.code} className="break-inside-avoid-page print:shadow-none">
      <CardHeader className="min-h-auto py-3.5 flex-wrap gap-2">
        <CardHeading className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2.5">
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {fiche.code}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              Critère {fiche.critere.numero}
              {fiche.titre ? ` · ${fiche.titre}` : ''}
            </span>
          </CardTitle>
        </CardHeading>
        <CardToolbar className="flex flex-wrap items-center gap-1.5">
          {majorOnly && (
            <Badge size="sm" variant="destructive" appearance="light">
              NC majeure uniquement
            </Badge>
          )}
          {fiche.nouvel_entrant_adapte && (
            <Badge size="sm" variant="secondary" appearance="light">
              Adapté nouvel entrant
            </Badge>
          )}
          <Badge className={s.color}>{s.label}</Badge>
        </CardToolbar>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {fiche.enonce && (
          <blockquote className="border-s-2 border-primary ps-3 text-sm text-foreground">
            {fiche.enonce}
          </blockquote>
        )}
        {next && (
          <Evolution
            fiche={fiche}
            date={next.en_vigueur_le}
            version={next.version}
          />
        )}

        {fiche.etat !== 'A_VENIR' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3 min-w-0">
              {main.map((g) => (
                <GuideBlock key={g.section} {...g} />
              ))}
              {extra.length > 0 && (
                <Collapsible className="print:block">
                  <CollapsibleTrigger className="text-xs font-medium text-primary hover:underline print:hidden">
                    Obligations spécifiques et sous-traitance
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2 print:!block">
                    {extra.map((g) => (
                      <GuideBlock key={g.section} {...g} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <div className="space-y-3 min-w-0">
              <div className="rounded-md border border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <FileCheck2 className="size-4 text-primary" /> Vos éléments
                    de preuve
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {fiche.preuves.exploitables} exploitable
                    {fiche.preuves.exploitables > 1 ? 's' : ''} /{' '}
                    {fiche.preuves.total}
                  </span>
                </div>
                <div className="p-3 space-y-3">
                  {fiche.preuves_attendues.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {fiche.preuves_attendues.map((p) => (
                        <Badge
                          key={p.type}
                          size="sm"
                          variant={p.disponibles ? 'success' : 'destructive'}
                          appearance="light"
                        >
                          {p.libelle} · {p.disponibles}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {fiche.preuves.liste.length ? (
                    <ul className="space-y-1.5">
                      {fiche.preuves.liste.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">
                            {p.reference}
                          </span>
                          <span className="min-w-0 grow text-foreground">
                            {p.libelle}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                            {formatDate(p.produite_le, 'd MMM yy')}
                          </span>
                          <Badge
                            size="sm"
                            className={cn(
                              'shrink-0',
                              EVIDENCE_STATUS[p.statut]?.color,
                            )}
                          >
                            {EVIDENCE_STATUS[p.statut]?.label ?? p.statut}
                          </Badge>
                        </li>
                      ))}
                      {fiche.preuves.total > fiche.preuves.liste.length && (
                        <li className="text-xs text-muted-foreground">
                          … et{' '}
                          {fiche.preuves.total - fiche.preuves.liste.length}{' '}
                          autres dans la fiche indicateur.
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {fiche.etat === 'NON_APPLICABLE'
                        ? 'Indicateur sans objet pour l’organisme.'
                        : 'Aucune preuve reliée pour l’instant.'}
                    </p>
                  )}
                </div>
              </div>

              {fiche.ecarts.length > 0 && (
                <div className="rounded-md border border-border">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium text-foreground">
                    <CircleAlert className="size-4 text-muted-foreground" />{' '}
                    Écarts ouverts ({fiche.ecarts.length})
                  </div>
                  <ul className="p-3 space-y-2">
                    {fiche.ecarts.map((e) => (
                      <li key={e.id} className="text-sm space-y-1">
                        <div className="text-foreground">
                          <span className="text-xs text-muted-foreground tabular-nums me-1.5">
                            {e.reference}
                          </span>
                          {e.titre}
                        </div>
                        {e.actions.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-1.5 text-xs text-secondary-foreground ps-4"
                          >
                            <Wrench className="size-3" /> {a.reference} ·{' '}
                            {a.statut_libelle} · échéance{' '}
                            {formatDate(a.echeance)}
                          </div>
                        ))}
                        {e.actions.length === 0 && (
                          <div className="text-xs text-muted-foreground ps-4">
                            Aucune action ouverte.
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                mode="link"
                asChild
                className="print:hidden"
              >
                <Link href={`/qualiopi/referentiel/${fiche.numero}`}>
                  Ouvrir la fiche indicateur <ArrowUpRight />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
