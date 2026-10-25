'use client';

import { BadgeCheck } from 'lucide-react';
import { StepRegistry } from '@/components/journey/registry-page';

export default function Page() {
  return (
    <StepRegistry
      view="attestation"
      title="Attestations & certificats"
      icon={BadgeCheck}
      description="Les attestations de fin de formation émises par le moteur, avec leur empreinte."
      indicators={[11]}
      empty="Aucune inscription pour l'instant : les attestations apparaîtront ici."
    />
  );
}
