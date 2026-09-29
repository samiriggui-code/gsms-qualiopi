import type { Metadata } from "next";

import { API_URL } from "@/lib/server-config";

import { QuestionnaireForm, type PublicQuestionnaire } from "./questionnaire-form";

export const metadata: Metadata = { title: "Questionnaire", robots: { index: false, follow: false } };

type Loaded = { ok: true; data: PublicQuestionnaire } | { ok: false; status: number; detail: string };

async function load(token: string): Promise<Loaded> {
  const res = await fetch(`${API_URL}/api/v1/public/questionnaires/${encodeURIComponent(token)}`, {
    cache: "no-store",
  }).catch(() => null);
  if (res === null)
    return { ok: false, status: 503, detail: "Le service est momentanément indisponible. Réessayez plus tard." };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = res.status === 404 ? "Ce lien n'est pas valide. Vérifiez qu'il est complet." : body.detail;
    return { ok: false, status: res.status, detail: detail ?? "Ce questionnaire n'est pas disponible." };
  }
  return { ok: true, data: body };
}

// Questionnaire envoyé au stagiaire (ou à l'entreprise) : lien personnel, sans compte ni mot de passe.
export default async function QuestionnairePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await load(token);
  return (
    <main className="min-h-dvh bg-bg px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        {loaded.ok ? (
          <QuestionnaireForm token={token} data={loaded.data} />
        ) : (
          <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-panel">
            <h1 className="text-lg font-semibold text-balance">
              {loaded.status === 410 ? "Questionnaire fermé" : "Questionnaire indisponible"}
            </h1>
            <p className="mt-2 text-sm text-fg-muted">{loaded.detail}</p>
          </section>
        )}
      </div>
    </main>
  );
}
