'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  CheckCheck,
  FolderPlus,
  Landmark,
  Pencil,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  edofApi,
  useEdofMutation,
  useEstablishment,
  type Anomaly,
  type EstablishmentView,
} from '@/lib/gsms/edof';
import { useCan } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AnomalyList } from '@/components/edof/anomaly-list';
import { DossierActions } from '@/components/edof/dossier-actions';
import { EdofJourney } from '@/components/edof/journey';
import {
  DOSSIER_STATUS,
  EFP_CONNECT,
  optionLabel,
  REPRESENTATIVE_KINDS,
  STRUCTURE_TYPES,
} from '@/components/edof/labels';
import { PiecesPanel } from '@/components/edof/pieces-panel';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { ResourceFormSheet } from '@/components/resource/resource-form-sheet';
import type { FieldDef } from '@/components/resource/types';

const YES_NO = [
  { value: 'OUI', label: 'Oui' },
  { value: 'NON', label: 'Non' },
];

const FIELDS: FieldDef[] = [
  { name: 'legal_name', label: 'Dénomination', type: 'text', span: 2 },
  { name: 'legal_form', label: 'Forme juridique', type: 'text', span: 1 },
  {
    name: 'structure_type',
    label: 'Type de structure',
    type: 'select',
    options: STRUCTURE_TYPES,
    span: 1,
  },
  { name: 'siret', label: 'SIRET de l’établissement', type: 'text', span: 1 },
  { name: 'naf_code', label: 'Code NAF', type: 'text', span: 1 },
  { name: 'address', label: 'Adresse', type: 'text', span: 2 },
  {
    name: 'nda_number',
    label: 'Numéro de déclaration d’activité (NDA)',
    type: 'text',
    span: 2,
  },
  {
    name: 'representative_kind',
    label: 'Représentant légal',
    type: 'select',
    options: REPRESENTATIVE_KINDS,
    span: 1,
  },
  {
    name: 'representative_name',
    label: 'Nom du représentant',
    type: 'text',
    span: 1,
  },
  {
    name: 'representative_role',
    label: 'Qualité (gérant, président…)',
    type: 'text',
    span: 2,
  },
  {
    name: 'qualiopi_certificate',
    label: 'N° du certificat Qualiopi',
    type: 'text',
    span: 1,
  },
  {
    name: 'qualiopi_certifier',
    label: 'Organisme certificateur',
    type: 'text',
    span: 1,
  },
  {
    name: 'qualiopi_valid_until',
    label: 'Certificat valable jusqu’au',
    type: 'date',
    span: 1,
  },
  {
    name: 'qualiopi_categories',
    label: 'Catégories couvertes',
    type: 'tags',
    span: 1,
    help: 'AF, BC, VAE, APPRENTISSAGE (telles qu’indiquées sur le certificat).',
  },
  {
    name: 'efp_connect_status',
    label: 'Accès EFP Connect',
    type: 'select',
    options: EFP_CONNECT,
    span: 2,
  },
  {
    name: 'bpf_last_year',
    label: 'Dernier BPF transmis (exercice)',
    type: 'number',
    span: 1,
  },
  {
    name: 'cgu_version_read',
    label: 'Version des CGU lue',
    type: 'text',
    span: 1,
    placeholder: '15',
  },
  {
    name: 'uses_subcontracting',
    label: 'Recours à la sous-traitance',
    type: 'select',
    options: YES_NO,
    span: 2,
  },
  { name: 'note', label: 'Notes', type: 'textarea', span: 2 },
];

const CHECKS: { field: string; label: string; help: string }[] = [
  {
    field: 'identity_checked_on',
    label: 'Identité légale',
    help: 'Dénomination, SIRET, adresse comparés au Kbis ou à l’Annuaire des entreprises.',
  },
  {
    field: 'nda_checked_on',
    label: 'NDA actif',
    help: 'Vu actif sur Mon Activité Formation.',
  },
  {
    field: 'qualiopi_checked_on',
    label: 'Certificat Qualiopi',
    help: 'Numéro, échéance et catégories relus sur le certificat.',
  },
  {
    field: 'obligations_checked_on',
    label: 'Obligations légales, fiscales, sociales',
    help: 'Dont BPF transmis et comptes tenus.',
  },
  {
    field: 'cgu_read_on',
    label: 'CGU Mon Compte Formation lues',
    help: 'Version en vigueur (15, depuis le 5 mai 2026).',
  },
];

function row(view: EstablishmentView) {
  const e = view.establishment;
  return {
    id: view.organization.id,
    ...e,
    siret: view.organization.siret,
    nda_number: view.organization.nda_number,
    uses_subcontracting:
      e.uses_subcontracting === true
        ? 'OUI'
        : e.uses_subcontracting === false
          ? 'NON'
          : null,
  };
}

