import { redirect } from "next/navigation";
import { AuthShell, RegisterForm } from "@/components/auth-forms";

export const metadata = { title: "Create account — VELORIS" };

export default function RegisterPage() {
  if (process.env.AUTH_DISABLED !== "false") redirect("/chat");
  return (
    <AuthShell title="Create your account" sub="Free plan included — 5 images a day, unlimited vision analysis, chat and audio.">
      <RegisterForm />
    </AuthShell>
  );
}
