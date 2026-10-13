'use client';

// Fiche détaillée d'une formation, sur le modèle des fiches formation de GSMS School : bandeau, visuel et
// repères à gauche, onglets à droite. Tout vient de la fiche formation (/fiches/{id}) et du catalogue
// (/formation/catalogue/{id}) : rien n'est calculé ni inventé ici. Un manque s'affiche comme un manque.
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Award,
  BookOpenCheck,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  ListChecks,
  MapPin,
  Pencil,
  Target,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import {
  euros,
  frDate,
  hours,
  splitPrerequisite,
  useCatalogueItem,
  type CatalogueFormation,
  type EvaluationStep,
} from '@/lib/gsms/catalogue';
import { useFiche, type Fiche, type ProgramModule } from '@/lib/gsms/edof';
import { SESSION_STATUS, TONE } from '@/lib/gsms/labels';
import type { SessionStatus } from '@/lib/gsms/types';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  optionLabel,
  RESOURCE_KINDS,
  RESOURCE_STATUS,
} from '@/components/edof/labels';
import { Refusal } from '@/components/gsms/refusal';
import { FormationQualiopi } from './formation-qualiopi';
import { FormationVisual } from './formation-visual';

export const FICHE_STATE: Record<
  CatalogueFormation['fiche'],
  { label: string; color: string }
> = {
  VALIDEE: { label: 'Fiche validée', color: TONE.ok },
  MODIFIEE: { label: 'Modifiée depuis la validation', color: TONE.warn },
  JAMAIS_VALIDEE: { label: 'Fiche à valider', color: TONE.neutral },
};

// Rubrique concernée par un point à arbitrer (review_notes.champ).
const CHAMP: Record<string, string> = {
  price_eur: 'Tarif',
  duration_hours: 'Durée',
  evaluation_methods: 'Modalités d’évaluation',
  success_rate: 'Taux de réussite',
  basis: 'Certification',
  modules: 'Programme',
  content: 'Présentation',
  skills: 'Compétences visées',
  audience: 'Public',
  prerequisites: 'Prérequis',
};

const pct = (v: number | null | undefined) =>
  v == null ? null : `${v.toLocaleString('fr-FR')} %`;

const str = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

const list = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

// ── Briques de mise en page ───────────────────────────────────────────────────

