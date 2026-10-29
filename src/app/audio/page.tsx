import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import AppShell from "@/components/AppShell";
import AudioStudio from "@/components/AudioStudio";

export const metadata = { title: "Audio — VELORIS" };
export const dynamic = "force-dynamic";

export default async function AudioPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const charLimit = user.plan === "ultra" ? 4000 : user.plan === "premium" ? 2500 : 1200;
  return (
    <AppShell user={user}>
      <AudioStudio charLimit={charLimit} />
    </AppShell>
  );
}
