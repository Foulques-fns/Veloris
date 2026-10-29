import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import AdminApp from "@/components/AdminApp";
import { Toaster } from "@/components/ui";

export const metadata = { title: "Admin — VELORIS" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/chat");
  return (
    <>
      <AdminApp admin={{ name: user.name, email: user.email }} />
      <Toaster />
    </>
  );
}