function Strip({
  items,
}: {
  items: { value: ReactNode; label: string; hint?: ReactNode }[];
}) {
  return (
    <div className="rounded-md bg-accent/70 p-1">
      <div className="grid grid-cols-2 md:grid-cols-4 rounded-md border border-border bg-background">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={cn(
              'flex flex-col justify-between gap-3 p-4',
              i % 2 === 1 && 'border-s border-border',
              i >= 2 && 'max-md:border-t md:border-s border-border',
            )}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xl lg:text-2xl font-semibold text-foreground leading-tight">
                {it.value ?? (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </span>
              <span className="text-xs text-secondary-foreground/70">
                {it.label}
              </span>
            </div>
            {it.hint && (
              <div className="text-xs text-secondary-foreground">{it.hint}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-md bg-accent/50 flex flex-col', className)}>
      <h3 className="text-sm font-medium text-foreground py-2.5 ps-3">
        {title}
      </h3>
      <div className="m-1 mt-0 rounded-md border border-input bg-background px-4 py-4 grow">
        {children}
      </div>
    </section>
  );
}

function IconRow({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Users;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0 border-b border-border last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent/60">
          <Icon className="size-4.5 text-secondary-foreground/70" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-2sm font-medium text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </div>
      <div className="text-sm font-medium text-foreground text-end max-w-[55%]">
        {children}
      </div>
    </div>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return (
    <span className="text-sm font-normal text-muted-foreground italic">
      {children}
    </span>
  );
}

function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground/80 pt-0.5">
        {label}
      </span>
      <span className="text-xs font-medium text-foreground text-end min-w-0 break-words">
        {value ?? <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

// ── Onglets ───────────────────────────────────────────────────────────────────

function Overview({
  f,
  fiche,
  measured,
}: {
  f: CatalogueFormation;
  fiche: Fiche;
  measured: number | null;
}) {
  const p = fiche.program;
  const skills = list(p.skills);
  const objectives = list(p.objectives);
  const prereq = list(p.prerequisites);
  const priceToConfirm = p.review_notes.some((n) => n.champ === 'price_eur');
  return (
    <div className="space-y-5">
      <Strip
        items={[
          {
            value: hours(f.duration_hours),
            label: 'Durée de la formation',
            hint: f.delivery_label ?? 'Modalité non précisée',
          },
          {
            value: euros(f.price_eur),
            label: 'Tarif affiché',
            hint: priceToConfirm ? (
              <Badge size="sm" className={TONE.warn}>
                À confirmer
              </Badge>
            ) : (
              'Fiche formation'
            ),
          },
          {
            value: f.modules || null,
            label: 'Modules au programme',
            hint: `${f.ressources.total} ressource${f.ressources.total > 1 ? 's' : ''} pédagogique${f.ressources.total > 1 ? 's' : ''}`,
          },
          {
            value: pct(f.publie.taux_reussite) ?? (
              <span className="text-base text-muted-foreground font-medium">
                Non publié
              </span>
            ),
            label: 'Taux de réussite publié',
            hint:
              measured != null
                ? `Mesuré sur 12 mois : ${pct(measured)}`
                : 'Aucun examen mesuré sur 12 mois',
          },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-2 items-stretch">
        <Panel title="Présentation de la formation">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border">
                <BookOpenCheck className="size-5 text-primary" />
              </span>
              <span className="text-base font-semibold text-foreground">
                {f.code}
              </span>
            </div>
            {str(p.content) ? (
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {str(p.content)}
              </p>
            ) : (
              <Missing>Présentation à rédiger sur la fiche formation.</Missing>
            )}
            {(objectives.length > 0 || skills.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {objectives.length ? 'Objectifs' : 'Compétences visées'}
                </p>
                <ul className="space-y-1.5">
                  {(objectives.length ? objectives : skills).map((s) => (
                    <li
                      key={s}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <Target className="size-4 mt-0.5 shrink-0 text-primary" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Détails complémentaires">
          <IconRow
            icon={Users}
            title="Public concerné"
            subtitle="Bénéficiaires"
          >
            {str(p.audience) ?? <Missing>À préciser</Missing>}
          </IconRow>
          <IconRow
            icon={ListChecks}
            title="Prérequis"
            subtitle="Conditions d’accès"
          >
            {prereq.length ? (
              <>
                {splitPrerequisite(prereq[0]).item}
                {prereq.length > 1 && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    et {prereq.length - 1} autre{prereq.length > 2 ? 's' : ''}
                  </span>
                )}
              </>
            ) : (
              <Missing>À préciser</Missing>
            )}
          </IconRow>
          <IconRow
            icon={Award}
            title="Certification"
            subtitle="Fondement déclaré"
          >
            {f.certification.code ? (
              <Badge size="sm" className={TONE.ok}>
                {f.certification.code}
              </Badge>
            ) : (
              <span className="text-xs">{f.certification.basis_label}</span>
            )}
          </IconRow>
          <IconRow
            icon={FileText}
            title="Ressources pédagogiques"
            subtitle="Supports, cours, quiz"
          >
            {f.ressources.total ? (
              <>
                {f.ressources.total}
                {f.ressources.a_rediger > 0 && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    dont {f.ressources.a_rediger} à rédiger
                  </span>
                )}
              </>
            ) : (
              <Missing>Aucune</Missing>
            )}
          </IconRow>
        </Panel>
      </div>
    </div>
  );
}

function ModuleList({
  modules,
  resources,
}: {
  modules: ProgramModule[];
  resources: Fiche['resources'];
}) {
  if (!modules.length)
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Aucun module détaillé sur la fiche : le programme reste à rédiger.
      </p>
    );
  return (
    <Accordion
      type="multiple"
      variant="outline"
      defaultValue={[modules[0].code]}
    >
      {modules.map((m) => {
        const linked = resources.filter((r) => r.module_code === m.code);
        return (
          <AccordionItem key={m.code} value={m.code} className="bg-accent/30">
            <AccordionTrigger className="py-3 hover:no-underline">
              <span className="flex items-center gap-3 text-start min-w-0">
                <span className="font-bold text-primary min-w-10 shrink-0">
                  {m.code}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {m.title}
                </span>
                {m.hours != null && (
                  <Badge size="sm" variant="outline" className="shrink-0">
                    {hours(Number(m.hours))}
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4 space-y-3">
              {m.details.length ? (
                <ul className="list-disc ps-5 space-y-1.5">
                  {m.details.map((d) => (
                    <li key={d} className="text-2sm text-muted-foreground">
                      {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <Missing>Contenu du module à détailler.</Missing>
              )}
              {linked.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {linked.map((r) => (
                    <Badge key={r.id} size="sm" variant="outline">
                      {optionLabel(RESOURCE_KINDS, r.kind)} : {r.title}
                    </Badge>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function Programme({ f, fiche }: { f: CatalogueFormation; fiche: Fiche }) {
  const p = fiche.program;
  const spread = p.modules.reduce(
    (s, m) => s + (m.hours != null ? Number(m.hours) : 0),
    0,
  );
  return (
    <div className="space-y-5">
      <Strip
        items={[
          { value: p.modules.length || null, label: 'Modules' },
          { value: hours(f.duration_hours), label: 'Volume horaire' },
          {
            value: spread ? hours(spread) : null,
            label: 'Heures réparties par module',
            hint: spread ? null : 'Répartition à indiquer',
          },
          {
            value: fiche.resources.length || null,
            label: 'Ressources pédagogiques',
            hint: f.ressources.a_rediger
              ? `${f.ressources.a_rediger} à rédiger`
              : null,
          },
        ]}
      />
      <ModuleList modules={p.modules} resources={fiche.resources} />
      <Panel title="Méthodes et moyens pédagogiques">
        <div className="space-y-3 text-sm">
          {str(p.teaching_methods) ? (
            <p className="text-muted-foreground">{str(p.teaching_methods)}</p>
          ) : (
            <Missing>Méthodes pédagogiques à rédiger.</Missing>
          )}
          {str(p.teaching_means) && (
            <p className="text-muted-foreground">{str(p.teaching_means)}</p>
          )}
        </div>
      </Panel>
      {fiche.resources.length > 0 && (
        <Panel title="Ressources de la formation">
          <ul className="divide-y divide-border text-sm">
            {fiche.resources.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0"
              >
                <span className="font-medium grow basis-48">{r.title}</span>
                <Badge size="sm" variant="outline">
                  {optionLabel(RESOURCE_KINDS, r.kind)}
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
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Prerequisites({ fiche }: { fiche: Fiche }) {
  const p = fiche.program;
  const rows = list(p.prerequisites).map(splitPrerequisite);
  return (
    <div className="space-y-5">
      <Strip
        items={[
          { value: rows.length || null, label: 'Prérequis' },
          {
            value: str(p.access_delay) ? (
              <span className="text-base">{str(p.access_delay)}</span>
            ) : null,
            label: 'Délai d’accès',
          },
          {
            value: str(p.audience) ? (
              <span className="text-base">{str(p.audience)}</span>
            ) : null,
            label: 'Public visé',
          },
          {
            value: (
              <span className="text-base">
                {str(p.accessibility_info) ? 'Renseignée' : 'À rédiger'}
              </span>
            ),
            label: 'Accessibilité (handicap)',
          },
        ]}
      />
      {rows.length ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-accent/40 text-start">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium text-secondary-foreground w-[38%]">
                  Prérequis
                </th>
                <th className="px-4 py-2.5 text-start font-medium text-secondary-foreground">
                  Détail des conditions d’accès
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.item}>
                  <td className="px-4 py-3 font-medium align-top">{r.item}</td>
                  <td className="px-4 py-3 text-foreground">
                    {r.detail ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun prérequis indiqué (écrire « Aucun » s’il n’y en a pas).
        </p>
      )}
      <Panel title="Accessibilité aux personnes en situation de handicap">
        {str(p.accessibility_info) ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {str(p.accessibility_info)}
          </p>
        ) : (
          <Missing>Modalités d’accueil et d’adaptation à rédiger.</Missing>
        )}
      </Panel>
    </div>
  );
}

const STEP_ICON = [ClipboardCheck, BookOpenCheck, GraduationCap];

function Evaluation({ fiche }: { fiche: Fiche }) {
  const p = fiche.program;
  const steps = (
    Array.isArray(p.evaluation_steps) ? p.evaluation_steps : []
  ) as EvaluationStep[];
  const cert = fiche.certification;
  return (
    <div className="space-y-5">
      {steps.length ? (
        <div className="space-y-3">
          {steps.map((s, i) => {
            const Icon = STEP_ICON[Math.min(i, STEP_ICON.length - 1)];
            return (
              <div
                key={s.title}
                className="flex items-start gap-4 rounded-md border border-border bg-accent/50 p-4"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                  <Icon className="size-5 text-primary" />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-foreground">{s.title}</h4>
                    {s.kind && (
                      <Badge
                        size="sm"
                        variant="outline"
                        className="bg-background"
                      >
                        {s.kind}
                      </Badge>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-sm text-muted-foreground">
                      {s.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : str(p.evaluation_methods) ? (
        <Panel title="Modalités d’évaluation">
          <p className="text-sm text-muted-foreground">
            {str(p.evaluation_methods)}
          </p>
        </Panel>
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Modalités d’évaluation à rédiger.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Certification visée">
          <IconRow
            icon={Award}
            title="Fondement"
            subtitle="Déclaré sur la fiche"
          >
            <span className="text-xs">
              {fiche.certification_bases[cert?.basis ?? 'A_DETERMINER']}
            </span>
          </IconRow>
          <IconRow icon={FileText} title="Code" subtitle="RNCP ou RS">
            {str(cert?.code) ?? <Missing>Non renseigné</Missing>}
          </IconRow>
          <IconRow
            icon={ClipboardCheck}
            title="Habilitation"
            subtitle="De l’organisme"
          >
            <span className="text-xs">
              {fiche.habilitations[cert?.habilitation ?? 'A_VERIFIER']}
            </span>
          </IconRow>
        </Panel>
        <Panel title="Intervenants">
          {fiche.trainers.length ? (
            <ul className="space-y-3">
              {fiche.trainers.map((t) => (
                <li key={t.id} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
                    <UserRound className="size-4.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {fiche.roles[t.role] ?? t.role}
                      {t.modules.length ? ` · ${t.modules.join(', ')}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Missing>Aucun intervenant associé à la formation.</Missing>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Sessions({ id }: { id: string }) {
  const { data, isLoading, error } = useCatalogueItem(id);
  if (isLoading) return <Skeleton className="h-48" />;
  if (!data) return <Refusal error={error} />;
  const m = data.mesure;
  return (
    <div className="space-y-5">
      <Strip
        items={[
          {
            value: m ? m.stagiaires : 0,
            label: 'Stagiaires sur 12 mois',
            hint: m
              ? `${m.sessions} session${m.sessions > 1 ? 's' : ''} terminée${m.sessions > 1 ? 's' : ''}`
              : 'Aucune session terminée',
          },
          {
            value: pct(m?.taux_reussite),
            label: 'Réussite mesurée',
            hint: m?.examines
              ? `${m.reussis} reçu${m.reussis > 1 ? 's' : ''} sur ${m.examines}`
              : 'Aucun examen enregistré',
          },
          {
            value: pct(m?.taux_satisfaction),
            label: 'Satisfaction à chaud',
            hint: m?.repondants
              ? `${m.satisfaits} satisfait${m.satisfaits > 1 ? 's' : ''} sur ${m.repondants}`
              : 'Aucune réponse',
          },
          {
            value: pct(m?.taux_abandon),
            label: 'Abandons',
            hint: m ? `${m.abandons} sur ${m.stagiaires}` : null,
          },
        ]}
      />
      {data.ecarts.length > 0 && (
        <div className="rounded-md border border-border bg-accent/40 p-3 space-y-1.5">
          {data.ecarts.map((e) => (
            <p key={e} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="size-4 mt-0.5 shrink-0 text-[var(--color-warning-accent,var(--color-yellow-600))]" />
              {e}
            </p>
          ))}
          <Link
            href="/formation/resultats"
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            Voir les résultats et publier les taux
          </Link>
        </div>
      )}
      {data.sessions.length ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.sessions.map((s) => {
            const st = SESSION_STATUS[s.status as SessionStatus];
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-md border border-border bg-accent/40 leading-none">
                  <span className="text-sm font-semibold">
                    {new Date(s.start_date).getUTCDate()}
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {new Date(s.start_date).toLocaleDateString('fr-FR', {
                      month: 'short',
                      timeZone: 'UTC',
                    })}
                  </span>
                </span>
                <span className="grow basis-52 min-w-0">
                  <Link
                    href={`/formation/sessions/${s.id}`}
                    className="text-sm font-medium hover:text-primary"
                  >
                    {s.reference}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    Du {frDate(s.start_date)} au {frDate(s.end_date)}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5 text-xs text-muted-foreground basis-40 grow">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    {[s.location, s.room].filter(Boolean).join(' · ') ||
                      'Lieu à préciser'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound className="size-3.5" />
                    {s.trainer_name ?? 'Formateur à désigner'}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {s.learners}
                  {s.capacity ? ` / ${s.capacity}` : ''} inscrit
                  {s.learners > 1 ? 's' : ''}
                </span>
                {st && (
                  <Badge size="sm" className={st.color}>
                    {st.label}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Aucune session enregistrée pour cette formation.
        </p>
      )}
    </div>
  );
}

function Review({ fiche }: { fiche: Fiche }) {
  const notes = fiche.program.review_notes;
  return (
    <div className="space-y-5">
      {fiche.missing.length > 0 && (
        <Panel title={`Rubriques à compléter (${fiche.missing.length})`}>
          <ul className="flex flex-wrap gap-1.5">
            {fiche.missing.map((m) => (
              <li key={m.field}>
                <Badge size="sm" className={TONE.warn}>
                  {m.label}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {notes.length ? (
        <ul className="space-y-3">
          {notes.map((n, i) => (
            <li
              key={`${n.champ}-${i}`}
              className="rounded-md border border-border bg-accent/40 p-4 space-y-1.5"
            >
              <Badge size="sm" variant="outline" className="bg-background">
                {CHAMP[n.champ] ?? n.champ}
              </Badge>
              <p className="text-sm text-foreground">{n.message}</p>
              <p className="text-xs text-muted-foreground">
                Source : {n.source}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun point à arbitrer sur cette fiche.
        </p>
      )}
    </div>
  );
}

// ── Fiche ─────────────────────────────────────────────────────────────────────

export function FormationSheet({
  formation: f,
  open,
  onOpenChange,
  canEdit,
  onEdit,
  onDelete,
}: {
  formation: CatalogueFormation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const quality = useCan()('read_quality');
  const fiche = useFiche(open ? f?.id : undefined);
  const item = useCatalogueItem(open ? f?.id : undefined);
  const state = f ? FICHE_STATE[f.fiche] : null;
  const p = fiche.data?.program;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[1080px] sm:max-w-none inset-5 start-auto max-sm:inset-2 max-sm:w-auto h-auto rounded-lg p-0 gap-0 flex flex-col [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-3.5">
          <SheetTitle className="font-medium">Fiche formation</SheetTitle>
        </SheetHeader>
        {f && (
          <SheetBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="shrink-0 border-b border-border px-5 py-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-lg lg:text-[22px] font-semibold leading-tight text-foreground">
                  {f.title}
                </span>
                {state && (
                  <Badge size="sm" className={state.color}>
                    {state.label}
                  </Badge>
                )}
                {f.points_a_arbitrer > 0 && (
                  <Badge size="sm" className={TONE.warn}>
                    {f.points_a_arbitrer} point
                    {f.points_a_arbitrer > 1 ? 's' : ''} à arbitrer
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2sm">
                {[
                  ['Filière', f.track_label],
                  ['Parcours', f.pathway_label ?? 'Non précisé'],
                  ['Durée', hours(f.duration_hours) ?? 'À fixer'],
                  ['Modalité', f.delivery_label ?? 'Non précisée'],
                ].map(([k, v], i) => (
                  <span key={k} className="inline-flex items-center gap-2">
                    {i > 0 && (
                      <span className="size-1 rounded-full bg-muted-foreground" />
                    )}
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium text-foreground">{v}</span>
                  </span>
                ))}
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-wrap lg:flex-nowrap px-5">
                <aside className="w-full lg:w-[240px] shrink-0 py-5 lg:pe-5 grid grid-cols-[88px_1fr] gap-4 items-start lg:block lg:space-y-4">
                  <FormationVisual
                    slug={f.catalog_slug}
                    track={f.track}
                    code={f.code}
                    className="aspect-square lg:aspect-[4/3] w-full rounded-xl border border-border"
                  />
                  <div>
                    <KeyValue label="Code" value={f.code} />
                    <KeyValue
                      label="Certification"
                      value={
                        f.certification.code ?? f.certification.basis_label
                      }
                    />
                    <KeyValue label="Tarif" value={euros(f.price_eur)} />
                    <KeyValue
                      label="Délai d’accès"
                      value={str(p?.access_delay)}
                    />
                    <KeyValue
                      label="Prochaine session"
                      value={
                        f.sessions.prochaine
                          ? frDate(f.sessions.prochaine.start_date)
                          : 'Aucune planifiée'
                      }
                    />
                    <KeyValue
                      label="Fiche relue le"
                      value={frDate(f.fiche_relue_le)}
                    />
                  </div>
                </aside>
                <div className="grow min-w-0 py-5 lg:border-s lg:border-border lg:ps-5">
                  {fiche.isLoading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-24" />
                      <Skeleton className="h-64" />
                    </div>
                  ) : !fiche.data ? (
                    <Refusal error={fiche.error} />
                  ) : (
                    <Tabs defaultValue="apercu" className="text-sm">
                      <TabsList className="mb-4 max-lg:w-0 max-lg:min-w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] h-auto gap-1">
                        <TabsTrigger value="apercu">Vue d’ensemble</TabsTrigger>
                        <TabsTrigger value="programme">Programme</TabsTrigger>
                        <TabsTrigger value="prerequis">Prérequis</TabsTrigger>
                        <TabsTrigger value="evaluation">Évaluation</TabsTrigger>
                        <TabsTrigger value="sessions">
                          Sessions ({f.sessions.total})
                        </TabsTrigger>
                        <TabsTrigger value="arbitrer">
                          À arbitrer (
                          {fiche.data.program.review_notes.length +
                            fiche.data.missing.length}
                          )
                        </TabsTrigger>
                        {quality && (
                          <TabsTrigger value="qualiopi">Qualiopi</TabsTrigger>
                        )}
                      </TabsList>
                      <TabsContent value="apercu">
                        <Overview
                          f={f}
                          fiche={fiche.data}
                          measured={item.data?.mesure?.taux_reussite ?? null}
                        />
                      </TabsContent>
                      <TabsContent value="programme">
                        <Programme f={f} fiche={fiche.data} />
                      </TabsContent>
                      <TabsContent value="prerequis">
                        <Prerequisites fiche={fiche.data} />
                      </TabsContent>
                      <TabsContent value="evaluation">
                        <Evaluation fiche={fiche.data} />
                      </TabsContent>
                      <TabsContent value="sessions">
                        <Sessions id={f.id} />
                      </TabsContent>
                      <TabsContent value="arbitrer">
                        <Review fiche={fiche.data} />
                      </TabsContent>
                      {quality && (
                        <TabsContent value="qualiopi">
                          <FormationQualiopi id={f.id} />
                        </TabsContent>
                      )}
                    </Tabs>
                  )}
                </div>
              </div>
            </ScrollArea>
          </SheetBody>
        )}
        <SheetFooter className="shrink-0 flex-row flex-wrap items-center gap-2.5 border-t border-border px-5 py-4">
          {canEdit && f && (
            <Button
              variant="ghost"
              className="text-destructive me-auto"
              onClick={onDelete}
            >
              <Trash2 /> <span className="max-sm:sr-only">Supprimer</span>
            </Button>
          )}
          {f && (
            <Button variant="outline" asChild className="max-sm:grow">
              <Link href={`/formation/edof/${f.id}`}>
                <ExternalLink /> Fiche complète
              </Link>
            </Button>
          )}
          {canEdit && f && (
            <Button variant="outline" onClick={onEdit} className="max-sm:grow">
              <Pencil /> Modifier
            </Button>
          )}
          <Button
            variant="mono"
            className="max-sm:hidden"
            onClick={() => onOpenChange(false)}
          >
            Fermer
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
