import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

export const PASSWORD = process.env.GSMS_E2E_PASSWORD ?? "demo-gsms-2026";

export async function login(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/sessions");
}

export async function openSession(page: Page, reference: string) {
  await page.goto("/sessions");
  await page.getByRole("radio", { name: /Toutes/ }).click();
  await page
    .getByRole("link", { name: new RegExp(reference) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(reference);
}

/** Aucune page ne doit défiler horizontalement (mesure sur la largeur réelle de l'écran). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.visualViewport!.width);
  expect(overflow, "débordement horizontal de la page").toBeLessThanOrEqual(1);
}

/** Pas de violation d'accessibilité grave ou critique (axe-core, WCAG 2.1 A/AA). */
export async function expectAccessible(page: Page, info: TestInfo) {
  // @axe-core/playwright type sa page avec sa propre copie de playwright-core : même objet à l'exécution.
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  await info.attach("axe", { body: JSON.stringify(serious, null, 2), contentType: "application/json" });
  expect(
    serious.map(
      (v) =>
        `${v.id} : ${v.help} → ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(" | ")}`,
    ),
  ).toEqual([]);
}

/** Capture jointe au rapport : c'est ce qu'on regarde pour juger le rendu. */
export async function snap(page: Page, info: TestInfo, name: string) {
  await page.waitForTimeout(250);
  // Aussi rangée par nom dans e2e-results/captures pour la revue visuelle.
  const path = `e2e-results/captures/${info.project.name}-${name}.png`;
  await info.attach(name, { body: await page.screenshot({ fullPage: true, path }), contentType: "image/png" });
}

export const isMobile = (info: TestInfo) => info.project.name === "mobile";
