'use client';

import { ScanSearch } from 'lucide-react';
import { StepRegistry } from '@/components/journey/registry-page';

export default function Page() {
  return (
    <StepRegistry
      view="analyse_besoin"
      title="Analyses du besoin"
      icon={ScanSearch}
      description="Le besoin de chaque bénéficiaire recueilli avant l'entrée en formation, et les adaptations décidées."
      indicators={[4, 10]}
      empty="Aucune inscription pour l'instant : les analyses du besoin apparaîtront ici."
    />
  );
}
