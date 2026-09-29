import type { Metadata } from "next";

import { SessionView } from "@/features/sessions/session-view";

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  return <SessionView id={id} />;
}
