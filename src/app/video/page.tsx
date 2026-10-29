import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import AppShell from "@/components/AppShell";
import VideoStudio from "@/components/VideoStudio";

export const metadata = { title: "Video — VELORIS" };
export const dynamic = "force-dynamic";

export default async function VideoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <VideoStudio />
    </AppShell>
  );
}
