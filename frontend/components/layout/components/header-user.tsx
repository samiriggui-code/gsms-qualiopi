import { useCurrentUser } from '@/hooks/use-current-user';
import { USER_AVATAR, UserDropdownMenu } from './user-menu';

export function HeaderUser() {
  const { data: user } = useCurrentUser();

  return (
    <UserDropdownMenu
      trigger={
        <img
          className="size-7 rounded-full border-2 border-zinc-950 cursor-pointer"
          src={USER_AVATAR}
          alt={user?.full_name ?? 'Menu utilisateur'}
        />
      }
    />
  );
}
