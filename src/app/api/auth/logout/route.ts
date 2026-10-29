import { destroySession } from "@/lib/session";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await destroySession();
  return json({ ok: true });
}
