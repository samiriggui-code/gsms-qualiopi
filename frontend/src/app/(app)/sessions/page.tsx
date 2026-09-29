import type { Metadata } from "next";

import { SessionsList } from "@/features/sessions/sessions-list";

export const metadata: Metadata = { title: "Sessions" };

export default function SessionsPage() {
  return <SessionsList />;
}
