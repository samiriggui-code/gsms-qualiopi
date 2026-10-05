'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  JUDGMENT_TONE,
  useJudge,
  type AuditDetail,
  type AuditItem,
  type Judgment,
} from '@/lib/gsms/audits';
import { READINESS } from '@/lib/gsms/labels';
import { evidenceTypeLabel } from '@/lib/qualiopi/referentiel';
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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Refusal } from '@/components/gsms/refusal';
import { IndicatorName } from '@/components/qualiopi/indicator-name';

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

// Fiche d'un indicateur dans l'audit : ce que la photo contient (résultats, preuves, écarts) et le jugement.
// Après un jugement, on passe à l'indicateur suivant encore à juger.
export function JudgeDialog({
  audit,
  item,
  order,
  onNavigate,
  nextPending,
  onClose,
}: {
  audit: AuditDetail;
  item: AuditItem | null;
  order: number[];
  onNavigate: (n: number) => void;
  nextPending: (n: number) => number | null;
  onClose: () => void;
}) {
  const mutation = useJudge(audit.id);
  const [jugement, setJugement] = useState<Judgment | ''>('');
  const [commentaire, setCommentaire] = useState('');
  const canJudge = audit.capabilities.juger.allowed;
  const choice = audit.jugements_possibles.find((j) => j.jugement === jugement);
  const needsReason = !!choice?.motif_obligatoire;

  useEffect(() => {
    setJugement(item?.jugement ?? '');
    setCommentaire(item?.commentaire ?? '');
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.numero]);

  const idx = item ? order.indexOf(item.numero) : -1;
  const move = (d: number) =>
    onNavigate(order[(idx + d + order.length) % order.length]);

  async function save() {
    if (!item || !jugement) return;
    try {
      await mutation.mutateAsync({
        numero: item.numero,
        jugement,
        commentaire: commentaire.trim(),
      });
      toast.success(`Indicateur ${item.numero} jugé`);
      const next = nextPending(item.numero);
      if (next) onNavigate(next);
      else onClose();
    } catch {
      // refus affiché dans la fenêtre
    }
  }

  const engine = item ? READINESS[item.etat_moteur] : undefined;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)] sm:max-w-2xl">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="pe-6">
                <IndicatorName number={item.numero} />
              </DialogTitle>
              <DialogDescription>
                Indicateur {item.numero} · photo du{' '}
                {formatDate(audit.photo_le, 'd MMM yyyy à HH:mm')}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5 max-h-[60dvh] overflow-y-auto">
              <p className="text-sm text-muted-foreground">{item.titre}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  État calculé par le moteur :
                </span>
                <Badge className={engine?.color}>
                  {engine?.label ?? item.etat_moteur}
                </Badge>
              </div>
              {item.revue_humaine && (
                <Block title="À examiner par l’auditeur">
                  <p className="text-sm text-foreground">
                    {item.revue_humaine}
                  </p>
                </Block>
              )}
              <Block
                title={`Résultats des contrôles (${item.resultats.length})`}
              >
                {item.resultats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun contrôle automatisé : jugement sur pièces.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {item.resultats.map((r, i) => (
                      <li key={i} className="text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            size="sm"
                            className={READINESS[r.status]?.color}
                          >
                            {READINESS[r.status]?.label ?? r.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {r.target === 'ORGANISME'
                              ? 'Organisme'
                              : r.target === 'FORMATION'
                                ? 'Formation'
                                : 'Session'}{' '}
                            · constaté {r.observed}
                          </span>
                        </div>
                        <p className="text-muted-foreground">{r.explanation}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Block>
              <Block title={`Preuves figées (${item.preuves.length})`}>
                {item.preuves.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune preuve dans la photo.
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {item.preuves.slice(0, 30).map((p) => (
                      <li key={p.reference} className="flex gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">
                          {p.reference}
                        </span>
                        <span className="min-w-0 text-foreground">
                          {p.label}
                          <span className="text-muted-foreground">
                            {' '}
                            · {evidenceTypeLabel(p.type)}
                          </span>
                        </span>
                      </li>
                    ))}
                    {item.preuves.length > 30 && (
                      <li className="text-xs text-muted-foreground">
                        et {item.preuves.length - 30} autre(s)
                      </li>
                    )}
                  </ul>
                )}
              </Block>
              {item.ecarts_ouverts.length > 0 && (
                <Block title="Écarts ouverts au moment de la photo">
                  <p className="text-sm text-foreground">
                    {item.ecarts_ouverts.join(', ')}
                  </p>
                </Block>
              )}

              {item.jugement && !canJudge && (
                <Block title="Jugement">
                  <div className="space-y-1">
                    <Badge className={JUDGMENT_TONE[item.jugement]}>
                      {item.jugement_libelle}
                    </Badge>
                    {item.commentaire && (
                      <p className="text-sm text-foreground whitespace-pre-line">
                        {item.commentaire}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {item.par} · {formatDate(item.le, 'd MMM yyyy HH:mm')}
                      {item.constat && ` · constat ${item.constat}`}
                    </p>
                  </div>
                </Block>
              )}

              {canJudge && (
                <fieldset className="space-y-3 rounded-lg border border-border p-3.5">
                  <legend className="px-1 text-sm font-medium text-foreground">
                    Votre jugement
                  </legend>
                  <Refusal error={mutation.error} />
                  <RadioGroup
                    value={jugement}
                    onValueChange={(v) => setJugement(v as Judgment)}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    aria-label="Jugement"
                  >
                    {audit.jugements_possibles.map((j) => (
                      <div key={j.jugement} className="flex items-center gap-2">
                        <RadioGroupItem
                          value={j.jugement}
                          id={`jug-${j.jugement}`}
                        />
                        <Label
                          htmlFor={`jug-${j.jugement}`}
                          className="font-normal"
                        >
                          {j.libelle}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  <div className="space-y-1.5">
                    <Label htmlFor="jug-commentaire">
                      {needsReason ? 'Motif' : 'Commentaire'}
                      {!needsReason && (
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          (facultatif)
                        </span>
                      )}
                    </Label>
                    <Textarea
                      id="jug-commentaire"
                      rows={3}
                      value={commentaire}
                      onChange={(e) => setCommentaire(e.target.value)}
                      placeholder={
                        needsReason
                          ? 'Ce qui manque, avec la preuve examinée'
                          : 'Ce que vous avez examiné'
                      }
                    />
                  </div>
                </fieldset>
              )}
            </DialogBody>
            <DialogFooter className="flex flex-row items-center gap-2">
              <Button
                variant="ghost"
                mode="icon"
                size="sm"
                onClick={() => move(-1)}
                aria-label="Indicateur précédent"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                mode="icon"
                size="sm"
                onClick={() => move(1)}
                aria-label="Indicateur suivant"
              >
                <ChevronRight />
              </Button>
              <div className="ms-auto flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Fermer
                </Button>
                {canJudge && (
                  <Button
                    onClick={save}
                    disabled={
                      mutation.isPending ||
                      !jugement ||
                      (needsReason && !commentaire.trim())
                    }
                  >
                    {mutation.isPending && (
                      <LoaderCircleIcon className="animate-spin" />
                    )}
                    Enregistrer
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
