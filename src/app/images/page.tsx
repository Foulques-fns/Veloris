import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import AppShell from "@/components/AppShell";
import ImageStudio from "@/components/ImageStudio";

export const metadata = { title: "Images — VELORIS" };
export const dynamic = "force-dynamic";

export default async function ImagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <ImageStudio />
    </AppShell>
  );
}
