import { db } from "@/db";
import { files } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { getFeatures, recordUsage, type PlanId, checkQuota } from "@/lib/settings";
import { listFreeChatModels } from "@/lib/models";
import { chatCompletion, hasApiKey } from "@/lib/pollinations";
import { logApiError } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Image understanding via a free vision-capable chat model. Does NOT count against the image quota. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const features = await getFeatures();
  if (!features.images) return err("Image features are disabled by the administrator.", 403);
  if (!hasApiKey()) return err("AI provider key missing. Add POLLINATIONS_API_KEY to .env and restart.", 503);

  const body = await readJson<{ fileId?: string; question?: string; model?: string }>(req);
  if (!body?.fileId) return err("fileId is required.");
  const f = (await db.select().from(files).where(eq(files.id, body.fileId)).limit(1))[0];
  if (!f || (f.userId !== user.id && user.role !== "admin")) return err("Image not found.", 404);
  if (!f.mime.startsWith("image/")) return err("Only images can be analyzed.", 415);
  if (f.size > 8 * 1024 * 1024) return err("Image exceeds 8MB.", 413);

  // Light chat throttle so analysis can't be abused as unlimited chat.
  const chatQuota = await checkQuota({ id: user.id, plan: user.plan as PlanId }, "chat");
  if (!chatQuota.ok) return err("Daily limit reached.", 429);

  const catalog = await listFreeChatModels();
  let model = catalog.find((m) => m.vision && m.id === body?.model) ?? catalog.find((m) => m.vision) ?? catalog[0];
  if (!model) return err("No vision-capable free model available.", 503);

  const question = (body.question ?? "").trim() || "Describe this image in detail. What do you see?";
  try {
    const { content } = await chatCompletion(
      {
        model: model.id,
        max_tokens: 2048,
        messages: [
          { role: "system", content: "You are VELORIS, a precise vision assistant. Analyze images thoroughly and respond in Markdown." },
          {
            role: "user",
            content: [
              { type: "text", text: question.slice(0, 2000) },
              { type: "image_url", image_url: { url: `data:${f.mime};base64,${f.data}` } },
            ],
          },
        ],
      },
      user.id,
    );
    await recordUsage(user.id, "analyze", model.id, { fileId: f.id });
    return json({ ok: true, analysis: content || "(no response)", model: model.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    await logApiError("/api/images/analyze", msg, user.id);
    return err(msg, 502);
  }
}
