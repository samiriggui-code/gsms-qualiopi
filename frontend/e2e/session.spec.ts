import { expect, test } from "@playwright/test";

import { expectAccessible, expectNoHorizontalOverflow, login, openSession, snap } from "./helpers";

// Lecture et mise en page : sur ordinateur et sur mobile.
test.describe("lecture", () => {
  test("connexion refusée puis réussie", async ({ page }) => {
    await page.goto("/sessions");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fsessions/);
    await page.getByLabel("Adresse e-mail").fill("gestion@demo.fr");
    await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Identifiants invalides")).toBeVisible();
    await login(page, "gestion@demo.fr");
  });

  test("liste des sessions : vues, recherche, état vide", async ({ page }, info) => {
    await login(page, "gestion@demo.fr");
    await expect(page.getByRole("radio", { name: /À venir et en cours/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("SST-2026-02").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("SSIAP1-2026-01")).toHaveCount(0); // terminée : pas dans cette vue
    await page.getByRole("radio", { name: /À clôturer/ }).click();
    await expect(page.getByText("SSIAP1-2026-01").filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("radio", { name: /Toutes/ }).click();
    await page.getByLabel("Rechercher une session").fill("ACME");
    await expect(page.getByText("SST-2026-04").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("SST-2026-02")).toHaveCount(0);
    await page.getByLabel("Rechercher une session").fill("zzz");
    await expect(page.getByText("Aucune session ne correspond")).toBeVisible();
    await page.getByLabel("Rechercher une session").fill("");
    await expectNoHorizontalOverflow(page);
    await expectAccessible(page, info);
    await snap(page, info, "sessions");
  });

  test("détail de session : parcours, émargement, Qualiopi", async ({ page }, info) => {
    await login(page, "gestion@demo.fr");
    await openSession(page, "SST-2026-02");
    // L'action « Terminer » est visible mais bloquée, avec la raison du moteur.
    await expect(page.getByRole("button", { name: "Terminer" })).toHaveAttribute("aria-disabled", "true");
    await expectNoHorizontalOverflow(page);
    await expectAccessible(page, info);
    await snap(page, info, "parcours");

    await page.getByRole("tab", { name: "Émargement" }).click();
    await expect(page.getByRole("table", { name: /Feuille d’émargement/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectAccessible(page, info);
    await snap(page, info, "emargement");

    await page.getByRole("tab", { name: "Qualiopi" }).click();
    await expect(page.getByRole("heading", { name: "Écarts ouverts pour cette session" })).toBeVisible();
    await expect(page.getByText(/I04 — Analyse du besoin/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectAccessible(page, info);
    await snap(page, info, "qualiopi");
  });

  test("étape en retard signalée (positionnement manquant, écart I08)", async ({ page }) => {
    await login(page, "gestion@demo.fr");
    await openSession(page, "SSIAP1-2026-01");
    // Matrice sur ordinateur (marque « ! »), cartes sur mobile (étiquette en clair).
    const late = page.getByTitle("Positionnement : en retard").or(page.getByText("En retard : positionnement"));
    await expect(late.filter({ visible: true })).toHaveCount(1);
  });

  test("panneau stagiaire au clavier", async ({ page }, info) => {
    await login(page, "gestion@demo.fr");
    await openSession(page, "SST-2026-02");
    const opener = page
      .getByRole("button", { name: /Emma Mathieu/ })
      .filter({ visible: true })
      .first();
    await opener.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog", { name: "Emma Mathieu" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Demi-journées suivies")).toBeVisible();
    await expectAccessible(page, info);
    await snap(page, info, "panneau-stagiaire");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused(); // le focus revient là où on était
  });
});
