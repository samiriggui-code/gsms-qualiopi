'use client';

// Référentiels : les versions du référentiel national qualité importées (sources, empreintes,
// version en vigueur) et l'import d'une version livrée avec l'application.
import { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Download,
  Fingerprint,
  LoaderCircleIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  useImportReferential,
  useReferentials,
} from '@/lib/gsms/administration';
import { useCan } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { PageHero } from '@/components/page/page-hero';

export default function ReferentialsPage() {
  const { data, isLoading, error } = useReferentials();
  const importer = useImportReferential();
  const can = useCan()('manage_referential');
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [activate, setActivate] = useState(false);

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <BookOpen className="size-4 text-primary" /> Référentiels
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Administration"
            icon={BookOpen}
            title="Référentiels"
            description="Les versions du référentiel national qualité et de son guide de lecture importées, avec leurs sources et empreintes. Une seule est en vigueur ; seuls ces textes font foi."
            actions={
              can && (
                <Button onClick={() => setOpen(true)}>
                  <Download /> Importer une version
                </Button>
              )
            }
          />
          {error ? (
            <Refusal error={error} />
          ) : isLoading || !data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.versions.map((v) => (
                <Card
                  key={v.id}
                  className={
                    v.is_active
                      ? 'shadow-none border-primary/40 ring-1 ring-primary/15'
                      : 'shadow-none'
                  }
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {v.code} · {v.version}
                        </p>
                        <h2 className="text-base font-semibold leading-snug">
                          {v.title}
                        </h2>
                      </div>
                      {v.is_active ? (
                        <Badge
                          variant="success"
                          appearance="light"
                          className="shrink-0"
                        >
                          <CheckCircle2 className="size-3" /> En vigueur
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0">
                          Archivée
                        </Badge>
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">
                        Applicable depuis
                      </dt>
                      <dd>{formatDate(v.effective_from)}</dd>
                      <dt className="text-muted-foreground">Indicateurs</dt>
                      <dd>{v.indicators}</dd>
                      <dt className="text-muted-foreground">Critères</dt>
                      <dd>{v.criteria.length}</dd>
                      <dt className="text-muted-foreground">Importée le</dt>
                      <dd>{v.imported_at ? formatDate(v.imported_at) : '—'}</dd>
                    </dl>
                    <p className="text-xs text-muted-foreground">
                      Source :{' '}
                      {v.source_url ? (
                        <a
                          href={v.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {v.source_label}
                        </a>
                      ) : (
                        v.source_label
                      )}
                    </p>
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono break-all">
                      <Fingerprint className="size-3.5 shrink-0" />{' '}
                      {v.normative_sha256.slice(0, 16)}…
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Content>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importer une version</DialogTitle>
            <DialogDescription>
              Versions livrées avec l&apos;application. Réimporter une version
              déjà présente la vérifie contre ses empreintes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              {(data?.dossiers ?? []).map((d) => (
                <label
                  key={d}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40"
                >
                  <input
                    type="radio"
                    name="folder"
                    value={d}
                    checked={folder === d}
                    onChange={() => setFolder(d)}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="text-sm font-medium">
                    {d.replace('/', ' · ').toUpperCase()}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="activate">
                Mettre en vigueur après l&apos;import
              </Label>
              <Switch
                id="activate"
                checked={activate}
                onCheckedChange={setActivate}
              />
            </div>
            {importer.error && <Refusal error={importer.error} />}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={!folder || importer.isPending}
              onClick={() =>
                folder &&
                importer.mutate(
                  { folder, activate },
                  {
                    onSuccess: (v) => {
                      toast.success(
                        `${v.code} ${v.version} importé${activate ? ' et mis en vigueur' : ''}`,
                      );
                      setOpen(false);
                    },
                  },
                )
              }
            >
              {importer.isPending && (
                <LoaderCircleIcon className="animate-spin" />
              )}{' '}
              Importer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
