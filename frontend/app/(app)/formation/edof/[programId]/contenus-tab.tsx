'use client';

import { useState } from 'react';
import { Library, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  edofApi,
  useEdofMutation,
  useTrainerOptions,
  type Fiche,
} from '@/lib/gsms/edof';
import { TONE } from '@/lib/gsms/labels';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  optionLabel,
  RESOURCE_KINDS,
  RESOURCE_ORIGINS,
  RESOURCE_RIGHTS,
  RESOURCE_STATUS,
} from '@/components/edof/labels';
import { Refusal } from '@/components/gsms/refusal';
import { ResourceFormSheet } from '@/components/resource/resource-form-sheet';
import type { FieldDef } from '@/components/resource/types';

const RESOURCE_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Titre', type: 'text', required: true },
  {
    name: 'kind',
    label: 'Type',
    type: 'select',
    options: RESOURCE_KINDS,
    span: 1,
    defaultValue: 'SUPPORT',
  },
  {
    name: 'module_code',
    label: 'Module (code)',
    type: 'text',
    span: 1,
    placeholder: 'UV1',
  },
  {
    name: 'origin',
    label: 'Origine',
    type: 'select',
    options: RESOURCE_ORIGINS,
    span: 1,
    defaultValue: 'INTERNE',
  },
  {
    name: 'rights',
    label: 'Droits de réutilisation',
    type: 'select',
    options: RESOURCE_RIGHTS,
    span: 1,
    defaultValue: 'A_VERIFIER',
  },
  {
    name: 'source_ref',
    label: 'Référence de la source',
    type: 'text',
    help: 'Éditeur, licence, identifiant du cours…',
  },
  {
    name: 'rights_note',
    label: 'Justification des droits',
    type: 'textarea',
    help: 'Contrat, licence, auteur : un contenu acheté n’accorde aucune habilitation.',
  },
  {
    name: 'status',
    label: 'État',
    type: 'select',
    options: RESOURCE_STATUS,
    span: 1,
    defaultValue: 'BROUILLON',
  },
  { name: 'note', label: 'Remarques', type: 'textarea' },
];

const RIGHTS_TONE: Record<string, string> = {
  PROPRIETAIRE: TONE.ok,
  LICENCE: TONE.ok,
  A_VERIFIER: TONE.warn,
  INTERDIT: TONE.danger,
};

