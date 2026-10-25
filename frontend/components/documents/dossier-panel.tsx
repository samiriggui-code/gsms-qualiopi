'use client';

// Dossier de pièces (organisme) : chaque pièce attendue, son état décidé par l'API, le modèle à
// télécharger, la pièce déposée, et le dépôt avec sa grille. Une pièce déposée devient une preuve
// du moteur, validée ensuite par la qualité (écran Preuves).
import { FormEvent, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  LoaderCircleIcon,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import { TONE } from '@/lib/gsms/labels';
import {
  contentUrl,
  modelUrl,
  useDossier,
  useUploadPiece,
  type DossierItem,
  type PieceState,
} from '@/lib/gsms/qualite';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Refusal } from '@/components/gsms/refusal';

export const PIECE_STATE: Record<PieceState, { label: string; color: string }> =
  {
    MANQUANTE: { label: 'Manquante', color: TONE.danger },
    DEMANDEE: { label: 'Demandée', color: TONE.info },
    EN_RETARD: { label: 'Demande en retard', color: TONE.danger },
    A_COMPLETER: { label: 'À compléter', color: TONE.warn },
    RECUE: { label: 'Reçue', color: TONE.info },
    VALIDEE: { label: 'Validée', color: TONE.ok },
    REJETEE: { label: 'Rejetée', color: TONE.danger },
    EXPIREE: { label: 'Expirée', color: TONE.warn },
  };

const ANSWERS = [
  { value: 'OUI', label: 'Oui' },
  { value: 'NON', label: 'Non' },
  { value: 'SANS_OBJET', label: 'Sans objet' },
];

function UploadDialog({
  subject,
  subjectId,
  item,
  onClose,
}: {
  subject: string;
  subjectId: string;
  item: DossierItem | null;
  onClose: () => void;
}) {
  const upload = useUploadPiece(subject, subjectId);
  const [file, setFile] = useState<File | null>(null);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [forCode, setForCode] = useState<string | null>(null);
  if (item && forCode !== item.code) {
    setForCode(item.code);
    setFile(null);
    setGrid({});
    setNote('');
  } else if (!item && forCode !== null) setForCode(null);

  const answered = item ? item.grille.every((g) => grid[g.code]) : false;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!item || !file) return;
    upload.mutate(
      {
        requirement: item.code,
        file,
        grille: grid,
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${item.label} : pièce déposée`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Déposer : {item?.label}</DialogTitle>
            <DialogDescription>
              Cochez la grille : la personne qui valide la preuve repart de vos
              réponses. « Sans objet » n’est possible que pour une bonne
              pratique, pas pour une exigence du référentiel.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="piece-file">Fichier</Label>
              <Input
                id="piece-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            {item?.grille.map((g) => (
              <fieldset
                key={g.code}
                className="space-y-2 rounded-lg border border-border p-3"
              >
                <legend className="px-1 text-sm font-medium">
                  {g.question}
                </legend>
                <p className="text-xs text-muted-foreground">
                  {g.exigence === 'REFERENTIEL'
                    ? 'Exigence du référentiel'
                    : 'Bonne pratique'}
                  {g.source ? ` · ${g.source}` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ANSWERS.filter(
                    (a) =>
                      a.value !== 'SANS_OBJET' || g.exigence !== 'REFERENTIEL',
                  ).map((a) => (
                    <label
                      key={a.value}
                      className={cn(
                        'cursor-pointer rounded-md border px-3 py-1.5 text-sm',
                        grid[g.code] === a.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border',
                      )}
                    >
                      <input
                        type="radio"
                        name={g.code}
                        value={a.value}
                        className="sr-only"
                        checked={grid[g.code] === a.value}
                        onChange={() =>
                          setGrid((v) => ({ ...v, [g.code]: a.value }))
                        }
                      />
                      {a.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="piece-note">Note (facultatif)</Label>
              <Textarea
                id="piece-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
            {upload.error && <Refusal error={upload.error} />}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!file || !answered || upload.isPending}
            >
              {upload.isPending ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <Upload />
              )}{' '}
              Déposer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// `indicators` : ne garder que les pièces qui servent ces indicateurs (écrans thématiques).
// `subjectId` : undefined pendant le chargement, null s'il n'y a pas encore d'organisme.
export function DossierPanel({
  subject = 'ORGANISME',
  subjectId,
  indicators,
  title,
}: {
  subject?: string;
  subjectId: string | null | undefined;
  indicators?: number[];
  title?: string;
}) {
  const { data, isLoading, error } = useDossier(subject, subjectId);
  const can = useCan()('write_quality');
  const [uploading, setUploading] = useState<DossierItem | null>(null);
  const items = (data?.items ?? []).filter(
    (i) => !indicators || i.indicators.some((n) => indicators.includes(n)),
  );
  const required = items.filter((i) => i.required);
  const done = required.filter(
    (i) => i.state === 'RECUE' || i.state === 'VALIDEE',
  ).length;

  if (error) return <Refusal error={error} />;
  return (
    <Card className="shadow-none overflow-hidden [contain:inline-size]">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 text-primary" />{' '}
          {title ?? data?.label ?? 'Dossier de pièces'}
        </h2>
        {!isLoading && (
          <span className="ms-auto text-xs text-muted-foreground tabular-nums">
            {done}/{required.length} pièces obligatoires reçues
          </span>
        )}
      </div>
      {subjectId === null ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Renseignez d’abord la fiche de l’organisme (Administration, Organisme)
          pour ouvrir son dossier de pièces.
        </p>
      ) : isLoading || !subjectId ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Aucune pièce attendue ici.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const s = PIECE_STATE[item.state];
            return (
              <li
                key={item.code}
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
              >
                <span className="min-w-0 grow basis-60">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium">{item.label}</span>
                    {!item.required && (
                      <Badge size="sm" variant="secondary">
                        Facultative
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Indicateur{item.indicators.length > 1 ? 's' : ''}{' '}
                    {item.indicators.join(', ')}
                    {item.document
                      ? ` · v${item.document.version} déposée le ${formatDate(item.document.uploaded_at)}${item.document.by ? ` par ${item.document.by}` : ''}`
                      : ''}
                    {item.evidence?.valid_until
                      ? ` · valable jusqu’au ${formatDate(item.evidence.valid_until)}`
                      : ''}
                    {item.request
                      ? ` · demandée à ${item.request.from} pour le ${formatDate(item.request.due_on)}`
                      : ''}
                  </span>
                </span>
                <Badge size="sm" className={cn('shrink-0', s.color)}>
                  {s.label}
                </Badge>
                <span className="flex shrink-0 items-center gap-1">
                  {item.modele && (
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      mode="icon"
                      aria-label={`Modèle : ${item.label}`}
                    >
                      <a href={modelUrl(subject, item.code)}>
                        <Download />
                      </a>
                    </Button>
                  )}
                  {item.document && item.document.support !== 'PAPIER' && (
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      mode="icon"
                      aria-label={`Voir : ${item.label}`}
                    >
                      <a
                        href={contentUrl(item.document.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Eye />
                      </a>
                    </Button>
                  )}
                  {can && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setUploading(item)}
                    >
                      <Upload />{' '}
                      {item.document ? 'Nouvelle version' : 'Déposer'}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {subjectId && (
        <UploadDialog
          subject={subject}
          subjectId={subjectId}
          item={uploading}
          onClose={() => setUploading(null)}
        />
      )}
    </Card>
  );
}
