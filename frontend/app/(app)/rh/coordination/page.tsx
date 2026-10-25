'use client';

import { Users2 } from 'lucide-react';
import { useOrganization } from '@/lib/gsms/administration';
import { DossierPanel } from '@/components/documents/dossier-panel';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { PageHero } from '@/components/page/page-hero';

export default function CoordinationPage() {
  const { data: org } = useOrganization();
  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Users2 className="size-4 text-primary" /> Coordination des
          intervenants
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Ressources humaines"
            icon={Users2}
            title="Coordination des intervenants"
            description="Organigramme, réunions pédagogiques et leurs comptes rendus : ce qui montre que les intervenants internes et externes sont coordonnés. Indicateur Qualiopi 18."
          />
          <DossierPanel
            subjectId={org?.id}
            indicators={[18]}
            title="Pièces de la coordination"
          />
        </div>
      </Content>
    </>
  );
}
