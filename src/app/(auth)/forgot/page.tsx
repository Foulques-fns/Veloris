import { redirect } from "next/navigation";
import { AuthShell, ForgotForm } from "@/components/auth-forms";

export const metadata = { title: "Reset password — VELORIS" };

export default function ForgotPage() {
  if (process.env.AUTH_DISABLED !== "false") redirect("/chat");
  return (
    <AuthShell title="Reset your password" sub="Enter your account email and we'll send you a one-time reset code.">
      <ForgotForm />
    </AuthShell>
  );
}
