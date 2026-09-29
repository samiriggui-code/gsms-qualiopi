import { defineConfig, devices } from "@playwright/test";

// Tests de bout en bout sur la vraie API GSMS et une base de démo neuve (e2e/seed_e2e.py).
// Prérequis : PostgreSQL local et l'environnement Python du backend (requirements-dev.txt).
const API_PORT = 8100;
const WEB_PORT = 3100;
const python = process.env.GSMS_PYTHON ?? "python3";
const backendEnv = {
  DATABASE_URL: process.env.GSMS_E2E_DATABASE_URL ?? "postgresql+psycopg://postgres:postgres@localhost:5432/gsms_e2e",
  JWT_SECRET: "secret-e2e-assez-long-pour-hs256-0123456789-abcdef",
  DOCUMENTS_DIR: "/tmp/gsms-e2e-documents",
  APP_ENV: "development",
  CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1, // les tests écrivent dans la même base de démo
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      env: backendEnv,
      url: `http://127.0.0.1:${API_PORT}/api/v1/referentials/active`,
      // 401 sans jeton : le serveur répond, c'est suffisant.
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next dev --port ${WEB_PORT}`,
      env: { GSMS_API_URL: `http://127.0.0.1:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}/connexion`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
