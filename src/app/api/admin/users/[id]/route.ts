import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { err, json, readJson, ADMIN_EMAIL } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLANS = new Set(["free", "premium", "ultra"]);
const ROLES = new Set(["user", "admin"]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return err("Forbidden.", 403);
  const { id } = await ctx.params;
  const body = await readJson<{
    plan?: string;
    role?: string;
    imageQuotaOverride?: number | null;
    chatQuotaOverride?: number | null;
    audioQuotaOverride?: number | null;
  }>(req);

  const target = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!target) return err("User not found.", 404);

  const isBootstrap = target.email.toLowerCase() === ADMIN_EMAIL;
  const patch: Partial<typeof users.$inferInsert> = {};

  if (body?.plan !== undefined) {
    if (!PLANS.has(body.plan)) return err("Invalid plan.");
    patch.plan = body.plan;
  }
  if (body?.role !== undefined) {
    if (!ROLES.has(body.role)) return err("Invalid role.");
    if (isBootstrap && body.role !== "admin") return err("The bootstrap admin account cannot be demoted.", 409);
    patch.role = body.role;
  }
  for (const key of ["imageQuotaOverride", "chatQuotaOverride", "audioQuotaOverride"] as const) {
    const raw = body?.[key];
    if (raw === undefined) continue;
    if (raw === null) {
      patch[key] = null;
    } else {
      const v = Math.round(Number(raw));
      // -1 = unlimited for this user specifically; 0 disables; N caps per day
      if (!Number.isFinite(v) || v < -1 || v > 100000) return err("Invalid quota override. Use -1 for unlimited.");
      patch[key] = v;
    }
  }
  if (Object.keys(patch).length === 0) return err("Nothing to update.");

  await db.update(users).set(patch).where(eq(users.id, id));
  const updated = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  return json({
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      plan: updated.plan,
      emailVerified: updated.emailVerified,
      imageQuotaOverride: updated.imageQuotaOverride,
      chatQuotaOverride: updated.chatQuotaOverride,
      audioQuotaOverride: updated.audioQuotaOverride,
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return err("Forbidden.", 403);
  const { id } = await ctx.params;
  const target = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!target) return err("User not found.", 404);
  if (target.email.toLowerCase() === ADMIN_EMAIL) return err("The bootstrap admin account cannot be deleted.", 409);
  if (target.id === admin.id) return err("You cannot delete your own account.", 409);
  await db.delete(sessions).where(eq(sessions.userId, id));
  await db.delete(users).where(eq(users.id, id));
  return json({ ok: true });
}

/** Force-logout a user (invalidate all sessions). */
export async function PUT(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return err("Forbidden.", 403);
  const { id } = await ctx.params;
  await db.delete(sessions).where(eq(sessions.userId, id));
  return json({ ok: true });
}
