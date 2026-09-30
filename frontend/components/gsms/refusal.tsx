import { AlertTriangle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Alert, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';

// Refus ou erreur de l'API affiché dans un formulaire, avec son détail (ex. demi-journées manquantes).
export function Refusal({ error }: { error: unknown }) {
  if (!(error instanceof Error)) return null;
  const details = error instanceof ApiError ? error.details : [];
  const items = details.flatMap((d) => {
    const list = (d as { demi_journees?: string[] }).demi_journees;
    return list ? list.map((x) => `Demi-journée sans présence ni absence : ${x}`) : [];
  });

  return (
    <Alert variant="destructive" appearance="light">
      <AlertIcon>
        <AlertTriangle />
      </AlertIcon>
      <div>
        <AlertTitle>{error.message}</AlertTitle>
        {items.length > 0 && (
          <AlertDescription>
            <ul className="list-disc ps-4 mt-1">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </AlertDescription>
        )}
      </div>
    </Alert>
  );
}
