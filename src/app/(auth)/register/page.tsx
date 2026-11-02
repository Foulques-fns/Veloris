import { redirect } from "next/navigation";
import { AuthShell, RegisterForm } from "@/components/auth-forms";

export const metadata = { title: "Inscription — VELORIS" };

export default function RegisterPage() {
  if (process.env.AUTH_DISABLED !== "false") redirect("/chat");
  return (
    <AuthShell title="Créer votre compte" sub="Free plan included — 5 images a day, unlimited vision analysis, chat and audio.">
      <RegisterForm />
    </AuthShell>
  );
}
