'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Hash,
  MapPin,
  Plus,
  Printer,
  Trash2,
  UserRound,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import {
  DOC_STATUS_TONE,
  euros,
  previewUrl,
  useDocKinds,
  useDocument,
  useDocumentAction,
  useQuotePrograms,
  useSaveLines,
  useUpdateDocument,
  versionUrl,
  type DocAction,
  type DocCheck,
  type DocDetail,
  type DocLine,
} from '@/lib/gsms/documents';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ActionGate } from '@/components/gsms/action-gate';
import { Refusal } from '@/components/gsms/refusal';
import {
  RecordSheet,
  SideCard,
  SideLine,
} from '@/components/page/record-sheet';
import { SectionEmpty } from '@/components/page/section-card';

// Fiche d'un document (modèle « fiche ») : colonne de gauche (client, montants, versions), onglets Contenu,
// Vérifications, Aperçu et Historique, actions du circuit en pied. Toutes les décisions viennent de l'API.

const FOOTER_ACTIONS: DocAction[] = [
  'abandonner',
  'reprendre',
  'renvoyer',
  'archiver',
  'envoyer',
  'soumettre',
  'valider',
];
const PRIMARY: DocAction[] = ['soumettre', 'valider', 'envoyer'];
const CHECK_LINK: Record<
  DocCheck['cible'],
  { href: string; label: string } | null
> = {
  organisme: { href: '/administration/organisme', label: 'Fiche organisme' },
  parametres: { href: '/administration/parametres', label: 'Paramètres' },
  entreprise: { href: '/commercial/entreprises', label: 'Entreprises' },
  formation: { href: '/formation/programmes', label: 'Catalogue' },
  lignes: null,
  document: null,
};
const NONE = '__libre__';

export function DocumentSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data: doc, isLoading, error } = useDocument(id);
  const action = useDocumentAction(id ?? '');
  const [asking, setAsking] = useState<DocAction | null>(null);

  const visible = doc
    ? FOOTER_ACTIONS.filter(
        (a) =>
          doc.capabilities[a].allowed ||
          (doc.capabilities[a] as { code?: string }).code === 'CHECKS_FAILED',
      )
    : [];

  const run = (a: DocAction) => {
    if (!doc) return;
    const needs = (doc.capabilities[a] as { a_saisir?: string[] }).a_saisir;
    if (needs?.length) setAsking(a);
    else action.mutate({ action: a });
  };

  return (
    <>
      <RecordSheet
        open={!!id}
        onClose={onClose}
        label="Fiche du document"
        title={doc ? doc.titre : isLoading ? 'Chargement…' : 'Document'}
        badges={
          doc && (
            <>
              <Badge size="sm" variant="secondary">
                {doc.type_libelle}
              </Badge>
              <Badge size="sm" className={DOC_STATUS_TONE[doc.statut]}>
                {doc.statut_libelle}
              </Badge>
              {doc.expire && (
                <Badge size="sm" variant="destructive" appearance="light">
                  Validité dépassée
                </Badge>
              )}
            </>
          )
        }
        meta={
          doc
            ? [
                { label: 'N°', value: doc.reference },
                {
                  label: 'Version archivée',
                  value: doc.version ? `v${doc.version}` : 'aucune',
                },
                {
                  label: 'Valable jusqu’au',
                  value: doc.valide_jusqu_au
                    ? formatDate(doc.valide_jusqu_au)
                    : '—',
                },
              ]
            : []
        }
        actions={
          doc && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`${previewUrl(doc.id)}#imprimer`}
                target="_blank"
                rel="noreferrer"
              >
                <Printer /> Imprimer ou PDF
              </a>
            </Button>
          )
        }
        side={doc ? <Side doc={doc} /> : <Skeleton className="h-64" />}
        tabs={
          doc
            ? [
                {
                  value: 'contenu',
                  label: 'Contenu',
                  content: <ContentTab doc={doc} />,
                },
                {
                  value: 'verifications',
                  label: 'Vérifications',
                  count: doc.verifications.length,
                  content: <ChecksTab checks={doc.verifications} />,
                },
                {
                  value: 'apercu',
                  label: 'Aperçu',
                  content: <PreviewTab doc={doc} />,
                },
                {
                  value: 'historique',
                  label: 'Historique',
                  count: doc.historique.length,
                  content: <HistoryTab doc={doc} />,
                },
              ]
            : [
                {
                  value: 'contenu',
                  label: 'Contenu',
                  content: error ? (
                    <Refusal error={error} />
                  ) : (
                    <Skeleton className="h-48" />
                  ),
                },
              ]
        }
        footer={
          doc &&
          visible.length > 0 && (
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              {action.error && (
                <div className="me-auto w-full sm:w-auto">
                  <Refusal error={action.error} />
                </div>
              )}
              {visible.map((a) => (
                <ActionGate
                  key={a}
                  decision={doc.capabilities[a]}
                  pending={action.isPending && action.variables?.action === a}
                  variant={
                    PRIMARY.includes(a)
                      ? 'primary'
                      : a === 'abandonner'
                        ? 'destructive'
                        : 'outline'
                  }
                  onRun={() => run(a)}
                >
                  {(doc.capabilities[a] as { libelle?: string }).libelle}
                </ActionGate>
              ))}
            </div>
          )
        }
      />
      {doc && asking && (
        <AskDialog
          doc={doc}
          action={asking}
          onClose={() => setAsking(null)}
          onConfirm={(body) =>
            action.mutate(
              { action: asking, ...body },
              { onSuccess: () => setAsking(null) },
            )
          }
          pending={action.isPending}
        />
      )}
    </>
  );
}

