import { MAIN_NAV } from '@/config/menu.config';
import { PagePlaceholder } from '@/components/page-placeholder';

export default function TableauDeBordPage() {
  return <PagePlaceholder item={MAIN_NAV[0].items[0]} />;
}
