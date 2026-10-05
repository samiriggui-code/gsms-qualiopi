'use client';

// Catalogue des formations, sur le modèle des pages formations de GSMS School : indicateurs, filtres par
// filière et parcours, vue en grille (visuels des fiches vitrine) ou en liste, fiche détaillée en panneau.
// Les comptes et états viennent de /formation/catalogue ; l'écran n'en recalcule aucun.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CalendarDays,
  CircleCheckBig,
  Clock,
  LayoutGrid,
  List,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  euros,
  frDate,
  hours,
  useCatalogue,
  type Catalogue,
  type CatalogueFormation,
} from '@/lib/gsms/catalogue';
import { TONE } from '@/lib/gsms/labels';
import { useResourceMutations } from '@/lib/resource';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FICHE_STATE,
  FormationSheet,
} from '@/components/catalogue/formation-sheet';
import { FormationVisual } from '@/components/catalogue/formation-visual';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow, type KpiItem } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';
import { ConfirmDialog } from '@/components/resource/confirm-dialog';
import { ResourceFormSheet } from '@/components/resource/resource-form-sheet';
import type { FieldDef } from '@/components/resource/types';

const ALL = 'toutes';

function kpis(data: Catalogue): KpiItem[] {
  const t = data.totaux;
  return [
    {
      icon: BookOpen,
      label: 'Formations',
      value: t.formations,
      subtitle: `${data.filieres.length} filière${data.filieres.length > 1 ? 's' : ''} au catalogue`,
    },
    {
      icon: CalendarDays,
      label: 'Sessions à venir',
      value: t.sessions_a_venir,
      subtitle: 'Planifiées ou confirmées',
    },
    {
      icon: Award,
      label: 'Certification identifiée',
      value: t.certification_identifiee,
      subtitle: `RNCP ou RS déclaré, sur ${t.formations}`,
    },
    {
      icon: CircleCheckBig,
      label: 'Fiches validées',
      value: t.fiches_validees,
      subtitle: `Version figée à jour, sur ${t.formations}`,
    },
    {
      icon: AlertTriangle,
      label: 'Points à arbitrer',
      value: t.points_a_arbitrer,
      subtitle: `Sur ${t.formations_a_arbitrer} formation${t.formations_a_arbitrer > 1 ? 's' : ''}`,
    },
  ];
}

function NextSession({ f }: { f: CatalogueFormation }) {
  return (
    <span className="flex min-w-0 flex-col items-start text-start">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Prochaine session
      </span>
      <span className="truncate text-xs font-medium text-foreground/80">
        {f.sessions.prochaine
          ? frDate(f.sessions.prochaine.start_date)
          : 'Aucune planifiée'}
      </span>
    </span>
  );
}

