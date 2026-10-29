import { db } from "@/db";
import { errorLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { err, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return err("Forbidden.", 403);
  const rows = await db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt)).limit(200);
  return json({ ok: true, errors: rows });
}

export async function DELETE() {
  const admin = await requireAdmin();
  if (!admin) return err("Forbidden.", 403);
  await db.delete(errorLogs);
  return json({ ok: true });
}
