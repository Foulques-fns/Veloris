import { redirect } from "next/navigation";
import { AuthShell, ResetForm } from "@/components/auth-forms";

export const metadata = { title: "Choose new password — VELORIS" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ email?: string; dev?: string }> }) {
  if (process.env.AUTH_DISABLED !== "false") redirect("/chat");
  const sp = await searchParams;
  const email = (sp.email ?? "").trim().toLowerCase();
  if (!email) redirect("/forgot");
  return (
    <AuthShell title="Choose a new password" sub="Enter the reset code from your email and pick a new password.">
      <ResetForm email={email} devCode={sp.dev} />
    </AuthShell>
  );
}
