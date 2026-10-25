'use client';

import { Mail } from 'lucide-react';
import { StepRegistry } from '@/components/journey/registry-page';

export default function Page() {
  return (
    <StepRegistry
      view="convocation"
      title="Convocations"
      icon={Mail}
      description="Les convocations émises, avec les informations sur les conditions de déroulement de la formation."
      indicators={[9]}
      empty="Aucune inscription pour l'instant : les convocations apparaîtront ici."
    />
  );
}
