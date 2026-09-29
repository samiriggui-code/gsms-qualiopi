import { ReactNode } from 'react';
import { Settings, Shield, UserCircle, Users } from 'lucide-react';
import Link from 'next/link';
import { toAbsoluteUrl } from '@/lib/helpers';
import { ROLE_LABELS } from '@/lib/session';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Avatar provisoire : l'API ne gère pas encore de photo de profil.
export const USER_AVATAR = toAbsoluteUrl('/media/avatars/300-2.png');

export function UserDropdownMenu({ trigger }: { trigger: ReactNode }) {
  const { data: user } = useCurrentUser();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/signin';
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" side="bottom" align="end">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="flex items-center gap-2 min-w-0">
            <img
              className="size-9 shrink-0 rounded-full border-2 border-green-500"
              src={USER_AVATAR}
              alt={user?.full_name ?? 'Avatar'}
            />
            <div className="flex flex-col min-w-0">
              <Link
                href="/compte/profil"
                className="text-sm text-mono hover:text-primary font-semibold truncate"
              >
                {user?.full_name}
              </Link>
              <a
                href={`mailto:${user?.email ?? ''}`}
                className="text-xs text-muted-foreground hover:text-primary truncate"
              >
                {user?.email}
              </a>
            </div>
          </div>
          {user && user.roles.length > 0 && (
            <Badge variant="primary" appearance="light" size="sm">
              {ROLE_LABELS[user.roles[0]] ?? user.roles[0]}
            </Badge>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* Menu Items */}
        <DropdownMenuItem asChild>
          <Link href="/compte/profil" className="flex items-center gap-2">
            <UserCircle />
            Mon profil
          </Link>
        </DropdownMenuItem>

        {/* Mon compte */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            <Settings />
            Mon compte
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/compte/profil" className="flex items-center gap-2">
                <UserCircle />
                Profil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/compte/securite" className="flex items-center gap-2">
                <Shield />
                Sécurité
              </Link>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {user?.permissions.includes('users.manage') && (
          <DropdownMenuItem asChild>
            <Link
              href="/administration/utilisateurs"
              className="flex items-center gap-2"
            >
              <Users />
              Utilisateurs
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <div className="p-2 mt-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={logout}
          >
            Déconnexion
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
