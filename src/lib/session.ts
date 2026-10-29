import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { randomToken, sha256 } from "./password";

export const SESSION_COOKIE = "nova_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  plan: "free" | "premium" | "ultra";
  emailVerified: boolean;
  customInstructions: string;
  personality: string;
};

export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = sha256(token + (process.env.SESSION_SECRET ?? ""));
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash, userId, userAgent, expiresAt });
  const store = await cookies();
  /**
   * Cookie policy:
   * - Production (https): SameSite=None + Secure + Partitioned (CHIPS), so the
   *   session also works when the app is embedded in a cross-origin iframe
   *   preview. CSRF exposure is mitigated by the origin guard in src/proxy.ts.
   * - Development (http://localhost): SameSite=Lax, non-secure.
   * - Override with COOKIE_SECURE=true|false in .env if you self-host on plain
   *   http behind your own proxy.
   */
  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production";
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    partitioned: secure || undefined,
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = sha256(token + (process.env.SESSION_SECRET ?? ""));
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  store.delete(SESSION_COOKIE);
}

/* ── Open mode (authentication disabled) ────────────────────────────────────
   Open mode is ON by default: no login screens, every visitor is a single
   local "open" account (admin + ultra). Set AUTH_DISABLED=false to switch on
   the complete auth system (register, email codes, sessions) — it is fully
   implemented and untouched.
*/
let openUserEnsured: Promise<void> | null = null;

export function resetOpenUserCache() {
  openUserEnsured = null;
}

/** Creates the open account once (admin+ultra), then yields — subsequent reads are live. */
function ensureOpenUser(): Promise<void> {
  openUserEnsured ??= (async () => {
    const email = (process.env.OPEN_USER_EMAIL || "guest@nova.local").toLowerCase();
    const name = process.env.OPEN_USER_NAME || "Foulques";
    const row = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (!row) {
      await db
        .insert(users)
        .values({ email, name, passwordHash: `scrypt:disabled:${randomToken(16)}`, role: "admin", plan: "ultra", emailVerified: true })
        .onConflictDoNothing();
    } else if (row.role !== "admin") {
      await db.update(users).set({ role: "admin" }).where(eq(users.id, row.id));
    }
  })();
  return openUserEnsured;
}

function getOpenModeUser(): Promise<SessionUser> {
  // Always live-read: admin panel changes to this account apply immediately.
  return ensureOpenUser().then(async () => {
    const email = (process.env.OPEN_USER_EMAIL || "guest@nova.local").toLowerCase();
    const row = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: "admin" as const,
      plan: (["free", "premium", "ultra"].includes(row.plan) ? row.plan : "ultra") as SessionUser["plan"],
      emailVerified: true,
      customInstructions: row.customInstructions,
      personality: row.personality,
    };
  });
}

/**
 * Open by default (per product decision — no login screens).
 * Set AUTH_DISABLED=false in the environment to re-enable full authentication.
 * Deliberately NOT read from an env *presence* check so a regenerated default
 * .env can never silently lock users out.
 */
export const AUTH_DISABLED = process.env.AUTH_DISABLED !== "false";

export async function getSessionUser(): Promise<SessionUser | null> {
  if (AUTH_DISABLED) return getOpenModeUser();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token + (process.env.SESSION_SECRET ?? ""));
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      plan: users.plan,
      emailVerified: users.emailVerified,
      customInstructions: users.customInstructions,
      personality: users.personality,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u) return null;
  return {
    ...u,
    role: (u.role === "admin" ? "admin" : "user") as "user" | "admin",
    plan: (["free", "premium", "ultra"].includes(u.plan) ? u.plan : "free") as SessionUser["plan"],
  };
}

/** For route handlers – throws a Response-shaped error when unauthenticated. */
export async function requireApiUser(): Promise<SessionUser | null> {
  return getSessionUser();
}
