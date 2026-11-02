import { redirect } from "next/navigation";
import { AuthShell, ForgotForm } from "@/components/auth-forms";

export const metadata = { title: "Réinitialisation — VELORIS" };

export default function ForgotPage() {
  if (process.env.AUTH_DISABLED !== "false") redirect("/chat");
  return (
    <AuthShell title="Mot de passe oublié" sub="Entrez votre e-mail et nous vous enverrons un code de réinitialisation unique.">
      <ForgotForm />
    </AuthShell>
  );
}
