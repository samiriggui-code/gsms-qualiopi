'use client';

import { FileSignature } from 'lucide-react';
import { StepRegistry } from '@/components/journey/registry-page';

export default function Page() {
  return (
    <StepRegistry
      view="convention"
      title="Conventions & contrats"
      icon={FileSignature}
      description="Les conventions et contrats de formation de chaque inscription : envoi, signature, ce qui reste à signer avant l'entrée en formation."
      indicators={[9]}
      empty="Aucune inscription pour l'instant : les conventions apparaîtront ici."
    />
  );
}
