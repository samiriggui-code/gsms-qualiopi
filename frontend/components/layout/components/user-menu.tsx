import { ReactNode } from 'react';
import { Globe, Moon, Settings, Shield, UserCircle, Users } from 'lucide-react';
import { useTheme } from 'next-themes';
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';

// TODO : brancher la traduction (dossier i18n/) ; seul le français est actif.
const I18N_LANGUAGES = [
  {
    label: 'Français',
    code: 'fr',
    flag: toAbsoluteUrl('/media/flags/france.svg'),
  },
  {
    label: 'English',
    code: 'en',
    flag: toAbsoluteUrl('/media/flags/united-kingdom.svg'),
  },
];

// Avatar provisoire : l'API ne gère pas encore de photo de profil.
export const USER_AVATAR = toAbsoluteUrl('/media/avatars/300-2.png');

export function UserDropdownMenu({ trigger }: { trigger: ReactNode }) {
  const currentLanguage = I18N_LANGUAGES[0];
  const { resolvedTheme, setTheme } = useTheme();
  const { data: user } = useCurrentUser();

  const handleThemeToggle = (checked: boolean) => {
    setTheme(checked ? 'dark' : 'light');
  };

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
          {user && (
            <Badge variant="primary" appearance="light" size="sm">
              {ROLE_LABELS[user.role]}
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

        {user?.role === 'admin' && (
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

        {/* Langue */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2 [&_[data-slot=dropdown-menu-sub-trigger-indicator]]:hidden hover:[&_[data-slot=badge]]:border-input data-[state=open]:[&_[data-slot=badge]]:border-input">
            <Globe />
            <span className="flex items-center justify-between gap-2 grow relative">
              Langue
              <Badge
                variant="outline"
                className="absolute end-0 top-1/2 -translate-y-1/2"
              >
                {currentLanguage.label}
                <img
                  src={currentLanguage.flag}
                  className="w-3.5 h-3.5 rounded-full"
                  alt={currentLanguage.label}
                />
              </Badge>
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup value={currentLanguage.code}>
              {I18N_LANGUAGES.map((item) => (
                <DropdownMenuRadioItem
                  key={item.code}
                  value={item.code}
                  disabled={item.code !== currentLanguage.code}
                  className="flex items-center gap-2"
                >
                  <img
                    src={item.flag}
                    className="w-4 h-4 rounded-full"
                    alt={item.label}
                  />
                  <span>{item.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Footer */}
        <DropdownMenuItem
          className="flex items-center gap-2"
          onSelect={(event) => event.preventDefault()}
        >
          <Moon />
          <div className="flex items-center gap-2 justify-between grow">
            Mode sombre
            <Switch
              size="sm"
              checked={resolvedTheme === 'dark'}
              onCheckedChange={handleThemeToggle}
            />
          </div>
        </DropdownMenuItem>
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
