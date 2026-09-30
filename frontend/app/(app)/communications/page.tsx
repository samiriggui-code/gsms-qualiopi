'use client';

// Communications (relances et e-mails) : les trois volets de la boîte mail de la démo Metronic
// (components/layouts/mail : dossiers, liste des messages, lecture), dans la mise en page CRM.
import * as React from 'react';
import { useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  ChevronLeft,
  CircleCheck,
  Clock,
  Inbox,
  LoaderCircleIcon,
  Mail,
  MailQuestion,
  RefreshCw,
  Send,
  ShieldCheck,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  useMessage,
  useMessageAction,
  useMessages,
  usePlanNow,
  type Message,
  type MessageStatus,
} from '@/lib/gsms/communications';
import { TONE } from '@/lib/gsms/labels';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge, BadgeDot } from '@/components/ui/badge';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { IndicatorName } from '@/components/qualiopi/indicator-name';

const STATUS: Record<
  MessageStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  A_VALIDER: { label: 'À valider', color: TONE.warn, icon: MailQuestion },
  PREVU: { label: 'Prévus', color: TONE.info, icon: CalendarClock },
  ENVOYE: { label: 'Envoyés', color: TONE.ok, icon: Send },
  ECHEC: { label: 'Échecs', color: TONE.danger, icon: AlertTriangle },
  SANS_ADRESSE: { label: 'Sans adresse', color: TONE.danger, icon: UserX },
  ANNULE: { label: 'Annulés', color: TONE.neutral, icon: Ban },
};
const FOLDERS: (MessageStatus | 'ALL')[] = [
  'A_VALIDER',
  'PREVU',
  'ENVOYE',
  'ECHEC',
  'SANS_ADRESSE',
  'ANNULE',
  'ALL',
];

const initials = (name: string | null) =>
  (name ?? '?')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

// Hauteur des volets sur ordinateur : l'écran moins l'en-tête et la barre de titre.
const PANE =
  'lg:h-[calc(100vh-var(--header-height)-var(--content-header-height))]';

