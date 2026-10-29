import { getSessionUser } from "@/lib/session";
import { err, json } from "@/lib/http";
import { checkQuota, getQuotas } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const imageQuota = await checkQuota(user, "image");
  const chatQuota = await checkQuota(user, "chat");
  const audioQuota = await checkQuota(user, "audio");
  const quotas = await getQuotas();
  return json({
    ok: true,
    user,
    usage: {
      images: { used: imageQuota.used, limit: imageQuota.limit },
      chat: { used: chatQuota.used, limit: chatQuota.limit },
      audio: { used: audioQuota.used, limit: audioQuota.limit },
    },
    quotas,
  });
}
