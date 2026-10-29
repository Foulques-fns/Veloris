import { db } from "@/db";
import { files } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { and, desc, eq } from "drizzle-orm";
import { checkQuota, getDisabledModels, getFeatures, recordUsage, startOfToday, type PlanId } from "@/lib/settings";
import { listFreeImageModels } from "@/lib/models";
import { editImage, generateImage, hasApiKey } from "@/lib/pollinations";
import { logApiError } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenBody = {
  prompt?: string;
  model?: string;
  width?: number;
  height?: number;
  seed?: number;
  quality?: "low" | "medium" | "high" | "standard" | "hd";
  mode?: "generate" | "edit";
  referenceIds?: string[];
};

function clampDim(v: number | undefined, min = 256, max = 2048, fallback = 1024): number {
  if (!v || Number.isNaN(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v / 8) * 8));
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const features = await getFeatures();
  if (!features.images) return err("Image generation is disabled by the administrator.", 403);
  if (!hasApiKey()) return err("AI provider key missing. Add POLLINATIONS_API_KEY to .env and restart.", 503);

  const body = await readJson<GenBody>(req);
  const prompt = (body?.prompt ?? "").trim();
  if (!prompt || prompt.length > 8000) return err("Prompt must be 1–8000 characters.");

  const catalog = await listFreeImageModels();
  const disabled = new Set((await getDisabledModels()).image);
  const model = catalog.find((m) => m.id === body?.model) ?? catalog[0];
  if (!model) return err("No free image model is currently available.", 503);
  if (disabled.has(model.id)) return err("This model has been disabled by the administrator.", 403);
  // HARD GUARD: only catalog-verified free models ever reach the provider.
  if (!catalog.some((m) => m.id === model.id)) return err("Model is not on the free tier.", 403);

  const refs: { name: string; mime: string; bytes: Buffer }[] = [];
  for (const fid of body?.referenceIds?.slice(0, Math.max(1, model.maxReferenceImages)) ?? []) {
    const f = (await db.select().from(files).where(eq(files.id, fid)).limit(1))[0];
    if (!f || f.userId !== user.id) continue;
    if (!f.mime.startsWith("image/")) return err(`Reference "${f.name}" is not an image.`);
    if (f.size > 8 * 1024 * 1024) return err(`Reference "${f.name}" exceeds 8MB.`);
    refs.push({ name: f.name, mime: f.mime, bytes: Buffer.from(f.data, "base64") });
  }

  const wantsEdit = body?.mode === "edit" || refs.length > 0;
  if (wantsEdit && !model.acceptsImages) {
    return err(`${model.title} does not accept image inputs. Pick an edit-capable model (MAI Image 2.6, FLUX.2 Klein 4B, Kontext Pro).`, 400);
  }

  // Strict daily quota — enforced on the backend (default FREE: 5/day).
  const quota = await checkQuota({ id: user.id, plan: user.plan as PlanId }, "image");
  if (!quota.ok) {
    return err(`Daily image limit reached (${quota.used}/${quota.limit}). It resets at 00:00 UTC — or ask an admin to upgrade your plan.`, 429, { quota });
  }

  const width = clampDim(body?.width);
  const height = clampDim(body?.height);

  try {
    const input = { prompt, model: model.id, width, height, seed: typeof body?.seed === "number" ? Math.round(body!.seed) : undefined, quality: body?.quality ?? "medium" };
    const result = refs.length > 0 ? await editImage({ ...input, references: refs }, user.id) : await generateImage(input, user.id);

    const name = `${prompt.slice(0, 48).replace(/[^a-z0-9]+/gi, "-") || "image"}.png`;
    const isEdit = refs.length > 0;
    const [saved] = await db
      .insert(files)
      .values({
        userId: user.id,
        name,
        mime: result.mime,
        size: result.bytes.length,
        data: result.bytes.toString("base64"),
        kind: "generated",
        meta: { prompt, model: model.id, width, height, seed: body?.seed ?? null, mode: isEdit ? "edit" : "generate" },
      })
      .returning({ id: files.id, createdAt: files.createdAt });

    await recordUsage(user.id, "image", model.id, { prompt: prompt.slice(0, 200), mode: isEdit ? "edit" : "generate" });

    return json({
      ok: true,
      image: { id: saved.id, url: `/api/files/${saved.id}`, name, model: model.id, prompt, width, height, mode: isEdit ? "edit" : "generate", createdAt: saved.createdAt },
      quota: { used: quota.used + 1, limit: quota.limit },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Generation failed";
    await logApiError("/api/images", msg, user.id);
    return err(msg, 502);
  }
}

/** Recent generations + today's quota. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const quota = await checkQuota({ id: user.id, plan: user.plan as PlanId }, "image");
  const rows = await db
    .select({ id: files.id, name: files.name, mime: files.mime, meta: files.meta, createdAt: files.createdAt })
    .from(files)
    .where(and(eq(files.userId, user.id), eq(files.kind, "generated")))
    .orderBy(desc(files.createdAt))
    .limit(60);
  const images = rows.filter((r) => r.mime.startsWith("image/"));
  return json({
    ok: true,
    quota: { used: quota.used, limit: quota.limit, resetsAt: startOfToday().toISOString() },
    images: images.map((r) => ({ ...r, url: `/api/files/${r.id}` })),
  });
}
