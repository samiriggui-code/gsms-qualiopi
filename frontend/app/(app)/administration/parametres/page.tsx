'use client';

// Paramètres de l'organisme : la fenêtre de réglages de la démo Metronic (store-inventory/settings-modal :
// en-tête de l'organisme, onglets, cartes de réglages ligne par ligne) sur les réglages datés de l'API et
// les modules activables. Un changement s'applique à une date (jamais dans le passé), avec un motif quand
// le réglage a une conséquence réglementaire ; tout est journalisé.
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  History,
  LoaderCircleIcon,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  useChangeSetting,
  useFeatures,
  useRelanceRules,
  useSettingHistory,
  useSettings,
  useToggleFeature,
  type Feature,
  type RelanceRule,
  type Setting,
} from '@/lib/gsms/settings';
import { useCan } from '@/lib/permissions';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Badge, BadgeDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { formatValue, SettingField } from './setting-field';

// Onglets et cartes : domaine de l'API → libellé
const TABS: {
  id: string;
  label: string;
  sections: { domain: string; title: string }[];
}[] = [
  {
    id: 'general',
    label: 'Général',
    sections: [{ domain: 'general', title: 'Identité et préférences' }],
  },
  {
    id: 'formation',
    label: 'Formation',
    sections: [
      { domain: 'training', title: 'Clôture des sessions' },
      { domain: 'journey', title: 'Parcours du stagiaire' },
    ],
  },
  {
    id: 'emargement',
    label: 'Émargement',
    sections: [{ domain: 'attendance', title: 'Demi-journées et signature' }],
  },
  {
    id: 'qualite',
    label: 'Qualité',
    sections: [{ domain: 'quality', title: 'Validation des pièces' }],
  },
  {
    id: 'relances',
    label: 'Relances',
    sections: [{ domain: 'relances', title: 'Envoi des messages' }],
  },
];

// Libellés affichés quand celui de l'API se lit mal avec le champ proposé
const LABELS: Record<string, string> = {
  'relances.regles_desactivees':
    'Règles de relance actives (décocher pour désactiver)',
  'attendance.weekdays': 'Jours de formation',
};

