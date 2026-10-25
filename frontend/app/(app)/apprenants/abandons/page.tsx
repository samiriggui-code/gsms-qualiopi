'use client';

import { CalendarX, UserMinus, UserX } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { ENROLLMENT_STATUS } from '@/lib/gsms/labels';
import type { AbandonRow } from '@/lib/gsms/registres';
import { RegistryPage } from '@/components/journey/registry-page';

export default function Page() {
  return (
    <RegistryPage<AbandonRow>
      view="abandons"
      title="Abandons & ruptures"
      icon={UserX}
      description="Les abandons et annulations, avec leur date, leur motif et l'avancement du parcours au moment de la rupture."
      indicators={[12]}
      empty="Aucun abandon ni annulation enregistré."
      kpis={(rows) => [
        {
          label: 'Abandons',
          value: rows.filter((r) => r.statut === 'ABANDON').length,
          subtitle: 'formation commencée puis quittée',
          icon: UserMinus,
        },
        {
          label: 'Annulations',
          value: rows.filter((r) => r.statut === 'ANNULE').length,
          subtitle: 'avant l’entrée en formation',
          icon: CalendarX,
        },
        {
          label: 'Sans motif',
          value: rows.filter((r) => !r.abandon.motif).length,
          subtitle: 'motif à recueillir',
          icon: UserX,
        },
      ]}
      tabs={[
        { id: 'all', label: 'Tous', test: () => true },
        {
          id: 'abandon',
          label: 'Abandons',
          test: (r) => r.statut === 'ABANDON',
        },
        {
          id: 'annule',
          label: 'Annulations',
          test: (r) => r.statut === 'ANNULE',
        },
      ]}
      status={(r) => ENROLLMENT_STATUS[r.statut]}
      detail={(r) =>
        [
          r.abandon.le ? `Le ${formatDate(r.abandon.le)}` : null,
          r.abandon.motif ?? 'Motif non renseigné',
          `${r.avancement.faits}/${r.avancement.applicables} étapes faites`,
        ]
          .filter(Boolean)
          .join(' · ')
      }
    />
  );
}