function Folders({
  value,
  counts,
  total,
  onChange,
}: {
  value: MessageStatus | 'ALL';
  counts: Partial<Record<MessageStatus, number>>;
  total: number;
  onChange: (v: MessageStatus | 'ALL') => void;
}) {
  return (
    <nav
      aria-label="Dossiers"
      className="flex lg:flex-col gap-0.5 p-2.5 lg:w-[220px] shrink-0 border-b lg:border-b-0 lg:border-e border-border max-lg:overflow-x-auto [scrollbar-width:none]"
    >
      {FOLDERS.map((f) => {
        const Icon = f === 'ALL' ? Inbox : STATUS[f].icon;
        const count = f === 'ALL' ? total : (counts[f] ?? 0);
        return (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-secondary-foreground hover:bg-accent hover:text-foreground',
              value === f && 'bg-accent text-foreground font-medium',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="grow text-start">
              {f === 'ALL' ? 'Tous' : STATUS[f].label}
            </span>
            {count > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function MessageList({
  messages,
  selected,
  onSelect,
  loading,
}: {
  messages: Message[];
  selected: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <ScrollArea
      className={cn(
        PANE,
        'lg:w-[340px] lg:shrink-0 max-lg:flex-1 min-w-0 lg:border-e border-border [&_[data-radix-scroll-area-viewport]>div]:!block',
      )}
    >
      <div className="space-y-1 p-2.5">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        {!loading && !messages.length && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Mail className="size-10 text-muted-foreground/40" />
            <div className="text-sm font-medium text-foreground">
              Aucun message ici
            </div>
            <p className="text-xs text-muted-foreground">
              Les relances apparaissent quand le module est activé.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            className={cn(
              'group flex w-full items-center gap-2.5 p-2 rounded-lg text-start transition-colors hover:bg-secondary',
              selected === m.id && 'bg-secondary',
            )}
          >
            <div className="shrink-0 flex items-center justify-center border rounded-full size-[30px] bg-background">
              <Avatar className="size-[30px]">
                <AvatarFallback className="bg-background text-[11px]">
                  {initials(m.destinataire.nom)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm text-foreground truncate">
                  {m.destinataire.nom ?? 'Destinataire inconnu'}
                </span>
                {m.statut === 'A_VALIDER' && (
                  <Badge appearance="ghost" className="px-0">
                    <BadgeDot className="size-2 bg-yellow-500" />
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {m.objet}
              </p>
            </div>
            <span className="text-xs text-secondary-foreground self-start shrink-0">
              {formatDate(m.prevu_le, 'd MMM')}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 text-2sm min-w-0">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-foreground">{children}</span>
    </div>
  );
}

function Reader({ id, onBack }: { id: string | null; onBack: () => void }) {
  const { data: m, isLoading, error } = useMessage(id);
  const action = useMessageAction();
  const can = useCan()('manage_communications');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [motif, setMotif] = useState('');

  if (!id)
    return (
      <div className="flex grow flex-col items-center justify-center gap-2 py-16 text-center max-lg:hidden">
        <div className="flex size-24 items-center justify-center rounded-full bg-muted">
          <Mail className="size-10 text-muted-foreground" />
        </div>
        <div className="text-sm font-semibold text-foreground">
          Aucun message ouvert
        </div>
        <p className="text-xs text-muted-foreground">
          Choisissez un message pour voir son contenu exact.
        </p>
      </div>
    );

  const run = (a: 'valider' | 'annuler' | 'renvoyer', why?: string) =>
    action.mutate(
      { id, action: a, motif: why },
      {
        onSuccess: (res) => {
          toast.success(
            a === 'valider'
              ? res.statut === 'ENVOYE'
                ? 'Message validé et envoyé.'
                : 'Message validé.'
              : a === 'annuler'
                ? 'Message annulé.'
                : 'Nouvel essai programmé.',
          );
          setCancelOpen(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <div className="flex grow flex-col min-w-0">
      {isLoading || !m ? (
        <div className="p-5 space-y-3">
          {error ? (
            <Refusal error={error} />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>
      ) : (
        <ScrollArea
          className={cn(
            PANE,
            'min-w-0 [&_[data-radix-scroll-area-viewport]>div]:!block',
          )}
        >
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                mode="icon"
                size="sm"
                className="lg:hidden"
                onClick={onBack}
                aria-label="Retour à la liste"
              >
                <ChevronLeft />
              </Button>
              <Badge className={STATUS[m.statut].color}>
                {STATUS[m.statut].label.replace(/s$/, '')}
              </Badge>
              <Badge variant="secondary" appearance="light" size="sm">
                {m.externe ? 'Externe' : 'Interne'}
              </Badge>
              <span className="ms-auto text-xs text-muted-foreground">
                {m.reference}
              </span>
            </div>
            <h2 className="text-base font-semibold text-foreground">
              {m.objet}
            </h2>

            <div className="space-y-1.5 rounded-lg border border-border p-3.5">
              <Field label="À">
                {m.destinataire.nom ?? '—'}
                {m.destinataire.email ? (
                  <span className="text-muted-foreground">
                    {' '}
                    &lt;{m.destinataire.email}&gt;
                  </span>
                ) : null}
              </Field>
              <Field label="Prévu le">{formatDate(m.prevu_le)}</Field>
              {m.valide_par && (
                <Field label="Validé">
                  par {m.valide_par} le{' '}
                  {formatDate(m.valide_le, 'd MMM yyyy HH:mm')}
                </Field>
              )}
              {m.envoye_le && (
                <Field label="Envoyé le">
                  {formatDate(m.envoye_le, 'd MMM yyyy HH:mm')}
                </Field>
              )}
              {m.erreur && (
                <Field label="Erreur">
                  <span className="text-destructive">
                    {m.erreur} ({m.tentatives} tentative
                    {m.tentatives > 1 ? 's' : ''})
                  </span>
                </Field>
              )}
              {m.motif_annulation && (
                <Field label="Annulé">{m.motif_annulation}</Field>
              )}
              <Field label="Modèle">
                {m.modele} v{m.version_modele}
              </Field>
              {m.indicateurs.length > 0 && (
                <Field label="Indicateurs">
                  <span className="inline-flex flex-wrap gap-1">
                    {m.indicateurs.map((n) => (
                      <Badge key={n} variant="secondary" size="sm">
                        <ShieldCheck className="size-3" />{' '}
                        <IndicatorName number={n} />
                      </Badge>
                    ))}
                  </span>
                </Field>
              )}
            </div>

            {can &&
              (m.statut === 'A_VALIDER' ||
                m.statut === 'PREVU' ||
                m.statut === 'ECHEC') && (
                <div className="flex flex-wrap items-center gap-2">
                  {m.statut === 'A_VALIDER' && (
                    <Button
                      size="sm"
                      disabled={action.isPending}
                      onClick={() => run('valider')}
                    >
                      {action.isPending ? (
                        <LoaderCircleIcon className="animate-spin" />
                      ) : (
                        <CircleCheck />
                      )}
                      Valider et envoyer
                    </Button>
                  )}
                  {m.statut === 'ECHEC' && (
                    <Button
                      size="sm"
                      disabled={action.isPending}
                      onClick={() => run('renvoyer')}
                    >
                      <RefreshCw /> Réessayer l’envoi
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMotif('');
                      setCancelOpen(true);
                    }}
                  >
                    <Ban /> Annuler l’envoi
                  </Button>
                </div>
              )}

            <div className="overflow-hidden rounded-lg border border-border bg-white">
              <iframe
                title={`Contenu : ${m.objet}`}
                srcDoc={m.html}
                sandbox=""
                className="block h-[560px] w-full"
              />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> Contenu exact tel qu’envoyé ·
              empreinte SHA-256 {m.empreinte.slice(0, 16)}…
            </p>
          </div>
        </ScrollArea>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler l’envoi</DialogTitle>
            <DialogDescription>
              Le message reste dans le journal, avec votre motif.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            <Label htmlFor="motif">Motif</Label>
            <Textarea
              id="motif"
              rows={3}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Retour
            </Button>
            <Button
              variant="destructive"
              disabled={!motif.trim() || action.isPending}
              onClick={() => run('annuler', motif.trim())}
            >
              Annuler l’envoi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CommunicationsPage() {
  const { data, isLoading, error } = useMessages();
  const plan = usePlanNow();
  const can = useCan()('manage_communications');
  const [folder, setFolder] = useState<MessageStatus | 'ALL'>('A_VALIDER');
  const [selected, setSelected] = useState<string | null>(null);

  const messages = (data?.messages ?? []).filter(
    (m) => folder === 'ALL' || m.statut === folder,
  );
  const counts = data?.compteurs ?? {};
  const total = Object.values(counts).reduce((n, v) => n + (v ?? 0), 0);

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Mail className="size-4 text-primary" />
          Communications
          {(counts.A_VALIDER ?? 0) > 0 && (
            <Badge variant="warning" appearance="light" size="sm">
              {counts.A_VALIDER} à valider
            </Badge>
          )}
        </h1>
        {can && (
          <Button
            size="sm"
            variant="outline"
            disabled={plan.isPending}
            onClick={() =>
              plan.mutate(undefined, {
                onSuccess: (r) =>
                  toast.success(
                    r.inactif
                      ? 'Le module Relances est désactivé (Réglages).'
                      : `Planification faite : ${r.crees ?? 0} message(s) créé(s).`,
                  ),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            {plan.isPending ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Planifier maintenant
          </Button>
        )}
      </ContentHeader>
      <Content className="grid py-0">
        {error ? (
          <div className="p-5">
            <Refusal error={error} />
          </div>
        ) : (
          <div className="flex max-lg:flex-col grow min-w-0">
            <Folders
              value={folder}
              counts={counts}
              total={total}
              onChange={(f) => {
                setFolder(f);
                setSelected(null);
              }}
            />
            <div
              className={cn('flex grow min-w-0', selected && 'max-lg:hidden')}
            >
              <MessageList
                messages={messages}
                selected={selected}
                onSelect={setSelected}
                loading={isLoading}
              />
              <div className="hidden lg:flex grow min-w-0">
                <Reader id={selected} onBack={() => setSelected(null)} />
              </div>
            </div>
            {selected && (
              <div className="flex grow min-w-0 lg:hidden">
                <Reader id={selected} onBack={() => setSelected(null)} />
              </div>
            )}
          </div>
        )}
      </Content>
    </>
  );
}
