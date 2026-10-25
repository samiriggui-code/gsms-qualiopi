'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoaderCircleIcon, Save, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { useRoles, useUpdateProfile } from '@/lib/gsms/administration';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { PageHero } from '@/components/page/page-hero';
import { initials } from '@/components/resource/record-card';

export default function ProfilePage() {
  const { data: me, isLoading, error } = useCurrentUser();
  const { data: roles = [] } = useRoles();
  const update = useUpdateProfile();
  const [name, setName] = useState('');
  useEffect(() => setName(me?.full_name ?? ''), [me?.full_name]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(name, {
      onSuccess: () => toast.success('Nom enregistré'),
      onError: (err) => toast.error(err.message),
    });
  };
  const label = (code: string) =>
    roles.find((r) => r.code === code)?.label ?? code;

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <User className="size-4 text-primary" /> Mon profil
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5 max-w-3xl">
          <PageHero
            eyebrow="Mon compte"
            icon={User}
            title="Mon profil"
            description="Le nom affiché dans l'application et dans la traçabilité des preuves, et les droits de votre compte."
          />
          {error ? (
            <Refusal error={error} />
          ) : isLoading || !me ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Card className="shadow-none">
                <CardContent className="p-5 md:p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                      {initials(me.full_name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">
                        {me.full_name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {me.email}
                      </p>
                    </div>
                  </div>
                  <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="full_name">Nom affiché</Label>
                      <Input
                        id="full_name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={200}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Adresse e-mail</Label>
                      <Input id="email" value={me.email} disabled />
                      <p className="text-xs text-muted-foreground">
                        Identifiant de connexion : un administrateur la modifie.
                      </p>
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <Button
                        type="submit"
                        disabled={
                          update.isPending ||
                          !name.trim() ||
                          name.trim() === me.full_name
                        }
                      >
                        {update.isPending ? (
                          <LoaderCircleIcon className="animate-spin" />
                        ) : (
                          <Save />
                        )}{' '}
                        Enregistrer
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="p-5 md:p-6 space-y-3">
                  <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="size-4 text-primary" /> Rôles et
                    droits
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {me.roles.map((r) => (
                      <Badge key={r} variant="primary" appearance="light">
                        {label(r)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {me.permissions.length} permission
                    {me.permissions.length > 1 ? 's' : ''} effective
                    {me.permissions.length > 1 ? 's' : ''} (les modules
                    désactivés retirent les leurs). Les rôles sont attribués par
                    un administrateur, dans Utilisateurs &amp; rôles.
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </Content>
    </>
  );
}