function AddTrainer({
  fiche,
  open,
  onClose,
}: {
  fiche: Fiche;
  open: boolean;
  onClose: () => void;
}) {
  const trainers = useTrainerOptions();
  const [trainerId, setTrainerId] = useState('');
  const [role, setRole] = useState('FORMATEUR');
  const add = useEdofMutation(() =>
    edofApi.addTrainer(fiche.program.id, { trainer_id: trainerId, role }),
  );
  const taken = new Set(fiche.trainers.map((t) => t.trainer_id));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle>Associer un intervenant</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Formateur</Label>
            <Select value={trainerId} onValueChange={setTrainerId}>
              <SelectTrigger aria-label="Formateur">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {(trainers.data ?? [])
                  .filter((t) => !taken.has(t.id))
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.first_name} {t.last_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Les formateurs et leurs titres (avec dates de validité) se gèrent
              dans Ressources humaines › Formateurs.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Rôle de l’intervenant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(fiche.roles).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Refusal error={add.error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={!trainerId || add.isPending}
            onClick={() =>
              add.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Intervenant associé.');
                  onClose();
                },
              })
            }
          >
            Associer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContenusTab({
  fiche,
  highlight,
}: {
  fiche: Fiche;
  highlight?: string | null;
}) {
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [resource, setResource] = useState<
    Fiche['resources'][number] | null | undefined
  >(undefined);
  const programId = fiche.program.id;
  const remove = useEdofMutation((linkId: string) =>
    edofApi.removeTrainer(programId, linkId),
  );
  const saveResource = useEdofMutation((body: Record<string, unknown>) =>
    resource
      ? edofApi.patchResource(programId, resource.id, body)
      : edofApi.addResource(programId, body),
  );
  const deleteResource = useEdofMutation((id: string) =>
    edofApi.deleteResource(programId, id),
  );
  const canEdit = fiche.capabilities.edit?.allowed;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 grow">
            <Users className="size-4 text-primary" /> Intervenants
          </h3>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTrainerOpen(true)}
            >
              <UserPlus /> Associer
            </Button>
          )}
        </div>
        {fiche.trainers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun intervenant associé.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {fiche.trainers.map((t) => (
              <li
                key={t.id}
                id={`intervenant-${t.trainer_id}`}
                className={cn(
                  'px-3 py-2.5 scroll-mt-24',
                  highlight === t.trainer_id && 'bg-primary/5',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium grow">{t.name}</span>
                  <Badge variant="outline" size="sm">
                    {fiche.roles[t.role] ?? t.role}
                  </Badge>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      mode="icon"
                      aria-label={`Retirer ${t.name}`}
                      onClick={() => remove.mutate(t.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t.qualifications.length === 0
                    ? 'Aucun titre enregistré.'
                    : t.qualifications.map((q, i) => (
                        <span
                          key={i}
                          className={cn(
                            'me-3',
                            q.valid_until &&
                              q.valid_until < today &&
                              'text-destructive',
                          )}
                        >
                          {q.label}
                          {q.valid_until
                            ? ` (jusqu’au ${formatDate(q.valid_until)})`
                            : ''}
                        </span>
                      ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 grow">
            <Library className="size-4 text-primary" /> Contenus pédagogiques
          </h3>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setResource(null)}
            >
              <Plus /> Ajouter
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Cours, quiz, cas pratiques, évaluations. Pour chacun : d’où il vient
          et qui peut le réutiliser. Un contenu acheté ou repris n’accorde ni
          certification ni habilitation.
        </p>
        {fiche.resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun contenu associé.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {fiche.resources.map((r) => (
              <li
                key={r.id}
                className={cn(
                  'px-3 py-2.5',
                  highlight === r.id && 'bg-primary/5',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium grow min-w-0 basis-48">
                    {r.title}
                  </span>
                  <Badge variant="outline" size="sm">
                    {optionLabel(RESOURCE_KINDS, r.kind)}
                  </Badge>
                  <Badge size="sm" className={RIGHTS_TONE[r.rights]}>
                    Droits : {optionLabel(RESOURCE_RIGHTS, r.rights)}
                  </Badge>
                  <Badge
                    size="sm"
                    className={
                      r.status === 'VALIDE'
                        ? TONE.ok
                        : r.status === 'A_REDIGER'
                          ? TONE.danger
                          : TONE.neutral
                    }
                  >
                    {optionLabel(RESOURCE_STATUS, r.status)}
                  </Badge>
                  {canEdit && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        mode="icon"
                        aria-label={`Modifier ${r.title}`}
                        onClick={() => setResource(r)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        mode="icon"
                        aria-label={`Supprimer ${r.title}`}
                        onClick={() => deleteResource.mutate(r.id)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {optionLabel(RESOURCE_ORIGINS, r.origin)}
                  {r.module_code ? ` · ${r.module_code}` : ''}
                  {r.source_ref ? ` · ${r.source_ref}` : ''}
                  {r.note && <span className="block">{r.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddTrainer
        key={String(trainerOpen)}
        fiche={fiche}
        open={trainerOpen}
        onClose={() => setTrainerOpen(false)}
      />
      <ResourceFormSheet
        open={resource !== undefined}
        onOpenChange={(o) => !o && setResource(undefined)}
        title={resource ? 'Modifier le contenu' : 'Nouveau contenu'}
        icon={Library}
        fields={RESOURCE_FIELDS}
        row={resource ?? null}
        pending={saveResource.isPending}
        onSubmit={(payload) =>
          saveResource.mutateAsync(payload, {
            onSuccess: () => toast.success('Contenu enregistré.'),
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </div>
  );
}
