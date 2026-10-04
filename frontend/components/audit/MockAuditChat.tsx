import { FileText, Flag } from 'lucide-react';

export interface MockAuditChatProps {
  messages: {
    from: 'kali' | 'user';
    type: 'text' | 'file' | 'flag';
    content: string;
  }[];
}

type Message = MockAuditChatProps['messages'][number];

function bubbleClass(m: Message): string {
  if (m.type === 'flag')
    return 'self-start border border-corriger/60 bg-[#3A1A1A] text-[#F6D4D1]';
  if (m.type === 'file')
    return 'self-end bg-audit-accent/90 font-jetbrains text-xs text-white';
  return m.from === 'kali'
    ? 'self-start bg-[#1E2735] text-[#E6E9EF]'
    : 'self-end bg-audit-accent text-white';
}

/** Simulation d'échange avec Kali, l'auditeur simulé : questions, réponses, pièces et preuves rejetées. */
export function MockAuditChat({ messages }: MockAuditChatProps) {
  return (
    <section className="rounded-xl bg-navy p-5 font-inter-tight">
      <header className="flex items-center gap-3 border-b border-white/10 pb-4">
        <span className="flex size-9 items-center justify-center rounded-full bg-audit-accent text-sm font-semibold text-white">
          K
        </span>
        <div>
          <p className="text-sm font-semibold text-white">Kali</p>
          <p className="font-jetbrains text-[11px] tracking-wider text-[#8B95A7]">
            AUDIT BLANC · SIMULATION
          </p>
        </div>
      </header>
      <ol className="mt-4 flex flex-col gap-2.5">
        {messages.map((m, i) => (
          <li
            key={i}
            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${bubbleClass(m)}`}
          >
            {m.type === 'file' && (
              <span className="flex items-center gap-2">
                <FileText className="size-4 shrink-0" aria-hidden />
                <span className="sr-only">Pièce envoyée : </span>
                {m.content}
              </span>
            )}
            {m.type === 'flag' && (
              <span className="flex gap-2">
                <Flag
                  className="mt-0.5 size-4 shrink-0 text-corriger"
                  aria-hidden
                />
                <span>
                  <span className="sr-only">Preuve rejetée : </span>
                  {m.content}
                </span>
              </span>
            )}
            {m.type === 'text' && m.content}
          </li>
        ))}
      </ol>
    </section>
  );
}