function toPatch(payload: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...payload };
  if ('uses_subcontracting' in out)
    out.uses_subcontracting =
      out.uses_subcontracting === 'OUI'
        ? true
        : out.uses_subcontracting === 'NON'
          ? false
          : null;
  return out;
}

function Situation({
  view,
  onEdit,
}: {
  view: EstablishmentView;
  onEdit: () => void;
}) {
  const e = view.establishment;
  const items: [string, React.ReactNode][] = [
    ['Dénomination', e.legal_name ?? view.organization.name],
    ['Forme juridique', (e.legal_form as string) ?? '—'],
    ['Type de structure', optionLabel(STRUCTURE_TYPES, e.structure_type)],
    ['SIRET', view.organization.siret ?? '—'],
    ['Adresse', (e.address as string) ?? '—'],
    ['NDA', view.organization.nda_number ?? '—'],
    [
      'Représentant légal',
      [
        optionLabel(REPRESENTATIVE_KINDS, e.representative_kind),
        e.representative_name,
      ]
        .filter((x) => x && x !== '—')
        .join(' — ') || '—',
    ],
    [
      'Qualiopi',
      e.qualiopi_certificate
        ? `${e.qualiopi_certificate}, jusqu’au ${formatDate(e.qualiopi_valid_until as string)}`
        : '—',
    ],
    [
      'Catégories Qualiopi',
      e.qualiopi_categories?.length ? e.qualiopi_categories.join(', ') : '—',
    ],
    ['Accès EFP Connect', optionLabel(EFP_CONNECT, e.efp_connect_status)],
  ];
  return (
    <Card id="etablissement">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" /> 1. Situation
          administrative
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil /> Modifier
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_1fr] gap-x-4 gap-y-1.5 text-sm">
          {items.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words max-sm:mb-1.5">{v}</dd>
            </div>
          ))}
        </dl>
        {(e.note || e.identity_source) && (
          <p className="text-xs text-muted-foreground border-t pt-2.5">
            {e.identity_source && (
              <span className="block">
                Source de l’identité : {e.identity_source}
              </span>
            )}
            {e.note}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HumanChecks({ view }: { view: EstablishmentView }) {
  const can = useCan();
  const attest = useEdofMutation((field: string) =>
    edofApi.patchEstablishment({
      [field]: new Date().toISOString().slice(0, 10),
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCheck className="size-4 text-primary" /> Vérifications à
          attester
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {CHECKS.map((c) => {
            const done = view.establishment[c.field] as string | null;
            return (
              <li
                key={c.field}
                id={`champ-${c.field}`}
                className="flex flex-wrap items-center gap-2 py-2 scroll-mt-24"
              >
                <span className="grow min-w-0 basis-56">
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.help}
                  </span>
                </span>
                {done ? (
                  <Badge variant="success" appearance="light" size="sm">
                    Vérifié le {formatDate(done)}
                  </Badge>
                ) : can('validate_edof') ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={attest.isPending}
                    onClick={() =>
                      attest.mutate(c.field, {
                        onSuccess: () =>
                          toast.success('Vérification attestée.'),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    J’ai vérifié
                  </Button>
                ) : (
                  <Badge variant="warning" appearance="light" size="sm">
                    À vérifier
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function Accompaniments({ view }: { view: EstablishmentView }) {
  const dossier = view.dossier;
  const can = useCan();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('WEBINAIRE');
  const [done, setDone] = useState('');
  const add = useEdofMutation(() =>
    edofApi.addAccompaniment(dossier.id, {
      kind,
      label,
      done_on: done || undefined,
    }),
  );
  const markDone = useEdofMutation((id: string) =>
    edofApi.patchAccompaniment(id, {
      done_on: new Date().toISOString().slice(0, 10),
    }),
  );
  return (
    <Card id="accompagnement">
      <CardHeader>
        <CardTitle>Accompagnement obligatoire de la CDC</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Les conditions particulières (V15, art. 2) engagent l’organisme à
          suivre l’accompagnement proposé par la Caisse des Dépôts : webinaire,
          parcours de formation, documentation.
        </p>
        {dossier.accompaniments.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {dossier.accompaniments.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <span className="grow min-w-0">{a.label}</span>
                {a.done_on ? (
                  <Badge variant="success" appearance="light" size="sm">
                    Suivi le {formatDate(a.done_on)}
                  </Badge>
                ) : (
                  can('write_edof') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markDone.mutate(a.id)}
                    >
                      Marquer suivi
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Aucun suivi enregistré.</p>
        )}
        {can('write_edof') && (
          <div className="grid grid-cols-1 gap-2">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger aria-label="Type d’accompagnement">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEBINAIRE">Webinaire</SelectItem>
                <SelectItem value="PARCOURS">Parcours de formation</SelectItem>
                <SelectItem value="DOCUMENTATION">Documentation</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Intitulé (ex. webinaire de prise en main)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Label
                htmlFor="acc-done"
                className="text-xs font-normal shrink-0"
              >
                Suivi le
              </Label>
              <Input
                id="acc-done"
                type="date"
                value={done}
                onChange={(e) => setDone(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!label.trim() || add.isPending}
              onClick={() =>
                add.mutate(undefined, {
                  onSuccess: () => {
                    setLabel('');
                    setDone('');
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              <Plus /> Ajouter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Formations({ view }: { view: EstablishmentView }) {
  const can = useCan();
  const router = useRouter();
  const create = useEdofMutation((programId: string) =>
    edofApi.createDossier(programId),
  );
  return (
    <Card id="formations">
      <CardHeader>
        <CardTitle>2. Formations</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {view.formations.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Aucune formation enregistrée.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {view.formations.map((f) => (
              <li
                key={f.program_id}
                className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm"
              >
                <span className="grow min-w-0 basis-56">
                  <Badge variant="outline" size="sm" className="me-2">
                    {f.code}
                  </Badge>
                  <span className="font-medium">{f.title}</span>
                </span>
                {f.dossier ? (
                  <>
                    <Badge
                      size="sm"
                      className={DOSSIER_STATUS[f.dossier.display_status].color}
                    >
                      {f.dossier.display_label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {f.dossier.blocking} bloquant(s) · {f.dossier.to_check} à
                      vérifier
                    </span>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/formation/edof/${f.program_id}`}>
                        Ouvrir <ArrowRight />
                      </Link>
                    </Button>
                  </>
                ) : can('write_edof') ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={create.isPending}
                    onClick={() =>
                      create.mutate(f.program_id, {
                        onSuccess: () =>
                          router.push(`/formation/edof/${f.program_id}`),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    <FolderPlus /> Préparer son dossier
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Pas de dossier
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function EdofPage() {
  const { data, error } = useEstablishment();
  const [editOpen, setEditOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const save = useEdofMutation((body: Record<string, unknown>) =>
    edofApi.patchEstablishment(toPatch(body)),
  );

  function go(a: Anomaly) {
    if (a.cible.type === 'piece' && a.cible.code) {
      setHighlight(a.cible.code);
      document
        .getElementById(`piece-${a.cible.code}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (a.cible.type === 'champ' && a.cible.champ?.endsWith('_on')) {
      document
        .getElementById(`champ-${a.cible.champ}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (a.cible.type === 'champ') {
      setEditOpen(true);
    } else if (a.cible.type === 'accompagnement') {
      document
        .getElementById('accompagnement')
        ?.scrollIntoView({ behavior: 'smooth' });
    } else {
      document.getElementById('suivi')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <>
      <ContentHeader>
        <div className="flex items-center gap-2.5 min-w-0">
          <Landmark className="size-4 text-primary shrink-0" />
          <h1 className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold min-w-0">
            <span>Référencement CPF (EDOF)</span>
            {data && (
              <Badge
                className={DOSSIER_STATUS[data.dossier.display_status].color}
              >
                {data.dossier.display_label}
              </Badge>
            )}
          </h1>
        </div>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid min-w-0">
          {error ? (
            <div className="w-full">
              <Refusal error={error} />
            </div>
          ) : !data ? (
            <div className="w-full space-y-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="w-full min-w-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
              <div className="space-y-5 min-w-0">
                <EdofJourney current={1} />
                <Situation view={data} onEdit={() => setEditOpen(true)} />
                <HumanChecks view={data} />
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Contrôles du dossier de l’établissement
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnomalyList anomalies={data.dossier.anomalies} onGo={go} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Pièces communes à toutes les formations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PiecesPanel dossier={data.dossier} highlight={highlight} />
                  </CardContent>
                </Card>
                <Formations view={data} />
              </div>
              <div className="space-y-5 min-w-0 lg:sticky lg:top-24">
                <Card id="suivi">
                  <CardHeader>
                    <CardTitle>Dossier de l’établissement</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DossierActions dossier={data.dossier} />
                  </CardContent>
                </Card>
                <Accompaniments view={data} />
              </div>
            </div>
          )}
        </div>
      </Content>
      {data && (
        <ResourceFormSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          title="Situation administrative"
          icon={Building2}
          fields={FIELDS}
          row={row(data)}
          pending={save.isPending}
          onSubmit={(payload) =>
            save.mutateAsync(payload, {
              onSuccess: () => toast.success('Situation enregistrée.'),
              onError: (e) => toast.error(e.message),
            })
          }
        />
      )}
    </>
  );
}
