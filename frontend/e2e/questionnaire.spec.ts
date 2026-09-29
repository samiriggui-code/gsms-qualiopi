import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { E2E_LINKS_FILE } from "./env";
import { expectAccessible, expectNoHorizontalOverflow, snap } from "./helpers";

// Questionnaire envoyé au stagiaire par les relances : lien personnel, sans compte.
const links = (): Record<string, string> => JSON.parse(readFileSync(E2E_LINKS_FILE, "utf-8"));

const group = (page: Page, name: RegExp) => page.getByRole("radiogroup", { name });

test("le stagiaire répond au questionnaire de besoin depuis son lien", async ({ page }, info) => {
  await page.goto(`/q/${links()[info.project.name]}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Préparer votre formation");
  await expect(page.getByText(/^Bonjour (Nora|Zoé),$/)).toBeVisible();
  await expect(page.getByText(/Sauveteur secouriste du travail · du/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page, info);
  await snap(page, info, "questionnaire");

  // Envoi incomplet : récapitulatif des manques, question par question.
  await page.getByRole("button", { name: "Envoyer mes réponses" }).click();
  const alert = page.locator("form").getByRole("alert"); // hors annonceur de routes de Next
  await expect(alert).toContainText("Certaines réponses sont à compléter");
  await expect(alert.getByRole("listitem")).toHaveCount(5);
  await expect(alert).toBeFocused();
  await snap(page, info, "questionnaire-manques");

  await page.getByLabel(/Qu'attendez-vous de cette formation/).fill("Être sauveteur secouriste dans mon équipe");
  await group(page, /Votre situation actuelle/)
    .getByText("Salarié(e)")
    .click();
  await group(page, /Votre expérience/)
    .getByText("Aucune")
    .click();
  await group(page, /niveau actuel/)
    .getByText("2", { exact: true })
    .click();
  await expect(group(page, /prérequis/)).toHaveCount(0); // SST : aucun prérequis, question non posée
  await expect(page.getByLabel(/Précisez l'aménagement/)).toHaveCount(0);
  await group(page, /aménagement/)
    .getByText("Oui")
    .click();
  await expect(alert.getByRole("listitem")).toHaveCount(0);

  // Question conditionnelle : l'aménagement demandé doit être précisé.
  await page.getByRole("button", { name: "Envoyer mes réponses" }).click();
  await expect(alert).toContainText("Question 6");
  await page.getByLabel(/Précisez l'aménagement/).fill("Salle accessible en fauteuil");
  await page.getByRole("button", { name: "Envoyer mes réponses" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Merci, vos réponses sont enregistrées");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await snap(page, info, "questionnaire-merci");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Questionnaire fermé");
  await expect(page.getByText("Merci, vos réponses ont déjà été enregistrées.")).toBeVisible();
});

test("lien expiré ou incomplet : message clair, rien d'autre", async ({ page }, info) => {
  await page.goto(`/q/${links().expire}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Questionnaire fermé");
  await expect(page.getByText(/Ce lien a expiré/)).toBeVisible();
  await expectAccessible(page, info);
  await snap(page, info, "questionnaire-expire");

  await page.goto(`/q/${links().expire.slice(0, -3)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Questionnaire indisponible");
  await expect(page.getByText("Ce lien n'est pas valide. Vérifiez qu'il est complet.")).toBeVisible();
});