const today = () => new Date().toISOString().slice(0, 10);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-accent/70 rounded-md shadow-none">
      <CardContent className="p-0">
        <h3 className="text-sm font-medium text-foreground py-2.5 ps-2">
          {title}
        </h3>
        <div className="bg-background rounded-md m-1 mt-0 border border-input p-5 space-y-5">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingRow({
  setting,
  canEdit,
  rules,
  onSave,
  onHistory,
}: {
  setting: Setting;
  canEdit: boolean;
  rules?: RelanceRule[];
  onSave: (s: Setting, value: unknown) => void;
  onHistory: (s: Setting) => void;
}) {
  const [draft, setDraft] = useState<unknown>(setting.value);
  useEffect(() => setDraft(setting.value), [setting.value]);
  const dirty = !same(draft, setting.value);
  const readOnly = !canEdit || setting.schema.const !== undefined;

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-2.5 lg:gap-5">
      <div className="flex flex-col gap-1 lg:basis-1/3 min-w-0">
        <Label
          htmlFor={setting.key}
          className="text-sm font-medium leading-snug"
        >
          {LABELS[setting.key] ?? setting.label}
        </Label>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {setting.regulatory && (
            <Badge size="sm" variant="warning" appearance="light">
              <ShieldAlert className="size-3" /> Motif exigé
            </Badge>
          )}
          {setting.since ? (
            <span>En vigueur depuis le {formatDate(setting.since)}</span>
          ) : (
            <span>Valeur par défaut</span>
          )}
        </div>
        {setting.help && (
          <span className="text-xs text-muted-foreground">{setting.help}</span>
        )}
      </div>
      <div className="lg:basis-2/3 min-w-0 space-y-2">
        <SettingField
          id={setting.key}
          schema={setting.schema}
          value={draft}
          onChange={setDraft}
          disabled={readOnly}
          rules={rules}
        />
        {setting.next && (
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <BadgeDot className="bg-primary" />
            Le {formatDate(setting.next.from)} :{' '}
            {formatValue(setting.schema, setting.next.value, rules)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <>
              <Button size="sm" onClick={() => onSave(setting, draft)}>
                <Save /> Enregistrer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(setting.value)}
              >
                <RotateCcw /> Rétablir
              </Button>
            </>
          )}
          {(setting.since || setting.next) && (
            <Button
              size="sm"
              variant="dim"
              mode="link"
              onClick={() => onHistory(setting)}
            >
              <History /> Historique
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveDialog({
  pending,
  onClose,
}: {
  pending: { setting: Setting; value: unknown } | null;
  onClose: () => void;
}) {
  const change = useChangeSetting();
  const [from, setFrom] = useState(today());
  const [reason, setReason] = useState('');
  const s = pending?.setting;

  useEffect(() => {
    setFrom(today());
    setReason('');
    change.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  async function confirm() {
    if (!pending || !s) return;
    try {
      await change.mutateAsync({
        key: s.key,
        value: pending.value,
        effective_from: from,
        reason: reason.trim() || null,
      });
      toast.success(
        from === today()
          ? `${LABELS[s.key] ?? s.label} : modifié`
          : `${LABELS[s.key] ?? s.label} : changement prévu le ${formatDate(from)}`,
      );
      onClose();
    } catch {
      // refus affiché dans la fenêtre
    }
  }

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle>Modifier le réglage</DialogTitle>
          <DialogDescription>
            Le changement s’applique à partir de la date choisie ; l’ancienne
            valeur reste celle des dates antérieures (une séance passée se relit
            avec ses réglages).
          </DialogDescription>
        </DialogHeader>
        {s && pending && (
          <DialogBody className="space-y-4">
            <div className="rounded-md border border-border p-3 text-sm space-y-1">
              <div className="font-medium text-foreground">
                {LABELS[s.key] ?? s.label}
              </div>
              <div className="text-muted-foreground">
                {formatValue(s.schema, s.value)} →{' '}
                <span className="text-foreground">
                  {formatValue(s.schema, pending.value)}
                </span>
              </div>
            </div>
            <Refusal error={change.error} />
            <div className="space-y-1.5">
              <Label htmlFor="setting-from">Date d’effet</Label>
              <Input
                id="setting-from"
                type="date"
                min={today()}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-reason">
                Motif
                {!s.regulatory && (
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    (facultatif)
                  </span>
                )}
              </Label>
              <Textarea
                id="setting-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {s.regulatory && (
                <p className="text-xs text-muted-foreground">
                  Ce réglage a une conséquence sur la preuve ou la conformité :
                  le motif est conservé dans l’historique.
                </p>
              )}
            </div>
          </DialogBody>
        )}
        <DialogFooter className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={confirm}
            disabled={
              change.isPending || !from || (!!s?.regulatory && !reason.trim())
            }
          >
            {change.isPending && <LoaderCircleIcon className="animate-spin" />}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  setting,
  onClose,
  rules,
}: {
  setting: Setting | null;
  onClose: () => void;
  rules?: RelanceRule[];
}) {
  const { data = [], isLoading } = useSettingHistory(setting?.key ?? null);
  return (
    <Dialog open={!!setting} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle>Historique</DialogTitle>
          <DialogDescription>{setting?.label}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <ol className="relative space-y-3 border-s border-border ms-1.5 ps-4">
              {data.map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -start-[21px] top-1.5 size-2 rounded-full bg-primary" />
                  <div className="text-sm text-foreground">
                    {setting && formatValue(setting.schema, h.value, rules)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    À partir du {formatDate(h.effective_from)} · saisi le{' '}
                    {formatDate(h.at, 'd MMM yyyy à HH:mm')}
                  </div>
                  {h.reason && (
                    <div className="text-xs text-secondary-foreground">
                      Motif : {h.reason}
                    </div>
                  )}
                </li>
              ))}
              <li className="relative">
                <span className="absolute -start-[21px] top-1.5 size-2 rounded-full bg-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  Valeur par défaut :{' '}
                  {setting &&
                    formatValue(setting.schema, setting.default, rules)}
                </div>
              </li>
            </ol>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function FeaturesTab({ canEdit }: { canEdit: boolean }) {
  const { data: features = [], isLoading, error } = useFeatures();
  const toggle = useToggleFeature();
  const [pending, setPending] = useState<Feature | null>(null);
  const label = (code: string) =>
    features.find((f) => f.code === code)?.label ?? code;

  async function confirm() {
    if (!pending) return;
    try {
      await toggle.mutateAsync({
        code: pending.code,
        enabled: !pending.enabled,
      });
      toast.success(
        `${pending.label} : ${pending.enabled ? 'désactivé' : 'activé'}`,
      );
      setPending(null);
    } catch (e) {
      toast.error(`${pending.label} : changement refusé`, {
        description: e instanceof Error ? e.message : undefined,
      });
      setPending(null);
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <Section title="Modules de l’application">
      <Refusal error={error} />
      {features.map((f, i) => (
        <React.Fragment key={f.code}>
          {i > 0 && <Separator />}
          <div className="flex items-start gap-5">
            <div className="flex flex-col gap-1 grow min-w-0">
              <span className="text-sm font-medium text-foreground">
                {f.label}
              </span>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {!f.available && (
                  <Badge size="sm" variant="secondary" appearance="light">
                    Non disponible
                  </Badge>
                )}
                {f.depends_on.length > 0 && (
                  <span>Nécessite : {f.depends_on.map(label).join(', ')}</span>
                )}
              </div>
            </div>
            <Switch
              size="sm"
              aria-label={f.label}
              checked={f.enabled}
              disabled={!canEdit || !f.available}
              onCheckedChange={() => setPending(f)}
            />
          </div>
        </React.Fragment>
      ))}
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-sm:max-w-[calc(100vw-1rem)]">
          <DialogHeader>
            <DialogTitle>
              {pending?.enabled ? 'Désactiver' : 'Activer'} « {pending?.label} »
            </DialogTitle>
            <DialogDescription>
              {pending?.enabled
                ? 'Le module disparaît de l’application et ses droits sont retirés ; les données déjà saisies sont conservées.'
                : 'Le module apparaît dans l’application pour les comptes qui en ont les droits.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Annuler
            </Button>
            <Button
              variant={pending?.enabled ? 'destructive' : 'primary'}
              onClick={confirm}
              disabled={toggle.isPending}
            >
              {toggle.isPending && (
                <LoaderCircleIcon className="animate-spin" />
              )}
              {pending?.enabled ? 'Désactiver' : 'Activer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

export default function ParametresPage() {
  const can = useCan();
  const canEdit = can('manage_settings');
  const { data: user } = useCurrentUser();
  const { data: settings, isLoading, error } = useSettings();
  const { data: features = [] } = useFeatures();
  const hasRelances = !!settings?.some((s) => s.domain === 'relances');
  const { data: rules } = useRelanceRules(
    hasRelances && can('manage_communications'),
  );
  const [tab, setTab] = useState('general');
  const [pending, setPending] = useState<{
    setting: Setting;
    value: unknown;
  } | null>(null);
  const [history, setHistory] = useState<Setting | null>(null);

  const byDomain = useMemo(() => {
    const out: Record<string, Setting[]> = {};
    for (const s of settings ?? []) (out[s.domain] ??= []).push(s);
    return out;
  }, [settings]);
  const tabs = TABS.filter((t) =>
    t.sections.some((s) => byDomain[s.domain]?.length),
  );
  const brand = byDomain.general?.find(
    (s) => s.key === 'general.brand_short_name',
  )?.value as string | undefined;
  const scheduled = (settings ?? []).filter((s) => s.next).length;

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Settings className="size-4 text-primary" />
          Paramètres
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <div className="flex justify-between flex-wrap gap-2 border-b border-border pb-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-lg lg:text-[22px] font-semibold text-foreground leading-none">
                  {brand || 'Organisme'}
                </span>
                <Badge size="sm" variant="success" appearance="light">
                  {features.filter((f) => f.enabled).length} modules actifs
                </Badge>
              </div>
              <div className="flex items-center flex-wrap gap-2 text-2sm">
                <span className="text-muted-foreground">Réglages</span>
                <span className="font-medium text-foreground">
                  {settings?.length ?? 0}
                </span>
                <BadgeDot className="bg-muted-foreground size-1" />
                <span className="text-muted-foreground">
                  Changements programmés
                </span>
                <span className="font-medium text-foreground">{scheduled}</span>
                {user && (
                  <>
                    <BadgeDot className="bg-muted-foreground size-1" />
                    <span className="text-muted-foreground">Connecté</span>
                    <span className="font-medium text-foreground">
                      {user.full_name}
                    </span>
                  </>
                )}
              </div>
            </div>
            {!canEdit && (
              <Badge
                variant="secondary"
                appearance="light"
                className="self-start"
              >
                Lecture seule
              </Badge>
            )}
          </div>

          <Refusal error={error} />

          <Tabs
            value={tab}
            onValueChange={setTab}
            className="text-2sm text-muted-foreground w-full space-y-4"
          >
            <div className="w-0 min-w-full overflow-x-auto [scrollbar-width:none]">
              <TabsList className="inline-flex whitespace-nowrap border border-border/80 bg-muted/80 [&_[data-slot=tabs-trigger]]:text-foreground [&_[data-slot=tabs-trigger]]:font-normal [&_[data-slot=tabs-trigger][data-state=active]]:shadow-lg">
                {tabs.map((t) => (
                  <TabsTrigger key={t.id} value={t.id}>
                    {t.label}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="modules">Modules</TabsTrigger>
              </TabsList>
            </div>

            {isLoading && <Skeleton className="h-72 w-full" />}
            {tabs.map((t) => (
              <TabsContent key={t.id} value={t.id} className="space-y-5">
                {t.sections
                  .filter((sec) => byDomain[sec.domain]?.length)
                  .map((sec) => (
                    <Section key={sec.domain} title={sec.title}>
                      {byDomain[sec.domain].map((s, i) => (
                        <React.Fragment key={s.key}>
                          {i > 0 && <Separator />}
                          <SettingRow
                            setting={s}
                            canEdit={canEdit}
                            rules={rules}
                            onSave={(setting, value) =>
                              setPending({ setting, value })
                            }
                            onHistory={setHistory}
                          />
                        </React.Fragment>
                      ))}
                    </Section>
                  ))}
              </TabsContent>
            ))}
            <TabsContent value="modules">
              <FeaturesTab canEdit={canEdit} />
            </TabsContent>
          </Tabs>
        </div>
      </Content>
      <SaveDialog pending={pending} onClose={() => setPending(null)} />
      <HistoryDialog
        setting={history}
        onClose={() => setHistory(null)}
        rules={rules}
      />
    </>
  );
}
