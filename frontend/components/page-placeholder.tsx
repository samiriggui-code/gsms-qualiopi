import type { NavItem } from '@/config/types';
import { Card, CardContent } from '@/components/ui/card';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';

// Page provisoire : en-tête de contenu CRM + encart « à construire ».
export function PagePlaceholder({ item }: { item: NavItem }) {
  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          {item.icon && <item.icon className="size-4 text-primary" />}
          {item.title}
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid">
          <Card>
            <CardContent className="py-16 text-center">
              <div className="text-base font-medium text-mono">{item.title}</div>
              <p className="text-sm text-muted-foreground mt-1">
                Écran à construire.
              </p>
            </CardContent>
          </Card>
        </div>
      </Content>
    </>
  );
}
