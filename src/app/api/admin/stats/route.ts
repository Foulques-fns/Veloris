import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { err, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return err("Forbidden.", 403);

  const totals = (
    await db.execute(sql`
    SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM users WHERE email_verified)::int AS verified,
      (SELECT count(*) FROM conversations)::int AS conversations,
      (SELECT count(*) FROM messages)::int AS messages,
      (SELECT count(*) FROM files)::int AS files,
      (SELECT count(*) FROM users WHERE role = 'admin')::int AS admins`)
  ).rows as Row[];

  const plans = (
    await db.execute(sql`SELECT plan, count(*)::int AS n FROM users GROUP BY plan ORDER BY n DESC`)
  ).rows as Row[];

  const today = (
    await db.execute(sql`
    SELECT type, count(*)::int AS n FROM usage_events
    WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
    GROUP BY type ORDER BY n DESC`)
  ).rows as Row[];

  const series = (
    await db.execute(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      COALESCE(sum((u.type='chat')::int),0)::int AS chat,
      COALESCE(sum((u.type='image')::int),0)::int AS image,
      COALESCE(sum((u.type='audio')::int),0)::int AS audio,
      COALESCE(sum((u.type='transcribe')::int),0)::int AS transcribe,
      COALESCE(sum((u.type='video')::int),0)::int AS video
    FROM generate_series(date_trunc('day', now() AT TIME ZONE 'UTC') - interval '13 days', date_trunc('day', now() AT TIME ZONE 'UTC'), interval '1 day') AS d(day)
    LEFT JOIN usage_events u ON u.created_at >= d.day AND u.created_at < d.day + interval '1 day'
    GROUP BY d.day ORDER BY d.day`)
  ).rows as Row[];

  const topModels = (
    await db.execute(sql`
    SELECT COALESCE(model,'?') AS model, count(*)::int AS n FROM usage_events
    WHERE created_at >= now() - interval '7 days' AND model IS NOT NULL
    GROUP BY model ORDER BY n DESC LIMIT 8`)
  ).rows as Row[];

  const errors24h = (
    await db.execute(sql`SELECT count(*)::int AS n FROM error_logs WHERE created_at >= now() - interval '24 hours'`)
  ).rows as Row[];

  const signups = (
    await db.execute(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(u.id)::int AS n
    FROM generate_series(date_trunc('day', now() AT TIME ZONE 'UTC') - interval '13 days', date_trunc('day', now() AT TIME ZONE 'UTC'), interval '1 day') AS d(day)
    LEFT JOIN users u ON u.created_at >= d.day AND u.created_at < d.day + interval '1 day'
    GROUP BY d.day ORDER BY d.day`)
  ).rows as Row[];

  return json({
    ok: true,
    totals: totals[0] ?? {},
    plans,
    today,
    series,
    signups,
    topModels,
    errors24h: Number(errors24h[0]?.n ?? 0),
  });
}
