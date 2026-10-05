'use client';

// Ressources pédagogiques (indicateur 19) : les supports, cours, quiz et cas pratiques de chaque formation,
// leur origine, les droits de réutilisation et leur état. Même données que l'onglet « Contenus » de la fiche
// formation, vues pour toute l'offre.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Library, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { TONE } from '@/lib/gsms/labels';
import {
  useResourceDelete,
  useResourceSave,
  useTrainingResources,
  type TrainingResource,
} from '@/lib/gsms/offre';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  optionLabel,
  RESOURCE_KINDS,
  RESOURCE_ORIGINS,
  RESOURCE_RIGHTS,
  RESOURCE_STATUS,
} from '@/components/edof/labels';
import { RESOURCE_FIELDS } from '@/components/edof/resource-fields';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { ConfirmDialog } from '@/components/resource/confirm-dialog';
import { ResourceFormSheet } from '@/components/resource/resource-form-sheet';
import type { FieldDef } from '@/components/resource/types';

const ALL = 'toutes';

const RIGHTS_TONE: Record<string, string> = {
  PROPRIETAIRE: TONE.ok,
  LICENCE: TONE.ok,
  A_VERIFIER: TONE.warn,
  INTERDIT: TONE.danger,
};
const STATUS_TONE: Record<string, string> = {
  VALIDE: TONE.ok,
  A_REDIGER: TONE.danger,
  BROUILLON: TONE.neutral,
};

