'use client';

import { useState } from 'react';
import {
  BookOpen,
  ListOrdered,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  edofApi,
  useEdofMutation,
  type Fiche,
  type ProgramModule,
} from '@/lib/gsms/edof';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ActionGate } from '@/components/gsms/action-gate';
import { Refusal } from '@/components/gsms/refusal';
import { ResourceFormSheet } from '@/components/resource/resource-form-sheet';
import type { FieldDef } from '@/components/resource/types';

// Listes saisies une ligne par entrée (une virgule peut faire partie d'un prérequis).
const LISTS = ['objectives', 'skills', 'prerequisites'];

const FIELD_LABEL: Record<string, string> = {
  title: 'Intitulé',
  audience: 'Public visé',
  skills: 'Compétences visées',
  objectives: 'Objectifs',
  prerequisites: 'Prérequis',
  duration_hours: 'Durée (heures)',
  delivery_mode: 'Modalité',
  content: 'Résumé du contenu',
  teaching_methods: 'Méthodes pédagogiques',
  teaching_means: 'Moyens pédagogiques et techniques',
  evaluation_methods: 'Modalités d’évaluation',
  access_delay: 'Délai d’accès',
  accessibility_info: 'Accessibilité',
  price_eur: 'Tarif (€)',
  certification_alignment: 'Adéquation à la certification',
  basis: 'Fondement CPF',
};

function fields(fiche: Fiche): FieldDef[] {
  return [
    { name: 'title', label: 'Intitulé', type: 'text', required: true },
    {
      name: 'duration_hours',
      label: 'Durée (heures)',
      type: 'number',
      span: 1,
    },
    { name: 'price_eur', label: 'Tarif (€ HT)', type: 'number', span: 1 },
    {
      name: 'delivery_mode',
      label: 'Modalité',
      type: 'select',
      options: Object.entries(fiche.delivery_modes).map(([value, label]) => ({
        value,
        label,
      })),
      span: 1,
    },
    { name: 'access_delay', label: 'Délai d’accès', type: 'text', span: 1 },
    { name: 'audience', label: 'Public visé', type: 'textarea' },
    {
      name: 'objectives',
      label: 'Objectifs opérationnels',
      type: 'textarea',
      help: 'Un objectif par ligne (indicateur 5).',
    },
    {
      name: 'skills',
      label: 'Compétences visées',
      type: 'textarea',
      help: 'Une compétence par ligne, reprises du référentiel.',
    },
    {
      name: 'prerequisites',
      label: 'Prérequis',
      type: 'textarea',
      help: 'Un prérequis par ligne ; « Aucun » s’il n’y en a pas.',
    },
    {
      name: 'content',
      label: 'Résumé du contenu',
      type: 'textarea',
      help: 'Le détail est dans les modules.',
    },
    {
      name: 'teaching_methods',
      label: 'Méthodes pédagogiques',
      type: 'textarea',
    },
    {
      name: 'teaching_means',
      label: 'Moyens pédagogiques et techniques',
      type: 'textarea',
    },
    {
      name: 'evaluation_methods',
      label: 'Modalités d’évaluation',
      type: 'textarea',
    },
    {
      name: 'accessibility_info',
      label: 'Accessibilité aux personnes en situation de handicap',
      type: 'textarea',
    },
    {
      name: 'certification_alignment',
      label: 'Adéquation à la certification',
      type: 'textarea',
    },
  ];
}

function toRow(fiche: Fiche) {
  const p = fiche.program;
  const out: Record<string, unknown> = { ...p };
  for (const k of LISTS)
    out[k] = Array.isArray(p[k]) ? (p[k] as string[]).join('\n') : '';
  return out as { id: string };
}

