import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

// Encart d'accueil des accueils de module (GSMS School : SectionWelcomeCallout) : organisme, personne
// connectée et son rôle, phrase de présentation du module, puis un pied avec une information du jour
// (venue de l'API) et le lien principal.
export function WelcomeCallout({
  icon: Icon,
  organization,
  person,
  role,
  module,
  description,
  footerLabel,
  footerValue,
  cta,
}: {
  icon: LucideIcon;
  organization?: string | null;
  person?: string | null;
  role?: string | null;
  module: string;
  description: ReactNode;
  footerLabel: string;
  footerValue: ReactNode;
  cta: { label: string; href: string };
}) {
  return (
    <Card className="h-full min-w-0 overflow-hidden rounded-xl">
      <CardContent className="relative flex-1 bg-gradient-to-br from-primary/10 via-background to-sky-500/5 p-6 sm:p-8">
        <div
          className="absolute -end-16 -top-16 size-56 rounded-full bg-primary/5"
          aria-hidden
        />
        <div className="relative flex max-w-2xl flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-primary/10 p-2">
              <Icon className="size-6 text-primary" />
            </span>
            {organization && (
              <span className="flex min-w-0 items-center gap-2 rounded-full bg-muted px-3 py-1">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium text-foreground">
                  {organization}
                </span>
              </span>
            )}
          </div>
          <h2 className="text-xl font-semibold text-foreground">
            Bonjour{person ? ' ' : ''}
            {person && <span className="text-primary">{person}</span>},
            bienvenue dans {module}
          </h2>
          {role && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserRound className="size-4" /> {role}
            </p>
          )}
          <p className="text-sm leading-relaxed text-secondary-foreground">
            {description}
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-muted-foreground">{footerLabel}</span>
          <span className="truncate text-sm font-medium text-foreground">
            {footerValue}
          </span>
        </div>
        <Button mode="link" underlined="dashed" asChild className="group">
          <Link href={cta.href} className="flex items-center gap-2">
            {cta.label}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
