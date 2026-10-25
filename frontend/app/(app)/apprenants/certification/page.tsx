'use client';

import { Award, CircleCheck, CircleHelp, CircleX } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { TONE } from '@/lib/gsms/labels';
import type { ExamRow } from '@/lib/gsms/registres';
import { RegistryPage } from '@/components/journey/registry-page';

const last = (r: ExamRow) => r.epreuves[r.epreuves.length - 1];

export default function Page() {
  return (
    <RegistryPage<ExamRow>
      view="certification"
      title="Présentation à la certification"
      icon={Award}
      description="Les stagiaires présentés aux épreuves de certification et leurs résultats, épreuve par épreuve."
      indicators={[16, 3]}
      empty="Aucune épreuve d'examen enregistrée : elles se saisissent comme évaluation de type « examen »."
      kpis={(rows) => [
        {
          label: 'Présentés',
          value: rows.length,
          subtitle: 'au moins une épreuve',
          icon: Award,
        },
        {
          label: 'Réussis',
          value: rows.filter((r) => last(r).reussi === true).length,
          subtitle: 'dernière épreuve réussie',
          icon: CircleCheck,
        },
        {
          label: 'Non réussis',
          value: rows.filter((r) => last(r).reussi === false).length,
          subtitle: 'à représenter ou accompagner',
          icon: CircleX,
        },
        {
          label: 'En attente',
          value: rows.filter((r) => last(r).reussi == null).length,
          subtitle: 'résultat non saisi',
          icon: CircleHelp,
        },
      ]}
      tabs={[
        { id: 'all', label: 'Tous', test: () => true },
        { id: 'ok', label: 'Réussis', test: (r) => last(r).reussi === true },
        {
          id: 'ko',
          label: 'Non réussis',
          test: (r) => last(r).reussi === false,
        },
        {
          id: 'wait',
          label: 'En attente',
          test: (r) => last(r).reussi == null,
        },
      ]}
      status={(r) =>
        last(r).reussi === true
          ? { label: 'Réussi', color: TONE.ok }
          : last(r).reussi === false
            ? { label: 'Non réussi', color: TONE.danger }
            : { label: 'En attente', color: TONE.neutral }
      }
      detail={(r) =>
        r.epreuves
          .map(
            (e) =>
              `${e.intitule} (${formatDate(e.le)}${e.note != null ? ` · ${e.note}` : ''})`,
          )
          .join(' · ')
      }
    />
  );
}
