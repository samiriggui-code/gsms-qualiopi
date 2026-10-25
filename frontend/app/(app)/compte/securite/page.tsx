'use client';

import { FormEvent, useState } from 'react';
import { KeyRound, LoaderCircleIcon, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useChangePassword } from '@/lib/gsms/administration';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { PageHero } from '@/components/page/page-hero';

const MIN = 12; // même règle que l'API (auth/router.py)

export default function SecurityPage() {
  const change = useChangePassword();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const tooShort = nouveau.length > 0 && nouveau.length < MIN;
  const mismatch = confirmation.length > 0 && confirmation !== nouveau;
  const ready = actuel && nouveau.length >= MIN && confirmation === nouveau;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate(
      { actuel, nouveau },
      {
        onSuccess: () => {
          toast.success('Mot de passe changé');
          setActuel('');
          setNouveau('');
          setConfirmation('');
        },
      },
    );
  };

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Lock className="size-4 text-primary" /> Sécurité
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5 max-w-3xl">
          <PageHero
            eyebrow="Mon compte"
            icon={Lock}
            title="Sécurité"
            description="Changer le mot de passe de votre compte. Votre mot de passe actuel est redemandé."
          />
          <Card className="shadow-none">
            <CardContent className="p-5 md:p-6">
              <form onSubmit={submit} className="grid gap-4 max-w-md">
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
                  <KeyRound className="size-4 text-primary" /> Mot de passe
                </h2>
                <div className="space-y-1.5">
                  <Label htmlFor="actuel">Mot de passe actuel</Label>
                  <Input
                    id="actuel"
                    type="password"
                    autoComplete="current-password"
                    value={actuel}
                    onChange={(e) => setActuel(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nouveau">Nouveau mot de passe</Label>
                  <Input
                    id="nouveau"
                    type="password"
                    autoComplete="new-password"
                    value={nouveau}
                    onChange={(e) => setNouveau(e.target.value)}
                    aria-invalid={tooShort}
                    required
                  />
                  <div
                    className="h-1 rounded-full bg-muted overflow-hidden"
                    aria-hidden
                  >
                    <div
                      className={cn(
                        'h-full transition-all',
                        nouveau.length >= MIN + 6
                          ? 'bg-green-600'
                          : nouveau.length >= MIN
                            ? 'bg-primary'
                            : 'bg-yellow-500',
                      )}
                      style={{
                        width: `${Math.min(100, (nouveau.length / (MIN + 6)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p
                    className={cn(
                      'text-xs',
                      tooShort ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {MIN} caractères minimum. Une phrase de plusieurs mots est
                    plus sûre et plus facile à retenir.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmation">
                    Confirmer le nouveau mot de passe
                  </Label>
                  <Input
                    id="confirmation"
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    aria-invalid={mismatch}
                    required
                  />
                  {mismatch && (
                    <p className="text-xs text-destructive">
                      Les deux saisies ne correspondent pas.
                    </p>
                  )}
                </div>
                {change.error && <Refusal error={change.error} />}
                <div>
                  <Button type="submit" disabled={!ready || change.isPending}>
                    {change.isPending && (
                      <LoaderCircleIcon className="animate-spin" />
                    )}{' '}
                    Changer le mot de passe
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </Content>
    </>
  );
}
