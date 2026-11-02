import { db } from "@/db";
import { projects } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const { id } = await ctx.params;
  
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .limit(1);
    
  if (!rows[0]) return err("Project not found.", 404);
  return json({ ok: true, project: rows[0] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const { id } = await ctx.params;
  
  const body = await readJson<{ name?: string; files?: Record<string, string> }>(req);
  if (!body) return err("Invalid body.");
  
  const [p] = await db
    .update(projects)
    .set({ 
      ...(body.name && { name: body.name }),
      ...(body.files && { files: body.files }),
      updatedAt: new Date()
    })
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .returning();
    
  if (!p) return err("Project not found.", 404);
  return json({ ok: true, project: p });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const { id } = await ctx.params;
  
  await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)));
    
  return json({ ok: true });
}
