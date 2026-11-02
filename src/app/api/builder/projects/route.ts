import { db } from "@/db";
import { projects } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  
  const rows = await db
    .select({ 
      id: projects.id, 
      name: projects.name, 
      updatedAt: projects.updatedAt,
      createdAt: projects.createdAt 
    })
    .from(projects)
    .where(eq(projects.userId, user.id))
    .orderBy(desc(projects.updatedAt))
    .limit(50);
    
  return json({ ok: true, projects: rows });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  
  const body = await readJson<{ name?: string; files?: Record<string, string> }>(req);
  const name = body?.name || "Untitled Project";
  const files = body?.files || { "index.html": "<!DOCTYPE html><html><body><h1>Hello Veloris!</h1></body></html>" };
  
  const [p] = await db
    .insert(projects)
    .values({ 
      userId: user.id, 
      name, 
      files 
    })
    .returning();
    
  return json({ ok: true, project: p });
}
