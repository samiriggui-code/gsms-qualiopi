import { toAbsoluteUrl } from '@/lib/helpers';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// TODO : brancher la traduction (dossier i18n/) ; seul le français est actif.
const LANGUAGES = [
  { label: 'Français', code: 'fr', flag: toAbsoluteUrl('/media/flags/france.svg') },
  { label: 'English', code: 'en', flag: toAbsoluteUrl('/media/flags/united-kingdom.svg') },
];

export function HeaderLanguage() {
  const current = LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          mode="icon"
          className="hover:bg-zinc-800 data-[state=open]:bg-zinc-800"
          aria-label={`Langue : ${current.label}`}
        >
          <img src={current.flag} className="size-4 rounded-full" alt="" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup value={current.code}>
          {LANGUAGES.map((lang) => (
            <DropdownMenuRadioItem
              key={lang.code}
              value={lang.code}
              disabled={lang.code !== current.code}
              className="flex items-center gap-2"
            >
              <img src={lang.flag} className="size-4 rounded-full" alt="" />
              {lang.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
