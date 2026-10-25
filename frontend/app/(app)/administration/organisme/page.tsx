'use client';

// Fiche de l'organisme : identité réglementaire (NDA, SIRET), catégories d'actions certifiées,
// statut de nouvel entrant et référents. Les catégories et le statut changent les indicateurs
// applicables : l'API relance le moteur à l'enregistrement.
import { FormEvent, useEffect, useState } from 'react';
import { Building2, Info, LoaderCircleIcon, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  useOrganization,
  useUpdateOrganization,
  type Organization,
} from '@/lib/gsms/administration';
import { useCan } from '@/lib/permissions';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { PageHero } from '@/components/page/page-hero';

type Form = Omit<Organization, 'existe' | 'categories_possibles'>;

const TEXT_FIELDS: {
  name: keyof Form;
  label: string;
  hint?: string;
  type?: string;
}[] = [
  { name: 'name', label: 'Raison sociale' },
  { name: 'nda_number', label: 'Numéro de déclaration d’activité (NDA)' },
  { name: 'siret', label: 'SIRET', hint: '14 chiffres' },
];
const REFERENTS: { name: keyof Form; label: string; type?: string }[] = [
  { name: 'disability_referent_name', label: 'Référent handicap' },
  {
    name: 'disability_referent_email',
    label: 'E-mail du référent handicap',
    type: 'email',
  },
  { name: 'mobility_referent_name', label: 'Référent mobilité' },
];

export default function OrganizationPage() {
  const { data: org, isLoading, error } = useOrganization();
  const update = useUpdateOrganization();
  const can = useCan()('manage_settings');
  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => {
    if (org) {
      const { existe: _e, categories_possibles: _c, ...rest } = org;
      setForm(rest);
    }
  }, [org]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const changed =
    !!(org && form) &&
    (Object.keys(form) as (keyof Form)[]).some(
      (k) => JSON.stringify(form[k]) !== JSON.stringify(org[k]),
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form || !org) return;
    const diff = Object.fromEntries(
      (Object.keys(form) as (keyof Form)[])
        .filter((k) => JSON.stringify(form[k]) !== JSON.stringify(org[k]))
        .map((k) => [
          k,
          typeof form[k] === 'string'
            ? (form[k] as string).trim() || null
            : form[k],
        ]),
    );
    update.mutate(diff, {
      onSuccess: () =>
        toast.success(
          'Fiche de l’organisme enregistrée ; les indicateurs sont réévalués.',
        ),
    });
  };

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Building2 className="size-4 text-primary" /> Organisme
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5 max-w-4xl">
          <PageHero
            eyebrow="Administration"
            icon={Building2}
            title={org?.name || 'Organisme'}
            description="L'identité réglementaire de l'organisme et le périmètre de sa certification. Les réglages de fonctionnement sont dans Paramètres."
          />
          {error ? (
            <Refusal error={error} />
          ) : isLoading || !form || !org ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <Card className="shadow-none">
                <CardContent className="p-5 md:p-6 grid gap-4 sm:grid-cols-2">
                  <h2 className="sm:col-span-2 text-sm font-semibold">
                    Identité
                  </h2>
                  {TEXT_FIELDS.map((f) => (
                    <div
                      key={f.name}
                      className={
                        f.name === 'name'
                          ? 'space-y-1.5 sm:col-span-2'
                          : 'space-y-1.5'
                      }
                    >
                      <Label htmlFor={f.name}>{f.label}</Label>
                      <Input
                        id={f.name}
                        value={(form[f.name] as string) ?? ''}
                        disabled={!can}
                        onChange={(e) => set(f.name, e.target.value as never)}
                      />
                      {f.hint && (
                        <p className="text-xs text-muted-foreground">
                          {f.hint}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <h2 className="text-sm font-semibold">
                    Périmètre de la certification
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {org.categories_possibles.map((c) => {
                      const on = (form.action_categories ?? []).includes(
                        c.code,
                      );
                      return (
                        <label
                          key={c.code}
                          className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:disabled]:cursor-default hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={on}
                            disabled={!can}
                            className="mt-0.5"
                            onCheckedChange={(v) =>
                              set(
                                'action_categories',
                                v
                                  ? [...(form.action_categories ?? []), c.code]
                                  : (form.action_categories ?? []).filter(
                                      (x) => x !== c.code,
                                    ),
                              )
                            }
                          />
                          <span>
                            <span className="block text-sm font-medium">
                              {c.libelle}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {c.code}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                    <span>
                      <span className="block text-sm font-medium">
                        Nouvel entrant
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Premier audit initial : certains indicateurs sont
                        adaptés (preuves des réalisations non encore
                        disponibles).
                      </span>
                    </span>
                    <Switch
                      checked={!!form.is_new_entrant}
                      disabled={!can}
                      onCheckedChange={(v) => set('is_new_entrant', v)}
                    />
                  </label>
                  <Alert variant="info" appearance="light">
                    <AlertIcon>
                      <Info />
                    </AlertIcon>
                    <AlertContent>
                      <AlertDescription>
                        Ces deux réglages déterminent les indicateurs
                        applicables. L&apos;état de préparation est recalculé
                        dès l&apos;enregistrement.
                      </AlertDescription>
                    </AlertContent>
                  </Alert>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="p-5 md:p-6 grid gap-4 sm:grid-cols-2">
                  <h2 className="sm:col-span-2 text-sm font-semibold">
                    Référents
                  </h2>
                  {REFERENTS.map((f) => (
                    <div key={f.name} className="space-y-1.5">
                      <Label htmlFor={f.name}>{f.label}</Label>
                      <Input
                        id={f.name}
                        type={f.type ?? 'text'}
                        value={(form[f.name] as string) ?? ''}
                        disabled={!can}
                        onChange={(e) => set(f.name, e.target.value as never)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
              {update.error && <Refusal error={update.error} />}
              {can && (
                <div className="flex justify-end">
                  <Button type="submit" disabled={!changed || update.isPending}>
                    {update.isPending ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <Save />
                    )}{' '}
                    Enregistrer
                  </Button>
                </div>
              )}
            </form>
          )}
        </div>
      </Content>
    </>
  );
}
