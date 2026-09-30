'use client';

// Carnet d'audit : une fiche par indicateur, comme un carnet de préparation, mais rempli par GSMS.
// Textes officiels (référentiel et guide de lecture) à gauche, éléments de preuve réellement réunis à
// droite, écarts ouverts et actions en cours, et ce qui change à l'entrée en vigueur de la version suivante.
// Imprimable (ou enregistrable en PDF) pour l'auditeur.
import * as React from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  CircleAlert,
  FileCheck2,
  Printer,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useCarnet, type CarnetFiche } from '@/lib/gsms/carnet';
import { READINESS, TONE } from '@/lib/gsms/labels';
import { cn } from '@/lib/utils';
import { Badge, BadgeDot } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { CountedTabs } from '@/components/resource/counted-tabs';

const STATE_BAR: { key: string; label: string; bar: string }[] = [
  { key: 'DEMONTRABLE', label: 'Démontrables', bar: 'bg-emerald-500' },
  { key: 'A_RISQUE', label: 'À risque', bar: 'bg-amber-500' },
  {
    key: 'PREUVES_INSUFFISANTES',
    label: 'Preuves insuffisantes',
    bar: 'bg-red-500',
  },
  { key: 'NON_EVALUABLE', label: 'Revue humaine', bar: 'bg-sky-500' },
  { key: 'NON_EVALUE', label: 'Non évalués', bar: 'bg-zinc-400' },
];

const EVIDENCE_STATUS: Record<string, { label: string; color: string }> = {
  DETECTEE: { label: 'Détectée', color: TONE.neutral },
  DOCUMENTEE: { label: 'Documentée', color: TONE.info },
  EXPLOITABLE: { label: 'Exploitable', color: TONE.ok },
  VALIDEE: { label: 'Validée', color: TONE.ok },
  EXPIREE: { label: 'Expirée', color: TONE.warn },
  REJETEE: { label: 'Rejetée', color: TONE.danger },
};

const GUIDE_TITLES: Record<string, string> = {
  'Niveau attendu': 'Niveau attendu',
  'Exemples de preuves': 'Preuves citées par le guide',
  'Non-conformité': 'Non-conformité',
  'Obligations spécifiques': 'Obligations spécifiques (publics, BC, VAE, CFA…)',
  'Sous-traitance': 'Sous-traitance',
};

function stateBadge(etat: CarnetFiche['etat']) {
  if (etat === 'A_VENIR') return { label: 'À venir', color: TONE.brand };
  return READINESS[etat];
}

function GuideBlock({ section, texte }: { section: string; texte: string }) {
  const nc = section === 'Non-conformité';
  return (
    <div
      className={cn(
        'space-y-1',
        nc &&
          'rounded-md border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30 p-3',
      )}
    >
      <div
        className={cn(
          'text-xs font-medium uppercase tracking-wide',
          nc ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground',
        )}
      >
        {GUIDE_TITLES[section] ?? section}
      </div>
      <div className="text-sm text-secondary-foreground whitespace-pre-line">
        {texte}
      </div>
    </div>
  );
}

function Evolution({
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
    <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 p-3 space-y-1.5 break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300">
        <Sparkles className="size-3.5" /> {label} ({version})
      </div>
      <p className="text-sm text-foreground">
        {e.segments?.length
          ? e.segments.map((s, i) =>
              s.ajout ? (
                <React.Fragment key={i}>
                  <mark className="bg-blue-200/70 dark:bg-blue-800/60 text-foreground rounded-sm px-0.5">
                    {s.texte}
                  </mark>{' '}
                </React.Fragment>
              ) : (
                <span key={i}>{s.texte} </span>
              ),
            )
          : e.enonce}
      </p>
      {e.prestations && e.type === 'NOUVEAU' && (
        <p className="text-xs text-muted-foreground">{e.prestations}</p>
      )}
      {e.segments?.some((s) => s.ajout) && (
        <p className="text-xs text-muted-foreground">
          Surligné : ce qui est ajouté ou reformulé dans le nouveau texte.
        </p>
      )}
    </div>
  );
}

