import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { checkQuota } from "@/lib/settings";
import AppShell from "@/components/AppShell";
import SettingsPage from "@/components/SettingsPage";

export const metadata = { title: "Settings — VELORIS" };
export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [images, chat, audio] = await Promise.all([checkQuota(user, "image"), checkQuota(user, "chat"), checkQuota(user, "audio")]);
  return (
    <AppShell user={user}>
      <SettingsPage user={user} usage={{ images: { used: images.used, limit: images.limit }, chat: { used: chat.used, limit: chat.limit }, audio: { used: audio.used, limit: audio.limit } }} />
    </AppShell>
  );
}
