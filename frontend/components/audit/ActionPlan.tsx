import {
  STATUS_DOT,
  statusLabel,
  type AuditStatus,
  type StatusLabels,
} from './status';

export interface ActionPlanProps {
  actions: {
    severity: AuditStatus;
    ref: string;
    task: string;
    detail: string;
  }[];
  /** Libellés de sévérité lus par les lecteurs d'écran (par défaut ceux de la maquette). */
  labels?: StatusLabels;
}

/** Plan d'action : une carte par tâche, avec sa sévérité et sa référence. */
export function ActionPlan({ actions, labels }: ActionPlanProps) {
  return (
    <ol className="flex flex-col gap-2.5 font-inter-tight text-ink">
      {actions.map((a, i) => (
        <li
          key={i}
          className="flex gap-3 rounded-xl border border-line bg-audit-surface p-4"
        >
          <span
            className={`mt-1.5 size-2.5 shrink-0 rounded-full ${STATUS_DOT[a.severity]}`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="font-jetbrains text-xs text-ink-soft">
              <span className="sr-only">
                {statusLabel(a.severity, labels)} ·{' '}
              </span>
              {a.ref}
            </p>
            <p className="mt-0.5 text-sm font-semibold">{a.task}</p>
            <p className="mt-0.5 text-sm text-ink-soft">{a.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