function Fiche({
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
                          variant="outline"
                          className={cn(
                            p.disponibles === 0 &&
                              'border-red-300 text-red-700 dark:text-red-300',
                          )}
                        >
                          <BadgeDot
                            className={
                              p.disponibles ? 'bg-emerald-500' : 'bg-red-500'
                            }
                          />
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
                <div className="rounded-md border border-amber-200 dark:border-amber-900">
                  <div className="flex items-center gap-2 border-b border-amber-200 dark:border-amber-900 px-3 py-2 text-sm font-medium text-foreground">
                    <CircleAlert className="size-4 text-amber-500" /> Écarts
                    ouverts ({fiche.ecarts.length})
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

export default function CarnetPage() {
  const { data, isLoading, error } = useCarnet();
  const [criterion, setCriterion] = useState('all');
  const [showNa, setShowNa] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(false);

  const fiches = useMemo(() => data?.fiches ?? [], [data]);
  const shown = fiches.filter(
    (f) =>
      (criterion === 'all' || String(f.critere.numero) === criterion) &&
      (showNa || f.etat !== 'NON_APPLICABLE') &&
      (!onlyChanges || (f.evolution && f.evolution.ampleur !== 'REDACTION')),
  );
  const applicable = fiches.filter(
    (f) => f.etat !== 'NON_APPLICABLE' && f.etat !== 'A_VENIR',
  );
  const counts = Object.fromEntries(
    STATE_BAR.map((s) => [
      s.key,
      applicable.filter((f) => f.etat === s.key).length,
    ]),
  );
  const changes = fiches.filter((f) => f.evolution?.ampleur === 'FOND').length;
  const created = fiches.filter((f) => f.evolution?.type === 'NOUVEAU').length;
  const tabs = [
    {
      id: 'all',
      label: 'Tous',
      count: fiches.filter((f) => showNa || f.etat !== 'NON_APPLICABLE').length,
    },
    ...Array.from(new Set(fiches.map((f) => f.critere.numero)))
      .sort((a, b) => a - b)
      .map((n) => ({
        id: String(n),
        label: `Critère ${n}`,
        count: fiches.filter(
          (f) =>
            f.critere.numero === n && (showNa || f.etat !== 'NON_APPLICABLE'),
        ).length,
      })),
  ];

  return (
    <>
      <ContentHeader className="print:hidden">
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <BookOpenCheck className="size-4 text-primary" />
          Carnet d’audit
        </h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.print()}
          disabled={!data}
        >
          <Printer /> Imprimer ou PDF
        </Button>
      </ContentHeader>
      <Content className="block print:py-0">
        <div className="container-fluid space-y-5">
          <Refusal error={error} />
          {isLoading && <Skeleton className="h-40 w-full" />}
          {data && (
            <>
              <Card className="print:shadow-none">
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="text-lg lg:text-[22px] font-semibold text-foreground leading-tight">
                        {data.organisme?.nom ?? 'Organisme'}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-2sm text-muted-foreground">
                        {data.organisme?.nda && (
                          <>
                            <span>NDA</span>
                            <span className="font-medium text-foreground">
                              {data.organisme.nda}
                            </span>
                            <BadgeDot className="bg-muted-foreground size-1" />
                          </>
                        )}
                        {data.organisme?.siret && (
                          <>
                            <span>SIRET</span>
                            <span className="font-medium text-foreground">
                              {data.organisme.siret}
                            </span>
                            <BadgeDot className="bg-muted-foreground size-1" />
                          </>
                        )}
                        <span>Édité le</span>
                        <span className="font-medium text-foreground">
                          {formatDate(data.edite_le)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="success" appearance="light">
                        Référentiel {data.referentiel.version} en vigueur
                      </Badge>
                      {data.prochaine_version && (
                        <Badge variant="primary" appearance="light">
                          {data.prochaine_version.version} au{' '}
                          {formatDate(data.prochaine_version.en_vigueur_le)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold text-foreground tabular-nums">
                        {counts.DEMONTRABLE}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        indicateurs démontrables sur {applicable.length}{' '}
                        applicables
                      </span>
                    </div>
                    <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
                      {STATE_BAR.filter((s) => counts[s.key]).map((s) => (
                        <div
                          key={s.key}
                          className={cn('h-full', s.bar)}
                          style={{ flexGrow: counts[s.key] }}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {STATE_BAR.map((s) => (
                        <span
                          key={s.key}
                          className="inline-flex items-center gap-1.5"
                        >
                          <span className={cn('size-2 rounded-full', s.bar)} />
                          {s.label} :{' '}
                          <span className="font-medium text-foreground">
                            {counts[s.key]}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {data.prochaine_version && (changes > 0 || created > 0) && (
                    <div className="flex items-start gap-2 rounded-md bg-blue-50/60 dark:bg-blue-950/30 p-3 text-sm text-foreground">
                      <Sparkles className="size-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>
                        Au {formatDate(data.prochaine_version.en_vigueur_le)},
                        le référentiel {data.prochaine_version.version} modifie
                        le fond de {changes} exigence{changes > 1 ? 's' : ''}
                        {created > 0
                          ? ` et crée ${created} indicateur${created > 1 ? 's' : ''}`
                          : ''}
                        . Chaque fiche concernée montre le nouveau texte, ajouts
                        surlignés.
                      </span>
                    </div>
                  )}
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />{' '}
                    {data.avertissement}
                  </p>
                </CardContent>
              </Card>

              <Card className="print:hidden">
                <CountedTabs
                  tabs={tabs}
                  value={criterion}
                  onChange={setCriterion}
                />
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="carnet-na"
                      size="sm"
                      checked={showNa}
                      onCheckedChange={setShowNa}
                    />
                    <Label htmlFor="carnet-na" className="text-xs font-normal">
                      Indicateurs sans objet
                    </Label>
                  </div>
                  {data.prochaine_version && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="carnet-v"
                        size="sm"
                        checked={onlyChanges}
                        onCheckedChange={setOnlyChanges}
                      />
                      <Label htmlFor="carnet-v" className="text-xs font-normal">
                        Seulement ce qui change au{' '}
                        {formatDate(data.prochaine_version.en_vigueur_le)}
                      </Label>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground ms-auto">
                    {shown.length} fiches
                  </span>
                </div>
              </Card>

              <div className="space-y-5">
                {shown.map((f) => (
                  <Fiche
                    key={f.numero}
                    fiche={f}
                    next={data.prochaine_version}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Sources : {data.referentiel.source}
                {data.prochaine_version
                  ? ` ; ${data.prochaine_version.source}`
                  : ''}
              </p>
            </>
          )}
        </div>
      </Content>
    </>
  );
}
