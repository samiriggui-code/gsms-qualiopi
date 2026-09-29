import { execFileSync } from "node:child_process";
import path from "node:path";

import { E2E_JWT_SECRET, E2E_LINKS_FILE } from "./env";

// Base de démo neuve à chaque lancement : les tests partent toujours du même état.
export default function globalSetup() {
  execFileSync(process.env.GSMS_PYTHON ?? "python3", [path.join(__dirname, "seed_e2e.py")], {
    stdio: "inherit",
    env: {
      ...process.env,
      GSMS_E2E_DB: "gsms_e2e",
      DOCUMENTS_DIR: "/tmp/gsms-e2e-documents",
      JWT_SECRET: E2E_JWT_SECRET,
      GSMS_E2E_LINKS: E2E_LINKS_FILE,
    },
  });
}
