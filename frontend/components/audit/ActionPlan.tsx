import { STATUS_DOT, STATUS_LABEL, type AuditStatus } from './status';

export interface ActionPlanProps {
  actions: {
    severity: AuditStatus;
    ref: string;
    task: string;
    detail: string;
  }[];
}

/** Plan d'action : une carte par tâche, avec sa sévérité et l'indicateur concerné. */
export function ActionPlan({ actions }: ActionPlanProps) {
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
              <span className="sr-only">{STATUS_LABEL[a.severity]} · </span>
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
