'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, CalendarRange, Plus } from 'lucide-react';
import { useSessions } from '@/lib/gsms/sessions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';
import { SessionFormSheet } from './session-form-sheet';
import { sessionKpis, SessionList } from './session-list';

// Sessions sur le modèle de GSMS School (vie scolaire › sessions) : bandeau de titre, cartes KPI,
// liste filtrable en grille ou en tableau ; la fiche détaillée reste la page /formation/sessions/[id].
export default function SessionsPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: sessions = [], isLoading } = useSessions();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ?nouveau=1 (bouton « Nouveau » de la barre du haut, raccourci de la sidebar) ouvre le formulaire
  useEffect(() => {
    if (searchParams.get('nouveau')) {
      setSheetOpen(true);
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <CalendarDays className="size-4 text-primary" />
          Sessions
          {!isLoading && (
            <Badge variant="secondary" size="sm">
              {sessions.length}
            </Badge>
          )}
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Offre de formation"
            icon={CalendarDays}
            title="Sessions"
            description="Les sessions planifiées sur les formations du catalogue : dates, lieu, formateur et inscrits. Chaque carte ouvre le dossier de la session."
            actions={
              <>
                <Button variant="outline" asChild>
                  <Link href="/agenda">
                    <CalendarRange /> Agenda
                  </Link>
                </Button>
                <Button onClick={() => setSheetOpen(true)}>
                  <Plus /> Nouvelle session
                </Button>
              </>
            }
          />
          <KpiRow items={sessionKpis(sessions)} loading={isLoading} />
          <SessionList />
        </div>
      </Content>
      <SessionFormSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
