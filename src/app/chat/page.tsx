import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import ChatApp from "@/components/ChatApp";

export const metadata = { title: "Chat — VELORIS" };
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <ChatApp user={user} />;
}
