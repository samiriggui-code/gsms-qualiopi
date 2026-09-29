import { redirect } from "next/navigation";

// La landing publique de l'école (catalogue des formations) viendra ici ; en attendant, l'espace formation.
export default function Home() {
  redirect("/sessions");
}
