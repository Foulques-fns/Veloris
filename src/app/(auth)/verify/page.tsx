import { redirect } from "next/navigation";
import { AuthShell, VerifyForm } from "@/components/auth-forms";

export const metadata = { title: "Verify email — VELORIS" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string; dev?: string }> }) {
  if (process.env.AUTH_DISABLED !== "false") redirect("/chat");
  const sp = await searchParams;
  const email = (sp.email ?? "").trim().toLowerCase();
  if (!email) redirect("/register");
  return (
    <AuthShell title="Check your email" sub="Enter the 6-digit code we emailed you. It expires in 5 minutes.">
      <VerifyForm email={email} devCode={sp.dev} />
    </AuthShell>
  );
}