function ResourceRow({
  r,
  canEdit,
  onEdit,
  onDelete,
}: {
  r: TrainingResource;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium grow min-w-0 basis-48">{r.title}</span>
        <Badge variant="outline" size="sm">
          {optionLabel(RESOURCE_KINDS, r.kind)}
        </Badge>
        <Badge size="sm" className={RIGHTS_TONE[r.rights]}>
          Droits : {optionLabel(RESOURCE_RIGHTS, r.rights)}
        </Badge>
        <Badge size="sm" className={STATUS_TONE[r.status]}>
          {optionLabel(RESOURCE_STATUS, r.status)}
        </Badge>
        {canEdit && (
          <span className="flex">
            <Button
              size="sm"
              variant="ghost"
              mode="icon"
              aria-label={`Modifier ${r.title}`}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              mode="icon"
              aria-label={`Supprimer ${r.title}`}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {optionLabel(RESOURCE_ORIGINS, r.origin)}
        {r.module_code ? ` · ${r.module_code}` : ''}
        {r.source_ref ? ` · ${r.source_ref}` : ''}
        {r.note && <span className="block">{r.note}</span>}
      </div>
    </li>
  );
}

export default function ResourcesPage() {
  const { data, isLoading, error } = useTrainingResources();
  const save = useResourceSave();
  const remove = useResourceDelete();
  const [status, setStatus] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<TrainingResource | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<TrainingResource | null>(null);
  const canEdit = Boolean(data?.capabilities.ecrire.allowed);
  const rows = useMemo(() => data?.ressources ?? [], [data]);
  const programs = useMemo(() => data?.formations ?? [], [data]);

  const byStatus = (s: string) =>
    rows.filter((r) => s === ALL || r.status === s).length;
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = rows.filter(
      (r) =>
        (status === ALL || r.status === status) &&
        (program === ALL || r.program_id === program) &&
        (!q ||
          [
            r.title,
            r.program_code,
            r.program_title,
            r.source_ref,
            r.module_code,
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    return programs
      .map((p) => ({ ...p, items: kept.filter((r) => r.program_id === p.id) }))
      .filter((g) => g.items.length);
  }, [rows, programs, status, program, query]);

  const createFields: FieldDef[] = [
    {
      name: 'program_id',
      label: 'Formation',
      type: 'select',
      required: true,
      options: programs.map((p) => ({
        value: p.id,
        label: `${p.code} · ${p.title}`,
      })),
      defaultValue: program !== ALL ? program : undefined,
    },
    ...RESOURCE_FIELDS,
  ];

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Library className="size-4 text-primary" />
          Ressources pédagogiques
          {data && (
            <span className="text-xs font-normal text-muted-foreground">
              {rows.length} ressource{rows.length > 1 ? 's' : ''}
            </span>
          )}
        </h1>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus /> Nouvelle ressource
          </Button>
        )}
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <p className="text-sm text-muted-foreground max-w-3xl">
            Supports, cours, quiz et cas pratiques mis à disposition des
            stagiaires, formation par formation, avec leur origine et les droits
            de réutilisation. Les contenus repris du LMS GSMS School ont été
            générés automatiquement : ils restent «&nbsp;à rédiger&nbsp;» tant
            qu’un formateur ne les a pas écrits.
          </p>
          <Refusal error={error} />
          <Tabs
            value={status}
            onValueChange={setStatus}
            className="text-sm min-w-0"
          >
            <TabsList
              variant="line"
              className="w-0 min-w-full gap-6 bg-transparent justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&_button]:border-b [&_button]:text-secondary-foreground"
            >
              <TabsTrigger value={ALL}>Toutes ({byStatus(ALL)})</TabsTrigger>
              {RESOURCE_STATUS.map((s) => (
                <TabsTrigger key={s.value} value={s.value}>
                  {s.label} ({byStatus(s.value)})
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={status} className="pt-5 space-y-5">
              <div className="flex flex-wrap gap-2.5">
                <div className="relative grow basis-60 max-w-sm">
                  <Search className="size-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Rechercher une ressource…"
                    aria-label="Rechercher une ressource"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="ps-9"
                  />
                  {query && (
                    <Button
                      mode="icon"
                      variant="ghost"
                      size="sm"
                      aria-label="Effacer la recherche"
                      className="absolute end-1.5 top-1/2 -translate-y-1/2 h-6 w-6"
                      onClick={() => setQuery('')}
                    >
                      <X />
                    </Button>
                  )}
                </div>
                <Select value={program} onValueChange={setProgram}>
                  <SelectTrigger
                    className="grow basis-60 max-w-sm"
                    aria-label="Formation"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Toutes les formations</SelectItem>
                    {programs.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} · {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-28" />
                  <Skeleton className="h-28" />
                </div>
              ) : groups.length ? (
                <div className="space-y-5">
                  {groups.map((g) => (
                    <section key={g.id} className="space-y-2">
                      <h2 className="text-sm font-semibold text-foreground">
                        <Link
                          href={`/formation/edof/${g.id}`}
                          className="hover:text-primary"
                        >
                          <span className="text-muted-foreground font-normal">
                            {g.code} ·{' '}
                          </span>
                          {g.title}
                        </Link>
                      </h2>
                      <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
                        {g.items.map((r) => (
                          <ResourceRow
                            key={r.id}
                            r={r}
                            canEdit={canEdit}
                            onEdit={() => setEditing(r)}
                            onDelete={() => setDeleting(r)}
                          />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                data && (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                      <Library className="size-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground max-w-md">
                        {rows.length
                          ? 'Aucune ressource ne correspond aux filtres.'
                          : 'Aucune ressource pédagogique enregistrée pour l’instant.'}
                      </p>
                    </CardContent>
                  </Card>
                )
              )}
            </TabsContent>
          </Tabs>
        </div>
      </Content>
      <ResourceFormSheet
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        title={editing ? 'Modifier la ressource' : 'Nouvelle ressource'}
        icon={Library}
        fields={editing ? RESOURCE_FIELDS : createFields}
        row={editing ?? null}
        pending={save.isPending}
        onSubmit={({ program_id, ...body }) =>
          save.mutateAsync(
            {
              programId: editing ? editing.program_id : String(program_id),
              id: editing?.id,
              body,
            },
            {
              onSuccess: () => toast.success('Ressource enregistrée.'),
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Supprimer la ressource"
        description={`« ${deleting?.title ?? ''} » sera retirée de la formation ${deleting?.program_code ?? ''}.`}
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(
            { programId: deleting.program_id, id: deleting.id },
            {
              onSuccess: () => {
                toast.success('Ressource supprimée.');
                setDeleting(null);
              },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </>
  );
}
