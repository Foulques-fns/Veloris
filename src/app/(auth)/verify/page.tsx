import { redirect } from "next/navigation";
import { AuthShell, VerifyForm } from "@/components/auth-forms";

export const metadata = { title: "Vérification — VELORIS" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string; dev?: string }> }) {
  if (process.env.AUTH_DISABLED !== "false") redirect("/chat");
  const sp = await searchParams;
  const email = (sp.email ?? "").trim().toLowerCase();
  if (!email) redirect("/register");
  return (
    <AuthShell title="Vérifiez votre e-mail" sub="Saisissez le code à 6 chiffres reçu par e-mail. Il expire dans 5 minutes.">
      <VerifyForm email={email} devCode={sp.dev} />
    </AuthShell>
  );
}
