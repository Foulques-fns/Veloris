import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import AppShell from "@/components/AppShell";
import CodeStudio from "@/components/CodeStudio";

export const metadata = { title: "AI Builder — VELORIS" };
export const dynamic = "force-dynamic";

export default async function BuilderPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  
  return (
    <AppShell user={user}>
      <CodeStudio />
    </AppShell>
  );
}
