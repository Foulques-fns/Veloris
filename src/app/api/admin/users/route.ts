import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { err, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return err("Forbidden.", 403);
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 120) ?? "";

  const base = sql`
    SELECT u.id, u.email, u.name, u.role, u.plan, u.email_verified AS "emailVerified",
      u.image_quota_override AS "imageQuotaOverride",
      u.chat_quota_override AS "chatQuotaOverride",
      u.audio_quota_override AS "audioQuotaOverride",
      u.created_at AS "createdAt",
      (SELECT count(*) FROM usage_events ue WHERE ue.user_id = u.id AND ue.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AND ue.type='image')::int AS "imagesToday",
      (SELECT count(*) FROM usage_events ue WHERE ue.user_id = u.id AND ue.type='chat')::int AS "chatTotal",
      (SELECT count(*) FROM conversations c WHERE c.user_id = u.id)::int AS "conversations"
    FROM users u`;

  const res = q
    ? await db.execute(sql`${base} WHERE u.email ILIKE ${"%" + q + "%"} OR u.name ILIKE ${"%" + q + "%"} ORDER BY u.created_at DESC LIMIT 100`)
    : await db.execute(sql`${base} ORDER BY u.created_at DESC LIMIT 100`);

  return json({ ok: true, users: res.rows });
}
