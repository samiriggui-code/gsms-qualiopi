'use client';

import { CalendarDays, LayoutTemplate, Map } from 'lucide-react';
import { useSessions } from '@/lib/gsms/sessions';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';
import { SectionCard } from '@/components/page/section-card';
import {
  sessionKpis,
  SessionList,
} from '../../formation/sessions/session-list';
import { LandingModel } from './landing-model';
import { Repere, RepereNote } from './repere';
import { SheetModel } from './sheet-model';

// Page témoin : les trois modèles de page que toutes les pages reprennent (accueil de module, liste, fiche),
// montés avec les briques communes de components/page et les vraies données de l'organisme.
export default function ModelesPage() {
  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <LayoutTemplate className="size-4 text-primary" />
          Modèles de page
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Administration"
            icon={LayoutTemplate}
            title="Modèles de page"
            description="Les trois modèles que suivent toutes les pages de l’application, montés avec les données réelles de l’organisme. Chaque bloc numéroté est une brique commune : une page ajoute ses propres détails, sans changer la mise en forme."
          />
          <Tabs defaultValue="accueil" className="min-w-0">
            <TabsList className="mb-5 inline-flex w-auto max-w-full grow-0 overflow-x-auto [scrollbar-width:none]">
              <TabsTrigger
                className="text-secondary-foreground"
                value="accueil"
              >
                Accueil
              </TabsTrigger>
              <TabsTrigger className="text-secondary-foreground" value="liste">
                Liste
              </TabsTrigger>
              <TabsTrigger className="text-secondary-foreground" value="fiche">
                Fiche
              </TabsTrigger>
              <TabsTrigger className="text-secondary-foreground" value="pages">
                Pages
              </TabsTrigger>
            </TabsList>
            <TabsContent value="accueil" className="min-w-0">
              <LandingModel />
            </TabsContent>
            <TabsContent value="liste" className="min-w-0">
              <ListModel />
            </TabsContent>
            <TabsContent value="fiche" className="min-w-0">
              <SheetModel />
            </TabsContent>
            <TabsContent value="pages" className="min-w-0">
              <PagesMap />
            </TabsContent>
          </Tabs>
        </div>
      </Content>
    </>
  );
}

function ListModel() {
  const { data: sessions = [], isLoading } = useSessions();
  return (
    <div className="space-y-8">
      <Repere n={1} name="Bandeau de titre">
        <RepereNote>
          Identique à l’accueil : rubrique, titre, phrase d’usage, bouton
          principal.
        </RepereNote>
        <PageHero
          eyebrow="Offre de formation"
          icon={CalendarDays}
          title="Sessions"
          description="Les sessions planifiées sur les formations du catalogue : dates, lieu, formateur et inscrits."
        />
      </Repere>
      <Repere n={2} name="Bandeau de 5 cartes chiffres">
        <RepereNote>
          Cinq chiffres comptés sur la liste chargée ; le sous-titre dit sur
          quoi porte le chiffre.
        </RepereNote>
        <KpiRow items={sessionKpis(sessions)} loading={isLoading} />
      </Repere>
      <Repere n={3} name="Carte de filtres + grille ou tableau">
        <RepereNote>
          Recherche, onglets, filtres, bascule Grille / Liste ; chaque carte ou
          ligne ouvre la fiche.
        </RepereNote>
        <SessionList />
      </Repere>
    </div>
  );
}

type State = 'fait' | 'partiel' | 'a-faire';
const STATE: Record<State, { label: string; className: string }> = {
  fait: {
    label: 'Appliqué',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  partiel: {
    label: 'En partie',
    className: 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
  },
  'a-faire': {
    label: 'À reprendre',
    className: 'bg-muted text-secondary-foreground',
  },
};

// Où en est chaque page par rapport aux modèles (ordre de reprise : cartographie GSMS School → Qualiopi).
const PAGES: { page: string; models: string; state: State; next?: string }[] = [
  { page: 'Programmes', models: 'Liste + fiche', state: 'fait' },
  {
    page: 'Sessions',
    models: 'Liste + fiche (dossier de session)',
    state: 'fait',
  },
  { page: 'Agenda', models: 'Liste (planning)', state: 'fait' },
  {
    page: 'Apprenants',
    models: 'Liste + fiche',
    state: 'partiel',
    next: 'fiche apprenant et suivi par session',
  },
  {
    page: 'Formateurs, qualifications, développement',
    models: 'Liste + fiche',
    state: 'partiel',
    next: 'fiches',
  },
  {
    page: 'Locaux, moyens techniques',
    models: 'Liste + fiche',
    state: 'partiel',
    next: 'fiches',
  },
  {
    page: 'Entreprises clientes',
    models: 'Liste + fiche',
    state: 'partiel',
    next: 'fiche entreprise',
  },
  {
    page: 'Satisfaction, réclamations',
    models: 'Liste + graphiques',
    state: 'partiel',
    next: 'graphiques',
  },
  {
    page: 'Veille, partenaires, sous-traitants',
    models: 'Liste + fiche',
    state: 'partiel',
    next: 'fiches',
  },
  {
    page: 'Accueil de chaque section',
    models: 'Accueil de module',
    state: 'a-faire',
  },
  { page: 'Tableau de bord', models: 'Accueil de module', state: 'a-faire' },
];

function PagesMap() {
  return (
    <SectionCard
      title="Pages et modèles"
      subtitle="Quel modèle suit chaque page, et où elle en est"
      icon={Map}
      contentClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dashed text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 text-start font-medium">Page</th>
              <th className="px-3 py-2.5 text-start font-medium">Modèle</th>
              <th className="px-5 py-2.5 text-start font-medium">État</th>
            </tr>
          </thead>
          <tbody>
            {PAGES.map((p) => (
              <tr key={p.page} className="border-b border-dashed last:border-0">
                <td className="px-5 py-2.5 font-medium text-foreground">
                  {p.page}
                </td>
                <td className="px-3 py-2.5 text-secondary-foreground">
                  {p.models}
                </td>
                <td className="px-5 py-2.5">
                  <Badge size="sm" className={STATE[p.state].className}>
                    {STATE[p.state].label}
                  </Badge>
                  {p.next && (
                    <span className="ms-2 text-xs text-muted-foreground">
                      reste : {p.next}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
