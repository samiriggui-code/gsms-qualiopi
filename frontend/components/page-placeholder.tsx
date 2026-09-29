import Link from 'next/link';
import { Database, FileCheck2, Hammer } from 'lucide-react';
import type { NavItem, PageSpec } from '@/config/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';

const DATA_LABELS: Record<PageSpec['data'], { label: string; variant: 'success' | 'warning' | 'info' }> = {
  existant: { label: 'Tables prêtes', variant: 'success' },
  'a-creer': { label: 'Modèle à créer', variant: 'warning' },
  calcule: { label: 'Calculé', variant: 'info' },
};

// Page provisoire : en-tête de contenu CRM + fiche de cadrage de l'écran à construire.
export function PagePlaceholder({ item }: { item: NavItem }) {
  const spec = item.spec;

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          {item.icon && <item.icon className="size-4 text-primary" />}
          {item.title}
          <Badge variant="outline" size="sm">
            À construire
          </Badge>
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid">
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <Hammer className="size-4 text-muted-foreground" />
                Écran à construire
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              {spec ? (
                <>
                  <p className="text-secondary-foreground leading-relaxed">{spec.description}</p>

                  {spec.indicators?.length ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <FileCheck2 className="size-4 text-muted-foreground" />
                        Indicateurs Qualiopi alimentés
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {spec.indicators.map((n) => (
                          <Badge key={n} variant="primary" appearance="light" asChild>
                            <Link href={`/qualiopi/referentiel/${n}`}>
                              I{String(n).padStart(2, '0')}
                            </Link>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Database className="size-4 text-muted-foreground" />
                      Données
                      <Badge variant={DATA_LABELS[spec.data].variant} appearance="light" size="sm">
                        {DATA_LABELS[spec.data].label}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{spec.source}</p>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">Écran à construire.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </Content>
    </>
  );
}
