'use client';

import { FolderOpen } from 'lucide-react';
import { useOrganization } from '@/lib/gsms/administration';
import { DossierPanel } from '@/components/documents/dossier-panel';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { PageHero } from '@/components/page/page-hero';

export default function DocumentsPage() {
  const { data: org } = useOrganization();
  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <FolderOpen className="size-4 text-primary" /> Documents qualité
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Qualité & amélioration"
            icon={FolderOpen}
            title="Documents qualité"
            description="Les pièces du dossier qualité de l'organisme : procédures, organigramme, comptes rendus, versions. Une pièce déposée devient une preuve, validée ensuite dans Preuves."
          />
          <DossierPanel subjectId={org?.id} />
        </div>
      </Content>
    </>
  );
}
