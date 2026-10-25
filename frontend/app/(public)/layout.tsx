import { ReactNode } from 'react';

// Pages publiques ouvertes par un lien signé (questionnaire, espace du stagiaire) : sans menu ni session.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="w-full min-h-dvh overflow-y-auto bg-muted/40">
      {children}
    </div>
  );
}