function toPatch(payload: Record<string, unknown>) {
  const out = { ...payload };
  for (const k of LISTS)
    if (k in out)
      out[k] = String(out[k] ?? '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
  return out;
}

function ModulesDialog({
  fiche,
  open,
  onClose,
}: {
  fiche: Fiche;
  open: boolean;
  onClose: () => void;
}) {
  const [modules, setModules] = useState<(ProgramModule & { text: string })[]>(
    () =>
      fiche.program.modules.map((m) => ({
        ...m,
        text: (m.details ?? []).join('\n'),
      })),
  );
  const save = useEdofMutation(() =>
    edofApi.patchProgram(fiche.program.id, {
      modules: modules.map((m) => ({
        code: m.code.trim(),
        title: m.title.trim(),
        details: m.text
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
        hours: m.hours ? Number(String(m.hours).replace(',', '.')) : null,
      })),
    }),
  );
  const update = (
    i: number,
    patch: Partial<ProgramModule & { text: string }>,
  ) => setModules(modules.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modules du programme</DialogTitle>
          <DialogDescription>
            Code, intitulé, points de contenu (un par ligne) et durée.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 max-h-[60dvh] overflow-y-auto">
          {modules.map((m, i) => (
            <div
              key={i}
              className="rounded-md border border-border p-2.5 space-y-2"
            >
              <div className="grid grid-cols-[5rem_1fr_5rem_auto] gap-2 items-center">
                <Input
                  aria-label="Code"
                  value={m.code}
                  onChange={(e) => update(i, { code: e.target.value })}
                />
                <Input
                  aria-label="Intitulé"
                  value={m.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                />
                <Input
                  aria-label="Heures"
                  inputMode="decimal"
                  placeholder="h"
                  value={m.hours ?? ''}
                  onChange={(e) =>
                    update(i, { hours: e.target.value as unknown as number })
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  mode="icon"
                  aria-label="Retirer le module"
                  onClick={() => setModules(modules.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
              <Textarea
                aria-label="Contenu"
                rows={2}
                value={m.text}
                onChange={(e) => update(i, { text: e.target.value })}
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setModules([
                ...modules,
                {
                  code: `UV${modules.length + 1}`,
                  title: '',
                  details: [],
                  text: '',
                },
              ])
            }
          >
            <Plus /> Ajouter un module
          </Button>
          <Refusal error={save.error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Modules enregistrés.');
                  onClose();
                },
              })
            }
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Value({ v }: { v: unknown }) {
  if (Array.isArray(v))
    return v.length ? (
      <ul className="list-disc ps-4">
        {v.map((x, i) => (
          <li key={i}>{String(x)}</li>
        ))}
      </ul>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  if (v === null || v === undefined || v === '')
    return <span className="text-muted-foreground">—</span>;
  return <span className="whitespace-pre-line">{String(v)}</span>;
}

export function ProgrammeTab({
  fiche,
  highlight,
}: {
  fiche: Fiche;
  highlight?: string | null;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const [note, setNote] = useState('');
  const save = useEdofMutation((body: Record<string, unknown>) =>
    edofApi.patchProgram(fiche.program.id, toPatch(body)),
  );
  const validate = useEdofMutation(() =>
    edofApi.validateFiche(fiche.program.id, note || undefined),
  );
  const p = fiche.program;
  const vs = fiche.version_state;
  const order = [
    'audience',
    'objectives',
    'skills',
    'prerequisites',
    'duration_hours',
    'delivery_mode',
    'teaching_methods',
    'teaching_means',
    'evaluation_methods',
    'access_delay',
    'accessibility_info',
    'price_eur',
    'content',
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {vs.state === 'VALIDEE' ? (
          <Badge variant="success" appearance="light">
            Version {vs.version} validée par {vs.validated_by}, le{' '}
            {formatDate(vs.validated_at)}
          </Badge>
        ) : vs.state === 'MODIFIEE' ? (
          <Badge variant="warning" appearance="light">
            Modifiée depuis la version {vs.version}
          </Badge>
        ) : (
          <Badge variant="destructive" appearance="light">
            Programme non validé
          </Badge>
        )}
        <div className="flex flex-wrap gap-2 ms-auto">
          {fiche.capabilities.edit?.allowed && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditOpen(true)}
              >
                <Pencil /> Modifier la fiche
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModulesOpen(true)}
              >
                <ListOrdered /> Modules
              </Button>
            </>
          )}
          <ActionGate
            decision={fiche.capabilities.validate}
            size="sm"
            onRun={() => setValidateOpen(true)}
          >
            <ShieldCheck /> Valider une version
          </ActionGate>
        </div>
      </div>

      {p.review_notes.length > 0 && (
        <Alert appearance="light" variant="warning" size="sm">
          <AlertIcon>
            <TriangleAlert />
          </AlertIcon>
          <div>
            <AlertTitle>Points à arbitrer avant validation</AlertTitle>
            <AlertDescription>
              <ul className="list-disc ps-4 mt-1 space-y-1">
                {p.review_notes.map((n, i) => (
                  <li key={i}>
                    <span className="font-medium">
                      {FIELD_LABEL[n.champ] ?? n.champ} :
                    </span>{' '}
                    {n.message}
                    <span className="block opacity-80">
                      Source : {n.source}
                    </span>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </div>
        </Alert>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-[minmax(0,13rem)_1fr] gap-x-4 gap-y-2 text-sm">
        {order.map((k) => (
          <div
            key={k}
            id={`champ-${k}`}
            className={`contents ${highlight === k ? '[&>*]:bg-primary/5' : ''}`}
          >
            <dt className="text-muted-foreground scroll-mt-24">
              {FIELD_LABEL[k]}
              {fiche.missing.some((m) => m.field === k) && (
                <span className="text-destructive"> · manquant</span>
              )}
            </dt>
            <dd className="min-w-0 break-words max-sm:mb-2">
              <Value
                v={
                  k === 'delivery_mode'
                    ? fiche.delivery_modes[p[k] as string]
                    : p[k]
                }
              />
            </dd>
          </div>
        ))}
      </dl>

      <section id="champ-modules" className="space-y-2 scroll-mt-24">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="size-4 text-primary" /> Contenu détaillé (
          {p.modules.length} modules)
        </h3>
        {p.modules.length ? (
          <ol className="divide-y divide-border rounded-md border border-border text-sm">
            {p.modules.map((m) => (
              <li key={m.code} className="px-3 py-2">
                <div className="font-medium">
                  {m.code} — {m.title}
                  {m.hours ? (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      · {m.hours} h
                    </span>
                  ) : null}
                </div>
                {m.details?.length > 0 && (
                  <ul className="list-disc ps-4 text-muted-foreground text-xs mt-0.5">
                    {m.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun module.</p>
        )}
      </section>

      <ResourceFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Fiche formation"
        icon={BookOpen}
        fields={fields(fiche)}
        row={toRow(fiche)}
        pending={save.isPending}
        onSubmit={(payload) =>
          save.mutateAsync(payload, {
            onSuccess: () => toast.success('Fiche enregistrée.'),
            onError: (e) => toast.error(e.message),
          })
        }
      />
      {modulesOpen && (
        <ModulesDialog
          fiche={fiche}
          open={modulesOpen}
          onClose={() => setModulesOpen(false)}
        />
      )}
      <Dialog open={validateOpen} onOpenChange={setValidateOpen}>
        <DialogContent className="max-sm:max-w-[calc(100vw-1rem)]">
          <DialogHeader>
            <DialogTitle>Valider une version de la fiche</DialogTitle>
            <DialogDescription>
              La version est figée : le programme rédigé, l’aperçu et le dossier
              EDOF en seront tirés. Une modification ultérieure demandera une
              nouvelle validation, sans rien changer à ce qui a déjà été émis ou
              déposé.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            <Label htmlFor="validate-note">Commentaire (facultatif)</Label>
            <Textarea
              id="validate-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Refusal error={validate.error} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={validate.isPending}
              onClick={() =>
                validate.mutate(undefined, {
                  onSuccess: () => {
                    toast.success('Version validée.');
                    setValidateOpen(false);
                  },
                })
              }
            >
              Valider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
