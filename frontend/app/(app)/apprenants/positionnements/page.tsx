'use client';

import { Crosshair } from 'lucide-react';
import { StepRegistry } from '@/components/journey/registry-page';

export default function Page() {
  return (
    <StepRegistry
      view="positionnement"
      title="Positionnements"
      icon={Crosshair}
      description="Le positionnement à l'entrée de chaque stagiaire et la vérification des prérequis."
      indicators={[8]}
      empty="Aucune inscription pour l'instant : les positionnements apparaîtront ici."
    />
  );
}
