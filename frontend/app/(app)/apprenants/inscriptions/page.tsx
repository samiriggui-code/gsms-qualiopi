'use client';

import {
  CircleCheck,
  ClipboardList,
  Hourglass,
  UserCheck,
  Users,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import {
  ENROLLMENT_STATUS,
  STEP_LABEL,
  STEP_STATE,
  TONE,
} from '@/lib/gsms/labels';
import type { EnrollmentRow } from '@/lib/gsms/registres';
import { RegistryPage } from '@/components/journey/registry-page';

const late = (r: EnrollmentRow) => r.avancement.prochaine?.etat === 'EN_RETARD';
const open = (r: EnrollmentRow) =>
  r.statut === 'INSCRIT' || r.statut === 'CONFIRME';

export default function Page() {
  return (
    <RegistryPage<EnrollmentRow>
      view="inscriptions"
      title="Inscriptions"
      icon={ClipboardList}
      description="Toutes les inscriptions aux sessions : statut, financement et avancement du dossier, étape par étape."
      indicators={[12]}
      empty="Aucune inscription pour l'instant : inscrivez un stagiaire depuis une session."
      kpis={(rows) => [
        {
          label: 'En cours',
          value: rows.filter(open).length,
          subtitle: 'inscrites ou confirmées',
          icon: Users,
        },
        {
          label: 'Dossier en retard',
          value: rows.filter(late).length,
          subtitle: 'une étape a dépassé son échéance',
          icon: Hourglass,
        },
        {
          label: 'À confirmer',
          value: rows.filter((r) => r.statut === 'INSCRIT').length,
          subtitle: 'inscription non confirmée',
          icon: UserCheck,
        },
        {
          label: 'Terminées',
          value: rows.filter((r) => r.statut === 'TERMINE').length,
          subtitle: 'formation suivie',
          icon: CircleCheck,
        },
      ]}
      tabs={[
        { id: 'open', label: 'En cours', test: open },
        { id: 'late', label: 'En retard', test: late },
        { id: 'done', label: 'Terminées', test: (r) => r.statut === 'TERMINE' },
        { id: 'all', label: 'Toutes', test: () => true },
      ]}
      status={(r) =>
        open(r) && r.avancement.prochaine
          ? STEP_STATE[r.avancement.prochaine.etat]
          : r.statut === 'TERMINE' && !r.avancement.prochaine
            ? { label: 'Dossier complet', color: TONE.ok }
            : ENROLLMENT_STATUS[r.statut]
      }
      detail={(r) => {
        const { faits, applicables, prochaine } = r.avancement;
        const parts = [`${faits}/${applicables} étapes faites`];
        if (prochaine)
          parts.push(
            `prochaine : ${STEP_LABEL[prochaine.etape].label.toLowerCase()}${prochaine.echeance ? ` (${formatDate(prochaine.echeance)})` : ''}`,
          );
        if (r.financement) parts.push(r.financement);
        return parts.join(' · ');
      }}
    />
  );
}
