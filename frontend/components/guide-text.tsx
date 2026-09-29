import { Fragment, ReactNode } from 'react';

// Rendu minimal du Markdown des guides de lecture : paragraphes, listes à puces, **gras**.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function GuideText({ body }: { body: string }) {
  const blocks = body.trim().split(/\n\s*\n/);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-secondary-foreground">
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i} className="list-disc ps-5 space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(lines.join(' '))}</p>;
      })}
    </div>
  );
}