function Side({ doc }: { doc: DocDetail }) {
  const c = doc.client;
  const t = doc.totaux;
  return (
    <>
      <SideCard title="Client">
        <SideLine icon={Building2}>{c?.nom}</SideLine>
        <SideLine icon={Hash} missing="Code client manquant">
          {c?.code && `Code ${c.code}`}
        </SideLine>
        <SideLine icon={MapPin} missing="Adresse manquante">
          {c?.adresse &&
            `${c.adresse}, ${c.code_postal ?? ''} ${c.ville ?? ''}`.trim()}
        </SideLine>
        <SideLine icon={UserRound} missing="Aucun contact">
          {c?.contact}
        </SideLine>
      </SideCard>
      <SideCard title="Montants">
        <Amount label="Total HT" value={euros(t.total_ht)} />
        <Amount
          label={
            t.tva_regime === 'ASSUJETTI'
              ? `TVA ${t.tva_taux ?? ''} %`
              : t.tva_regime === 'EXONERE'
                ? 'TVA (exonéré)'
                : 'TVA'
          }
          value={
            t.tva_regime === 'NON_RENSEIGNE' ? 'à renseigner' : euros(t.tva)
          }
        />
        <Amount label="Total TTC" value={euros(t.total_ttc)} strong />
        {!t.complet && (
          <p className="text-xs text-muted-foreground">
            Des prix restent à renseigner : les totaux sont partiels.
          </p>
        )}
      </SideCard>
      <SideCard title="Versions archivées">
        {doc.versions.length === 0 ? (
          <p className="text-muted-foreground">
            Aucune : la validation archive la première version.
          </p>
        ) : (
          doc.versions.map((v) => (
            <a
              key={v.id}
              href={versionUrl(doc.id, v.id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 hover:text-primary"
            >
              <span>
                v{v.version} · {formatDate(v.emis_le)}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {v.statut === 'REMPLACE' ? 'remplacée' : 'en vigueur'}
                <ExternalLink className="size-3" />
              </span>
            </a>
          ))
        )}
      </SideCard>
    </>
  );
}

function Amount({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? 'font-semibold tabular-nums text-foreground'
            : 'tabular-nums text-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}

// ── Contenu : en-tête, lignes, sections ─────────────────────────────────────────────────────────

function ContentTab({ doc }: { doc: DocDetail }) {
  const editable = doc.capabilities.modifier.allowed;
  return (
    <div className="space-y-6">
      {!editable && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {(doc.capabilities.modifier as { message?: string }).message}
        </p>
      )}
      <HeaderForm doc={doc} editable={editable} />
      <LinesEditor doc={doc} editable={editable} />
      <SectionsEditor doc={doc} editable={editable} />
    </div>
  );
}

function HeaderForm({ doc, editable }: { doc: DocDetail; editable: boolean }) {
  const update = useUpdateDocument(doc.id);
  const [title, setTitle] = useState(doc.titre);
  const [until, setUntil] = useState(doc.valide_jusqu_au ?? '');
  useEffect(() => {
    setTitle(doc.titre);
    setUntil(doc.valide_jusqu_au ?? '');
  }, [doc.titre, doc.valide_jusqu_au]);
  const dirty = title !== doc.titre || until !== (doc.valide_jusqu_au ?? '');
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="doc-titre">Titre</Label>
        <Input
          id="doc-titre"
          value={title}
          maxLength={250}
          disabled={!editable}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="doc-validite">Valable jusqu’au</Label>
        <Input
          id="doc-validite"
          type="date"
          value={until}
          disabled={!editable}
          onChange={(e) => setUntil(e.target.value)}
        />
      </div>
      {editable && (
        <Button
          variant="outline"
          disabled={!dirty || !title.trim() || update.isPending}
          onClick={() =>
            update.mutate({
              titre: title.trim(),
              valide_jusqu_au: until || null,
            })
          }
        >
          Enregistrer
        </Button>
      )}
      {update.error && (
        <div className="sm:col-span-3">
          <Refusal error={update.error} />
        </div>
      )}
    </div>
  );
}

function LinesEditor({ doc, editable }: { doc: DocDetail; editable: boolean }) {
  const programs = useQuotePrograms(editable);
  const kinds = useDocKinds();
  const save = useSaveLines(doc.id);
  const [lines, setLines] = useState<DocLine[]>(doc.lignes);
  useEffect(() => setLines(doc.lignes), [doc.lignes]);
  const dirty = JSON.stringify(lines) !== JSON.stringify(doc.lignes);
  const units = kinds.data?.unites ?? { STAGIAIRE: 'stagiaire' };

  const patch = (i: number, p: Partial<DocLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const pickProgram = (i: number, programId: string) => {
    if (programId === NONE)
      return patch(i, { formation_id: null, formation: null });
    const p = programs.data?.find((x) => x.id === programId);
    if (!p) return;
    patch(i, {
      formation_id: p.id,
      formation: {
        code: p.code,
        titre: p.titre,
        prix_a_confirmer: p.prix_a_confirmer,
      },
      libelle: p.titre,
      prix_unitaire: p.prix,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Prestations</h3>
        {editable && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setLines((ls) => [
                ...ls,
                {
                  formation_id: null,
                  formation: null,
                  libelle: '',
                  detail: null,
                  quantite: 1,
                  unite: 'STAGIAIRE',
                  prix_unitaire: null,
                  remise_pct: 0,
                },
              ])
            }
          >
            <Plus /> Ajouter une ligne
          </Button>
        )}
      </div>
      {lines.length === 0 && (
        <SectionEmpty icon={FileText}>
          Aucune ligne. Ajoutez une formation du catalogue ou une prestation
          libre.
        </SectionEmpty>
      )}
      {lines.map((l, i) => (
        <div
          key={l.id ?? `new-${i}`}
          className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12"
        >
          <div className="space-y-1.5 sm:col-span-5">
            <Label htmlFor={`l-${i}-f`}>Formation</Label>
            <Select
              value={l.formation_id ?? NONE}
              disabled={!editable}
              onValueChange={(v) => pickProgram(i, v)}
            >
              <SelectTrigger id={`l-${i}-f`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Prestation libre</SelectItem>
                {(programs.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} · {p.titre}
                  </SelectItem>
                ))}
                {l.formation_id &&
                  l.formation &&
                  !programs.data?.some((p) => p.id === l.formation_id) && (
                    <SelectItem value={l.formation_id}>
                      {l.formation.code} · {l.formation.titre}
                    </SelectItem>
                  )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-7">
            <Label htmlFor={`l-${i}-lib`}>Désignation</Label>
            <Input
              id={`l-${i}-lib`}
              value={l.libelle}
              maxLength={300}
              disabled={!editable}
              onChange={(e) => patch(i, { libelle: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`l-${i}-q`}>Quantité</Label>
            <Input
              id={`l-${i}-q`}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={l.quantite}
              disabled={!editable}
              onChange={(e) => patch(i, { quantite: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor={`l-${i}-u`}>Unité</Label>
            <Select
              value={l.unite}
              disabled={!editable}
              onValueChange={(v) => patch(i, { unite: v })}
            >
              <SelectTrigger id={`l-${i}-u`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(units).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor={`l-${i}-p`}>Prix unitaire HT (€)</Label>
            <Input
              id={`l-${i}-p`}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={l.prix_unitaire ?? ''}
              placeholder="à renseigner"
              disabled={!editable}
              onChange={(e) =>
                patch(i, {
                  prix_unitaire:
                    e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`l-${i}-r`}>Remise (%)</Label>
            <Input
              id={`l-${i}-r`}
              type="number"
              min={0}
              max={100}
              step="any"
              inputMode="decimal"
              value={l.remise_pct}
              disabled={!editable}
              onChange={(e) =>
                patch(i, { remise_pct: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div className="flex items-end justify-between gap-2 sm:col-span-2">
            <div className="text-sm">
              <span className="block text-xs text-muted-foreground">
                Montant HT
              </span>
              <span className="font-medium tabular-nums">
                {l.montant_ht != null ? euros(l.montant_ht) : '—'}
              </span>
            </div>
            {editable && (
              <Button
                mode="icon"
                variant="ghost"
                aria-label={`Supprimer la ligne ${i + 1}`}
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            )}
          </div>
          {l.formation?.prix_a_confirmer && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-warning,var(--color-yellow-600))] sm:col-span-12">
              <AlertTriangle className="size-3.5" />
              Tarif « à confirmer » dans la fiche formation : confirmez-le dans
              le catalogue ou saisissez le prix convenu avec le client.
            </p>
          )}
        </div>
      ))}
      {editable && (dirty || save.error) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {save.error && <Refusal error={save.error} />}
          <Button variant="outline" onClick={() => setLines(doc.lignes)}>
            Annuler les modifications
          </Button>
          <Button
            disabled={
              save.isPending ||
              lines.some((l) => !l.libelle.trim() || !(l.quantite > 0))
            }
            onClick={() => save.mutate(lines)}
          >
            Enregistrer les lignes
          </Button>
        </div>
      )}
    </div>
  );
}

function SectionsEditor({
  doc,
  editable,
}: {
  doc: DocDetail;
  editable: boolean;
}) {
  const update = useUpdateDocument(doc.id);
  const [sections, setSections] = useState(doc.sections);
  useEffect(() => setSections(doc.sections), [doc.sections]);
  const dirty = JSON.stringify(sections) !== JSON.stringify(doc.sections);
  if (!editable && sections.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Texte du devis</h3>
          <p className="text-xs text-muted-foreground">
            Paragraphes imprimés avant les prestations (contexte, objectifs,
            organisation). Rédigés et relus par une personne.
          </p>
        </div>
        {editable && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSections((s) => [...s, { titre: '', texte: '' }])}
          >
            <Plus /> Ajouter un paragraphe
          </Button>
        )}
      </div>
      {sections.map((s, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-end gap-2">
            <div className="grow space-y-1.5">
              <Label htmlFor={`s-${i}-t`}>Titre du paragraphe</Label>
              <Input
                id={`s-${i}-t`}
                value={s.titre}
                maxLength={200}
                disabled={!editable}
                onChange={(e) =>
                  setSections((ss) =>
                    ss.map((x, j) =>
                      j === i ? { ...x, titre: e.target.value } : x,
                    ),
                  )
                }
              />
            </div>
            {editable && (
              <Button
                mode="icon"
                variant="ghost"
                aria-label={`Supprimer le paragraphe ${i + 1}`}
                onClick={() =>
                  setSections((ss) => ss.filter((_, j) => j !== i))
                }
              >
                <Trash2 />
              </Button>
            )}
          </div>
          <Textarea
            aria-label={`Texte du paragraphe ${i + 1}`}
            value={s.texte}
            maxLength={5000}
            rows={4}
            disabled={!editable}
            onChange={(e) =>
              setSections((ss) =>
                ss.map((x, j) =>
                  j === i ? { ...x, texte: e.target.value } : x,
                ),
              )
            }
          />
        </div>
      ))}
      {editable && dirty && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {update.error && <Refusal error={update.error} />}
          <Button variant="outline" onClick={() => setSections(doc.sections)}>
            Annuler les modifications
          </Button>
          <Button
            disabled={update.isPending || sections.some((s) => !s.titre.trim())}
            onClick={() => update.mutate({ sections })}
          >
            Enregistrer le texte
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Vérifications, aperçu, historique ──────────────────────────────────────────────────────────

function ChecksTab({ checks }: { checks: DocCheck[] }) {
  if (checks.length === 0)
    return (
      <SectionEmpty icon={CheckCircle2}>
        Aucun point bloquant : le document peut être envoyé en relecture puis
        validé.
      </SectionEmpty>
    );
  return (
    <ul className="divide-y rounded-lg border">
      {checks.map((c, i) => {
        const link = CHECK_LINK[c.cible];
        return (
          <li
            key={`${c.code}-${i}`}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
          >
            <span className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-warning,var(--color-yellow-600))]" />
              {c.message}
            </span>
            {link && (
              <Button variant="outline" size="sm" asChild>
                <Link href={link.href}>{link.label}</Link>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PreviewTab({ doc }: { doc: DocDetail }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {doc.version && ['VALIDE', 'ENVOYE', 'ARCHIVE'].includes(doc.statut)
          ? `Version ${doc.version} telle qu’archivée.`
          : 'Aperçu du contenu actuel, marqué « Brouillon » tant qu’il n’est pas validé.'}
      </p>
      <iframe
        key={doc.modifie_le}
        title={`Aperçu de ${doc.reference}`}
        src={previewUrl(doc.id)}
        className="h-[70vh] w-full rounded-lg border bg-muted"
      />
    </div>
  );
}

function HistoryTab({ doc }: { doc: DocDetail }) {
  return (
    <ol className="space-y-3">
      {doc.historique.map((h, i) => (
        <li key={i} className="rounded-lg border px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {h.de} → {h.vers}
              {h.version ? ` · v${h.version}` : ''}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              {formatDate(h.le, 'd MMM yyyy HH:mm')} · {h.par}
            </span>
          </div>
          {h.motif && <p className="mt-1 text-muted-foreground">{h.motif}</p>}
        </li>
      ))}
      <li className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Créé le {formatDate(doc.cree_le)}
        {doc.par ? ` par ${doc.par}` : ''}
      </li>
    </ol>
  );
}

function AskDialog({
  doc,
  action,
  onClose,
  onConfirm,
  pending,
}: {
  doc: DocDetail;
  action: DocAction;
  onClose: () => void;
  onConfirm: (body: { motif?: string; date_envoi?: string }) => void;
  pending: boolean;
}) {
  const decision = doc.capabilities[action] as {
    libelle?: string;
    a_saisir?: string[];
  };
  const needs = decision.a_saisir ?? [];
  const [motif, setMotif] = useState('');
  const [sent, setSent] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{decision.libelle}</DialogTitle>
          <DialogDescription>
            {doc.reference} · {doc.titre}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {needs.includes('motif') && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-motif">Motif</Label>
              <Textarea
                id="doc-motif"
                value={motif}
                maxLength={2000}
                onChange={(e) => setMotif(e.target.value)}
              />
            </div>
          )}
          {needs.includes('date') && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-envoi">Date d’envoi au client</Label>
              <Input
                id="doc-envoi"
                type="date"
                value={sent}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setSent(e.target.value)}
              />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={pending || (needs.includes('motif') && !motif.trim())}
            onClick={() =>
              onConfirm({
                motif: motif.trim() || undefined,
                date_envoi: needs.includes('date') ? sent : undefined,
              })
            }
          >
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
