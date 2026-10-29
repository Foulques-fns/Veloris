import { db } from "@/db";
import { errorLogs } from "@/db/schema";

export async function logApiError(endpoint: string, err: unknown, userId?: string, statusCode?: number) {
  try {
    const message = err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000);
    await db.insert(errorLogs).values({ endpoint, message, userId: userId ?? null, statusCode });
  } catch {
    // logging must never throw
  }
}
