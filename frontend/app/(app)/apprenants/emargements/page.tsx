'use client';

import { CalendarCheck } from 'lucide-react';
import { StepRegistry } from '@/components/journey/registry-page';

export default function Page() {
  return (
    <StepRegistry
      view="emargement"
      title="Émargements"
      icon={CalendarCheck}
      description="L'assiduité de chaque stagiaire : demi-journées émargées et demi-journées passées sans signature."
      indicators={[12]}
      empty="Aucune inscription pour l'instant : les émargements apparaîtront ici."
    />
  );
}
