import { findNavItem } from '@/config/menu.config';
import { notFound } from 'next/navigation';
import { PagePlaceholder } from '@/components/page-placeholder';

// Page provisoire pour chaque entrée du menu qui n'a pas encore d'écran dédié.
// Créer app/(app)/<chemin>/page.tsx pour remplacer une entrée.
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const match = findNavItem(`/${slug.join('/')}`);

  if (!match) {
    notFound();
  }

  return <PagePlaceholder item={match.item} />;
}
