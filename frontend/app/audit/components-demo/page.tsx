import type { Metadata } from 'next';
import {
  ActionPlan,
  type ActionPlanProps,
} from '@/components/audit/ActionPlan';
import { EvidenceUploadStack } from '@/components/audit/EvidenceUploadStack';
import { IndicatorVerdict } from '@/components/audit/IndicatorVerdict';
import {
  MockAuditChat,
  type MockAuditChatProps,
} from '@/components/audit/MockAuditChat';
import {
  ProofBoard,
  type ProofBoardProps,
} from '@/components/audit/ProofBoard';
import { ReferentielCoverage } from '@/components/audit/ReferentielCoverage';
import type { AuditStatus } from '@/components/audit/status';
import { VerdictGrid } from '@/components/audit/VerdictGrid';

export const metadata: Metadata = {
  title: 'Composants d’audit (démonstration)',
};

// Données d'exemple pour la revue visuelle : aucune ne vient d'un audit réel.
const CRITERES = [
  { id: 'C1', count: 3 },
  { id: 'C2', count: 5 },
  { id: 'C3', count: 8 },
  { id: 'C4', count: 4 },
  { id: 'C5', count: 2 },
  { id: 'C6', count: 7 },
  { id: 'C7', count: 3 },
];

// Statuts d'exemple : quelques points à clarifier ou à corriger, le reste conforme.
const SAMPLE: Record<string, AuditStatus[]> = {
  C1: ['ok', 'ok', 'warn'],
  C3: ['ok', 'ok', 'ok', 'ko', 'ok', 'ok', 'warn', 'ok'],
  C6: ['ok', 'ok', 'ko', 'ok', 'ok', 'ok', 'ok'],
  C7: ['ok', 'warn', 'ok'],
};
const VERDICTS = CRITERES.map((c) => ({
  id: c.id,
  statuses:
    SAMPLE[c.id] ?? Array.from({ length: c.count }, (): AuditStatus => 'ok'),
}));

const PROOFS: ProofBoardProps['columns'] = [
  {
    critereId: 'C1',
    items: [
      {
        status: 'ok',
        title: 'Catalogue en ligne',
        detail: 'Prérequis, délais, tarifs publiés',
      },
      {
        status: 'warn',
        title: 'Taux de satisfaction',
        detail: 'Publié, sans date ni période',
      },
    ],
  },
  {
    critereId: 'C2',
    items: [
      {
        status: 'ok',
        title: 'Questionnaire d’analyse des besoins',
        detail: 'IND4_QUESTIONNAIRE_ANALYSE_BESOINS.pdf',
      },
    ],
  },
  {
    critereId: 'C3',
    items: [
      {
        status: 'ok',
        title: 'Feuilles d’émargement',
        detail: '12 sessions, signées par demi-journée',
      },
      {
        status: 'ko',
        title: 'Accueil handicap',
        detail: 'Aucune procédure formalisée',
      },
    ],
  },
  {
    critereId: 'C6',
    items: [
      {
        status: 'ko',
        title: 'Environnement professionnel',
        detail: 'Lien non documenté',
      },
    ],
  },
];

const ACTIONS: ActionPlanProps['actions'] = [
  {
    severity: 'ko',
    ref: 'I12·C3',
    task: 'Rédiger une procédure d’accueil handicap',
    detail:
      'Identifier le référent, les adaptations possibles et le réseau de partenaires.',
  },
  {
    severity: 'warn',
    ref: 'I2·C7',
    task: 'Dater le questionnaire de satisfaction',
    detail:
      'Indiquer la période couverte et la date de diffusion des résultats.',
  },
  {
    severity: 'ko',
    ref: 'I18·C6',
    task: 'Documenter le lien avec l’environnement professionnel',
    detail:
      'Conserver les échanges avec les entreprises et partenaires du secteur.',
  },
];

const CHAT: MockAuditChatProps['messages'] = [
  {
    from: 'eve',
    type: 'text',
    content: 'Où publiez-vous vos indicateurs de résultats ?',
  },
  {
    from: 'user',
    type: 'text',
    content: 'Sur notre site, dans la fiche de chaque formation.',
  },
  {
    from: 'eve',
    type: 'text',
    content:
      'Pouvez-vous me donner le libellé exact de l’indicateur et une pièce datée qui le montre ?',
  },
  { from: 'user', type: 'file', content: 'attestation.pdf' },
  {
    from: 'eve',
    type: 'flag',
    content:
      'Cette attestation prouve un résultat, pas l’analyse du besoin. Envoyez plutôt un questionnaire de recueil des besoins daté.',
  },
];

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-jetbrains text-xs tracking-widest text-ink-soft">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function AuditComponentsDemoPage() {
  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-audit-bg px-4 py-8 font-inter-tight text-ink sm:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Composants d’audit Qualiopi
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Page de revue visuelle, avec des données d’exemple.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Block title="REFERENTIELCOVERAGE">
            <ReferentielCoverage criteres={CRITERES} />
          </Block>
          <Block title="VERDICTGRID">
            <VerdictGrid criteres={VERDICTS} />
          </Block>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Block title="INDICATORVERDICT · CONFORME">
            <IndicatorVerdict
              status="ok"
              indicatorLabel="I4 — Analyse des besoins du bénéficiaire"
              citation="IND4_QUESTIONNAIRE_ANALYSE_BESOINS.pdf"
            />
          </Block>
          <Block title="INDICATORVERDICT · À CORRIGER">
            <IndicatorVerdict
              status="ko"
              indicatorLabel="I12 — Accès des publics en situation de handicap"
              note="Aucune procédure formalisée pour l’accueil des publics en situation de handicap."
            />
          </Block>
        </div>

        <Block title="EVIDENCEUPLOADSTACK">
          <EvidenceUploadStack count={4} />
        </Block>

        <Block title="PROOFBOARD">
          <ProofBoard columns={PROOFS} />
        </Block>

        <div className="grid gap-6 md:grid-cols-2">
          <Block title="MOCKAUDITCHAT">
            <MockAuditChat messages={CHAT} />
          </Block>
          <Block title="ACTIONPLAN">
            <ActionPlan actions={ACTIONS} />
          </Block>
        </div>
      </div>
    </main>
  );
}
