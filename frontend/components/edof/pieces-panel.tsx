'use client';

import { useMemo, useState } from 'react';
import {
  ExternalLink,
  FileUp,
  History,
  Link2,
  LoaderCircleIcon,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  edofApi,
  pieceUrl,
  useEdofMutation,
  useReusableDocuments,
  type Dossier,
  type PieceRow,
} from '@/lib/gsms/edof';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Refusal } from '@/components/gsms/refusal';
import { PIECE_STATE } from './labels';

const SECTIONS: { stages: PieceRow['stage'][]; title: string; hint: string }[] =
  [
    {
      stages: ['FORMULAIRE', 'AVANT_DEPOT'],
      title: 'Pièces à fournir avant le dépôt',
      hint: 'Demandées dans le formulaire de référencement, ou à justifier avant de déposer.',
    },
    {
      stages: ['COMPLEMENT'],
      title: 'Pièces que la Caisse des Dépôts peut demander',
      hint: 'À préparer : elles ne deviennent obligatoires que si la CDC les réclame pendant l’instruction.',
    },
    {
      stages: ['SUIVI'],
      title: 'Suivi de la demande',
      hint: 'Courrier reçu de la Caisse des Dépôts.',
    },
  ];

function UploadDialog({
  dossier,
  row,
  mode,
  onClose,
}: {
  dossier: Dossier;
  row: PieceRow | null;
  mode: 'upload' | 'link';
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [siret, setSiret] = useState('');
  const [note, setNote] = useState('');
  const openComplements = dossier.complements.filter(
    (c) =>
      c.status === 'DEMANDEE' &&
      (!c.requirement || c.requirement === row?.code),
  );
  const [complementId, setComplementId] = useState('');
  const reusable = useReusableDocuments(dossier.id, mode === 'link' && !!row);
  const save = useEdofMutation(async () => {
    if (!row) return;
    const meta = {
      issued_on: issuedOn || undefined,
      valid_until: validUntil || undefined,
      siret_on_document: siret || undefined,
      note: note || undefined,
      complement_id: complementId || undefined,
    };
    if (mode === 'upload') {
      if (!file) throw new Error('Choisissez un fichier.');
      return edofApi.upload(dossier.id, row.code, file, meta);
    }
    if (!documentId) throw new Error('Choisissez un document.');
    return edofApi.link(dossier.id, row.code, {
      document_id: documentId,
      ...meta,
    });
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'upload'
              ? 'Déposer la pièce'
              : 'Rattacher un document existant'}
          </DialogTitle>
          <DialogDescription>{row?.label}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-xs text-muted-foreground">
            À fournir par : {row?.provided_by}. GSMS conserve la pièce telle
            qu’elle est déposée ; il n’en fabrique aucune.
          </p>
          {mode === 'upload' ? (
            <div className="space-y-1.5">
              <Label htmlFor="piece-file">Fichier (PDF, PNG, JPEG)</Label>
              <Input
                id="piece-file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Document déjà déposé</Label>
              <Select value={documentId} onValueChange={setDocumentId}>
                <SelectTrigger aria-label="Document déjà déposé">
                  <SelectValue
                    placeholder={
                      reusable.isLoading ? 'Chargement…' : 'Choisir un document'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(reusable.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title} — {d.name ?? 'sans nom'} (v{d.version})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Le document n’est pas copié : ce dossier y renvoie et garde sa
                propre validation.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {row?.max_age_days && (
              <div className="space-y-1.5">
                <Label htmlFor="piece-issued">
                  Date portée par le document
                </Label>
                <Input
                  id="piece-issued"
                  type="date"
                  value={issuedOn}
                  onChange={(e) => setIssuedOn(e.target.value)}
                />
              </div>
            )}
            {row?.expires && (
              <div className="space-y-1.5">
                <Label htmlFor="piece-valid">Valable jusqu’au</Label>
                <Input
                  id="piece-valid"
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            )}
            {row?.siret && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="piece-siret">SIRET lu sur le document</Label>
                <Input
                  id="piece-siret"
                  inputMode="numeric"
                  value={siret}
                  onChange={(e) => setSiret(e.target.value)}
                  placeholder="14 chiffres"
                />
              </div>
            )}
          </div>
          {openComplements.length > 0 && (
            <div className="space-y-1.5">
              <Label>En réponse à la demande de la CDC</Label>
              <Select value={complementId} onValueChange={setComplementId}>
                <SelectTrigger aria-label="Demande de la CDC à laquelle la pièce répond">
                  <SelectValue placeholder="Choisir la demande" />
                </SelectTrigger>
                <SelectContent>
                  {openComplements.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="piece-note">Commentaire</Label>
            <Textarea
              id="piece-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
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
                  toast.success('Pièce enregistrée : elle est à valider.');
                  onClose();
                },
              })
            }
          >
            {save.isPending && (
              <LoaderCircleIcon className="size-4 animate-spin" />
            )}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  pieceId,
  onClose,
}: {
  pieceId: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const reject = useEdofMutation((id: string) => edofApi.reject(id, reason));
  return (
    <Dialog open={!!pieceId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle>Rejeter la pièce</DialogTitle>
          <DialogDescription>
            Le motif est conservé et affiché à la personne qui dépose.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label htmlFor="reject-reason">Motif</Label>
          <Textarea
            id="reject-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Refusal error={reject.error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || reject.isPending}
            onClick={() =>
              pieceId && reject.mutate(pieceId, { onSuccess: onClose })
            }
          >
            Rejeter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PieceLine({
  row,
  highlighted,
  onUpload,
  onLink,
  onReject,
}: {
  row: PieceRow;
  highlighted: boolean;
  onUpload: () => void;
  onLink: () => void;
  onReject: (id: string) => void;
}) {
  const can = useCan();
  const approve = useEdofMutation((id: string) => edofApi.approve(id));
  const [showHistory, setShowHistory] = useState(false);
  const p = row.piece;
  // Un état inconnu (API plus récente que l'interface) s'affiche tel quel au lieu de casser la page.
  const state = PIECE_STATE[row.state] ?? { label: row.state, color: '' };
  const restricted = row.sensitive && !can('sensitive_edof');

  return (
    <li
      id={`piece-${row.code}`}
      className={cn(
        'px-3 py-3 text-sm scroll-mt-24',
        highlighted && 'bg-primary/5 ring-1 ring-primary/30 rounded-md',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="min-w-0 grow basis-64">
          <div className="font-medium text-foreground flex items-center gap-1.5">
            {row.sensitive && (
              <Lock
                className="size-3.5 text-muted-foreground shrink-0"
                aria-label="Pièce sensible"
              />
            )}
            <span>{row.label}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {row.conditions.length > 0 && (
              <span>{row.conditions.join(' ; ')} · </span>
            )}
            Fournie par : {row.provided_by}
          </div>
          {row.note && (
            <div className="text-xs text-muted-foreground mt-0.5 italic">
              {row.note}
            </div>
          )}
        </div>
        <Badge size="sm" className={cn('shrink-0', state.color)}>
          {state.label}
        </Badge>
      </div>

      {p && (
        <div className="mt-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground space-y-0.5">
          {p.restricted ? (
            <div className="flex items-center gap-1.5">
              <Lock className="size-3" /> Pièce sensible : accès réservé.
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="text-foreground">
                {p.document?.name ?? 'Document'}
              </span>
              <span>v{p.document?.version}</span>
              {p.shared && <span>document commun rattaché</span>}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {p.issued_on && <span>Daté du {formatDate(p.issued_on)}</span>}
            {p.valid_until && (
              <span>Valable jusqu’au {formatDate(p.valid_until)}</span>
            )}
            {p.siret_on_document && (
              <span>SIRET lu : {p.siret_on_document}</span>
            )}
            <span>
              Déposé par {p.deposited_by ?? '—'} le {formatDate(p.deposited_at)}
            </span>
            {p.validated_by && (
              <span>
                {p.status === 'REJETEE' ? 'Rejeté' : 'Validé'} par{' '}
                {p.validated_by}
              </span>
            )}
          </div>
          {p.rejection_reason && (
            <div className="text-destructive">
              Motif du rejet : {p.rejection_reason}
            </div>
          )}
        </div>
      )}

      {row.anomalies.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs">
          {row.anomalies.map((a, i) => (
            <li
              key={i}
              className={
                a.niveau === 'BLOQUANT'
                  ? 'text-destructive'
                  : 'text-yellow-700 dark:text-yellow-500'
              }
            >
              {a.message}
              {a.detail ? ` — ${a.detail}` : ''}
            </li>
          ))}
        </ul>
      )}

      {!row.generated && (
        <div className="mt-2 flex flex-wrap gap-2">
          {can('write_edof') && !restricted && (
            <>
              <Button size="sm" variant="outline" onClick={onUpload}>
                <FileUp /> {p ? 'Nouvelle version' : 'Déposer'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onLink}>
                <Link2 /> Rattacher un document
              </Button>
            </>
          )}
          {p && !p.restricted && p.document?.has_file && (
            <Button size="sm" variant="ghost" asChild>
              <a href={pieceUrl(p.id)} target="_blank" rel="noreferrer">
                <ExternalLink /> Ouvrir
              </a>
            </Button>
          )}
          {p && can('validate_edof') && p.status !== 'VALIDEE' && (
            <Button
              size="sm"
              variant="outline"
              disabled={approve.isPending}
              onClick={() =>
                approve.mutate(p.id, {
                  onSuccess: () => toast.success('Pièce validée.'),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              <ShieldCheck /> Valider
            </Button>
          )}
          {p && can('validate_edof') && p.status !== 'REJETEE' && (
            <Button size="sm" variant="ghost" onClick={() => onReject(p.id)}>
              <X /> Rejeter
            </Button>
          )}
          {row.history.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowHistory((v) => !v)}
            >
              <History /> {row.history.length} version(s) précédente(s)
            </Button>
          )}
        </div>
      )}
      {showHistory && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground border-s ps-3">
          {row.history.map((h) => (
            <li key={h.id}>
              {h.document?.name ?? 'Document'} — déposé le{' '}
              {formatDate(h.deposited_at)} par {h.deposited_by ?? '—'} (
              {
                PIECE_STATE[
                  h.status === 'VALIDEE'
                    ? 'VALIDEE'
                    : h.status === 'REJETEE'
                      ? 'REJETEE'
                      : 'A_VALIDER'
                ].label
              }
              , remplacé)
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function PiecesPanel({
  dossier,
  highlight,
}: {
  dossier: Dossier;
  highlight?: string | null;
}) {
  const [uploadRow, setUploadRow] = useState<PieceRow | null>(null);
  const [linkRow, setLinkRow] = useState<PieceRow | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const hidden = useMemo(
    () => dossier.pieces.filter((p) => p.state === 'NON_APPLICABLE').length,
    [dossier.pieces],
  );

  return (
    <div className="space-y-6">
      {hidden > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <Switch id="show-na" checked={showAll} onCheckedChange={setShowAll} />
          <Label htmlFor="show-na" className="font-normal">
            Afficher les {hidden} pièce(s) non applicable(s) à la situation
            déclarée
          </Label>
        </div>
      )}
      {SECTIONS.map((section) => {
        const rows = dossier.pieces.filter(
          (p) =>
            section.stages.includes(p.stage) &&
            (showAll || p.state !== 'NON_APPLICABLE'),
        );
        if (!rows.length) return null;
        return (
          <section key={section.title} className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {section.title}
              </h3>
              <p className="text-xs text-muted-foreground">{section.hint}</p>
            </div>
            <ul className="divide-y divide-border rounded-md border border-border">
              {rows.map((row) => (
                <PieceLine
                  key={row.code}
                  row={row}
                  highlighted={highlight === row.code}
                  onUpload={() => setUploadRow(row)}
                  onLink={() => setLinkRow(row)}
                  onReject={setRejectId}
                />
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Liste établie d’après le référentiel GSMS du{' '}
        {formatDate(dossier.referentiel.version)} :{' '}
        {Object.values(dossier.referentiel.sources).join(' ; ')}.
      </p>
      <UploadDialog
        key={`u-${uploadRow?.code}`}
        dossier={dossier}
        row={uploadRow}
        mode="upload"
        onClose={() => setUploadRow(null)}
      />
      <UploadDialog
        key={`l-${linkRow?.code}`}
        dossier={dossier}
        row={linkRow}
        mode="link"
        onClose={() => setLinkRow(null)}
      />
      <RejectDialog
        key={rejectId ?? 'none'}
        pieceId={rejectId}
        onClose={() => setRejectId(null)}
      />
    </div>
  );
}
