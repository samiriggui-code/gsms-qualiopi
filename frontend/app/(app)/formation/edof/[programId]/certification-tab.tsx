'use client';

import { useState } from 'react';
import {
  Award,
  ExternalLink,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import { edofApi, useEdofMutation, type Fiche } from '@/lib/gsms/edof';
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
import { Refusal } from '@/components/gsms/refusal';
import { ResourceFormSheet } from '@/components/resource/resource-form-sheet';
import type { FieldDef } from '@/components/resource/types';

type Row = { competence: string; modules: string; evaluation: string };

function fields(fiche: Fiche): FieldDef[] {
  return [
    {
      name: 'basis',
      label: 'Fondement de l’éligibilité au CPF',
      type: 'select',
      required: true,
      options: Object.entries(fiche.certification_bases).map(
        ([value, label]) => ({ value, label }),
      ),
    },
    {
      name: 'code',
      label: 'Code de la fiche (RNCP… / RS…)',
      type: 'text',
      span: 1,
    },
    {
      name: 'registration_end',
      label: 'Échéance de l’enregistrement',
      type: 'date',
      span: 1,
    },
    { name: 'title', label: 'Intitulé de la certification', type: 'text' },
    { name: 'certifier', label: 'Certificateur', type: 'text' },
    {
      name: 'source_url',
      label: 'Lien de la fiche France compétences',
      type: 'text',
    },
    {
      name: 'habilitation',
      label: 'Ce que le certificateur autorise l’établissement à faire',
      type: 'select',
      required: true,
      options: Object.entries(fiche.habilitations).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      name: 'partner_siret',
      label: 'SIRET référencé chez le certificateur',
      type: 'text',
      span: 1,
    },
    {
      name: 'evaluator_name',
      label: 'Organisme qui organise l’évaluation',
      type: 'text',
      span: 1,
    },
    { name: 'note', label: 'Remarques', type: 'textarea' },
  ];
}

function MappingDialog({
  fiche,
  open,
  onClose,
}: {
  fiche: Fiche;
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    (fiche.certification?.competence_mapping ?? []).map((r) => ({
      competence: r.competence,
      modules: (r.modules ?? []).join(', '),
      evaluation: r.evaluation ?? '',
    })),
  );
  const save = useEdofMutation(() =>
    edofApi.putCertification(fiche.program.id, {
      competence_mapping: rows
        .filter((r) => r.competence.trim())
        .map((r) => ({
          competence: r.competence.trim(),
          modules: r.modules
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          evaluation: r.evaluation.trim(),
        })),
    }),
  );
  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Correspondance compétences, programme, évaluation
          </DialogTitle>
          <DialogDescription>
            Pour chaque compétence ou bloc du référentiel de la certification :
            les modules qui la travaillent (codes séparés par des virgules) et
            la modalité d’évaluation.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 max-h-[60dvh] overflow-y-auto">
          {rows.map((r, i) => (
            <div
              key={i}
              className="rounded-md border border-border p-2.5 space-y-2"
            >
              <div className="flex gap-2">
                <Input
                  aria-label="Compétence"
                  placeholder="Compétence ou bloc"
                  value={r.competence}
                  onChange={(e) => update(i, { competence: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  mode="icon"
                  aria-label="Retirer"
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
              <Input
                aria-label="Modules"
                placeholder="Modules : UV1, UV8"
                value={r.modules}
                onChange={(e) => update(i, { modules: e.target.value })}
              />
              <Input
                aria-label="Évaluation"
                placeholder="Modalité d’évaluation"
                value={r.evaluation}
                onChange={(e) => update(i, { evaluation: e.target.value })}
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRows([
                ...rows,
                { competence: '', modules: '', evaluation: '' },
              ])
            }
          >
            <Plus /> Ajouter une compétence
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
                  toast.success('Correspondance enregistrée.');
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

function Checked({
  on,
  by,
}: {
  on: string | null | undefined;
  by: string | null | undefined;
}) {
  return on ? (
    <Badge variant="success" appearance="light" size="sm">
      Vérifié le {formatDate(on)}
      {by ? ` par ${by}` : ''}
    </Badge>
  ) : (
    <Badge variant="warning" appearance="light" size="sm">
      Non vérifié
    </Badge>
  );
}

export function CertificationTab({ fiche }: { fiche: Fiche }) {
  const [editOpen, setEditOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const c = fiche.certification;
  const save = useEdofMutation((body: Record<string, unknown>) =>
    edofApi.putCertification(fiche.program.id, body),
  );
  const verify = useEdofMutation(
    ({ quoi, index }: { quoi: string; index?: number }) =>
      edofApi.verify(fiche.program.id, quoi, index),
  );
  const canVerify = fiche.capabilities.verify?.allowed;
  const canEdit = fiche.capabilities.edit?.allowed;

  function attest(quoi: string, index?: number) {
    verify.mutate(
      { quoi, index },
      {
        onSuccess: () => toast.success('Vérification attestée.'),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const rows: [string, React.ReactNode][] = c
    ? [
        ['Fondement CPF', fiche.certification_bases[c.basis] ?? c.basis],
        ['Code', (c.code as string) ?? '—'],
        ['Intitulé', (c.title as string) ?? '—'],
        ['Certificateur', (c.certifier as string) ?? '—'],
        [
          'Échéance de l’enregistrement',
          c.registration_end ? formatDate(c.registration_end as string) : '—',
        ],
        [
          'Habilitation de l’établissement',
          fiche.habilitations[c.habilitation] ?? c.habilitation,
        ],
        ['SIRET référencé', (c.partner_siret as string) ?? '—'],
        ['Évaluation organisée par', (c.evaluator_name as string) ?? '—'],
      ]
    : [];

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Qualiopi ne rend pas une formation éligible au CPF. Il faut une
        certification enregistrée (RNCP ou RS) ou un autre fondement légal, et,
        pour une certification, que l’établissement soit habilité par le
        certificateur. Former et organiser l’évaluation sont deux autorisations
        distinctes.
      </p>
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 grow">
            <Award className="size-4 text-primary" /> Certification visée
          </h3>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              <Pencil /> Modifier
            </Button>
          )}
        </div>
        {c ? (
          <dl
            id="champ-basis"
            className="grid grid-cols-1 sm:grid-cols-[minmax(0,14rem)_1fr] gap-x-4 gap-y-1.5 text-sm scroll-mt-24"
          >
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words max-sm:mb-1.5">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Certification non renseignée.
          </p>
        )}
        {c?.source_url ? (
          <a
            className="inline-flex items-center gap-1 text-sm text-primary"
            href={String(c.source_url)}
            target="_blank"
            rel="noreferrer"
          >
            Fiche France compétences <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </section>

      {c && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Vérifications
            humaines
          </h3>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            <li className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="grow min-w-0 basis-56">
                Validité et périmètre de la certification
                <span className="block text-xs text-muted-foreground">
                  État, échéance et certificateur relus sur France compétences.
                </span>
              </span>
              <Checked on={c.checked_on} by={c.checked_by} />
              {!c.checked_on && canVerify && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => attest('certification')}
                >
                  J’ai vérifié
                </Button>
              )}
            </li>
            <li className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="grow min-w-0 basis-56">
                Habilitation de l’établissement
                <span className="block text-xs text-muted-foreground">
                  SIRET présent dans la liste des organismes préparant à la
                  certification, ou attestation du certificateur.
                </span>
              </span>
              <Checked
                on={c.habilitation_checked_on}
                by={c.habilitation_checked_by}
              />
              {!c.habilitation_checked_on && canVerify && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => attest('habilitation')}
                >
                  J’ai vérifié
                </Button>
              )}
            </li>
            {c.other_requirements.map((r, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center gap-2 px-3 py-2.5"
              >
                <span className="grow min-w-0 basis-56">
                  {r.label}
                  <span className="block text-xs text-muted-foreground">
                    {r.reference}
                    {r.source ? ` — ${r.source}` : ''}
                  </span>
                </span>
                <Checked on={r.verified_on} by={r.verified_by} />
                {!r.verified_on && canVerify && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => attest('autorisation', i)}
                  >
                    J’ai vérifié
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="champ-competence_mapping" className="space-y-2 scroll-mt-24">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold grow">
            Compétences, modules et évaluation
          </h3>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMappingOpen(true)}
            >
              <Pencil /> Établir la correspondance
            </Button>
          )}
        </div>
        {c?.competence_mapping?.length ? (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {c.competence_mapping.map((r, i) => (
              <li key={i} className="px-3 py-2">
                <div className="font-medium">{r.competence}</div>
                <div className="text-xs text-muted-foreground">
                  Modules : {r.modules?.join(', ') || '—'} · Évaluation :{' '}
                  {r.evaluation || (
                    <span className="text-destructive">manquante</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune correspondance établie.
          </p>
        )}
      </section>

      <ResourceFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Certification et habilitation"
        icon={Award}
        fields={fields(fiche)}
        row={{
          id: c?.id ?? 'nouvelle',
          basis: 'A_DETERMINER',
          habilitation: 'A_VERIFIER',
          ...(c ?? {}),
        }}
        pending={save.isPending}
        onSubmit={(payload) =>
          save.mutateAsync(payload, {
            onSuccess: () =>
              toast.success(
                'Certification enregistrée. Les vérifications portant sur une valeur modifiée sont à refaire.',
              ),
            onError: (e) => toast.error(e.message),
          })
        }
      />
      {mappingOpen && (
        <MappingDialog
          fiche={fiche}
          open={mappingOpen}
          onClose={() => setMappingOpen(false)}
        />
      )}
    </div>
  );
}
