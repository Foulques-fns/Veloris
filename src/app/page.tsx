import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { LandingClient } from "@/components/LandingClient";

export default async function Landing() {
  const user = await getSessionUser();
  if (user) redirect("/chat");

  return <LandingClient />;
}
