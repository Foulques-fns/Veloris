export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function err(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "foulques.fns1@gmail.com").toLowerCase();
