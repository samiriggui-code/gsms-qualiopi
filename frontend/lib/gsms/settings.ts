import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Réglages datés et fonctionnalités activables (backend/app/platform/router.py, settings.py, features.py).

export interface JsonSchema {
  type?: string;
  enum?: (string | number)[];
  const?: unknown;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  format?: string;
  items?: JsonSchema;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  properties?: Record<string, JsonSchema>;
}

export interface Setting {
  key: string;
  domain: string;
  label: string;
  help: string;
  regulatory: boolean;
  schema: JsonSchema;
  default: unknown;
  value: unknown;
  since: string | null;
  next: { value: unknown; from: string } | null;
}

export interface SettingChange {
  value: unknown;
  effective_from: string;
  reason: string | null;
  by: string | null;
  at: string;
}

export interface Feature {
  code: string;
  label: string;
  enabled: boolean;
  available: boolean;
  depends_on: string[];
}

export interface RelanceRule {
  cle: string;
  libelle: string;
  destinataire: string;
  externe: boolean;
  indicateurs: number[];
}

const keys = {
  settings: ['settings'] as const,
  history: (key: string) => ['settings', key, 'history'] as const,
  features: ['features'] as const,
  rules: ['communications', 'regles'] as const,
};

export const useSettings = () =>
  useQuery({
    queryKey: keys.settings,
    queryFn: () => api.get<Setting[]>('settings'),
  });

export const useSettingHistory = (key: string | null) =>
  useQuery({
    queryKey: keys.history(key ?? ''),
    queryFn: () => api.get<SettingChange[]>(`settings/${key}/history`),
    enabled: !!key,
  });

export const useFeatures = () =>
  useQuery({
    queryKey: keys.features,
    queryFn: () => api.get<Feature[]>('features'),
  });

export const useRelanceRules = (enabled: boolean) =>
  useQuery({
    queryKey: keys.rules,
    queryFn: () => api.get<RelanceRule[]>('communications/regles'),
    enabled,
  });

export function useChangeSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      ...body
    }: {
      key: string;
      value: unknown;
      effective_from: string;
      reason: string | null;
    }) =>
      api.put<{ key: string; value: unknown; effective_from: string }>(
        `settings/${key}`,
        body,
      ),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: keys.settings });
      qc.invalidateQueries({ queryKey: keys.history(v.key) });
    },
  });
}

export function useToggleFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, enabled }: { code: string; enabled: boolean }) =>
      api.put<{ code: string; enabled: boolean }>(`features/${code}`, {
        enabled,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.features });
      qc.invalidateQueries({ queryKey: keys.settings });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}
