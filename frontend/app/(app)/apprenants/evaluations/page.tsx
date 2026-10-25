'use client';

import { ClipboardCheck } from 'lucide-react';
import { StepRegistry } from '@/components/journey/registry-page';

export default function Page() {
  return (
    <StepRegistry
      view="evaluations"
      title="Évaluations des acquis"
      icon={ClipboardCheck}
      description="Les évaluations formatives, sommatives et examens enregistrés pour chaque stagiaire."
      indicators={[11]}
      empty="Aucune inscription pour l'instant : les évaluations apparaîtront ici."
    />
  );
}
