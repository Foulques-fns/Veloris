import { redirect } from "next/navigation";
import { AuthShell, LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Sign in — VELORIS" };

export default function LoginPage() {
  if (process.env.AUTH_DISABLED !== "false") redirect("/chat");
  return (
    <AuthShell title="Welcome back" sub="Sign in to continue your conversations, images and audio.">
      <LoginForm />
    </AuthShell>
  );
}
