export interface EvidenceUploadStackProps {
  count: number;
}

// Positions en éventail (classes fixes : Tailwind ne détecte pas les classes construites à la volée).
const FAN = [
  'translate-x-0 -rotate-6',
  'translate-x-4 -rotate-3',
  'translate-x-8 rotate-0',
  'translate-x-12 rotate-3',
  'translate-x-16 rotate-6',
];
const LINES = ['w-3/4', 'w-full', 'w-5/6', 'w-2/3', 'w-1/2'];

/** Pile de documents déposés, en éventail ; au-delà de cinq, le nombre exact est affiché. */
export function EvidenceUploadStack({ count }: EvidenceUploadStackProps) {
  const shown = Math.min(Math.max(count, 0), FAN.length);

  return (
    <figure
      className="font-inter-tight text-ink"
      aria-label={`${count} pièce${count > 1 ? 's' : ''} déposée${count > 1 ? 's' : ''}`}
    >
      <div className="relative h-40 w-52">
        {Array.from({ length: shown }, (_, i) => (
          <div
            key={i}
            className={`absolute left-0 top-2 h-36 w-28 origin-bottom-left rounded-md border border-line bg-audit-surface p-3 shadow-sm ${FAN[i]}`}
          >
            <div className="flex flex-col gap-1.5" aria-hidden>
              {LINES.map((w, j) => (
                <span key={j} className={`h-1 rounded-full bg-line ${w}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 font-jetbrains text-xs text-ink-soft">
        {count} PIÈCE{count > 1 ? 'S' : ''}
      </figcaption>
    </figure>
  );
}
