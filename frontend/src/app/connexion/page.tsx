import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

// Écran partagé, comme les pages d'accès de la suite GSMS : formulaire d'un côté, photo de l'autre
// (bandeau en haut sur mobile). La photo est sombre dans les deux thèmes : son texte est toujours blanc.
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
      <aside
        aria-hidden
        className="relative h-44 shrink-0 bg-[#0b0d10] bg-[url(/brand/connexion-fond.jpg)] bg-cover bg-[center_30%] sm:h-56 lg:order-2 lg:m-4 lg:h-auto lg:rounded-xl lg:border lg:border-white/10"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10 lg:rounded-xl lg:bg-gradient-to-r lg:from-black/10 lg:via-black/20 lg:to-black/60" />
        <div className="relative flex h-full flex-col justify-end gap-2 p-5 text-white sm:p-8 lg:justify-between lg:p-12">
          <p className="hidden text-xs font-semibold tracking-[0.14em] text-white/80 uppercase lg:block">
            GSMS · Global Security Management System
          </p>
          <div className="lg:ml-auto lg:max-w-sm lg:text-right">
            <p className="text-xl font-semibold sm:text-2xl lg:text-3xl">Accès sécurisé</p>
            <p className="mt-1 text-sm text-white/85 lg:mt-2 lg:text-base">
              Sessions, parcours des stagiaires, émargement et préparation Qualiopi.
            </p>
          </div>
        </div>
      </aside>

      <section className="flex flex-1 items-start justify-center px-4 py-8 sm:py-12 lg:order-1 lg:items-center lg:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-6">
            <p className="text-[13px] font-medium tracking-wide text-fg-subtle uppercase">Espace formation</p>
            <h1 className="mt-1 text-2xl font-semibold">Connexion</h1>
          </div>
          <div className="rounded-lg border bg-surface p-5 shadow-panel sm:p-6">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
          <p className="mt-6 text-center text-xs text-fg-subtle">GSMS Qualiopi · Global-IT-SS</p>
        </div>
      </section>
    </main>
  );
}
