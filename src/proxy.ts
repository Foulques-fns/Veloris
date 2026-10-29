import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 request proxy (formerly middleware).
 *
 * CSRF origin guard for all mutating API calls. The session cookie uses
 * SameSite=None in production (so iframe-embedded previews keep working), so
 * cross-origin mutations are instead blocked here using the browser's
 * sec-fetch-site / origin metadata.
 */
export function proxy(req: NextRequest) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return NextResponse.next();
  }

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return NextResponse.json({ ok: false, error: "Cross-site request blocked." }, { status: 403 });
  }

  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("host") ?? req.headers.get("x-forwarded-host") ?? "";
    try {
      const originHost = new URL(origin).host;
      if (host && originHost && originHost !== host) {
        return NextResponse.json({ ok: false, error: "Cross-site request blocked." }, { status: 403 });
      }
    } catch {
      /* unparseable origin — let the route handler decide */
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
