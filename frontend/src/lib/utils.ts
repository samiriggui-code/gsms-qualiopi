import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const DATE_LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const DATETIME = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function parse(iso: string): Date {
  // Une date seule (AAAA-MM-JJ) est un jour civil : pas de décalage de fuseau.
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
}

export const fmt = {
  date: (iso?: string | null) => (iso ? DATE.format(parse(iso)) : "—"),
  day: (iso?: string | null) => (iso ? DATE_LONG.format(parse(iso)) : "—"),
  datetime: (iso?: string | null) => (iso ? DATETIME.format(parse(iso)) : "—"),
  range: (from: string, to: string) => (from === to ? fmt.date(from) : `${fmt.date(from)} → ${fmt.date(to)}`),
};