function FormationCard({
  f,
  onOpen,
}: {
  f: CatalogueFormation;
  onOpen: () => void;
}) {
  return (
    <Card className="group overflow-hidden border-border shadow-none transition-all duration-300 hover:border-primary/50">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-start cursor-pointer"
        aria-label={`Ouvrir la fiche ${f.title}`}
      >
        <FormationVisual
          slug={f.catalog_slug}
          track={f.track}
          code={f.code}
          className="aspect-[16/10] w-full border-b border-border"
        />
      </button>
      <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              TONE.info,
              'text-[10px] font-bold uppercase tracking-wide',
            )}
          >
            {f.track_label}
          </Badge>
          {f.pathway && f.pathway !== 'AUTRE' && (
            <Badge
              size="sm"
              className={cn(
                TONE.ok,
                'text-[10px] font-bold uppercase tracking-wide',
              )}
            >
              {f.pathway}
            </Badge>
          )}
          <Badge size="sm" variant="outline" className="text-[10px]">
            {f.code}
          </Badge>
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={onOpen}
            className="line-clamp-2 text-start font-semibold text-foreground transition-colors group-hover:text-primary cursor-pointer"
          >
            {f.title}
          </button>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {hours(f.duration_hours) ?? 'Durée à fixer'}
            </span>
            {f.audience && (
              <span className="truncate max-w-full">{f.audience}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge size="sm" className={FICHE_STATE[f.fiche].color}>
            {FICHE_STATE[f.fiche].label}
          </Badge>
          {f.points_a_arbitrer > 0 && (
            <Badge size="sm" className={TONE.warn}>
              {f.points_a_arbitrer} à arbitrer
            </Badge>
          )}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-dashed border-border pt-3">
          <NextSession f={f} />
          <span className="text-end">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tarif
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {euros(f.price_eur) ?? '—'}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function FormationRow({
  f,
  onOpen,
}: {
  f: CatalogueFormation;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-4 text-start hover:bg-accent/40 cursor-pointer"
      >
        <span className="flex min-w-0 grow basis-72 items-center gap-3">
          <FormationVisual
            slug={f.catalog_slug}
            track={f.track}
            code={f.code}
            compact
            className="size-11 rounded-xl border border-border"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground line-clamp-2">
              {f.title}
            </span>
            <span className="block text-xs text-muted-foreground">
              {f.code} · {f.track_label}
              {f.pathway_label ? ` · ${f.pathway_label}` : ''}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground ms-14 sm:ms-0">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="size-3" />
            {hours(f.duration_hours) ?? '—'}
          </span>
          <span className="font-medium text-foreground tabular-nums w-16 text-end">
            {euros(f.price_eur) ?? '—'}
          </span>
          <span className="w-28">
            {f.sessions.a_venir
              ? `${f.sessions.a_venir} session${f.sessions.a_venir > 1 ? 's' : ''} à venir`
              : 'Aucune session'}
          </span>
          <Badge size="sm" className={FICHE_STATE[f.fiche].color}>
            {FICHE_STATE[f.fiche].label}
          </Badge>
          {f.points_a_arbitrer > 0 && (
            <Badge size="sm" className={TONE.warn}>
              {f.points_a_arbitrer} à arbitrer
            </Badge>
          )}
        </span>
      </button>
    </li>
  );
}

export default function ProgrammesPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useCatalogue();
  const { create, update, remove } = useResourceMutations('programs', {
    one: 'La formation',
    created: 'créée',
    updated: 'modifiée',
    deleted: 'supprimée',
  });
  const [track, setTrack] = useState(ALL);
  const [pathway, setPathway] = useState(ALL);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogueFormation | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<CatalogueFormation | null>(null);
  const canEdit = Boolean(data?.capabilities.ecrire.allowed);
  const rows = useMemo(() => data?.formations ?? [], [data]);
  const opened = rows.find((r) => r.id === openId) ?? null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (track === ALL || r.track === track) &&
        (pathway === ALL || r.pathway === pathway) &&
        (!q ||
          [r.code, r.title, r.audience, r.track_label]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
  }, [rows, track, pathway, query]);

  const fields: FieldDef[] = useMemo(() => {
    const opts = (o: Record<string, string> | undefined) =>
      Object.entries(o ?? {}).map(([value, label]) => ({ value, label }));
    return [
      {
        name: 'code',
        label: 'Code',
        type: 'text',
        required: true,
        span: 1,
        placeholder: 'Ex. SSIAP1-INI',
      },
      {
        name: 'duration_hours',
        label: 'Durée (heures)',
        type: 'number',
        span: 1,
      },
      { name: 'title', label: 'Intitulé', type: 'text', required: true },
      {
        name: 'track',
        label: 'Filière',
        type: 'select',
        span: 1,
        options: opts(data?.libelles.filieres),
      },
      {
        name: 'pathway',
        label: 'Parcours',
        type: 'select',
        span: 1,
        options: opts(data?.libelles.parcours),
      },
      { name: 'price_eur', label: 'Tarif (€)', type: 'number', span: 1 },
      {
        name: 'delivery_mode',
        label: 'Modalité',
        type: 'select',
        span: 1,
        options: opts(data?.libelles.modalites),
      },
      { name: 'audience', label: 'Public visé', type: 'text' },
      { name: 'content', label: 'Présentation', type: 'textarea' },
      { name: 'access_delay', label: "Délai d'accès", type: 'text', span: 1 },
      {
        name: 'public_info_reviewed_on',
        label: 'Fiche relue le',
        type: 'date',
        span: 1,
      },
      {
        name: 'is_certifying',
        label: 'Formation certifiante',
        type: 'boolean',
      },
    ];
  }, [data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['formation'] });

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <BookOpen className="size-4 text-primary" />
          Catalogue des formations
          {data && (
            <span className="text-xs font-normal text-muted-foreground">
              {rows.length} formation{rows.length > 1 ? 's' : ''}
            </span>
          )}
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5 lg:space-y-7">
          <Refusal error={error} />
          <PageHero
            eyebrow="Offre de formation"
            icon={BookOpen}
            title="Catalogue des formations"
            description="Chaque fiche réunit le programme, les prérequis, l’évaluation, les sessions et les points encore à arbitrer."
            actions={
              canEdit && (
                <Button onClick={() => setEditing(null)}>
                  <Plus /> Nouvelle formation
                </Button>
              )
            }
          />
          {(isLoading || data) && (
            <KpiRow items={data ? kpis(data) : []} loading={isLoading} />
          )}

          <Card className="shadow-none">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-foreground">
                  Liste des formations
                </h2>
                <p className="text-xs text-muted-foreground">
                  Les formations reprises de GSMS School gardent leurs écarts à
                  trancher.
                </p>
              </div>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher une formation, un code, un public…"
                  aria-label="Rechercher une formation"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10 ps-9"
                />
                {query && (
                  <Button
                    mode="icon"
                    variant="ghost"
                    size="sm"
                    aria-label="Effacer la recherche"
                    className="absolute end-1.5 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setQuery('')}
                  >
                    <X />
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div
                  role="group"
                  aria-label="Filtrer par filière"
                  className="flex flex-wrap gap-1 rounded-lg border border-border bg-accent p-1"
                >
                  {[
                    {
                      value: ALL,
                      label: 'Toutes filières',
                      count: rows.length,
                    },
                    ...(data?.filieres ?? []),
                  ].map((t) => (
                    <Button
                      key={t.value}
                      type="button"
                      size="sm"
                      aria-pressed={track === t.value}
                      variant={track === t.value ? 'secondary' : 'ghost'}
                      className={cn(
                        'text-xs sm:text-sm',
                        track === t.value && 'bg-background shadow-xs',
                      )}
                      onClick={() => setTrack(t.value)}
                    >
                      {t.label}
                      <span className="text-secondary-foreground tabular-nums">
                        {t.count}
                      </span>
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Select value={pathway} onValueChange={setPathway}>
                    <SelectTrigger
                      className="h-10 grow sm:w-[230px]"
                      aria-label="Parcours"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Tous parcours</SelectItem>
                      {(data?.parcours ?? []).map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label} ({p.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex h-10 items-center gap-1 rounded-lg border bg-muted/50 p-1">
                    <Button
                      type="button"
                      size="sm"
                      mode="icon"
                      variant={view === 'grid' ? 'secondary' : 'ghost'}
                      aria-label="Vue en grille"
                      aria-pressed={view === 'grid'}
                      className={cn(
                        'h-8 w-8',
                        view === 'grid' && 'bg-background shadow-xs',
                      )}
                      onClick={() => setView('grid')}
                    >
                      <LayoutGrid />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      mode="icon"
                      variant={view === 'list' ? 'secondary' : 'ghost'}
                      aria-label="Vue en liste"
                      aria-pressed={view === 'list'}
                      className={cn(
                        'h-8 w-8',
                        view === 'list' && 'bg-background shadow-xs',
                      )}
                      onClick={() => setView('list')}
                    >
                      <List />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-80" />
              ))}
            </div>
          ) : !shown.length ? (
            data && (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <BookOpen className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground max-w-md">
                    {rows.length
                      ? 'Aucune formation ne correspond aux filtres.'
                      : 'Aucune formation enregistrée. Les formations de Form’SSI s’importent avec les commandes import-formssi et import-gsms-school.'}
                  </p>
                </CardContent>
              </Card>
            )
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {shown.map((f) => (
                <FormationCard
                  key={f.id}
                  f={f}
                  onOpen={() => setOpenId(f.id)}
                />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {shown.map((f) => (
                <FormationRow key={f.id} f={f} onOpen={() => setOpenId(f.id)} />
              ))}
            </ul>
          )}
        </div>
      </Content>

      <FormationSheet
        formation={opened}
        open={opened !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
        canEdit={canEdit}
        onEdit={() => setEditing(opened)}
        onDelete={() => setDeleting(opened)}
      />
      <ResourceFormSheet
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        title={editing ? 'Modifier la formation' : 'Nouvelle formation'}
        icon={BookOpen}
        fields={fields}
        row={
          editing
            ? { ...editing, public_info_reviewed_on: editing.fiche_relue_le }
            : null
        }
        pending={create.isPending || update.isPending}
        onSubmit={(payload) =>
          (editing
            ? update.mutateAsync({ id: editing.id, payload })
            : create.mutateAsync(payload)
          ).then(refresh)
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Supprimer la formation"
        description={
          deleting?.sessions.total
            ? `« ${deleting.title} » et ses ${deleting.sessions.total} session(s), avec tous leurs dossiers, seront supprimés.`
            : `« ${deleting?.title ?? ''} » sera supprimée du catalogue.`
        }
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              setOpenId(null);
              refresh();
            },
          })
        }
      />
    </>
  );
}
