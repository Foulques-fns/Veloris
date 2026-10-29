import { getSessionUser } from "@/lib/session";
import AppShell from "@/components/AppShell";
import PricingPage from "@/components/PricingPage";

export const metadata = { title: "Plans — VELORIS" };
export const dynamic = "force-dynamic";

export default async function Pricing() {
  const user = await getSessionUser();
  if (!user) return <PricingPage currentPlan={null} isAdmin={false} />;
  return (
    <AppShell user={user}>
      <PricingPage currentPlan={user.plan} isAdmin={user.role === "admin"} />
    </AppShell>
  );
}
