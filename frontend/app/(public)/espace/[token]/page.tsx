import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import {
  Accessibility,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  UserRound,
} from 'lucide-react';
import { API_URL } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Mon espace formation',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

interface Espace {
  organisme: {
    nom: string | null;
    contact: string | null;
    referent_handicap: { nom: string; email: string | null } | null;
  };
  stagiaire: { prenom: string; statut: string };
  formation: {
    intitule: string;
    reference: string;
    debut: string;
    fin: string;
    statut: string;
    lieu: string | null;
    salle: string | null;
    formateur: string | null;
  };
  creneaux: {
    jour: string;
    periode: string;
    debut: string | null;
    fin: string | null;
    present: boolean | null;
  }[];
  assiduite: {
    prevues: number;
    suivies: number;
    heures_prevues: string | null;
    heures_suivies: string | null;
  };
  a_faire: { titre: string; jusqu_au: string; lien: string }[];
  questionnaires_repondus: { titre: string; repondu_le: string }[];
  documents: {
    type: string;
    titre: string;
    emis_le: string | null;
    lien: string;
  }[];
  convention: { signee_le: string } | null;
  expire_le: string;
}

type Loaded =
  | { ok: true; data: Espace }
  | { ok: false; status: number; detail: string };

async function load(token: string): Promise<Loaded> {
  const res = await fetch(
    `${API_URL}/api/v1/public/espace/${encodeURIComponent(token)}`,
    { cache: 'no-store' },
  ).catch(() => null);
  if (res === null)
    return {
      ok: false,
      status: 503,
      detail: 'Le service est momentanément indisponible. Réessayez plus tard.',
    };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      res.status === 404
        ? "Ce lien n'est pas valide. Vérifiez qu'il est complet."
        : body.detail;
    return {
      ok: false,
      status: res.status,
      detail: detail ?? "Cet espace n'est pas disponible.",
    };
  }
  return { ok: true, data: body };
}

const date = (
  iso: string,
  opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  },
) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', opts);
const period = (a: string, b: string) =>
  a === b ? `le ${date(a)}` : `du ${date(a)} au ${date(b)}`;

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FileText;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary" /> {title}
      </h2>
      {children}
    </section>
  );
}

function LinkRow({
  href,
  title,
  detail,
  external,
}: {
  href: string;
  title: string;
  detail?: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="group flex min-h-12 items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="min-w-0 grow">
        <span className="block text-sm font-medium">{title}</span>
        {detail && (
          <span className="block text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
    </a>
  );
}

// Espace du stagiaire : lien personnel, sans compte. L'API décide de tout ce qui s'affiche.
export default async function EspacePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await load(token);
  if (!loaded.ok) {
    return (
      <main className="px-4 py-10">
        <section className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">
            {loaded.status === 410 ? 'Espace fermé' : 'Espace indisponible'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{loaded.detail}</p>
        </section>
      </main>
    );
  }
  const d = loaded.data;
  const f = d.formation;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = d.creneaux.filter((c) => c.jour >= today);
  const ended = f.fin < today;

  return (
    <main className="px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <header className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {d.organisme.nom ?? 'Votre organisme de formation'}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Bonjour {d.stagiaire.prenom},
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            voici votre espace pour la formation{' '}
            <span className="font-medium text-foreground">{f.intitule}</span>,{' '}
            {period(f.debut, f.fin)}.
          </p>
          <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
            {f.lieu && (
              <span className="inline-flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />{' '}
                {f.lieu}
                {f.salle ? `, ${f.salle}` : ''}
              </span>
            )}
            {f.formateur && (
              <span className="inline-flex items-center gap-2">
                <UserRound className="size-4 shrink-0 text-primary" /> Formateur
                : {f.formateur}
              </span>
            )}
          </div>
        </header>

        {d.a_faire.length > 0 && (
          <Section icon={Clock} title="À faire de votre côté">
            <div className="space-y-2">
              {d.a_faire.map((q) => (
                <LinkRow
                  key={q.lien}
                  href={q.lien}
                  title={q.titre}
                  detail={`Quelques minutes · jusqu’au ${date(q.jusqu_au)}`}
                />
              ))}
            </div>
          </Section>
        )}

        {!ended && upcoming.length > 0 && (
          <Section icon={CalendarDays} title="Vos demi-journées à venir">
            <ul className="divide-y divide-border">
              {upcoming.map((c) => (
                <li
                  key={`${c.jour}-${c.periode}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="font-medium capitalize">
                    {date(c.jour, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {c.periode}
                    {c.debut && c.fin ? ` · ${c.debut} – ${c.fin}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section icon={GraduationCap} title="Votre parcours">
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2
                className={
                  d.convention
                    ? 'size-4 text-green-600'
                    : 'size-4 text-muted-foreground/50'
                }
              />
              {d.convention
                ? `Convention signée le ${date(d.convention.signee_le)}`
                : 'Convention en attente de signature'}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2
                className={
                  d.assiduite.suivies > 0
                    ? 'size-4 text-green-600'
                    : 'size-4 text-muted-foreground/50'
                }
              />
              Présence : {d.assiduite.suivies} demi-journée
              {d.assiduite.suivies > 1 ? 's' : ''} sur {d.assiduite.prevues}
              {d.assiduite.heures_suivies
                ? ` (${d.assiduite.heures_suivies} h)`
                : ''}
            </li>
            {d.questionnaires_repondus.map((q) => (
              <li key={q.titre} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-green-600" /> {q.titre} :
                merci, répondu le {date(q.repondu_le)}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={FileText} title="Vos documents">
          {d.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Votre convocation puis votre attestation de fin de formation
              apparaîtront ici dès qu’elles seront émises.
            </p>
          ) : (
            <div className="space-y-2">
              {d.documents.map((doc) => (
                <LinkRow
                  key={doc.lien}
                  href={doc.lien}
                  external
                  title={doc.titre}
                  detail={
                    doc.emis_le ? `Émis le ${date(doc.emis_le)}` : undefined
                  }
                />
              ))}
            </div>
          )}
        </Section>

        {(d.organisme.contact || d.organisme.referent_handicap) && (
          <Section icon={Mail} title="Une question ?">
            <div className="space-y-2 text-sm">
              {d.organisme.contact && (
                <p>
                  Écrivez à{' '}
                  <a
                    href={`mailto:${d.organisme.contact}`}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {d.organisme.contact}
                  </a>
                </p>
              )}
              {d.organisme.referent_handicap && (
                <p className="inline-flex items-start gap-2">
                  <Accessibility className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    Besoin d’un aménagement ? Votre référent handicap :{' '}
                    {d.organisme.referent_handicap.nom}
                    {d.organisme.referent_handicap.email && (
                      <>
                        {' '}
                        (
                        <a
                          href={`mailto:${d.organisme.referent_handicap.email}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {d.organisme.referent_handicap.email}
                        </a>
                        )
                      </>
                    )}
                  </span>
                </p>
              )}
            </div>
          </Section>
        )}

        <p className="pb-6 text-center text-xs text-muted-foreground">
          Lien personnel, à ne pas partager · valable jusqu’au{' '}
          {date(d.expire_le)}
        </p>
      </div>
    </main>
  );
}
