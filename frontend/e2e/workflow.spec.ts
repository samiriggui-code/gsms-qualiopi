import { expect, test } from "@playwright/test";

import { expectAccessible, login, openSession, snap } from "./helpers";

// Écritures réelles dans la base de démo : une seule fois, sur ordinateur.
test.describe("parcours métier", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== "ordinateur", "écritures faites une fois (projet ordinateur)");
  });

  test("saisir l'analyse du besoin en retard", async ({ page }, info) => {
    await login(page, "gestion@demo.fr");
    await openSession(page, "SST-2026-02");
    await page.getByRole("button", { name: "Louis Morin", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Louis Morin" });
    await expect(panel.getByText("En retard · échéance")).toBeVisible();
    await panel.getByRole("button", { name: "Saisir" }).first().click();

    // Validation côté écran : la synthèse est obligatoire.
    await panel.getByRole("button", { name: "Enregistrer l'analyse" }).click();
    await expect(panel.getByText("Champ obligatoire")).toBeVisible();
    await panel.getByLabel("Synthèse du besoin").fill("Reprise d'activité après congé ; aucun besoin particulier.");
    await expectAccessible(page, info);
    await snap(page, info, "formulaire");
    await panel.getByRole("button", { name: "Enregistrer l'analyse" }).click();

    await expect(page.getByText("Analyse du besoin enregistrée")).toBeVisible();
    await expect(panel.getByText("Reprise d'activité après congé")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTitle("Analyse du besoin : fait")).toHaveCount(3); // la matrice est relue
  });

  test("refus motivé : convocation sans horaires", async ({ page }) => {
    await login(page, "gestion@demo.fr");
    await openSession(page, "SST-2026-04");
    await page.getByRole("button", { name: "Paul Lambert", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Paul Lambert" });
    const emit = panel.getByRole("button", { name: "Émettre" }).first();
    await expect(emit).toHaveAttribute("aria-disabled", "true");
    // La raison est écrite sous l'étape…
    await expect(panel.getByText(/Bloqué : .*demi-journées planifiées/)).toBeVisible();
    // …et redite au clic (sur mobile, pas de survol). force : un bouton aria-disabled reste cliquable.
    await emit.click({ force: true });
    await expect(page.locator("[data-sonner-toast]").getByText(/demi-journées planifiées/)).toBeVisible();
  });

  test("attestation : refus détaillé, puis émission et document figé", async ({ page }, info) => {
    await login(page, "gestion@demo.fr");
    await openSession(page, "SSIAP1-2026-01");

    // Chloé Blanc : une demi-journée sans rien de noté (trou I12 de la démo), dite précisément.
    await page.getByRole("button", { name: "Chloé Blanc", exact: true }).click();
    let panel = page.getByRole("dialog", { name: "Chloé Blanc" });
    await expect(
      panel.getByText("Rien de noté : 21/08/2026 après-midi").or(panel.getByText(/Rien de noté : .+après-midi/)),
    ).toBeVisible();
    await snap(page, info, "emargement-manquant");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Lucas Garnier", exact: true }).click();
    panel = page.getByRole("dialog", { name: "Lucas Garnier" });
    await panel.getByRole("button", { name: "Émettre" }).first().click();
    await expect(panel.getByText(/Le moteur rédige l'attestation/)).toBeVisible();
    await panel.getByRole("button", { name: "Émettre" }).last().click();
    await expect(page.getByText("Attestation émise (version 1)")).toBeVisible();
    await expect(panel.getByText("En vigueur")).toBeVisible();
    await snap(page, info, "document-emis");

    const href = await panel.getByRole("link", { name: /Ouvrir/ }).getAttribute("href");
    const res = await page.context().request.get(href!);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("Attestation de fin de formation");
    expect(res.headers()["x-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
  });

  test("formatrice : ses sessions seulement, sans convocation ni Qualiopi", async ({ page }, info) => {
    await login(page, "julie@demo.fr");
    await page.getByRole("radio", { name: /Toutes/ }).click();
    await expect(page.getByText("SST-2026-02").first()).toBeVisible();
    await expect(page.getByText("SSIAP1-2026-01")).toHaveCount(0);
    await openSession(page, "SST-2026-02");
    await expect(page.getByRole("tab", { name: "Qualiopi" })).toHaveCount(0);

    await page.getByRole("button", { name: "Noah Clement", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Noah Clement" });
    await expect(panel.getByRole("button", { name: /Émettre|Réémettre/ })).toHaveCount(0); // hors de ses droits : masqué
    await panel.getByRole("button", { name: "Ajouter" }).click();
    await panel.getByLabel("Intitulé").fill("Cas pratique n°1 : alerte et protection");
    await panel.getByLabel("Nature").selectOption("FORMATIVE");
    await panel.getByLabel("Résultat").selectOption("oui");
    await panel.getByRole("button", { name: "Enregistrer l'évaluation" }).click();
    await expect(page.getByText("Évaluation enregistrée")).toBeVisible();
    await expect(panel.getByText("1 évaluation(s)")).toBeVisible();
    await snap(page, info, "formatrice");
  });
});
