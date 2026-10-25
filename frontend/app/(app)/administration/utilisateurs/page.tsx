'use client';

// Équipe et rôles : les comptes de l'organisme, leurs rôles et leur activation. L'API refuse de
// modifier son propre compte ou de donner des droits qu'on n'a pas : l'écran affiche ses refus.
import { FormEvent, useMemo, useState } from 'react';
import {
  LoaderCircleIcon,
  Plus,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateUser,
  useRoles,
  useSetUserActive,
  useSetUserRoles,
  useUsers,
  type TeamUser,
} from '@/lib/gsms/administration';
import { useCan } from '@/lib/permissions';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';
import { initials } from '@/components/resource/record-card';

function RolePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (roles: string[]) => void;
}) {
  const { data: roles = [] } = useRoles();
  return (
    <div className="space-y-2">
      {roles.map((r) => (
        <label
          key={r.code}
          className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40"
        >
          <Checkbox
            checked={value.includes(r.code)}
            onCheckedChange={(on) =>
              onChange(
                on ? [...value, r.code] : value.filter((c) => c !== r.code),
              )
            }
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{r.label}</span>
            <span className="block text-xs text-muted-foreground">
              {r.permissions.length} permission
              {r.permissions.length > 1 ? 's' : ''}
              {r.system ? ' · rôle proposé' : ' · rôle de l’organisme'}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

function NewUserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateUser();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(['lecture']);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { email, full_name: name, password, roles },
      {
        onSuccess: () => {
          toast.success(`Compte créé pour ${name}`);
          setEmail('');
          setName('');
          setPassword('');
          setRoles(['lecture']);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nouveau compte</DialogTitle>
            <DialogDescription>
              Transmettez le mot de passe provisoire à la personne : elle le
              changera dans Mon compte, Sécurité.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nu-name">Nom</Label>
                <Input
                  id="nu-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-email">Adresse e-mail</Label>
                <Input
                  id="nu-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nu-pass">Mot de passe provisoire</Label>
              <Input
                id="nu-pass"
                type="text"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                required
              />
              <p className="text-xs text-muted-foreground">
                12 caractères minimum.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Rôles</Label>
              <RolePicker value={roles} onChange={setRoles} />
            </div>
            {create.error && <Refusal error={create.error} />}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={
                create.isPending || !roles.length || password.length < 12
              }
            >
              {create.isPending && (
                <LoaderCircleIcon className="animate-spin" />
              )}{' '}
              Créer le compte
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RolesDialog({
  user,
  onClose,
}: {
  user: TeamUser | null;
  onClose: () => void;
}) {
  const setRoles = useSetUserRoles();
  const [roles, setLocal] = useState<string[]>([]);
  const [forId, setForId] = useState<string | null>(null);
  if (!user) {
    if (forId !== null) setForId(null); // rouvert plus tard : repart des rôles enregistrés
  } else if (forId !== user.id) {
    setForId(user.id);
    setLocal(user.roles);
  }
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rôles de {user?.full_name}</DialogTitle>
          <DialogDescription>
            Vous ne pouvez donner que des droits que vous avez vous-même.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 max-h-[60vh] overflow-y-auto">
          <RolePicker value={roles} onChange={setLocal} />
          {setRoles.error && <Refusal error={setRoles.error} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={setRoles.isPending || !roles.length}
            onClick={() =>
              user &&
              setRoles.mutate(
                { id: user.id, roles },
                {
                  onSuccess: () => {
                    toast.success('Rôles enregistrés');
                    onClose();
                  },
                },
              )
            }
          >
            {setRoles.isPending && (
              <LoaderCircleIcon className="animate-spin" />
            )}{' '}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { data: users = [], isLoading, error } = useUsers();
  const { data: roles = [] } = useRoles();
  const { data: me } = useCurrentUser();
  const setActive = useSetUserActive();
  const can = useCan()('manage_users');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const label = useMemo(
    () => (code: string) =>
      roles.find((r) => r.code === code)?.label.split(' :')[0] ?? code,
    [roles],
  );

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <UserCog className="size-4 text-primary" /> Utilisateurs &amp; rôles
          {!isLoading && (
            <Badge variant="secondary" size="sm">
              {users.length}
            </Badge>
          )}
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Administration"
            icon={UserCog}
            title="Utilisateurs & rôles"
            description="Les comptes de l'équipe, leurs rôles et leur accès. Un compte désactivé ne peut plus se connecter ; son historique reste."
            actions={
              can && (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Nouveau compte
                </Button>
              )
            }
          />
          {error ? (
            <Refusal error={error} />
          ) : (
            <>
              <KpiRow
                loading={isLoading}
                items={[
                  {
                    label: 'Comptes',
                    value: users.length,
                    subtitle: 'dans l’équipe',
                    icon: Users,
                  },
                  {
                    label: 'Actifs',
                    value: users.filter((u) => u.is_active).length,
                    subtitle: 'peuvent se connecter',
                    icon: UserCheck,
                  },
                  {
                    label: 'Désactivés',
                    value: users.filter((u) => !u.is_active).length,
                    subtitle: 'accès coupé',
                    icon: UserX,
                  },
                  {
                    label: 'Rôles',
                    value: roles.length,
                    subtitle: 'proposés ou créés',
                    icon: ShieldCheck,
                  },
                ]}
              />
              <Card className="shadow-none overflow-hidden [contain:inline-size]">
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 4 }, (_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {users.map((u) => {
                      const self = u.id === me?.id;
                      return (
                        <li
                          key={u.id}
                          className="flex min-w-0 items-center gap-3 px-4 py-3"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {initials(u.full_name)}
                          </span>
                          <span className="min-w-0 grow">
                            <span className="flex flex-wrap items-center gap-x-2">
                              <span className="truncate text-sm font-medium">
                                {u.full_name}
                              </span>
                              {self && (
                                <Badge size="sm" variant="secondary">
                                  Vous
                                </Badge>
                              )}
                              {!u.is_active && (
                                <Badge
                                  size="sm"
                                  variant="destructive"
                                  appearance="light"
                                >
                                  Désactivé
                                </Badge>
                              )}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {u.email}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              {u.roles.map((r) => (
                                <Badge
                                  key={r}
                                  size="sm"
                                  variant="primary"
                                  appearance="light"
                                >
                                  {label(r)}
                                </Badge>
                              ))}
                            </span>
                          </span>
                          {can && !self && (
                            <span className="flex shrink-0 items-center gap-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing(u)}
                              >
                                Rôles
                              </Button>
                              <Switch
                                checked={u.is_active}
                                disabled={setActive.isPending}
                                aria-label={
                                  u.is_active
                                    ? `Désactiver ${u.full_name}`
                                    : `Réactiver ${u.full_name}`
                                }
                                onCheckedChange={(on) =>
                                  setActive.mutate(
                                    { id: u.id, is_active: on },
                                    {
                                      onSuccess: () =>
                                        toast.success(
                                          on
                                            ? 'Compte réactivé'
                                            : 'Compte désactivé',
                                        ),
                                      onError: (e) => toast.error(e.message),
                                    },
                                  )
                                }
                              />
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </Content>
      <NewUserDialog open={creating} onClose={() => setCreating(false)} />
      <RolesDialog user={editing} onClose={() => setEditing(null)} />
    </>
  );
}
